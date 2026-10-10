"""Original FLIGHT 404 journey kit; Blender 5.x, metres, exported +Y up.

Run: /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup
     --python scripts/blender/build_journey_assets.py

All meshes are authored here, with no downloaded geometry or textures. Game weapons
are closed, fictional visual props only. No functioning internal mechanism exists.
"""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'client/public/models/journey'
SRC = ROOT / 'models/blender'
PREVIEW = ROOT / 'docs/previews'
for folder in [OUT, SRC, PREVIEW]: folder.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.scene.unit_settings.system = 'METRIC'
def xyz(p): return (p[0], -p[2], p[1])

def material(name, rgb, metal=0, rough=.45, glow=0):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    col = tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb) + (1,)
    mat.diffuse_color = col
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = col
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if glow:
        p.inputs['Emission Color'].default_value = col
        p.inputs['Emission Strength'].default_value = glow
    return mat

M = {
    'ivory': material('Warm cabin composite', (.91,.90,.85)),
    'white': material('Porcelain shell', (.97,.98,.97), .08,.28),
    'navy': material('Airline midnight navy', (.055,.15,.22), .08,.38),
    'blue': material('Ocean blue upholstery', (.22,.39,.49), 0,.76),
    'glass': material('Blue architectural glazing', (.38,.60,.69), .52,.17),
    'steel': material('Brushed aluminium', (.59,.66,.69), .72,.28),
    'dark': material('Graphite rubber', (.055,.075,.085), 0,.8),
    'cyan': material('Cyan illuminated instrument', (.26,.82,.86), .05,.3, 1.5),
    'amber': material('Warm amber accent', (.91,.58,.25), .25,.35),
    'lamp': material('Warm white luminaires', (1,.95,.82), 0,.3, 2.5),
    'paper': material('Ivory document paper', (.97,.95,.87), 0,.84),
    'red': material('Closed burgundy game case', (.55,.07,.09), .12,.42),
    'rope': material('Natural woven rope', (.69,.54,.34), 0,.93),
    'rope_dark': material('Twisted fibre accent', (.46,.34,.19), 0,.95),
    'runway': material('Taxiway aggregate', (.20,.25,.28), 0,.93),
}
active=[]
def finish(obj, name, mat):
    obj.name=name; obj.data.materials.append(M[mat]); active.append(obj); return obj
