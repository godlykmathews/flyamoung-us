"""Color, simplify and seat the supplied CC-BY pilot scan for FLIGHT 404.
Blender --background --factory-startup --python scripts/blender/build_pilot.py
Original remains untouched; generated GLB is metres, +Y up, facing -Z.
"""
import bpy, math, json, hashlib, sys
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
bpy.context.preferences.filepaths.save_version=0
SOURCE=ROOT/'models/pilot_in_uniform.glb'
OUT=ROOT/'client/public/models/characters/pilot-seated.glb'
BLEND=ROOT/'models/blender/cabin-pilot.blend'
PREVIEW=ROOT/'docs/previews/pilot-seated.png'
for path in (OUT.parent,BLEND.parent,PREVIEW.parent):path.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
bpy.context.view_layer.update()
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
lo=Vector(tuple(min(p[i] for p in points) for i in range(3)));hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
factor=1.78/(hi.z-lo.z);cx=(lo.x+hi.x)/2;cy=(lo.y+hi.y)/2
for o in meshes:
    transform=o.matrix_world.copy();o.parent=None;o.matrix_world.identity()
    for v in o.data.vertices:
        p=transform@v.co
        # Source faces Blender -Y. Rotate half-turn to face game -Z (Blender +Y).
        v.co=(-(p.x-cx)*factor,-(p.y-cy)*factor,(p.z-lo.z)*factor)
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();pilot=bpy.context.object;pilot.name='Pilot seated uniform'
for o in list(bpy.context.scene.objects):
    if o!=pilot:bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.000035);bpy.ops.object.mode_set(mode='OBJECT')
pilot.data.calc_loop_triangles();initial=len(pilot.data.loop_triangles)
dec=pilot.modifiers.new('Web detail budget','DECIMATE');dec.ratio=min(1,28000/initial)
bpy.ops.object.modifier_apply(modifier=dec.name)

