"""Create textured, seated cabin passengers from the owner's static source GLBs.

Blender --background --factory-startup --python scripts/blender/build_passengers.py
Sources stay unchanged. Coordinates export as Y-up / -Z forward, feet Y=0,
seat/hip Y=.57 and hip local Z=0. This is an original pose derivative, not a
claim that the supplied scans contain a humanoid skeleton or animation clips.
"""
import bpy, math, json, hashlib, sys
from pathlib import Path
from mathutils import Vector, Matrix
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'client/public/models/characters';SRC=ROOT/'models/blender';PREVIEW=ROOT/'docs/previews'
for p in [OUT,SRC,PREVIEW]:p.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
specs=[
 ('passenger-a-seated','casual_portrait_of_a_mature_man.glb','Casual Portrait of a Mature Man','restore50',35000),
 ('passenger-b-seated','confident_professional.glb','Confident Professional','XRProfXR',60000),
 ('passenger-c-seated','fashionable_skoof.glb','fashionable skoof','DENNISS75',35000),
]
records={};collections=[]

def source_metadata(path):
    import struct
    b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0]
    return json.loads(b[20:20+n]).get('asset',{}).get('extras',{})

def mesh_array(obj):
    values=np.empty(len(obj.data.vertices)*3,dtype=np.float64)
    obj.data.vertices.foreach_get('co',values);return values.reshape((-1,3))

def smoothstep(t):return np.clip(t,0,1)**2*(3-2*np.clip(t,0,1))

def seated_curve(hip=.86):
    # Bend direction changes continuously through pelvis and knee, keeping scans
    # watertight and avoiding the hard discontinuity of rotating sliced limbs.
    y=np.linspace(0,1.9,4097)
    shape=smoothstep((y-.40)/.12)*(1-smoothstep((y-.76)/.22))
    step=y[1]-y[0]
    lo,hi=0,math.pi/2
    for _ in range(36):
        angle=(lo+hi)/2
        yy=np.cumsum(np.cos(shape*angle))*step-step
        if np.interp(hip,y,yy)>.57:lo=angle
        else:hi=angle
    angles=shape*(lo+hi)/2
    yy=np.cumsum(np.cos(angles))*step-step
    zz=np.cumsum(np.sin(angles))*step
    zz-=np.interp(hip,y,zz)
    return y,angles,yy,zz

curve_y,curve_angles,curve_vertical,curve_depth=seated_curve()

def leg_profiles(points):
    """Track the two source calves through horizontal slices, before posing."""
    levels=np.linspace(.035,.9,35);centres=[];previous=None
    for height in levels:
        band=points[np.abs(points[:,2]-height)<.035]
        if len(band)<10:
            centres.append(previous.copy());continue
        q=np.stack([band[:,0],-band[:,1]],axis=1)
        if previous is None:
            c=np.array([[np.median(q[:,0]),np.percentile(q[:,1],15)],[np.median(q[:,0]),np.percentile(q[:,1],85)]])
        else:c=previous.copy()
        for _ in range(16):
            labels=np.argmin(((q[:,None,:]-c[None,:,:])**2).sum(axis=2),axis=1)
            for k in range(2):
                if np.any(labels==k):c[k]=q[labels==k].mean(axis=0)
        if previous is not None and np.linalg.norm(c-previous)>np.linalg.norm(c[::-1]-previous):c=c[::-1]
        previous=c;centres.append(c.copy())
    return levels,np.array(centres)

