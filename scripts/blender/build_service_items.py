"""Original handheld cabin-service props. Blender metres; exported GLB +Y up.
Run Blender --background --factory-startup --python scripts/blender/build_service_items.py
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'client/public/models/service'
OUT.mkdir(parents=True,exist_ok=True)
SRC=ROOT/'models/blender'
PREVIEW=ROOT/'docs/previews'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def xyz(p):return (p[0],-p[2],p[1])
def mat(name,color,metal=0,rough=.5):
    m=bpy.data.materials.new(name);m.use_nodes=True
    c=tuple((v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4) for v in color)+(1,)
    m.diffuse_color=c;p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=c;p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m
M={
 'tray':mat('Brushed aluminium',(.55,.63,.68),.8,.3),
 'liner':mat('Non-slip navy liner',(.12,.22,.29),0,.86),
 'ivory':mat('Ivory porcelain',(.96,.94,.88),.02,.24),
 'coffee':mat('Coffee surface',(.15,.065,.028),0,.19),
 'water':mat('Water surface',(.27,.67,.79),.15,.12),
 'glass':mat('Frosted blue cup',(.64,.82,.88),.12,.2),
 'cloth':mat('Woven airline blanket',(.24,.40,.49),0,.98),
 'seam':mat('Blanket stitching',(.66,.78,.8),0,1),
 'paper':mat('Linen napkin',(.89,.89,.84),0,.95),
 'bread':mat('Bread roll',(.69,.38,.13),0,.9),
 'rice':mat('Rice pilaf',(.87,.79,.58),0,.94),
 'green':mat('Salad leaves',(.23,.40,.12),0,.86),
 'red':mat('Cherry tomato',(.75,.13,.09),0,.36),
}
active=[]
def finish(o,name,material):
    o.name=name;o.data.materials.append(M[material]);active.append(o)
    return o
def box(name,p,size,material,radius=.008):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(p));o=bpy.context.object
    o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(o,name,material)
    b=o.modifiers.new('Soft manufactured edges','BEVEL');b.width=min(radius,min(size)*.45);b.segments=3
    o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL')
    return o
def lathe(name,profile,p,material,steps=40):
    verts=[];faces=[]
    for radius,h in profile:
        for i in range(steps):
            a=2*math.pi*i/steps;verts.append(xyz((p[0]+radius*math.cos(a),p[1]+h,p[2]+radius*math.sin(a))))
    for j in range(len(profile)-1):
        for i in range(steps):
            k=j*steps+i;n=j*steps+(i+1)%steps
            faces.append((k,k+steps,n+steps,n))
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
    finish(o,name,material)
    for f in me.polygons:f.use_smooth=True
    return o
def tube(name,points,radius,material):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=radius;c.bevel_resolution=2
    s=c.splines.new('POLY');s.points.add(len(points)-1)
    for q,p in zip(s.points,points):q.co=(*xyz(p),1)
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);finish(o,name,material);return o
def ellipsoid(name,p,size,material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,location=xyz(p));o=bpy.context.object;o.scale=(size[0],size[2],size[1]);finish(o,name,material)
    for f in o.data.polygons:f.use_smooth=True
def tray():
    box('Service tray',(0,0,0),(.46,.025,.31),'tray',.012)
    box('Recessed liner',(0,.014,0),(.418,.006,.268),'liner',.016)
    for x in [-.224,.224]:box('Raised side rim',(x,.022,0),(.012,.032,.28),'tray',.006)
    for z in [-.149,.149]:box('Raised end rim',(0,.022,z),(.43,.032,.01),'tray',.005)
def napkin(p=(.11,.021,0)):
    box('Folded linen napkin',p,(.12,.012,.17),'paper',.005)
    for x in [.063,.069,.075]:tube('Woven napkin stripe',[(x,.029,-.07),(x,.029,.07)],.001,'seam')
def coffee():
    tray();napkin()
    p=(-.065,.02,-.012)
    lathe('Porcelain saucer',[(0,0),(.062,0),(.069,.005),(.068,.01),(.051,.009),(.03,.004),(0,.004)],p,'ivory')
    cup=(p[0],p[1]+.008,p[2])
    lathe('Open porcelain cup',[(0,0),(.032,0),(.036,.007),(.045,.093),(.043,.1),(.039,.1),(.039,.094),(.03,.014),(0,.014)],cup,'ivory')
    lathe('Coffee meniscus',[(.038,.087),(0,.087)],cup,'coffee')
    tube('Cup handle',[(cup[0]-.041-.029*math.sin(t),cup[1]+.052+.032*math.cos(t),cup[2]) for t in [math.pi*i/24 for i in range(25)]],.006,'ivory')
    box('Teaspoon stem',(.12,.035,.006),(.013,.004,.105),'tray',.003)
    ellipsoid('Teaspoon bowl',(.12,.035,-.055),(.014,.003,.022),'tray')
def water():
    tray();napkin()
    p=(-.066,.02,0)
    lathe('Open drinking tumbler',[(0,0),(.032,0),(.037,.004),(.045,.126),(.044,.13),(.04,.13),(.034,.009),(0,.009)],p,'glass')
    lathe('Water in tumbler',[(.04,.095),(0,.095)],p,'water')
    for i in range(20):
        a=2*math.pi*i/20
        tube('Tumbler fluting',[(-.066+.035*math.cos(a),.028,.035*math.sin(a)),(-.066+.042*math.cos(a),.139,.042*math.sin(a))],.0007,'glass')
def meal():
    tray()
    box('Meal dish',(-.045,.035,-.015),(.275,.037,.21),'ivory',.017)
    box('Meal well',(-.045,.055,-.015),(.246,.009,.18),'liner',.014)
    for x,z,s in [(-.113,-.035,.055),(-.06,-.035,.041),(-.102,.02,.046)]:ellipsoid('Rice portion',(x,.067,z),(s,.019,s*.7),'rice')
    for i in range(8):
        a=i*2.4;ellipsoid('Leaf',(0.023+math.sin(a)*.028,.068, -.035+math.cos(a)*.034),(.018,.008,.025),'green')
    for z in [-.055,-.005]:ellipsoid('Tomato',(.038,.077,z),(.014,.012,.014),'red')
    ellipsoid('Bread roll',(-.024,.075,.046),(.042,.025,.027),'bread')
    for z in [.035,.046,.057]:tube('Baked score',[(-.046,.094,z),(-.017,.098,z)],.0015,'rice')
    box('Cutlery napkin',(.143,.027,0),(.068,.012,.185),'paper',.005)
    box('Fork handle',(.136,.039,.035),(.009,.004,.09),'tray',.002)
    box('Fork neck',(.136,.039,-.019),(.018,.004,.028),'tray',.002)
    for x in [.129,.136,.143]:box('Fork tine',(x,.039,-.041),(.003,.004,.026),'tray',.001)
    box('Knife',(.157,.039,0),(.01,.004,.155),'tray',.002)
def blanket():
    for y,d in [(.005,.09),(.046,.085),(.085,.075)]:box('Soft folded blanket',(0,y,0),(.40,d,.25),'cloth',.035)
    for z in [-.105,.105]:
        tube('Bound blanket edge',[(x,.122,z) for x in [-.177,-.15,-.1,0,.1,.15,.177]],.0022,'seam')
    for i in range(31):
        x=-.17+i*.011
        tube('Stitched hem',[(x,.123,-.096),(x+.004,.123,-.093)],.00055,'seam')
    for x in [-.115,-.102]:tube('Woven airline stripe',[(x,.124,-.09),(x,.124,.09)],.002,'seam')

gallery=[];manifest={}
for key,build in [('coffee',coffee),('water',water),('meal',meal),('blanket',blanket)]:
    active=[];build()
    bpy.ops.object.select_all(action='DESELECT')
    for o in active:o.select_set(True)
    bpy.context.view_layer.objects.active=active[0]
    # Export a single mesh per material; the editable originals stay in the .blend.
    originals=list(active);copies=[]
    for o in originals:
        copy=o.copy();copy.data=o.data.copy();bpy.context.collection.objects.link(copy);copies.append(copy)
    bpy.ops.object.select_all(action='DESELECT')
    for o in copies:o.select_set(True)
    bpy.context.view_layer.objects.active=copies[0]
    bpy.ops.object.convert(target='MESH');bpy.ops.object.join()
    merged=bpy.context.object;merged.name='Service '+key
    path=OUT/(key+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_cameras=False,export_lights=False)
    bpy.data.objects.remove(merged,do_unlink=True)
    data=path.read_bytes();doc=json.loads(data[20:20+int.from_bytes(data[12:16],'little')])
    tris=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
    manifest[key]={'bytes':len(data),'triangles':tris}
    for o in originals:o.location.x+=(-.81+len(gallery)*.54)
    gallery.append(originals)

box('Display plinth',(0,-.11,0),(2.3,.18,.58),'paper',.025)
s=bpy.context.scene;s.world.use_nodes=True;s.world.node_tree.nodes.get('Background').inputs[0].default_value=(.45,.52,.60,1)
for name,p,power,size in [('Key',(-1,3,2),400,3),('Fill',(2,2,-1),200,2)]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=xyz(p);o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
c=bpy.data.cameras.new('Service kit camera');o=bpy.data.objects.new('Service kit camera',c);s.collection.objects.link(o);o.location=xyz((1.6,1.65,2.6));o.rotation_euler=(Vector(xyz((0,.025,0)))-o.location).to_track_quat('-Z','Y').to_euler();c.type='ORTHO';c.ortho_scale=2.7;s.camera=o
s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=24;s.cycles.use_denoising=True
s.render.resolution_x=1400;s.render.resolution_y=700;s.render.resolution_percentage=100;s.view_settings.view_transform='AgX'
s.render.filepath=str(PREVIEW/'service-items.png');s.render.image_settings.file_format='PNG'
s['author']='Original FLIGHT 404 Blender props';s['mount']='Export origin is tray centre; game attaches at [0,1.01,-0.37].'
bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'service-items.blend'))
(SRC/'service-items-manifest.json').write_text(json.dumps(manifest,indent=2))
bpy.ops.render.render(write_still=True)
print(json.dumps(manifest))
