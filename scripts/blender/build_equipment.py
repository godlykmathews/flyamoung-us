"""Author the original FLIGHT 404 equipment asset kit in Blender.

Blender 4.5+/5.x. Coordinates in the helpers use game metres, +Y up, +Z front.
The actual Blender coordinates are (x,-z,y); glTF's Y-up export restores them.
Run: Blender --background --factory-startup --python scripts/blender/build_equipment.py
Optional arguments after --: --no-render (skip the evidence preview only).
"""
import bpy, math, json, sys, hashlib
from pathlib import Path
from mathutils import Vector, Matrix, Euler

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT/'models/blender'
OUT = ROOT/'client/public/models/interior'
PREVIEW = ROOT/'docs/previews'
for p in [SRC,OUT,PREVIEW]:p.mkdir(parents=True,exist_ok=True)
for obj in list(bpy.data.objects):bpy.data.objects.remove(obj,do_unlink=True)
for scene in list(bpy.data.scenes)[1:]:bpy.data.scenes.remove(scene)
C = Matrix(((1,0,0),(0,0,-1),(0,1,0)))
def xyz(p):return (p[0],-p[2],p[1])
def rotation(r):return (C@Euler(r,'XYZ').to_matrix()@C.transposed()).to_euler()
def rgb(hex):
    h=hex.lstrip('#'); values=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values)+(1,)
def material(name,color,metal=0,rough=.5,emission=0):
    m=bpy.data.materials.new(name);m.diffuse_color=rgb(color);m.use_nodes=True;m.use_backface_culling=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=rgb(color)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if emission:p.inputs['Emission Color'].default_value=rgb(color);p.inputs['Emission Strength'].default_value=emission
    return m