def box(name,p,size,mat,r=.015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(p)); o=bpy.context.object
    o.dimensions=(size[0],size[2],size[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(o,name,mat)
    if r:
        b=o.modifiers.new('Manufactured rounded edges','BEVEL'); b.width=min(r,min(size)*.44); b.segments=2
        o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL')
    return o
def tube(name, points, radius, mat, resolution=2):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=radius;c.bevel_resolution=resolution
    s=c.splines.new('POLY');s.points.add(len(points)-1)
    for q,p in zip(s.points,points):q.co=(*xyz(p),1)
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);return finish(o,name,mat)
def cyl(name,p,radius,depth,mat,vertices=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=xyz(p));o=bpy.context.object
    finish(o,name,mat)
    b=o.modifiers.new('Soft circular edges','BEVEL');b.width=min(.012,depth*.15);b.segments=2
    o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return o
def text(name,body,p,size,mat,align='CENTER'):
    c=bpy.data.curves.new(name,'FONT');c.body=body;c.size=size;c.align_x=align;c.align_y='CENTER';c.extrude=.0008;c.resolution_u=3
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.location=xyz(p)
    o.rotation_euler=(math.pi/2,0,0);return finish(o,name,mat)
def floor_text(name,body,p,size,mat):
    o=text(name,body,p,size,mat);o.rotation_euler=(0,0,0);return o
def wing_mark(p,scale=1,mat='amber'):
    for side in [-1,1]:
        for i in range(3):
            o=box('F404 wing emblem',(p[0]+side*(.06+i*.045)*scale,p[1]+i*.015*scale,p[2]),(.09*scale,.012*scale,.007*scale),mat,.004)
            o.rotation_euler.y=-side*.24

def gate_desk():
    box('Desk shadow plinth',(0,.055,0),(3.35,.11,.75),'dark',.05)
    box('Seamless gate desk',(0,.58,0),(3.50,1.02,.82),'ivory',.10)
    box('Navy facade inset',(0,.62,.422),(3.24,.58,.024),'navy',.055)
    box('Brass fascia rule',(0,.22,.425),(3.20,.018,.023),'amber',.006)
    box('Stone desk counter',(0,1.12,0),(3.72,.11,1.00),'white',.06)
    for x in [-1.45,1.45]:
        box('Sign support',(x,1.98,-.35),(.045,1.65,.045),'steel')
    box('Suspended gate placard',(0,2.63,-.35),(3.60,.49,.15),'navy',.035)
    text('Gate number','GATE 04',(0,2.65,-.268),.25,'white')
    text('Airline wordmark','F L I G H T   4 0 4',(.18,.64,.443),.18,'white')
    wing_mark((-1.08,.64,.45),1.5)
    for x in [-.88,.88]:
        box('Monitor foot',(x,1.19,-.05),(.25,.028,.19),'navy')
        box('Monitor neck',(x,1.32,-.05),(.042,.23,.035),'steel')
        box('Monitor shell',(x,1.48,-.05),(.50,.30,.045),'navy',.024)
        box('Boarding display',(x,1.48,-.023),(.445,.246,.008),'glass',.010)
        for y,w in [(1.55,.27),(1.48,.33),(1.41,.20)]:box('Display information',(x-.025,y,-.016),(w,.008,.003),'cyan',.001)

def jetbridge():
    box('Passage floor',(0,-.065,0),(3.35,.13,8),'steel',.02)
    box('Navy runner',(0,.014,0),(2.81,.025,8),'blue',.008)
    for x in [-1.46,1.46]:
        box('Runner border',(x,.012,0),(.06,.018,8),'amber',.004)
        box('Window sill',(x,1.02,0),(.14,.16,8),'ivory')
        box('Lower passage wall',(x,.52,0),(.17,.92,8),'ivory')
        box('Upper beam',(x,2.65,0),(.21,.20,8),'navy')
        # Window spans are open, so the runtime world remains visible.
        tube('Continuous handrail',[(x,1.21,-3.9),(x,1.21,3.9)],.028,'steel')
        for z in [-4,-2,0,2,4]:box('Window mullion',(x,1.91,z),(.11,1.33,.10),'steel',.009)
    box('Roof acoustic liner',(0,2.83,0),(3.35,.12,8),'ivory',.025)
    for z in [-3,-1,1,3]:
        box('Ceiling light slot',(0,2.755,z),(1.12,.026,.16),'navy')
        box('Ceiling light diffuser',(0,2.737,z),(1.02,.012,.105),'lamp')
    for z in [-3.97,3.97]:
        for x in [-1.58,1.58]:box('Boarding doorway jamb',(x,1.43,z),(.17,2.84,.16),'navy')
        box('Boarding doorway lintel',(0,2.79,z),(3.30,.20,.16),'navy')
    for z in [-2.9,-.9,1.1,3.1]:
        for x in [-.09,.09]:
            o=box('Boarding direction chevron',(x,.035,z),(.20,.008,.045),'ivory',.001);o.rotation_euler.z= -(.63 if x<0 else -.63)

def scanner():
    box('Scanner foot',(0,.035,0),(.43,.07,.39),'navy',.055)
    box('Scanner pedestal',(0,.52,0),(.25,.98,.23),'ivory',.05)
    box('Reader head',(0,1.075,.018),(.43,.19,.37),'navy',.045)
    box('Scan glass',(0,1.179,.018),(.30,.018,.24),'glass',.035)
    for z in [-.082,.114]:box('Illuminated scan edge',(0,1.192,z),(.245,.009,.008),'cyan',.003)
    text('Scan caption','SCAN',(0,.85,.124),.07,'navy')
    box('Status indicator',(0,.69,.131),(.073,.036,.009),'cyan',.006)

def documents():
    box('Navy flight dispatch folder',(0,.008,0),(.30,.016,.40),'navy',.009)
    box('Paper stack',(0,.022,-.004),(.269,.014,.365),'paper',.003)
    box('Steel clipboard clip',(0,.038,-.174),(.10,.018,.044),'steel',.006)
    floor_text('Dispatch title','FLIGHT 404',(0,.031,-.123),.023,'navy')
    floor_text('Document subtitle','CREW MANIFEST',(0,.031,-.083),.012,'navy')
    for i in range(8):
        z=-.04+i*.023
        box('Manifest row',(0,.031,z),(.216,.001,.0018),'blue',0)
        box('Manifest check',(-.092,.032,z-.008),(.009,.001,.009),'cyan',0)
        box('Manifest crew name',(-.027,.032,z-.008),(.082,.001,.0025),'navy',0)
    # Stylized sign-off seal remains purely decorative.
    cyl('Dispatch approval seal',(.080,.033,.144),.021,.002,'amber',20)

def passport():
    box('Passport bound cover',(0,.008,0),(.110,.016,.155),'navy',.007)
    box('Passport cream page edge',(.002,.014,0),(.099,.005,.141),'paper',.002)
    box('Passport top cover',(0,.018,0),(.110,.003,.155),'navy',.004)
    floor_text('Passport title','PASSPORT',(0,.020,-.037),.011,'amber')
    cyl('Passport foil crest',(0,.021,.006),.016,.001,'amber',24)
    box('Passport crest centre',(0,.022,.006),(.018,.001,.016),'navy',.003)
    floor_text('Passport signature','404',(0,.021,.046),.011,'amber')

def suitcase():
    for x in [-.145,.145]:
        for z in [-.076,.076]:
            o=cyl('Spinner wheel',(x,.048,z),.037,.035,'dark',14);o.rotation_euler.y=math.pi/2
    box('Hard shell carry-on',(0,.32,0),(.40,.52,.245),'blue',.065)
    box('Suitcase seam',(0,.32,.006),(.408,.017,.249),'navy',.05)
    for x in [-.12,-.06,0,.06,.12]:box('Moulded shell rib',(x,.32,.125),(.013,.37,.007),'steel',.006)
    for x in [-.075,.075]:box('Telescopic handle rail',(x,.639,-.025),(.016,.205,.017),'steel',.004)
    box('Carry-on grip',(0,.745,-.025),(.181,.038,.035),'navy',.011)
    box('Luggage ID tag',(.135,.51,.135),(.055,.084,.012),'amber',.008)
    text('Luggage ID','04',(.135,.512,.144),.031,'navy')

def airport_terminal():
    box('Terminal apron plinth',(0,.12,0),(28.5,.24,8.5),'ivory',.12)
    box('Terminal service core',(0,2.91,-1.8),(27.8,5.48,4.2),'ivory',.14)
    for x in range(-13,14,2):
        box('Terminal glass bay',(x,2.81,2.32),(1.88,4.52,.07),'glass',.01)
        box('Facade vertical fin',(x+.96,2.92,2.40),(.12,5.25,.40),'steel',.012)
    for y in [.58,2.95,5.18]:box('Facade horizontal rail',(0,y,2.43),(27.7,.12,.20),'steel')
    box('Cantilever terminal roof',(0,5.75,0),(29.2,.30,8.7),'white',.10)
    box('Roof navy fascia',(0,5.73,4.32),(29.2,.27,.11),'navy',.02)
    for x in [-10,-5,0,5,10]:
        box('Terminal entry frame',(x,1.48,2.56),(1.56,2.47,.19),'navy',.015)
        box('Entry glass',(x,1.48,2.67),(1.37,2.29,.035),'glass',.004)
        box('Door split',(x,1.48,2.70),(.04,2.31,.028),'steel')
        box('Entry canopy',(x,3.00,3.16),(2.02,.12,1.5),'white')
        text('Concourse gate number',str((x+10)//5+1).zfill(2),(x,3.55,2.625),.40,'white')
    box('Airport rooftop sign',(0,6.28,-1),(9,.88,.22),'navy',.04)
    text('Airport name','FLIGHT 404',(0,6.30,-.875),.60,'white')

def runway_lights():
    for x in [-9,9]:
        cyl('Inset light base',(x,.028,0),.14,.055,'dark')
        cyl('Light steel housing',(x,.07,0),.080,.065,'steel')
        cyl('Runway edge lens',(x,.137,0),.058,.075,'lamp')
        box('Inset approach tile',(x,.005,0),(.52,.01,.52),'runway',.02)

def sabotage_case():
    box('Closed fictional danger case',(0,.136,0),(.42,.265,.22),'red',.04)
    box('Case lid seal',(0,.168,0),(.425,.013,.224),'dark',.034)
    for x in [-.145,.145]:
        box('Case reinforced corner',(x,.136,.11),(.035,.233,.018),'navy',.007)
        box('Closed case latch',(x,.168,.128),(.035,.064,.027),'steel',.005)
    tube('Case carry grip',[(-.066,.27,0),(-.066,.308,0),(.066,.308,0),(.066,.27,0)],.009,'navy')
    box('Fictional prop label',(0,.112,.117),(.13,.064,.006),'ivory',.004)
    text('Closed case identifier','X-04',(0,.112,.123),.041,'navy')

def knife():
    box('Fictional prop grip',(0,.06,0),(.035,.12,.025),'navy',.012)
    for y in [.03,.055,.08]:box('Grip inset',(0,y,.013),(.025,.004,.002),'steel',.001)
    box('Blunt prop guard',(0,.125,0),(.071,.016,.034),'steel',.006)
    verts=[(-.020,.135,-.006),(.018,.135,-.006),(.018,.270,-.006),(-.006,.321,-.006),(-.021,.245,-.006)]
    verts += [(x,y,.006) for x,y,z in verts]
    faces=[(0,4,3,2,1),(5,6,7,8,9)]+[(i,(i+1)%5,(i+1)%5+5,i+5) for i in range(5)]
    me=bpy.data.meshes.new('Stylized prop blade');me.from_pydata([xyz(v) for v in verts],[],faces);me.update()
    o=bpy.data.objects.new('Stylized prop blade',me);bpy.context.collection.objects.link(o);finish(o,'Stylized prop blade','steel')
    b=o.modifiers.new('Rounded prop edges','BEVEL');b.width=.002;b.segments=2;o.modifiers.new('Weighted blade normals','WEIGHTED_NORMAL')

def rope():
    pts=[]
    for i in range(251):
        a=i*math.pi*2/62.5;r=.041+.00024*i
        pts.append((r*math.cos(a),.019+.002*math.sin(a*.5),r*.80*math.sin(a)))
    tube('Coiled fictional rope',pts,.009,'rope',2)
    # A shallow alternating fibre highlight gives readable twist without textures.
    braid=[]
    for i in range(501):
        a=i*math.pi*2/125;r=.041+.00012*i
        braid.append(((r+.007*math.cos(i*.65))*math.cos(a),.019+.007*math.sin(i*.65),(.80*r+.007*math.cos(i*.65))*math.sin(a)))
    tube('Woven rope fibre',braid,.0013,'rope_dark',1)
    tube('Rope loose tail',[(.10,.019,0),(.115,.019,.035),(.112,.019,.07),(.085,.019,.09)],.009,'rope',2)

spec=[
    ('gate-desk',gate_desk,'Gate counter with check-in monitors and elevated sign; front +Z.'),
    ('jetbridge',jetbridge,'Open-air glazed-frame passage aligned Z; floor top Y=0; entrances ±4m Z.'),
    ('boarding-scanner',scanner,'Pedestal document scanner; scan surface Y=1.19m; front +Z.'),
    ('crew-documents',documents,'Dispatch folder and manifest; lie flat in XZ; readable from +Z.'),
    ('passport',passport,'Small flat navy passport; lie flat in XZ; readable from +Z.'),
    ('suitcase',suitcase,'Carry-on with raised handle and wheels; front +Z.'),
    ('airport-terminal',airport_terminal,'Terminal facade faces +Z, 29.2m wide, 6.72m tall.'),
    ('runway-lights',runway_lights,'One pair of edge lamps at X=-9,+9m, runway centre origin.'),
    ('sabotage-case',sabotage_case,'Fictional sealed red game prop. No internals or functional mechanism.'),
    ('knife',knife,'Rounded stylized fictional prop. Grip at bottom, tip +Y.'),
    ('rope',rope,'Decorative coil lies on XZ plane; no rig or mechanical simulation.'),
]
manifest={
    'name':'FLIGHT 404 original journey kit','version':1,'author':'Original procedural Blender modeling for FLIGHT 404',
    'license':'CC0-1.0','provenance':'Original parametric meshes authored in scripts/blender/build_journey_assets.py; no third-party geometry or images.',
    'request':'Create attractive airline boarding terminal, jetbridge, documents, baggage, runway architecture and fictional closed sabotage props for browser game.',
    'negativePrompt':'No photoreal imagery, branding, downloaded meshes, external textures, real weapon internals or functional mechanisms.',
    'units':'metres','upAxis':'+Y','forwardAxis':'+Z','origin':'Base/floor centre except flat document props and runway-light pair, which use table/runway centre.',
    'budget':{'maxTotalBytes':3000000,'textures':0,'externalResources':0},
    'blenderVersion':bpy.app.version_string,'source':'models/blender/journey-assets.blend','assets':{}
}
collections={}
for name,builder,contract in spec:
    active=[];builder(); originals=list(active)
    col=bpy.data.collections.new('Journey / '+name);bpy.context.scene.collection.children.link(col);collections[name]=col
    for o in originals:
        for parent in list(o.users_collection):parent.objects.unlink(o)
        col.objects.link(o)
    # Keep all editable source objects. Export a compact joined copy per asset.
    copies=[]
    for o in originals:
        c=o.copy();c.data=o.data.copy();bpy.context.collection.objects.link(c);copies.append(c)
    bpy.ops.object.select_all(action='DESELECT')
    for o in copies:o.select_set(True)
    bpy.context.view_layer.objects.active=copies[0]
    bpy.ops.object.convert(target='MESH');bpy.ops.object.join()
    merged=bpy.context.object;merged.name=name
    # Export origin is exactly scene origin, independent of which mesh was active.
    bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    path=OUT/(name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_cameras=False,export_lights=False,export_texcoords=False,export_animations=False)
    corners=[merged.matrix_world @ Vector(v) for v in merged.bound_box]
    dimensions=[max(v[i] for v in corners)-min(v[i] for v in corners) for i in [0,2,1]]
    data=path.read_bytes();doc=json.loads(data[20:20+int.from_bytes(data[12:16],'little')])
    tris=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
    manifest['assets'][name]={'path':'/models/journey/'+name+'.glb','bytes':len(data),'triangles':tris,'dimensionsMeters':dimensions,'sha256':hashlib.sha256(data).hexdigest(),'contract':contract}
    bpy.data.objects.remove(merged,do_unlink=True)
    col.hide_render=True;col.hide_viewport=True

# A retained studio scene provides real, repeatable material and silhouette evidence.
s=bpy.context.scene;s.world.use_nodes=True;s.world.node_tree.nodes.get('Background').inputs[0].default_value=(.32,.41,.51,1)
s.world.node_tree.nodes.get('Background').inputs[1].default_value=.45
active=[]
box('Studio ground',(0,-.19,0),(55,.25,45),'ivory',.1)
for name,p,power,size in [('Studio key',(-8,15,10),2200,10),('Studio fill',(10,8,-5),1400,9),('Studio rim',(-7,6,-12),1200,6)]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=xyz(p);o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
c=bpy.data.cameras.new('Journey asset preview');camera=bpy.data.objects.new('Journey asset preview',c);s.collection.objects.link(camera);s.camera=camera;c.type='ORTHO'
s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=24;s.cycles.use_denoising=True
s.render.resolution_x=1600;s.render.resolution_y=1000;s.render.resolution_percentage=100
s.view_settings.view_transform='AgX';s.render.image_settings.file_format='PNG'
def show(name,translation=(0,0,0),scale=1):
    col=collections[name];col.hide_render=False;col.hide_viewport=False
    for o in col.objects:o.location=Vector(xyz(translation))+o.location*scale;o.scale*=scale
def shoot(filename,pos,target,ortho):
    camera.location=xyz(pos);camera.rotation_euler=(Vector(xyz(target))-camera.location).to_track_quat('-Z','Y').to_euler();c.ortho_scale=ortho
    s.render.filepath=str(PREVIEW/filename);bpy.ops.render.render(write_still=True)
show('gate-desk',(-3,0,2.3));show('boarding-scanner',(-.55,0,2.8));show('suitcase',(-1.6,0,3.65));show('jetbridge',(3.2,0,-.5))
shoot('journey-boarding.png',(12,10,16),(1,1,0),15.5)
for col in collections.values():col.hide_render=True;col.hide_viewport=True
for name,p,scale in [('crew-documents',(-.9,0,0),3),('passport',(-.15,.02,.27),3),('sabotage-case',(.45,0,-.12),2.6),('knife',(1.35,.02,.2),2.3),('rope',(1.25,.02,-.40),2.5)]:show(name,p,scale)
shoot('journey-props.png',(3.0,4.7,5.8),(.2,.3,0),4.8)
for col in collections.values():col.hide_render=True;col.hide_viewport=True
show('airport-terminal');show('runway-lights',(0,0,6))
shoot('journey-airport.png',(23,16,27),(0,2,0),36)
# The source opens on the terminal studio shot; each editable collection is named.
s['provenance']=manifest['provenance'];s['license']='CC0-1.0';s['runtime_axes']='All GLBs exported +Y-up metres, front +Z.'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'journey-assets.blend'))
manifest['totalBytes']=sum(a['bytes'] for a in manifest['assets'].values())
manifest['totalTriangles']=sum(a['triangles'] for a in manifest['assets'].values())
assert manifest['totalBytes']<=3000000, 'Runtime asset budget exceeded'
manifest['scriptSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
manifest['sourceSha256']=hashlib.sha256((SRC/'journey-assets.blend').read_bytes()).hexdigest()
(SRC/'journey-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('JOURNEY_ASSETS_COMPLETE '+json.dumps({'assets':len(spec),'bytes':manifest['totalBytes'],'triangles':manifest['totalTriangles']}))