for index,(name,filename,title,author,budget) in enumerate(specs):
    path=ROOT/'models'/filename
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported=[o for o in bpy.data.objects if o not in before]
    meshes=[o for o in imported if o.type=='MESH']
    bpy.context.view_layer.update()
    # Bake glTF hierarchy transforms before measuring or posing the mesh.
    for obj in meshes:
        obj.data.transform(obj.matrix_world);obj.parent=None;obj.matrix_world=Matrix.Identity(4)
    for obj in imported:
        if obj.type!='MESH':bpy.data.objects.remove(obj,do_unlink=True)
    points=np.concatenate([mesh_array(o) for o in meshes]);low=points.min(axis=0);high=points.max(axis=0)
    scale=1.72/(high[2]-low[2])
    # Sources face Blender -Y. Rotate pi to face game -Z (Blender +Y).
    points[:,0]*=-scale;points[:,1]*=-scale;points[:,2]=(points[:,2]-low[2])*scale
    hip_band=points[(points[:,2]>.80)&(points[:,2]<.95)]
    centre_x=float(np.median(hip_band[:,0]));centre_y=float(np.median(hip_band[:,1]))
    if name=='passenger-b-seated':
        aligned=points.copy();aligned[:,0]-=centre_x;aligned[:,1]-=centre_y
        leg_heights,leg_centres=leg_profiles(aligned)
    triangles=sum(len(o.data.loop_triangles) if len(o.data.loop_triangles) else sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
    ratio=min(1,budget/max(1,triangles))
    for obj in meshes:
        a=mesh_array(obj);a[:,0]=-a[:,0]*scale-centre_x;a[:,1]=-a[:,1]*scale-centre_y;a[:,2]=(a[:,2]-low[2])*scale
        obj.data.vertices.foreach_set('co',a.ravel());obj.data.update()
        bpy.context.view_layer.objects.active=obj
        reduce=obj.modifiers.new('Browser scan reduction','DECIMATE');reduce.ratio=ratio
        bpy.ops.object.modifier_apply(modifier=reduce.name)
        a=mesh_array(obj)
        h=a[:,2].copy();front=-a[:,1].copy()
        if name=='passenger-b-seated':
            # Translate the complete rear calf, rather than only the rear
            # surface of a calf. Profiles preserve each leg's cross section.
            centres=np.stack([np.stack([np.interp(h,leg_heights,leg_centres[:,k,d]) for d in range(2)],axis=1) for k in range(2)],axis=1)
            q=np.stack([a[:,0],front],axis=1)
            distance=((q[:,None,:]-centres)**2).sum(axis=2)
            rear_leg=smoothstep((distance[:,0]-distance[:,1])/.004+.5)*(1-smoothstep((h-.65)/.25))
            front-=np.maximum(0,centres[:,1,1]-centres[:,0,1])*rear_leg
            a[:,0]-=(centres[:,1,0]-centres[:,0,0]-.13)*rear_leg
        angle=np.interp(h,curve_y,curve_angles)
        # Convert each cross-section through the smooth bend centreline.
        # The cushion datum is its top surface, not the centre of the pelvis.
        # Raise fleshy thighs above that surface while leaving shoe soles grounded;
        # lengthen the forward thigh reach so shins clear the .54m cushion front.
        a[:,2]=np.interp(h,curve_y,curve_vertical)-np.sin(angle)*front+smoothstep(h/.40)*.14
        a[:,1]=-(1.4*np.interp(h,curve_y,curve_depth)+np.cos(angle)*front)
        obj.data.vertices.foreach_set('co',a.ravel());obj.data.update()
        # Only the source colour UV remains in the exported material; dropping
        # unused scan normal/roughness UV channels saves repeated vertex data.
        for layer in list(obj.data.uv_layers)[1:]:obj.data.uv_layers.remove(layer)
        if hasattr(obj.data,'normals_split_custom_set'):
            obj.data.normals_split_custom_set([(0,0,0)]*len(obj.data.loops))
        for poly in obj.data.polygons:poly.use_smooth=True
        obj.name=name+' / '+obj.name
    # Preserve original maps, but bound repeated passenger texture memory.
    images=set()
    for obj in meshes:
        for mat in obj.data.materials:
            if mat and mat.use_nodes:
                bsdf=mat.node_tree.nodes.get('Principled BSDF')
                if bsdf:
                    # Original tangent-space scan normals no longer correspond to
                    # the decimated and bent mesh. Keep the source colour maps,
                    # and derive clean normals from the new geometry instead.
                    for socket in ['Normal','Metallic','Roughness']:
                        for link in list(bsdf.inputs[socket].links):mat.node_tree.links.remove(link)
                    bsdf.inputs['Metallic'].default_value=0
                    bsdf.inputs['Roughness'].default_value=.82
                for node in mat.node_tree.nodes:
                    if node.type=='TEX_IMAGE' and node.image:images.add(node.image)
    for img in images:
        w,h=img.size
        if max(w,h)>1024:
            factor=1024/max(w,h);img.scale(max(1,round(w*factor)),max(1,round(h*factor)))
        img.pack()
    # The imported scan chunks share their source material. Join their geometry
    # after posing to render repeated passengers with one mesh/material draw.
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:obj.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.object.join()
    meshes=[bpy.context.view_layer.objects.active]
    meshes[0].name=name+' / posed source mesh'
    collection=bpy.data.collections.new(name+' / editable posed meshes');scene.collection.children.link(collection)
    for obj in meshes:
        for c in list(obj.users_collection):c.objects.unlink(obj)
        collection.objects.link(obj)
    root=bpy.data.objects.new(name,None);collection.objects.link(root)
    metadata=source_metadata(path)
    root['source_title']=title;root['source_author']=author;root['source_license']=metadata.get('license','CC BY 4.0');root['source_url']=metadata.get('source','')
    root['modifications']='Reduced mesh density; textures resized; original smooth seated pose; normalized metres and orientation.'
    for obj in meshes:obj.parent=root
    bpy.ops.object.select_all(action='DESELECT')
    for obj in collection.objects:obj.select_set(True)
    out=OUT/(name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_materials='EXPORT',export_image_format='JPEG',export_jpeg_quality=88,export_cameras=False,export_lights=False,export_animations=False,export_extras=True)
    all_points=np.concatenate([mesh_array(o) for o in meshes]);mins=all_points.min(axis=0);maxs=all_points.max(axis=0)
    total=0
    for obj in meshes:obj.data.calc_loop_triangles();total+=len(obj.data.loop_triangles)
    import struct
    out_bytes=out.read_bytes();gltf=json.loads(out_bytes[20:20+struct.unpack_from('<I',out_bytes,12)[0]])
    records[name]={'source':str(path.relative_to(ROOT)),'source_metadata':metadata,'source_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':out.stat().st_size,'sha256':hashlib.sha256(out_bytes).hexdigest(),'triangles':total,'meshes':len(meshes),'primitives':sum(len(m['primitives']) for m in gltf['meshes']),'images':len(gltf.get('images',[])),'animations':[], 'bounds_game':{'min':[float(mins[0]),float(mins[2]),float(-maxs[1])],'max':[float(maxs[0]),float(maxs[2]),float(-mins[1])]},'seat_height':.57,'axis':'Y up / -Z forward / hip local Z=0'}
    collections.append((collection,root))
    collection.hide_render=True

# Contact-sheet scene uses collection instances, leaving authored/export mounts intact.
def mat(name,color,rough=.7):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bsdf=m.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(*color,1);bsdf.inputs['Roughness'].default_value=rough;return m
seat_mat=mat('Preview navy seat',(.027,.08,.13));floor_mat=mat('Preview floor',(.22,.25,.27))
def cube(name,p,size,material):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
    bevel=o.modifiers.new('Soft edge','BEVEL');bevel.width=.04;bevel.segments=3
    return o
for i,(collection,root) in enumerate(collections):
    # Directly move the source roots for the saved preview only after exporting.
    collection.hide_render=False;root.location.x=(i-1)*1.3
    cube('Preview cushion',((i-1)*1.3,.12,.495),(.765,.84,.15),seat_mat)
    cube('Preview back',((i-1)*1.3,-.32,1.05),(.78,.13,1.1),seat_mat)
    cube('Preview support',((i-1)*1.3,.03,.23),(.40,.50,.40),seat_mat)
cube('Preview floor',(0,0,-.03),(200,200,.05),floor_mat)
world=scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.45,.53,.63,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
def light(p,power,size):
    d=bpy.data.lights.new('Softbox','AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new('Softbox',d);scene.collection.objects.link(o);o.location=p;o.rotation_euler=(Vector((0,0,.8))-o.location).to_track_quat('-Z','Y').to_euler()
light((1,4,5),850,5);light((-4,-1,3),600,4)
d=bpy.data.cameras.new('Passenger seating contact sheet');cam=bpy.data.objects.new('Passenger seating contact sheet',d);scene.collection.objects.link(cam);cam.location=(3.4,5.8,2.65);cam.rotation_euler=(Vector((0,.02,.80))-cam.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=4.9;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.cycles.device='CPU';scene.render.resolution_x=1200;scene.render.resolution_y=760;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'cabin-passengers.blend'))
(SRC/'cabin-passengers.manifest.json').write_text(json.dumps({'generator':'scripts/blender/build_passengers.py','blender':bpy.app.version_string,'assets':records},indent=2)+'\n')
print('PASSENGERS_REPORT '+json.dumps(records))
if '--no-render' not in sys.argv:
    scene.render.filepath=str(PREVIEW/'cabin-passengers.png');bpy.ops.render.render(write_still=True)
print('PASSENGERS_COMPLETE')