MAT={
 'ivory':material('Ivory enamel','#deded3',.16,.34),
 'white':material('Porcelain / paper','#f4f0e7',.01,.29),
 'navy':material('Navy polymer','#233d51',.05,.65),
 'slate':material('Instrument panel','#364753',.38,.44),
 'black':material('Rubber seals','#101b23',.04,.88),
 'steel':material('Brushed aluminum','#a7b4bb',.84,.29),
 'chrome':material('Polished steel','#bec7cd',.95,.18),
 'darksteel':material('Gunmetal fasteners','#54626a',.78,.37),
 'amber':material('Warning amber','#e2ac46',.15,.34),
 'red':material('Emergency red','#a93731',.08,.53),
 'blue':material('Water blue','#548fac',.1,.36),
 'food':material('Baked bread','#ca8e49',0,.88),
 'greens':material('Salad greens','#64823b',0,.87),
 'tomato':material('Tomato','#be4a32',0,.45),
 'rice':material('Rice cream','#e4d6b3',0,.88),
 'coffee':material('Coffee','#2a1a12',0,.19),
 'status':material('status_lamp','#e5b652',.1,.27,.65),
}
atlas_data=json.loads((SRC/'equipment-atlas.json').read_text())
atlas_image=bpy.data.images.load(str(SRC/'equipment-atlas.png'));atlas_image.pack()
def atlasmat(name,emit=0):
    m=material(name,'#ffffff',0,.78 if not emit else .4)
    p=m.node_tree.nodes.get('Principled BSDF');t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=atlas_image
    m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
    if emit:m.node_tree.links.new(t.outputs['Color'],p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=emit
    return m
MAT['print']=atlasmat('Embedded instrument / placard atlas')
MAT['screen']=atlasmat('Emissive instrument displays',.8)

ACTIVE=None
def scene(name):
    global ACTIVE
    s=bpy.data.scenes.new(name);s.unit_settings.system='METRIC';s.unit_settings.scale_length=1
    bpy.context.window.scene=s
    ACTIVE=bpy.data.collections.new(name+' / editable components');s.collection.children.link(ACTIVE)
    s.world=bpy.data.worlds.new(name+' sky');s.world.use_nodes=True
    s.world.node_tree.nodes.get('Background').inputs[0].default_value=(.32,.4,.48,1)
    s.world.node_tree.nodes.get('Background').inputs[1].default_value=.45
    return s
def link(obj):
    for c in list(obj.users_collection):c.objects.unlink(obj)
    ACTIVE.objects.link(obj)
    return obj
def mesh(name,verts,faces,mat='slate',smooth=False):
    m=bpy.data.meshes.new(name);m.from_pydata([xyz(v) for v in verts],[],faces);m.update()
    o=bpy.data.objects.new(name,m);ACTIVE.objects.link(o);m.materials.append(MAT[mat])
    for p in m.polygons:p.use_smooth=smooth
    return o
def bevel(o,amount=.008,segments=2):
    if not amount:return o
    mod=o.modifiers.new('Manufactured edge radius','BEVEL');mod.width=amount;mod.segments=1 if amount<.003 else segments
    mod.affect='EDGES';mod.harden_normals=True
    n=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');n.keep_sharp=True;n.weight=50
    for p in o.data.polygons:p.use_smooth=True
    return o
def box(name,p,d,mat='slate',radius=.006,r=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(p));o=link(bpy.context.object);o.name=name
    o.dimensions=(d[0],d[2],d[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.rotation_euler=rotation(r);o.data.materials.append(MAT[mat]);return bevel(o,min(radius,min(d)*.45))
def cylinder(name,p,radius,depth,mat='steel',axis='y',vertices=24,tip=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=radius,radius2=radius if tip is None else tip,depth=depth,location=xyz(p))
    o=link(bpy.context.object);o.name=name
    if axis=='z':o.rotation_euler=(math.pi/2,0,0)
    if axis=='x':o.rotation_euler=(0,math.pi/2,0)
    o.data.materials.append(MAT[mat]);return bevel(o,min(.0025,radius*.12),2)
def ball(name,p,scale,mat='chrome'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,location=xyz(p));o=link(bpy.context.object);o.name=name
    o.scale=(scale[0],scale[2],scale[1]);o.data.materials.append(MAT[mat])
    for f in o.data.polygons:f.use_smooth=True
    return o
def tube(name,points,radius,mat='steel',cyclic=False,resolution=3):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=10
    curve.bevel_depth=radius;curve.bevel_resolution=resolution
    spline=curve.splines.new('POLY');spline.points.add(len(points)-1)
    for point,p in zip(spline.points,points):point.co=(*xyz(p),1)
    spline.use_cyclic_u=cyclic
    obj=bpy.data.objects.new(name,curve);ACTIVE.objects.link(obj);curve.materials.append(MAT[mat]);return obj
def ring(name,p,major,minor,mat='steel',axis='z',scale=(1,1,1)):
    points=[]
    for i in range(40):
        a=2*math.pi*i/40
        q=(major*math.cos(a),major*math.sin(a),0) if axis=='z' else (major*math.cos(a),0,major*math.sin(a))
        points.append(tuple(p[j]+q[j]*scale[j] for j in range(3)))
    return tube(name,points,minor,mat,True,2)
def panel(name,key,p,size,r=(0,0,0),emission=False,uvcrop=None):
    w,h=size
    o=mesh(name,[(-w/2,-h/2,0),(w/2,-h/2,0),(w/2,h/2,0),(-w/2,h/2,0)],[(0,1,2,3)],'screen' if emission else 'print')
    o.location=xyz(p);o.rotation_euler=rotation(r)
    x,y,tw,th=atlas_data['rects'][key]
    if uvcrop:
        cx,cy,cw,ch=uvcrop;x+=cx*tw;y+=cy*th;tw*=cw;th*=ch
    aW,aH=atlas_data['size'];uvs=[((x+.75)/aW,1-(y+th-.75)/aH),((x+tw-.75)/aW,1-(y+th-.75)/aH),((x+tw-.75)/aW,1-(y+.75)/aH),((x+.75)/aW,1-(y+.75)/aH)]
    layer=o.data.uv_layers.new(name='Atlas UV')
    for i,uv in enumerate(uvs):layer.data[i].uv=uv
    return o
def screw(p,radius=.008):
    cylinder('Recessed screw',p,radius,.005,'darksteel','z',16)
    box('Screw slot',(p[0],p[1],p[2]+.003),(.012,.0015,.001),'black',.0003,r=(0,0,.65))
def lamp(p):
    cylinder('Lamp bezel',p,.018,.012,'darksteel','z',20)
    return cylinder('Status lamp',(p[0],p[1],p[2]+.009),.0115,.008,'status','z',20)
def parent(objects,name,p=(0,0,0),r=(0,0,0)):
    o=bpy.data.objects.new(name,None);ACTIVE.objects.link(o);o.location=xyz(p);o.rotation_euler=rotation(r)
    for obj in objects:obj.parent=o
    return o
def rotate_all(name,r):
    children=[o for o in ACTIVE.objects if o.parent is None];return parent(children,name,r=r)
def lathe(name,p,profile,mat='white',segments=32):
    verts=[];faces=[]
    for radius,y in profile:
        for i in range(segments):
            a=2*math.pi*i/segments;verts.append((p[0]+radius*math.cos(a),p[1]+y,p[2]+radius*math.sin(a)))
    for row in range(len(profile)-1):
        for i in range(segments):
            a=row*segments+i;b=row*segments+(i+1)%segments;faces.append((a,a+segments,b+segments,b))
    return mesh(name,verts,faces,mat,True)
def cup(name,p):
    x,y,z=p
    lathe(name,p,[(.004,0),(.032,0),(.041,.005),(.047,.087),(.047,.094),(.041,.094),(.034,.016),(.002,.016)])
    ring(name+' handle',(x+.047,y+.048,z),.029,.006,'white','z',scale=(.75,1,1))
    cylinder(name+' coffee',(x,y+.077,z),.039,.002,'coffee',vertices=32)
def rounded_rim(name,p,size,mat='chrome'):
    x,y,z=p;w,d=size;rad=.025
    pts=[]
    for cx,cz,start in [(w/2-rad,d/2-rad,0),(-w/2+rad,d/2-rad,90),(-w/2+rad,-d/2+rad,180),(w/2-rad,-d/2+rad,270)]:
        for i in range(7):
            a=math.radians(start+i*15);pts.append((x+cx+rad*math.cos(a),y,z+cz+rad*math.sin(a)))
    # Explicit four separate radius corners avoid hard, blocklike tray silhouettes.
    return tube(name,pts,.007,mat,True,2)

def clipboard():
    s=scene('01 Clipboard')
    box('Rounded navy clipboard',(0,0,0),(.43,.57,.027),'navy',.023)
    for i in range(3):box('Layered checklist paper',(i*.001,-.012,.017+i*.002),(.378,.488,.0018),'white',.001)
    panel('Printed readiness checklist','checklist',(0,-.012,.023),(.378,.488))
    box('Clip backing',(0,.24,.024),(.177,.066,.018),'steel',.009)
    cylinder('Clamp hinge',(0,.247,.044),.012,.16,'chrome','x')
    box('Spring clamp',(0,.226,.044),(.146,.032,.022),'chrome',.006,r=(-.15,0,0))
    tube('Hanging loop',[(-.03,.274,.02),(-.03,.294,.02),(0,.311,.02),(.03,.294,.02),(.03,.274,.02)],.005,'steel')
    for x in [-.064,.064]:screw((x,.243,.058),.005)
    cylinder('Pen barrel',(.237,-.03,.032),.008,.285,'navy')
    cylinder('Pen cap',(.237,.13,.032),.009,.058,'steel')
    cylinder('Pen writing point',(.237,-.186,.032),.007,.027,'chrome',tip=.001)
    tube('Pen clip',[(.237,.144,.04),(.239,.154,.047),(.24,.084,.048)],.0018,'chrome')
    box('Clipboard stand',(0,-.286,-.006),(.37,.028,.10),'darksteel',.004)
    lamp((.177,-.257,.017))
    rotate_all('Clipboard tilt',(-.32,0,0))
    return s

def navigation():
    s=scene('02 Flight management unit')
    box('FMS cast housing',(0,0,0),(.515,.632,.12),'slate',.022)
    box('Recessed face plate',(0,0,.059),(.476,.591,.015),'darksteel',.01)
    box('Display gasket',(0,.135,.072),(.392,.288,.022),'black',.017)
    panel('FMS active route display','fms',(0,.136,.085),(.346,.259),emission=True)
    for side in [-1,1]:
        for i in range(5):
            y=.244-i*.048
            box('Line select key',(side*.216,y,.084),(.029,.018,.019),'black',.003)
            box('Line select engraved tick',(side*.188,y,.087),(.009,.0017,.002),'white',.0001)
    for row in range(5):
        for col in range(6):
            x=-.184+col*.074;y=-.041-row*.047
            box('Tactile keypad key',(x,y,.087),(.063,.035,.019),'black',.005)
            panel('Key legend','keypad',(x,y,.098),(.062,.034),uvcrop=(col/6,row/5,1/6,1/5))
    panel('Manufacturer title','fms_title',(-.022,-.283,.069),(.36,.037))
    lamp((.21,-.28,.073))
    for x in [-.232,.232]:
        for y in [-.294,.294]:screw((x,y,.071))
    cylinder('Brightness rotary knob',(.196,.299,.071),.014,.029,'black','z')
    for i in range(9):
        a=i*2*math.pi/9
        cylinder('Knob knurl',(.196+.013*math.cos(a),.299+.013*math.sin(a),.077),.0018,.017,'darksteel','z',8)
    rotate_all('FMS viewing angle',(-.25,0,0))
    return s

def seatbelts():
    s=scene('03 Seatbelt inspection')
    box('Upholstered inspection pad',(0,0,0),(.61,.405,.035),'navy',.024)
    box('Pad piping',(0,0,-.006),(.623,.419,.018),'darksteel',.021)
    panel('Belt inspection placard','belt_title',(0,.148,.019),(.53,.047))
    # Curved webbing strips have thickness and woven UVs, with sewn edge detail.
    for side in [-1,1]:
        box('Folded woven belt',(side*.173,-.012,.04),(.25,.083,.016),'black',.005,r=(0,0,-side*.035))
        panel('Woven strap surface','webbing',(side*.173,-.012,.049),(.242,.08),r=(0,0,-side*.035))
        for y in [-.047,.022]:
            for i in range(16):box('Webbing stitch',(side*.173-.111+i*.014,y,.051),(.005,.0013,.001),'white',.0002)
    box('Latch body',(-.052,-.009,.064),(.128,.106,.043),'chrome',.012)
    box('Buckle face recess',(-.052,-.005,.088),(.106,.084,.012),'darksteel',.009)
    lever_parts=[]
    lever_parts.append(box('Lift release cover',(-.052,-.009,.101),(.104,.07,.014),'steel',.008,r=(-.08,0,0)))
    lever_parts.append(box('Lift lip',(-.052,-.04,.105),(.085,.015,.01),'chrome',.004))
    lever_parts.append(box('Release engraving',(-.052,.002,.11),(.051,.008,.001),'navy',.001))
    parent(lever_parts,'Buckle_Release')
    cylinder('Release hinge',(-.052,.037,.09),.007,.11,'chrome','x')
    tongue=[]
    tongue.append(box('Tongue metal plate',(.097,-.01,.069),(.091,.063,.011),'chrome',.007))
    tongue.append(box('Tongue locking slot',(.075,-.01,.075),(.021,.026,.001),'black',.003))
    tongue.append(box('Tongue strap slot',(.124,-.01,.075),(.01,.044,.001),'black',.002))
    parent(tongue,'Buckle_Tongue')
    panel('Inspection sequence','belt_footer',(0,-.141,.02),(.53,.04));lamp((.263,-.148,.023))
    for x in [-.281,.281]:
        for y in [-.185,.185]:screw((x,y,.021),.006)
    return s

def service():
    s=scene('04 Galley service')
    # A molded meal tray with a true raised, rounded rim and nested dishware.
    box('Service tray base',(-.30,.012,.015),(.64,.023,.42),'darksteel',.02)
    rounded_rim('Raised tray rim',(-.30,.034,.015),(.618,.398),'steel')
    box('Folded linen napkin',(-.493,.032,.055),(.133,.008,.226),'white',.003)
    for i in range(3):box('Napkin folds',(-.493,.038+i*.002,.034),(.127,.001,.16-i*.016),'white',.001)
    # Foil entree dish: open lathe-like rectangular lip; food stays beneath it.
    box('Entree container',(-.296,.047,-.026),(.235,.032,.178),'steel',.026)
    box('Entree dark cavity',(-.296,.065,-.026),(.209,.011,.153),'black',.021)
    rounded_rim('Entree foil lip',(-.296,.07,-.026),(.222,.167),'chrome')
    for i in range(12):
        x=-.37+(i%4)*.025;z=-.065+(i//4)*.027
        ball('Rice portion',(x,.077,z),(.021,.009,.016),'rice')
    for i in range(5):
        x=-.241+(i%2)*.022;z=-.069+(i//2)*.039
        ball('Salad leaf',(x,.087,z),(.025,.014,.023),'greens')
    for x,z in [(-.221,-.025),(-.246,.028)]:ball('Cherry tomato',(x,.09,z),(.016,.017,.016),'tomato')
    lathe('Bread side plate',(-.115,.038,.13),[(.004,0),(.066,0),(.079,.008),(.078,.014),(.062,.009),(.003,.009)])
    ball('Bread roll',(-.115,.071,.13),(.053,.032,.038),'food')
    for i in range(3):tube('Bread scoring',[(-.142+i*.019,.093,.111),(-.132+i*.019,.102,.122),(-.121+i*.019,.094,.14)],.0015,'rice')
    # Spoon and fork, including the spoon bowl and separated fork tines.
    box('Fork handle',(-.526,.047,.069),(.012,.008,.145),'chrome',.003)
    box('Fork head',(-.526,.047,-.02),(.028,.006,.026),'chrome',.002)
    for i in range(4):box('Fork tine',(-.537+i*.007,.047,-.047),(.0035,.004,.03),'chrome',.001)
    box('Spoon handle',(-.471,.047,.065),(.012,.007,.135),'chrome',.003)
    ball('Spoon bowl',(-.471,.047,-.022),(.02,.005,.031),'chrome')
    # Water bottle is opaque blue PET; metal/roughness works without refraction.
    lathe('Water bottle',(-.061,.035,-.091),[(.026,0),(.035,.01),(.038,.026),(.038,.133),(.033,.157),(.018,.177),(.018,.199)],'blue')
    for y in [.057,.073,.088,.145]:ring('Bottle molded ribs',(-.061,y,-.091),.038,.0018,'blue','y')
    cylinder('Bottle cap',(-.061,.244,-.091),.021,.032,'white')
    panel('Water label','water',(-.061,.137,-.052),(.065,.058))
    # Galley machine with removable carafe recess, metal rails and drip grate.
    box('Coffee machine enclosure',(.391,.237,-.107),(.405,.47,.335),'steel',.035)
    box('Coffee front fascia',(.391,.277,.065),(.367,.375,.023),'navy',.022)
    box('Cup recess',(.391,.163,.081),(.235,.211,.014),'black',.015)
    box('Coffee drip tray',(.391,.051,.12),(.35,.037,.238),'darksteel',.017)
    for i in range(11):box('Drip grate bar',(.241+i*.03,.073,.12),(.01,.004,.2),'chrome',.001)
    box('Coffee display bezel',(.391,.383,.084),(.296,.11,.019),'black',.011)
    panel('Coffee machine display','coffee',(.391,.383,.095),(.271,.085),emission=True)
    box('Brew head',(.391,.267,.109),(.113,.058,.109),'chrome',.013)
    cylinder('Coffee spout',(.391,.225,.15),.012,.049,'chrome')
    cup('Porcelain coffee cup',(.391,.076,.136))
    for x in [.25,.53]:cylinder('Program button',(x,.301,.086),.014,.013,'darksteel','z')
    lamp((.541,.384,.089))
    panel('Coffee identifier','coffee_title',(.391,.457,.067),(.28,.03))
    for side in [-1,1]:
        for i in range(6):box('Coffee side ventilation',(.391+side*.204,.21+i*.023,-.13),(.001,.008,.19),'black',.0002)
    for x in [.224,.558]:
        for y in [.091,.432]:screw((x,y,.08),.006)
    return s

def electrical():
    s=scene('05 Circuit distribution')
    box('Panel mounting frame',(0,0,0),(1.54,1.1,.052),'steel',.019)
    box('Panel recessed face',(0,0,.032),(1.473,1.026,.027),'slate',.014)
    panel('Distribution header','circuit_title',(0,.428,.046),(1.25,.073))
    for i,key in enumerate(['cabin','galley','seats','comms']):
        x=-.52+i*.347
        box('Breaker removable module',(x,-.005,.054),(.293,.632,.033),'black',.01)
        panel('Circuit identifier',key,(x,.237,.073),(.241,.067))
        cylinder('Toggle retaining nut',(x,.079,.086),.046,.028,'steel','z',6)
        cylinder('Toggle black collar',(x,.079,.105),.029,.019,'black','z')
        pieces=[]
        pieces.append(cylinder('Switch metal shaft',(0,.026,.022),.012,.087,'chrome','y',16))
        pieces.append(ball('Switch grip',(0,.075,.021),(.021,.029,.02),'darksteel'))
        parent(pieces,f'Switch_{key}',(x,.079,.115),(.20,0,0))
        panel('Switch positions','onoff',(x,.15,.074),(.229,.031))
        cylinder('Reset surround',(x,-.152,.082),.037,.022,'darksteel','z')
        cylinder('Push reset',(x,-.152,.099),.026,.026,'red' if i==3 else 'black','z')
        panel('Reset label','test',(x,-.214,.073),(.226,.031))
        panel('Breaker number',f'cb{i+1}',(x,-.28,.073),(.177,.032))
        for dx in [-.126,.126]:
            for y in [-.296,.29]:screw((x+dx,y,.075),.005)
    panel('Bus rating','circuit_footer',(-.064,-.436,.047),(1.08,.061));lamp((.646,-.434,.053))
    for x in [-.734,.734]:
        for y in [-.505,.505]:screw((x,y,.043),.01)
    for x in [-.735,.735]:
        tube('Panel pull handle',[(x,-.27,.06),(x,-.27,.11),(x,.26,.11),(x,.26,.06)],.009,'chrome')
    return s

def place_subset(objects,name,p,r):
    return parent(objects,name,p,r)
def fixture_console(side):
    x=side*1.65;z=-12.65
    box('Flight deck console pedestal',(x,.646,z),(1.5,1.276,1.55),'navy',.075)
    box('Console foot plinth',(x,.063,z),(1.43,.106,1.48),'black',.036)
    box('Console curved worktop',(x,1.303,z),(1.55,.095,1.6),'slate',.048)
    box('Console edge piping',(x,1.338,z+.74),(1.46,.025,.035),'steel',.008)
    # Raised dashboard faces rearward towards the crew; all geometry remains inside the pedestal footprint.
    box('Glareshield lower dashboard',(x,1.546,z-.453),(1.455,.452,.198),'slate',.034,r=(-.20,0,0))
    box('Glareshield padded eyebrow',(x,1.785,z-.476),(1.53,.072,.257),'black',.029)
    for dx,key in [(-.372,'pfd'),(.372,'nd')]:
        parts=[]
        parts.append(box('Avionics display bezel',(0,0,0),(.645,.355,.047),'black',.018))
        parts.append(panel('Primary flight screen',key,(0,0,.025),(.585,.306),emission=True))
        for bx in [-.292,.292]:
            for by in [-.139,.139]:parts.append(cylinder('Display fastener',(bx,by,.027),.005,.006,'darksteel','z',12))
        place_subset(parts,'Primary flight display',(x+dx,1.551,z-.337),(-.20,0,0))
    # Console top throttle levers and guarded pushbuttons.
    box('Switch bank',(x-side*.33,1.37,z+.095),(.35,.052,.31),'black',.018)
    for row in range(2):
        for col in range(4):box('Backlit panel key',(x-side*.45+col*.075,1.404,z+.012+row*.106),(.048,.018,.063),'steel' if row else 'darksteel',.004)
    cylinder('Control column',(x+side*.31,1.427,z+.415),.027,.241,'darksteel')
    tube('Aircraft yoke',[(x+side*.31-.235,1.609,z+.385),(x+side*.31-.237,1.507,z+.453),(x+side*.31-.125,1.459,z+.453),(x+side*.31+.125,1.459,z+.453),(x+side*.31+.237,1.507,z+.453),(x+side*.31+.235,1.609,z+.385)],.024,'black',False,3)
    box('Yoke hub',(x+side*.31,1.464,z+.456),(.139,.091,.07),'slate',.014)
    for xx in [-.235,.235]:ball('Yoke grip top',(x+side*.31+xx,1.609,z+.385),(.028,.019,.031),'black')
    # Ventilation, access-panel seam, and latches distinguish the pedestal from a plain block.
    for i in range(7):box('Console foot vent',(x, .21+i*.034,z+.779),(1.06,.009,.003),'black',.001)
    box('Pedestal service hatch',(x,.829,z+.787),(1.18,.584,.013),'slate',.026)
    for dx in [-.535,.535]:
        for y in [.587,1.069]:screw((x+dx,y,z+.797),.011)
    panel('Console navigation label','nav',(x,.824,z+.8),(.52,.076))

def fixtures():
    s=scene('00 Installed fixtures')
    for side in [-1,1]:fixture_console(side)
    # Author local +Z-facing galley and then rotate +90° to face the aisle.
    old=set(ACTIVE.objects)
    box('Galley toe kick',(0,.075,-.38),(2.05,.15,.82),'navy',.025)
    box('Galley back frame',(0,1.07,-.69),(2.1,2.14,.07),'ivory',.025)
    for x in [-1.018,1.018]:box('Galley side stile',(x,.582,-.28),(.064,1.045,.86),'ivory',.018)
    box('Worktop stone surface',(0,1.13,-.26),(2.1,.07,1),'steel',.025)
    box('Counter front edge',(0,1.123,.241),(2.07,.044,.023),'chrome',.009)
    for x in [-.67,0,.67]:
        box('Trolley docking gasket',(x,.562,.161),(.622,.946,.035),'black',.016)
        box('Trolley fitted front',(x,.574,.19),(.579,.881,.028),'steel',.023)
        box('Trolley top latch',(x,.958,.213),(.248,.054,.034),'navy',.009)
        box('Trolley lock marker',(x+.09,.958,.233),(.026,.025,.009),'amber',.003)
        tube('Trolley pull handle',[(x-.145,.797,.214),(x-.145,.797,.255),(x+.145,.797,.255),(x+.145,.797,.214)],.011,'chrome')
        for y in [.263,.366,.469]:box('Trolley reinforcement bead',(x,y,.209),(.505,.013,.008),'steel',.004)
        for dx in [-.233,.233]:
            for y in [.19,.94]:screw((x+dx,y,.21),.007)
        panel('Trolley identification','door',(x,.674,.209),(.37,.046))
    # Upper cabinets frame an actual open workspace around the separate coffee/tray asset.
    box('Galley upper cabinet',(0,1.997,-.262),(2.1,.405,.92),'ivory',.024)
    for x in [-.52,.52]:
        box('Overhead cabinet inset',(x,1.997,.213),(.982,.341,.024),'white',.016)
        box('Overhead latch recess',(x,1.869,.229),(.148,.055,.016),'darksteel',.011)
        box('Overhead latch',(x,1.869,.238),(.092,.02,.009),'chrome',.005)
    panel('Galley header','service',(0,2.132,.227),(1.4,.065))
    for x in [-.96,.96]:tube('Galley hand grip',[(x,1.258,-.572),(x,1.258,-.477),(x,1.694,-.477),(x,1.694,-.572)],.015,'chrome')
    box('Worktop backsplash',(0,1.335,-.645),(2.05,.33,.014),'steel',.009)
    place_subset([o for o in ACTIVE.objects if o not in old],'Galley assembly',(-2.74,0,9.4),(0,math.pi/2,0))
    # Maintenance cabinet with inset for the separate breaker task assembly.
    old=set(ACTIVE.objects)
    box('Maintenance enclosure',(0,1.23,-.52),(2.1,2.46,.98),'ivory',.034)
    box('Maintenance plinth',(0,.064,-.5),(2.06,.128,.91),'navy',.015)
    box('Power bay frame',(0,1.41,-.025),(1.79,1.28,.045),'darksteel',.019)
    # Central face area remains recessed; the task panel attaches slightly ahead of this.
    box('Power bay rear wall',(0,1.41,-.004),(1.65,1.164,.009),'black',.012)
    panel('Power header','power',(0,2.184,-.022),(1.72,.137))
    panel('Power safety placard','caution',(0,.537,-.022),(1.34,.088))
    for i in range(8):box('Power cooling grille',(0,.218+i*.024,-.021),(1.48,.009,.006),'navy',.002)
    for x in [-.973,.973]:
        for y in [.42,2.157]:screw((x,y,-.013),.012)
    box('Service hinge',(-1.013,1.4,-.009),(.032,1.15,.035),'steel',.008)
    place_subset([o for o in ACTIVE.objects if o not in old],'Maintenance assembly',(2.457,0,12.3),(0,-math.pi/2,0))
    return s

def bake_modifiers(s):
    bpy.context.window.scene=s
    bpy.ops.object.select_all(action='DESELECT')
    for o in list(s.objects):
        if o.type=='CURVE':
            o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');o.select_set(False)
        elif o.type=='MESH':
            bpy.context.view_layer.objects.active=o
            for m in list(o.modifiers):
                try:bpy.ops.object.modifier_apply(modifier=m.name)
                except RuntimeError as e:print('Modifier notice',o.name,str(e))
def join_static(s):
    """Merge static meshes by material to keep browser draw counts bounded."""
    bpy.context.window.scene=s
    groups={}
    for o in list(s.objects):
        if o.type!='MESH':continue
        ancestor=o.parent;dynamic=False
        while ancestor:
            if ancestor.name.startswith(('Switch_','Buckle_')):dynamic=True;break
            ancestor=ancestor.parent
        if dynamic:continue
        # World transforms are preserved while detaching before same-material joins.
        world=o.matrix_world.copy();o.parent=None;o.matrix_world=world
        key=o.data.materials[0].name if o.data.materials else 'none'
        groups.setdefault(key,[]).append(o)
    for key,objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        bpy.context.object.name='Static / '+key
    for o in list(s.objects):
        if o.type=='EMPTY' and not o.children:bpy.data.objects.remove(o,do_unlink=True)
def export_asset(s,filename):
    bpy.context.window.scene=s;bpy.context.view_layer.update();bake_modifiers(s)
    # Keep source component names/objects in .blend; export a duplicate optimized scene.
    export_scene=bpy.data.scenes.new('EXPORT '+filename)
    by_original={}
    for obj in s.objects:
        copy=obj.copy();copy.data=obj.data.copy() if obj.data else None;export_scene.collection.objects.link(copy)
        by_original[obj]=copy
    # Copying shared objects preserves source-parent pointers. Remap while retaining local transforms.
    for original,copy in by_original.items():
        if original.parent:copy.parent=by_original[original.parent]
    bpy.context.window.scene=export_scene;bpy.context.view_layer.update()
    join_static(export_scene)
    bpy.ops.object.select_all(action='SELECT')
    path=OUT/filename
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_extras=True)
    return export_scene,path

scenes={
 'flight-equipment.glb':fixtures(),
 'checklist.glb':clipboard(),
 'navigation.glb':navigation(),
 'seatbelts.glb':seatbelts(),
 'meals.glb':service(),
 'electrical.glb':electrical(),
}
exports={}
for filename,s in scenes.items():
    exp,path=export_asset(s,filename);exports[filename]=(exp,path)

def light(s,name,p,energy,size,target):
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);s.collection.objects.link(obj);obj.location=xyz(p)
    obj.rotation_euler=(Vector(xyz(target))-obj.location).to_track_quat('-Z','Y').to_euler()
def instance(s,source,name,p,scale=1,r=(0,0,0)):
    empty=bpy.data.objects.new(name,None);empty.instance_type='COLLECTION';empty.instance_collection=source.collection.children[0] if source.collection.children else source.collection
    s.collection.objects.link(empty);empty.location=xyz(p);empty.rotation_euler=rotation(r);empty.scale=(scale,scale,scale)
    return empty
gallery=scene('Equipment gallery — preview')
for filename,p in [('checklist.glb',(-1.18,1.02,.02)),('navigation.glb',(-.44,1.04,0)),('seatbelts.glb',(.45,1.01,.01)),('electrical.glb',(0,2.23,-.04)),('meals.glb',(1.6,.65,-.06))]:
    instance(gallery,scenes[filename],filename,p)
box('Display pedestal',(0,.285,-.25),(4.4,.55,1.65),'ivory',.08)
box('Studio floor',(0,-.035,0),(200,.05,200),'white',.01)
light(gallery,'Large softbox',(1.6,6,5),1400,5,(0,1,0))
light(gallery,'Cool fill',(-4,3,1),700,4,(0,1,0))
light(gallery,'Rim softbox',(1,4,-3),1050,3,(0,1,0))
camera_data=bpy.data.cameras.new('Equipment gallery camera');camera=bpy.data.objects.new('Equipment gallery camera',camera_data);gallery.collection.objects.link(camera)
camera.location=xyz((4.4,3.65,7.6));camera.rotation_euler=(Vector(xyz((.15,1.32,0)))-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='ORTHO';camera_data.ortho_scale=5.05;gallery.camera=camera
gallery.render.engine='CYCLES';gallery.cycles.samples=32;gallery.cycles.use_denoising=True;gallery.cycles.device='CPU'
gallery.render.resolution_x=1500;gallery.render.resolution_y=1000;gallery.render.resolution_percentage=100
gallery.view_settings.view_transform='AgX';gallery.render.image_settings.file_format='PNG';gallery.render.filepath=str(PREVIEW/'blender-equipment.png')
for s in bpy.data.scenes:
    s['asset_author']='Original FLIGHT 404 Blender authoring'
    s['units']='metres, game +Y up, +Z forward; Blender (x,-z,y)'
bpy.context.window.scene=gallery
bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'flight-equipment.blend'))
if '--no-render' not in sys.argv:bpy.ops.render.render(write_still=True)

manifest={'generator':'scripts/blender/build_equipment.py','authoring_tool':bpy.app.version_string,'license':'Original assets authored for FLIGHT 404; no external model sources.','axis_contract':'GLB metres +Y up / +Z front; source helper game(x,y,z) -> Blender(x,-z,y)','assets':{}}
for filename,(s,path) in exports.items():
    bpy.context.window.scene=s;bpy.context.view_layer.update()
    data=path.read_bytes();length=int.from_bytes(data[12:16],'little');doc=json.loads(data[20:20+length])
    tris=0
    for m in doc.get('meshes',[]):
        for prim in m['primitives']:
            if 'indices' in prim:tris+=doc['accessors'][prim['indices']]['count']//3
    points=[]
    for o in s.objects:
        if o.type=='MESH':points.extend([o.matrix_world@v.co for v in o.data.vertices])
    gamepoints=[(p.x,p.z,-p.y) for p in points]
    bounds={'min':[round(min(p[i] for p in gamepoints),5) for i in range(3)],'max':[round(max(p[i] for p in gamepoints),5) for i in range(3)]} if points else None
    manifest['assets'][filename]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'triangles':tris,'meshes':len(doc.get('meshes',[])),'materials':len(doc.get('materials',[])),'images':len(doc.get('images',[])),'bounds_game':bounds,'external_uris':[v['uri'] for k in ['buffers','images'] for v in doc.get(k,[]) if 'uri' in v and not v['uri'].startswith('data:')]}
(SRC/'equipment-manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps(manifest,indent=2))