def rgba(hex):
    values=[int(hex[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values)+(1,)
def mat(name,color,rough=.65,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=rgba(color)
    n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=rgba(color);n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal
    m.use_backface_culling=True;return m
M={
 'shirt':mat('Pilot ivory shirt','e4e6dc',.8),
 'navy':mat('Pilot midnight navy uniform','172b42',.74),
 'skin':mat('Pilot warm skin','bf957c',.67),
 'hair':mat('Pilot dark brown hair','382d27',.9),
 'shoe':mat('Pilot black leather','172029',.31),
 'gold':mat('Pilot brushed gold insignia','d8bd70',.32,.62),
 'tablet':mat('Pilot flight folio','304650',.55),
 'screen':mat('Pilot folio paper','b8c9c6',.9),
}
for material in list(pilot.data.materials):pilot.data.materials.pop(index=0)
for m in M.values():pilot.data.materials.append(m)
keys=list(M)
def game_point(x,y,z):return Vector((x,-z,y))
def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
# A painted vertex layer avoids coarse face-by-face color boundaries on the
# original untextured scan. The original colorless source is retained intact.
colors=pilot.data.color_attributes.new(name='UniformColor',type='FLOAT_COLOR',domain='POINT')
for v in pilot.data.vertices:
    x,y,z=v.co.x,v.co.z,-v.co.y
    c=Vector(M['shirt'].diffuse_color)
    c=c.lerp(Vector(M['navy'].diffuse_color),1-smooth(.927,.951,y))
    c=c.lerp(Vector(M['shoe'].diffuse_color),1-smooth(.108,.132,y))
    neck=smooth(1.46,1.49,y)*(1-smooth(.055,.092,abs(x)))
    head=smooth(1.545,1.56,y)
    c=c.lerp(Vector(M['skin'].diffuse_color),max(neck,head))
    hair=max(smooth(1.687,1.705,y),smooth(1.568,1.596,y)*smooth(.005,.022,z))
    c=c.lerp(Vector(M['hair'].diffuse_color),hair)
    forearm=smooth(1.06,1.09,y)*(1-smooth(1.27,1.29,y))*max(smooth(.12,.145,abs(x)),smooth(.155,.18,-z))
    outer_forearm=smooth(1.07,1.10,y)*(1-smooth(1.255,1.28,y))*smooth(.15,.17,abs(x))
    hands=smooth(1.115,1.14,y)*(1-smooth(1.205,1.225,y))*smooth(.055,.075,-z)*(1-smooth(.13,.16,abs(x)))
    upperarm=smooth(1.12,1.15,y)*(1-smooth(1.255,1.277,y))*smooth(.187,.212,abs(x))
    c=c.lerp(Vector(M['skin'].diffuse_color),max(forearm,upperarm,outer_forearm,hands))
    # Flight folio front surface: leave fingers and wrists skin colored.
    folio=smooth(1.125,1.15,y)*(1-smooth(1.335,1.35,y))*smooth(.13,.15,-z)*(1-smooth(.14,.17,abs(x)))
    c=c.lerp(Vector(M['tablet'].diffuse_color),folio)
    colors.data[v.index].color=c
painted=mat('Pilot painted uniform','ffffff',.72)
attr=painted.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name=colors.name
painted.node_tree.links.new(attr.outputs['Color'],painted.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
pilot.data.materials.clear();pilot.data.materials.append(painted)
for p in pilot.data.polygons:p.material_index=0;p.use_smooth=True

# Integrating a smooth centreline preserves the scan around both knee bends.
# Cross sections rotate with its tangent, instead of mixing disconnected limb
# positions. Sole vertices stay at zero and the pelvis clears the .57m cushion.
curve_y=np.linspace(0,1.9,4097)
shape=np.array([smooth(.31,.61,h)*(1-smooth(.73,1.045,h)) for h in curve_y])
angles=shape*math.pi/2
step=curve_y[1]-curve_y[0]
vertical=np.cumsum(np.cos(angles))*step-step
depth=np.cumsum(np.sin(angles))*step
depth-=np.interp(.94,curve_y,depth)
lift=.69-float(np.interp(.94,curve_y,vertical))
def seated(x,y,z):
    angle=float(np.interp(y,curve_y,angles))
    height=float(np.interp(y,curve_y,vertical))-math.sin(angle)*z+smooth(0,.4,y)*lift
    if y>.98:height-=.15*(y-.98)
    return Vector((x,height,float(np.interp(y,curve_y,depth))+math.cos(angle)*z))
head_vertices=[v.co for v in pilot.data.vertices if v.co.z>1.69]
cap_x=(min(v.x for v in head_vertices)+max(v.x for v in head_vertices))/2
cap_z=-(min(v.y for v in head_vertices)+max(v.y for v in head_vertices))/2
cap_width=(max(v.x for v in head_vertices)-min(v.x for v in head_vertices))/2+.012
cap_depth=(max(v.y for v in head_vertices)-min(v.y for v in head_vertices))/2+.014
for v in pilot.data.vertices:
    p=seated(v.co.x,v.co.z,-v.co.y);v.co=game_point(*p)
if hasattr(pilot.data,'normals_split_custom_set'):
    pilot.data.normals_split_custom_set([(0,0,0)]*len(pilot.data.loops))

def box(name,p,size,material,radius=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=game_point(*p));o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(M[material])
    if radius:
        b=o.modifiers.new('Small tailored edge','BEVEL');b.width=radius;b.segments=2;bpy.ops.object.modifier_apply(modifier=b.name)
    return o
def ellipsoid(name,p,size,material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=12,location=game_point(*p));o=bpy.context.object;o.name=name;o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(M[material])
    for f in o.data.polygons:f.use_smooth=True
    return o
def curve(name,points,radius,material):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=radius;c.bevel_resolution=2;s=c.splines.new('POLY');s.points.add(len(points)-1)
    for v,p in zip(s.points,points):v.co=(*game_point(*p),1)
    o=bpy.data.objects.new(name,c);bpy.context.scene.collection.objects.link(o);c.materials.append(M[material]);return o

# Restrained uniform details are separately editable authored geometry.
for side in [-1,1]:
    # The scan leans slightly, so each shoulder has its own front/back datum.
    shoulder=[v.co for v in pilot.data.vertices if abs(v.co.x-side*.16)<.018 and v.co.z>1.05]
    shoulder_top=max(p.z for p in shoulder)
    co=max((p for p in shoulder if p.z>shoulder_top-.004),key=lambda p:p.y)
    p=Vector((co.x,co.z+.002,-co.y))
    box('Navy shoulder epaulet',p,(.073,.010,.038),'navy',.004)
    for stripe in range(4):box('Gold captain epaulet stripe',(p.x+side*(-.0225+stripe*.015),p.y+.006,p.z),(.005,.003,.036),'gold',.001)
# Pilot cap sits just above the source hair and extends its visor forward.
head=seated(cap_x,1.745,cap_z)
ellipsoid('Pilot cap crown',(head.x,head.y,head.z),(cap_width,.057,cap_depth),'navy')
ellipsoid('Pilot cap peak',(head.x,head.y-.022,head.z-.078),(.107,.010,.091),'shoe')
curve('Pilot cap gold braid',[(head.x+(cap_width-.003)*math.cos(a),head.y-.016,head.z+(cap_depth-.004)*math.sin(a)) for a in [i*math.tau/48 for i in range(49)]],.003,'gold')
box('Pilot cap wing badge',(head.x,head.y+.004,head.z-cap_depth-.002),(.052,.016,.006),'gold',.003)

# The saved source has a lit seating preview; export contains only the pilot.
art=[o for o in bpy.context.scene.objects if o.type in {'MESH','CURVE'}]
for o in art:
    if o.type=='CURVE':
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
root=bpy.data.objects.new('Pilot_Seated',None);bpy.context.scene.collection.objects.link(root)
for o in art:o.parent=root
root['source_title']='Pilot In Uniform';root['source_author']='Alebor64';root['source_license']='CC BY 4.0';root['source_url']='https://sketchfab.com/3d-models/pilot-in-uniform-2860e37246324dc1a6444054c9b3abc4'
root['modifications']='Scaled from millimetres; simplified; added uniform materials and insignia; authored seated pose and cap.'
root['axis_contract']='metres; +Y up; faces -Z; feet at Y0; seat cushion near Y.57'
scene=bpy.context.scene;scene.name='Pilot seated authoring';scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.39,.46,.54,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.3
for name,p,power,size in [('Key',(-3,4,-3),600,4),('Fill',(3,2,-2),300,3),('Rim',(0,3,3),450,3)]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=game_point(*p);o.rotation_euler=(game_point(0,.8,0)-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.007));floor=bpy.context.object;floor.name='Preview floor';floor.data.materials.append(mat('Studio background','9ba8b4',.95))
camera_data=bpy.data.cameras.new('Pilot preview camera');camera=bpy.data.objects.new('Pilot preview camera',camera_data);scene.collection.objects.link(camera);camera.location=game_point(2,1.55,-3);camera.rotation_euler=(game_point(0,.78,-.02)-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='ORTHO';camera_data.ortho_scale=1.75;scene.camera=camera
scene.view_settings.view_transform='AgX';scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
# The preview seat uses the same cushion top and back datums as the cockpit.
# It is excluded from the art list and therefore never enters the pilot GLB.
box('Preview pilot cushion',(0,.5,-.015),(.70,.14,.68),'navy',.055)
box('Preview pilot back',(0,1.02,.214),(.66,.80,.13),'navy',.055)
box('Preview pilot seat pedestal',(0,.24,0),(.32,.43,.36),'shoe',.025)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for o in art:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
if '--no-render' not in sys.argv:scene.render.filepath=str(PREVIEW);bpy.ops.render.render(write_still=True)
data=OUT.read_bytes();j=json.loads(data[20:20+int.from_bytes(data[12:16],'little')]);tris=sum(j['accessors'][p['indices']]['count']//3 for m in j['meshes'] for p in m['primitives'])
print('PILOT_REPORT',json.dumps({'source':str(SOURCE),'blend':str(BLEND),'export':str(OUT),'triangles':tris,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'materials':len(j.get('materials',[]))}))
