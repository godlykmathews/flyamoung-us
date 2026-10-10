"""Author FLIGHT 404's commercial cabin in Blender, then export a static GLB.

Run: Blender --background --python scripts/blender/build_cabin.py [-- --render]
All modeled dimensions below use the game's right-handed X/Y-up/Z system.
The editable source, packed PBR textures, and a merged export collection are saved.
"""
import bpy
import math
import json
import hashlib
import sys
from pathlib import Path
from mathutils import Vector
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'client/public/models/interior'
SOURCE = ROOT / 'models/blender'
PREVIEW = ROOT / 'docs/previews/cabin-aisle.png'
for p in (OUT, SOURCE, PREVIEW.parent): p.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for old in list(bpy.data.materials): bpy.data.materials.remove(old)
scene = bpy.context.scene
source_collection = bpy.data.collections.new('Cabin_Editable_Source')
scene.collection.children.link(source_collection)
objects = []

def xyz(p): return (p[0], -p[2], p[1])
def material(name, color, rough=.5, metal=0, emission=0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    m.diffuse_color = (*color, 1)
    return m

M = {
 'ivory': material('cabin_ivory_satin', (.78,.775,.72), .34),
 'panel': material('cabin_warm_panel', (.59,.61,.60), .5),
 'shell': material('cabin_seat_back_shell', (.68,.71,.72), .36),
 'dark': material('cabin_charcoal_trim', (.025,.036,.043), .48),
 'metal': material('cabin_brushed_aluminium', (.37,.43,.47), .31, .78),
 'chrome': material('cabin_latch_metal', (.54,.60,.64), .22, .9),
 'fabric': material('cabin_navy_woven_fabric', (.046,.091,.145), .87),
 'carpet': material('cabin_aisle_woven_carpet', (.09,.14,.18), .98),
 'piping': material('cabin_tailored_piping', (.19,.29,.38), .7),
 'headrest': material('cabin_headrest_cream', (.76,.79,.77), .8),
 'emissive': material('cabin_emissive', (1,.89,.66), .32, 0, 2.1),
 'exit': material('cabin_exit_safety', (.055,.46,.28), .35, 0, .8),
 'white': material('cabin_sign_white', (.9,.95,.94), .5),
 'red': material('cabin_safety_red', (.57,.047,.032), .5),
 'sky': material('cabin_window_daylight', (.61,.79,.86), .11, 0, 0),
}
# Thin acrylic glazing. The client explicitly uses low alpha/depthWrite=false,
# allowing the shared earth and cloud environment to appear through apertures.
M['sky'].node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.08
M['sky'].diffuse_color=(.61,.79,.86,.08)

def texture_mat(key, name, base, carpet=False):
    # Actual packed texture, not an unsupported procedural shader at export.
    n=512; yy,xx=np.mgrid[0:n,0:n]; rng=np.random.default_rng(404 if not carpet else 405)
    grain=rng.normal(0,.025,(n,n))
    weave=((xx%6<2).astype(float)*.045+(yy%6<2).astype(float)*.035)
    diagonal=((xx+yy)%32<4).astype(float)*(.04 if carpet else .013)
    arr=np.ones((n,n,4),dtype=np.float32)
    for c,b in enumerate(base): arr[:,:,c]=np.clip(b+grain+weave+diagonal,0,1)
    img=bpy.data.images.new(name,width=n,height=n,alpha=False)
    img.pixels.foreach_set(arr.ravel()); img.file_format='PNG'
    img.filepath_raw=str(SOURCE/(name+'.png'));img.save();img.pack()
    node=M[key].node_tree.nodes.new('ShaderNodeTexImage');node.image=img
    M[key].node_tree.links.new(node.outputs['Color'], M[key].node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

texture_mat('fabric','navy-seat-weave',(.065,.12,.185))
texture_mat('carpet','aisle-carpet-weave',(.075,.10,.13),True)

def adopt(obj,name,mat):
    obj.name=name
    for c in list(obj.users_collection): c.objects.unlink(obj)
    source_collection.objects.link(obj)
    if mat: obj.data.materials.append(M[mat])
    objects.append(obj)
    return obj

def box(name,p,size,mat,bevel=0,tilt=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(p))
    o=adopt(bpy.context.object,name,mat);o.dimensions=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if tilt: o.rotation_euler.x=tilt
    if bevel:
        b=o.modifiers.new('Manufactured edge radii','BEVEL');b.width=bevel
        # Round visible cushions generously; a tiny latch or slot needs fewer segments.
        b.segments=3 if min(size)>.12 else 2 if min(size)>.04 else 1
        b.affect='EDGES'
        bpy.ops.object.modifier_apply(modifier=b.name)
        for poly in o.data.polygons: poly.use_smooth=True
        w=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');w.keep_sharp=True
        bpy.ops.object.modifier_apply(modifier=w.name)
    return o

def mesh(name,verts,faces,mat,uv=None):
    d=bpy.data.meshes.new(name);d.from_pydata([xyz(p) for p in verts],[],faces);d.update()
    o=bpy.data.objects.new(name,d);source_collection.objects.link(o);objects.append(o)
    if mat:d.materials.append(M[mat])
    if uv:
        layer=d.uv_layers.new(name='UVMap')
        for poly in d.polygons:
            for li in poly.loop_indices:layer.data[li].uv=uv[d.loops[li].vertex_index]
    return o

def tube(name,pts,r,mat,sides=6,closed=False):
    # Explicit mesh avoids curve export ambiguity and keeps the polygon budget predictable.
    pts=[Vector(xyz(p)) for p in pts];verts=[];faces=[]
    for i,p in enumerate(pts):
        tangent=(pts[(i+1)%len(pts)]-pts[i-1]) if closed else (pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)])
        tangent.normalize();axis=Vector((1,0,0))
        if abs(tangent.dot(axis))>.95:axis=Vector((0,0,1))
        u=tangent.cross(axis).normalized();v=tangent.cross(u).normalized()
        verts += [tuple(p+r*(u*math.cos(k*math.tau/sides)+v*math.sin(k*math.tau/sides))) for k in range(sides)]
    for i in range(len(pts) if closed else len(pts)-1):
        j=(i+1)%len(pts)
        for k in range(sides):faces.append((i*sides+k,i*sides+(k+1)%sides,j*sides+(k+1)%sides,j*sides+k))
    if not closed:faces.extend([tuple(reversed(range(sides))),tuple((len(pts)-1)*sides+k for k in range(sides))])
    d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update()
    o=bpy.data.objects.new(name,d);source_collection.objects.link(o);objects.append(o);d.materials.append(M[mat])
    for p in d.polygons:p.use_smooth=True
    return o

def rounded_loop(w,h,r,n=4):
    result=[]
    for cx,cy,a in [(w/2-r,h/2-r,0),(-w/2+r,h/2-r,90),(-w/2+r,-h/2+r,180),(w/2-r,-h/2+r,270)]:
        for k in range(n+1):
            angle=math.radians(a+k*90/n);result.append((cx+r*math.cos(angle),cy+r*math.sin(angle)))
    return result

def cylinder(name,p,r,depth,mat,axis='y',vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=xyz(p))
    o=adopt(bpy.context.object,name,mat)
    if axis=='x':o.rotation_euler.y=math.pi/2
    if axis=='z':o.rotation_euler.x=math.pi/2
    for poly in o.data.polygons:poly.use_smooth=True
    return o

def label(text,p,size=.08,mat='dark',normal='z'):
    cu=bpy.data.curves.new('Engraved '+text,'FONT');cu.body=text;cu.align_x='CENTER';cu.align_y='CENTER';cu.size=size;cu.extrude=.0002;cu.resolution_u=2
    o=bpy.data.objects.new('Cabin marking '+text,cu);source_collection.objects.link(o);o.location=xyz(p)
    o.rotation_euler=(math.pi/2,0,0)
    if normal=='-z':o.rotation_euler=(math.pi/2,0,math.pi)
    if normal=='x':o.rotation_euler=(math.pi/2,0,math.pi/2)
    if normal=='-x':o.rotation_euler=(math.pi/2,0,-math.pi/2)
    o.data.materials.append(M[mat]);bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.convert(target='MESH');o.select_set(False);objects.append(o)
    return o

def seat_prototype():
    start=len(objects)
    # Slimline shell with separate inset upholstered pads, tailored piping and winged headrest.
    box('Seat structural pan',(0,.385,-.08),(.79,.13,.84),'dark',.04)
    box('Seat cushion',(0,.495,-.12),(.765,.15,.84),'fabric',.08)
    box('Back sculpted shell',(0,1.08,.408),(.81,1.09,.15),'shell',.08,.075)
    box('Lumbar upholstered inset',(0,.88,.282),(.72,.46,.19),'fabric',.075,.09)
    box('Back upholstered inset',(0,1.245,.325),(.735,.49,.155),'fabric',.06,.075)
    box('Headrest pillow',(0,1.535,.351),(.54,.23,.19),'headrest',.065,.075)
    for side in [-1,1]:
        box('Headrest wing',(side*.30,1.50,.30),(.10,.27,.20),'fabric',.04,.075)
        box('Armrest support',(side*.401,.63,.23),(.044,.28,.08),'metal',.014)
        box('Armrest satin lower',(side*.402,.755,-.09),(.065,.065,.70),'shell',.022)
        box('Armrest soft cap',(side*.402,.79,-.10),(.067,.039,.68),'dark',.017)
        cylinder('Armrest pivot',(side*.403,.745,.23),.033,.073,'chrome','x')
        # Tube legs and floor feet; no large primitive pedestal.
        tube('Seat support tube',[(side*.27,.08,.30),(side*.27,.40,.21),(side*.27,.43,-.30)],.023,'metal')
        tube('Seat forward support',[(side*.27,.06,-.39),(side*.27,.42,-.25)],.026,'metal')
        box('Seat track foot',(side*.27,.035,-.04),(.11,.065,.96),'dark',.024)
    # Upholstery seams follow the rounded front cushion and backrest perimeter.
    cushion=[(u,.552,v-.12) for u,v in rounded_loop(.72,.78,.12,5)]
    tube('Seat cushion seam piping',cushion,.005,'piping',5,True)
    back=[(u,1.12+v,.235+v*.075) for u,v in rounded_loop(.69,.85,.08,5)]
    tube('Seat back seam piping',back,.005,'piping',5,True)
    tube('Upholstery horizontal stitch',[(-.30,1.09,.223),(.30,1.09,.223)],.003,'piping',5)
    # Stowed tray is visible from the aisle behind the seat.
    box('Tray recess',(0,1.15,.516),(.68,.51,.025),'dark',.055,.075)
    box('Folded tray table',(0,1.15,.543),(.625,.455,.030),'shell',.045,.075)
    box('Tray top latch',(0,1.405,.56),(.10,.045,.025),'chrome',.012)
    for x in [-.25,.25]:cylinder('Tray hinge',(x,.94,.54),.024,.045,'metal','x',12)
    box('Seatback literature pocket',(0,.755,.53),(.64,.28,.052),'fabric',.04)
    tube('Pocket mouth', [(-.30,.895,.563),(0,.875,.566),(.30,.895,.563)],.008,'piping')
    box('Safety card',(0,.87,.548),(.22,.13,.01),'headrest',.008)
    label('SAFETY',(0,.884,.557),.031,'dark')
    # Webbing and clasp lie loose on the cushion.
    box('Lap belt left',(-.20,.579,-.08),(.28,.017,.05),'dark',.006)
    box('Lap belt right',(.18,.578,-.08),(.27,.017,.05),'dark',.006)
    box('Belt clasp',(-.027,.59,-.08),(.105,.025,.073),'chrome',.009)
    box('Belt clasp inset',(-.027,.604,-.08),(.058,.007,.043),'dark',.003)
    return objects[start:]

def make_seats():
    donors=seat_prototype()
    positions=[(x,z) for z in [-7,-4,-1,2,5] for x in [-2.95,-1.9,1.9,2.95]]
    for i,(x,z) in enumerate(positions):
        for donor in donors:
            if i==0:continue
            o=donor.copy();o.data=donor.data;source_collection.objects.link(o);objects.append(o)
            o.location += Vector(xyz((x,0,z)))
    x,z=positions[0]
    for donor in donors:donor.location+=Vector(xyz((x,0,z)))

def make_floor_and_shell():
    mesh('Continuous woven aisle and cabin floor',[(-3.7,0,-13.65),(3.7,0,-13.65),(3.7,0,17.8),(-3.7,0,17.8)],[(0,3,2,1)],'carpet',[(0,0),(9,0),(9,46),(0,46)])
    # Cabin wall is actually open at windows, with rounded recessed reveals below.
    for side in [-1,1]:
        box('Lower kick panel',(side*3.685,.48,2.075),(.08,.96,31.45),'panel',.025)
        box('Window sill rail',(side*3.66,1.04,2.075),(.11,.16,31.45),'ivory',.03)
        box('Upper wall',(side*3.68,2.27,2.075),(.08,.30,31.45),'ivory',.03)
        box('Baseboard aluminium',(side*3.63,.10,2.075),(.035,.10,31.45),'metal',.012)
        box('Aisle edge inlay',(side*1.36,.003,1.5),(.045,.006,23.8),'panel',.004)
        box('Aisle photoluminescent strip',(side*1.31,.006,1.5),(.018,.008,23.8),'emissive',.003)
        window_centers=[-8.2,-6.4,-4.6,-2.8,-1, .8,2.6,4.4,6.2,9.3,11.1,12.9]
        # Cover every stretch outside apertures with solid wall; door sits in its own bay.
        bounds=[(-13.65,window_centers[0]-.47)]
        for a,b in zip(window_centers,window_centers[1:]):bounds.append((a+.47,b-.47))
        bounds.append((window_centers[-1]+.47,17.8))
        for a,b in bounds:
            if b>a:box('Window wall mullion',(side*3.685,1.62,(a+b)/2),(.08,1.0,b-a),'ivory',.018)
        for i,z in enumerate(window_centers):make_window(side,z,i)
        for z in [-9.1,-5.5,-1.9,1.7,5.3,8.2,10.2,12]:
            box('Lower panel joint',(side*3.638,.58,z),(.012,.84,.012),'panel',.003)
    # Smooth curved ceiling profile spans wall shoulders to the crown at 3.2m.
    profile=[]
    for i in range(33):
        theta=math.pi*i/32
        profile.append((3.7*math.cos(theta),2.24+.96*math.sin(theta)))
    verts=[(x,y,z) for z in [-13.65,17.8] for x,y in profile]
    faces=[(i,33+i,34+i,i+1) for i in range(32)]
    o=mesh('Continuous curved cabin ceiling',verts,faces,'ivory')
    for p in o.data.polygons:p.use_smooth=True
    for side in [-1,1]:
        box('Ceiling indirect light diffuser',(side*1.85,3.065,2.15),(.075,.045,30.9),'emissive',.022)
        box('Ceiling ventilation rail',(side*1.15,3.145,2.15),(.16,.022,30.9),'panel',.008)
        for z in np.arange(-12.8,17.2,.22):box('Ceiling air slot',(side*1.15,3.129,float(z)),(.11,.004,.024),'dark',.003)
    for z in np.arange(-12,17,2.7):
        path=[(x,y-.014,float(z)) for x,y in profile]
        tube('Ceiling hoop panel seam',path,.008,'panel',5)

def make_window(side,z,index):
    loops=[(.94,1.02,.22,3.64),(.85,.95,.20,3.615),(.72,.80,.20,3.74)]
    rings=[]
    for w,h,r,x in loops:rings.append([(side*x,1.62+v,z+u) for u,v in rounded_loop(w,h,r,6)])
    verts=[p for ring in rings for p in ring];n=len(rings[0]);faces=[]
    for a in range(len(rings)-1):
        for i in range(n):faces.append((a*n+i,a*n+(i+1)%n,(a+1)*n+(i+1)%n,(a+1)*n+i))
    o=mesh('Recessed rounded window reveal',verts,faces,'ivory')
    for p in o.data.polygons:p.use_smooth=True
    # Close the four corners between the rectangular wall aperture and oval frame.
    outer=[]
    for u,v in rounded_loop(.94,1.02,.22,6):
        ray=max(abs(u)/.47,abs(v)/.51)
        outer.append((side*3.645,1.62+v/ray,z+u/ray))
    mesh('Window aperture corner infill',outer+rings[0],[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],'ivory')
    tube('Window inner seal',[(side*3.739,y,zp) for _,y,zp in rings[-1]],.013,'panel',6,True)
    pane=[(side*3.75,1.62,z)]+[(side*3.75,y,zp) for _,y,zp in rings[-1]]
    mesh('Rounded daylight glazing',pane,[(0,i+1,(i+1)%n+1) for i in range(n)],'sky')
    box('Shade recessed top',(side*3.625,2.065,z),(.04,.045,.61),'shell',.018)
    box('Shade finger grip',(side*3.58,2.055,z),(.034,.035,.13),'metal',.01)

def make_bins_and_psu():
    for side in [-1,1]:
        for i,z in enumerate([-8.3,-5.6,-2.9,-.2,2.5,5.2,9.2,11.9]):
            # Shaped bin cross-section, curved door nose and recessed perimeter seams.
            sec=[(2.93,2.32),(2.39,2.31),(1.96,2.47),(1.93,2.62),(2.28,2.91),(2.77,2.72)]
            verts=[(side*(x+.7),y,z+dz) for dz in [-1.28,1.28] for x,y in sec];n=len(sec)
            faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
            o=mesh('Overhead luggage bin enclosure',verts,faces,'ivory')
            b=o.modifiers.new('Bin moulded radii','BEVEL');b.width=.05;b.segments=3
            bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.modifier_apply(modifier=b.name);o.select_set(False)
            for poly in o.data.polygons:poly.use_smooth=True
            # Door face is an inset smooth panel with visible seams, small pull latch.
            box('Bin door shadow seam',(side*2.658,2.53,z),(.026,.12,2.45),'panel',.035)
            box('Bin inset latch',(side*2.634,2.52,z),(.04,.073,.23),'dark',.017)
            box('Bin latch pull',(side*2.612,2.516,z),(.022,.023,.18),'chrome',.008)
        for row,z in enumerate([-7,-4,-1,2,5]):
            # Each passenger service unit has two vents, separate reading lamps and call buttons.
            box('Passenger service unit',(side*2.94,2.31,z),(.58,.075,.71),'shell',.048)
            for offset in [-.18,.18]:
                cylinder('Adjustable air vent rim',(side*2.93,2.264,z+offset),.073,.019,'metal','y',20)
                cylinder('Air vent dark throat',(side*2.93,2.250,z+offset),.052,.012,'dark','y',16)
                cylinder('Air vent adjustable nozzle',(side*2.93,2.243,z+offset),.028,.024,'shell','y',16)
                cylinder('Reading light bezel',(side*3.13,2.26,z+offset),.046,.022,'chrome','y',16)
                cylinder('Reading light lens',(side*3.13,2.244,z+offset),.031,.011,'emissive','y',16)
                cylinder('Call button',(side*2.73,2.26,z+offset),.026,.016,'ivory','y',12)
            label(f'{row+1:02d}   '+('A B' if side<0 else 'C D'),(side*2.606,2.55,z),.06,'dark','x' if side<0 else '-x')

def make_bulkheads_and_doors():
    for side in [-1,1]:
        box('Flight deck bulkhead',(side*2.225,1.59,-10),(2.95,3.18,.15),'ivory',.025)
        box('Flight deck doorway jamb',(side*.765,1.2,-9.903),(.026,2.4,.035),'metal',.008)
        label('FLIGHT DECK' if side<0 else 'CREW ACCESS',(side*1.85,1.91,-9.91),.13,'dark')
        # Exit door with recessed panel, oval window, gasket and operating handle.
        box('Exit door gasket',(side*3.615,1.30,7.72),(.04,2.46,1.27),'dark',.12)
        box('Exit door moulded liner',(side*3.58,1.30,7.72),(.065,2.39,1.20),'ivory',.10)
        box('Exit door inset',(side*3.54,1.39,7.72),(.035,1.53,.92),'shell',.12)
        ellipse=[(side*3.503,1.91+.21*math.sin(t),7.72+.16*math.cos(t)) for t in np.linspace(0,math.tau,32,endpoint=False)]
        mesh('Exit inspection window',[(side*3.508,1.91,7.72)]+ellipse,[(0,i+1,(i+1)%32+1) for i in range(32)],'sky')
        tube('Exit inspection window gasket',ellipse,.016,'dark',6,True)
        box('Exit handle recess',(side*3.49,1.14,7.72),(.07,.21,.56),'dark',.05)
        box('Exit operating lever',(side*3.435,1.14,7.72),(.065,.065,.39),'chrome',.025)
        box('Exit safety panel',(side*3.532,.68,7.72),(.02,.14,.52),'red',.01)
        label('OPEN',(side*3.398,1.34,7.72),.065,'red','x' if side<0 else '-x')
        box('Exit illuminated sign',(side*3.515,2.39,7.72),(.04,.18,.46),'exit',.022)
        label('EXIT',(side*3.486,2.39,7.72),.10,'white','x' if side<0 else '-x')
    box('Doorway lintel',(0,2.80,-10),(1.5,.76,.15),'ivory',.02)
    label('FLIGHT 404',(0,2.82,-9.916),.10,'dark')
    box('Aft pressure bulkhead',(0,1.60,17.8),(7.4,3.2,.12),'ivory',.025)
    box('Aft partition inset',(0,1.55,17.728),(2.1,2.45,.035),'panel',.12)
    label('FLIGHT 404',(0,1.85,17.701),.26,'dark','-z')
    label('CREW REST',(0,1.48,17.7),.085,'dark','-z')
    box('Aft exit light',(0,2.76,17.70),(.52,.20,.03),'exit',.018)
    label('EXIT',(0,2.76,17.678),.13,'white','-z')
    # Windshield inset and pillars behind the flight-deck instruments.
    # A real opening, not a blue panel pasted over an opaque forward wall.
    box('Flight deck lower nose',(0,.58,-13.65),(7.4,1.16,.12),'dark',.04)
    box('Flight deck windscreen roof',(0,2.985,-13.65),(7.4,.43,.12),'dark',.04)
    for side in [-1,1]:box('Windscreen corner cheek',(side*3.59,1.96,-13.65),(.22,1.70,.12),'dark',.025)
    box('Windscreen clear glazing',(0,1.975,-13.655),(6.95,1.62,.014),'sky',.03)
    box('Windscreen center pillar',(0,1.975,-13.535),(.12,1.69,.08),'dark',.025)
    for side in [-1,1]:
        box('Windscreen outer pillar',(side*2.18,1.975,-13.535),(.09,1.69,.08),'dark',.022)
    box('Flight deck floor mat',(0,.006,-11.85),(7.2,.012,3.5),'dark',.035)

def make_pilot_chair():
    """Fixed chair matches the seated pilot's 0.57m hip/seat mount, facing -Z."""
    x,z=-1.65,-11.05
    box('Pilot chair pedestal',(x,.24,z),(.32,.43,.36),'metal',.04)
    box('Pilot chair floor base',(x,.055,z),(.77,.10,.75),'dark',.035)
    box('Pilot seat pan',(x,.425,z-.015),(.76,.105,.73),'dark',.04)
    box('Pilot shaped cushion',(x,.50,z-.015),(.70,.14,.68),'fabric',.06)
    box('Pilot seatback shell',(x,1.01,z+.285),(.75,.90,.11),'shell',.04,.045)
    box('Pilot padded back',(x,1.02,z+.214),(.66,.80,.13),'fabric',.065,.045)
    box('Pilot adjustable headrest',(x,1.43,z+.24),(.46,.23,.14),'headrest',.04)
    for side in [-1,1]:
        box('Pilot armrest support',(x+side*.365,.66,z+.12),(.035,.20,.07),'metal',.012)
        box('Pilot armrest',(x+side*.365,.75,z-.025),(.075,.06,.54),'dark',.025)
        tube('Pilot harness shoulder',[(x+side*.23,1.34,z+.129),(x+side*.16,1.00,z+.129),(x+side*.13,.60,z+.08)],.018,'dark',6)
    box('Pilot harness buckle',(x,.59,z-.05),(.11,.03,.08),'chrome',.01)

def make_aft_amenities():
    """Four extra metres of floor, with furnishings inside shared colliders."""
    # Right-side lavatory enclosure with a genuinely recessed doorway and
    # mechanical vacant indicator; all furniture stays outside the clear aisle.
    box('Lavatory enclosure',(3.05,1.37,15.5),(1.0,2.74,2.4),'ivory',.07)
    box('Lavatory door black reveal',(2.539,1.37,15.5),(.025,2.36,1.01),'dark',.035)
    box('Lavatory door moulded face',(2.515,1.37,15.5),(.035,2.29,.945),'shell',.025)
    box('Lavatory upper placard',(2.489,2.19,15.5),(.02,.23,.72),'navy' if 'navy' in M else 'fabric',.02)
    label('LAVATORY',(2.472,2.19,15.5),.082,'white','-x')
    box('Lavatory latch surround',(2.482,1.18,15.19),(.04,.25,.15),'metal',.016)
    box('Lavatory flush handle',(2.451,1.20,15.19),(.03,.14,.043),'chrome',.01)
    box('Vacant indicator',(2.453,1.39,15.19),(.018,.065,.16),'exit',.008)
    for j in range(10):box('Door ventilation slot',(2.489,.48+j*.025,15.5),(.012,.009,.56),'dark',.002)
    label('VACANT',(2.438,1.39,15.19),.025,'white','-x')
    # Full-size silver catering cart with lower casters, restraint strap,
    # tray runners, individual latches, brake and recessed handles.
    x,z=-3.03,15.52
    box('Trolley parking enclosure',(-3.55,.63,z),(.20,1.26,1.26),'ivory',.05)
    box('Catering trolley body',(x,.68,z),(.93,1.08,.62),'metal',.035)
    box('Trolley service top',(x,1.242,z),(.965,.045,.67),'chrome',.016)
    for zz in [-.28,.28]:
        tube('Trolley top grip',[(x-.29,1.26,z+zz),(x-.29,1.34,z+zz),(x+.29,1.34,z+zz),(x+.29,1.26,z+zz)],.014,'metal',8)
        for xx in [-.35,.35]:
            box('Trolley caster swivel',(x+xx,.12,z+zz),(.09,.12,.08),'metal',.015)
            cylinder('Rubber caster',(x+xx,.085,z+zz),.067,.065,'dark','z',16)
            cylinder('Caster hub',(x+xx,.085,z+zz-.036),.025,.01,'chrome','z',12)
    box('Trolley door gasket',(x+.473,.69,z),(.018,1.0,.55),'dark',.018)
    box('Trolley insulated door',(x+.488,.69,z),(.03,.965,.51),'panel',.015)
    for j in range(7):box('Trolley tray runner',(x+.51,.27+j*.119,z),(.016,.012,.42),'metal',.004)
    box('Trolley lock strap',(x+.521,.81,z),(.013,.073,.54),'dark',.008)
    box('Trolley restraint buckle',(x+.541,.81,z+.03),(.026,.096,.10),'chrome',.012)
    box('Trolley lock amber lever',(x+.562,.81,z+.03),(.027,.038,.056),'emissive',.007)
    box('Trolley recessed handle',(x+.532,1.06,z),(.037,.07,.23),'dark',.014)
    box('Trolley pedal brake',(x+.43,.08,z+.31),(.14,.035,.13),'red',.008)
    label('SECURE CART',(x+.557,.60,z),.045,'dark','x')
    # Aft storage, folded jumpseat and emergency equipment give the extra floor
    # a recognisable crew vestibule rather than an empty stretched corridor.
    box('Crew stowage cupboard',(-3.04,2.01,15.5),(.98,1.22,2.4),'ivory',.05)
    box('Crew cupboard seam',(-2.535,2.01,15.5),(.012,1.15,.013),'panel',.003)
    for zz in [15.0,16.0]:
        box('Stowage latch recess',(-2.531,1.67,zz),(.02,.075,.14),'dark',.012)
        box('Stowage latch',(-2.509,1.67,zz),(.025,.032,.096),'chrome',.008)
    label('CREW STOWAGE',(-2.526,2.29,15.5),.11,'dark','x')
    box('Rigid crew luggage',(-3.02,.43,14.65),(.67,.76,.52),'fabric',.07)
    for zz in [14.45,14.85]:tube('Luggage reinforcement',[(-3.32,.18,zz),(-3.32,.73,zz),(-2.72,.73,zz),(-2.72,.18,zz)],.012,'piping',6)
    tube('Luggage retractable handle',[(-3.13,.82,14.65),(-3.13,1.0,14.65),(-2.90,1.0,14.65),(-2.90,.82,14.65)],.014,'metal',8)
    box('Folded jumpseat back',(0,1.20,17.655),(.70,1.07,.10),'fabric',.055)
    box('Folded jumpseat cushion',(0,.56,17.61),(.70,.20,.15),'fabric',.045)
    for side in [-1,1]:tube('Jumpseat harness',[(side*.24,1.65,17.585),(side*.13,1.02,17.56),(0,.78,17.56)],.018,'dark',6)
    box('Jumpseat harness clasp',(0,.82,17.54),(.10,.09,.03),'chrome',.009)
    label('CREW SEAT',(0,2.32,17.63),.12,'dark','-z')
    cylinder('Emergency extinguisher',(2.425,.90,16.37),.11,.62,'red','y',24)
    cylinder('Extinguisher pressure neck',(2.425,1.23,16.37),.05,.065,'metal','y',16)
    box('Extinguisher lever',(2.425,1.29,16.37),(.19,.035,.065),'dark',.012)
    tube('Extinguisher hose',[(2.44,1.24,16.38),(2.34,1.2,16.50),(2.31,.71,16.50)],.015,'dark',8)
    box('Extinguisher mounting strap',(2.407,.94,16.37),(.25,.055,.25),'metal',.02)
    label('FIRE',(2.297,.85,16.36),.055,'white','-x')
    label('EMERGENCY EQUIPMENT',(2.49,1.60,16.38),.067,'red','-x')
    for side in [-1,1]:
        box('Aft threshold inlay',(side*1.0,.005,13.75),(.028,.01,1.2),'metal',.003)
    # Passenger belt/remain-seated signs are physical plaques in both cabins.
    for z,normal in [(-9.902,'z'),(17.705,'-z')]:
        box('Fasten seatbelt sign',(1.55,2.73,z),(.76,.18,.025),'dark',.015)
        label('FASTEN SEAT BELT',(1.55,2.73,z+(.018 if normal=='z' else -.018)),.055,'emissive',normal)

make_floor_and_shell()
make_bins_and_psu()
make_seats()
make_bulkheads_and_doors()
make_pilot_chair()
make_aft_amenities()

# Keep the editable assembly and a separate export collection. Repeated seat
# components use linked mesh datablocks in the source and are merged by material
# in the shipping copy, so runtime static geometry is only one draw per material.
export_collection=bpy.data.collections.new('Cabin_Optimized_Export')
scene.collection.children.link(export_collection)
export_objects=[]
for original in objects:
    copy=original.copy();copy.data=original.data.copy();export_collection.objects.link(copy);export_objects.append(copy)
    if not any(m.name in ('cabin_navy_woven_fabric','cabin_aisle_woven_carpet') for m in copy.data.materials):
        for uv in list(copy.data.uv_layers):copy.data.uv_layers.remove(uv)
source_collection.hide_render=True;source_collection.hide_viewport=True
groups={}
for o in export_objects:
    key=o.data.materials[0].name if len(o.data.materials) else 'none'
    groups.setdefault(key,[]).append(o)
merged=[]
for key,group in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in group:o.select_set(True)
    bpy.context.view_layer.objects.active=group[0]
    if len(group)>1:bpy.ops.object.join()
    o=bpy.context.object;o.name=key+'_static';merged.append(o)
    # Back-face culling off handles thin wall and reveal geometry both ways.
    for mat in o.data.materials:mat.use_backface_culling=False

scene.render.engine='CYCLES';scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.world.color=(.35,.40,.47)
world=scene.world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.56,.68,.80,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.34

def area(name,p,power,size,color,target):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='RECTANGLE';d.size=size;d.size_y=size*.7;d.color=color
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=xyz(p)
    o.rotation_euler=(Vector(xyz(target))-o.location).to_track_quat('-Z','Y').to_euler()
    return o
for z in [-8,-4,0,4,8,12,16]:area('Cabin overhead softbox',(0,3.02,z),95,2.8,(1,.90,.77),(0,0,z))
for side in [-1,1]:
    for z in [-7,-3,1,5,10]:area('Daylight through window',(side*3.61,1.75,z),40,1,(.73,.85,1),(0,1,z))
camera_data=bpy.data.cameras.new('Cabin aisle preview camera');camera=bpy.data.objects.new('Cabin aisle preview camera',camera_data);scene.collection.objects.link(camera)
camera.location=xyz((0,1.68,7.15));target=Vector(xyz((0,1.48,-7.3)))
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.lens=20;scene.camera=camera
scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'aircraft-cabin.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in merged:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'aircraft-cabin.glb'),export_format='GLB',use_selection=True,export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_animations=False)
triangles=0;bounds=[]
for o in merged:
    o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
    bounds.extend([o.matrix_world@vertex.co for vertex in o.data.vertices])
glb=OUT/'aircraft-cabin.glb'
report={
 'name':'FLIGHT 404 Blender cabin', 'generator':bpy.app.version_string,
 'source':'models/blender/aircraft-cabin.blend','export':'client/public/models/interior/aircraft-cabin.glb',
 'authorship':'Original project-authored Blender geometry; no external model or texture sources.',
 'source_objects':len(objects),'export_meshes':len(merged),'triangles':triangles,
 'materials':[m.name for m in M.values()], 'bytes':glb.stat().st_size,'sha256':hashlib.sha256(glb.read_bytes()).hexdigest(),
 'game_bounds':{'min':[min(v.x for v in bounds),min(v.z for v in bounds),-max(v.y for v in bounds)],'max':[max(v.x for v in bounds),max(v.z for v in bounds),-min(v.y for v in bounds)]},
 'notes':['31.45m cabin with 4m aft vestibule, 20 linked-source seats, recessed transparent windows and open cockpit windscreen.','Original catering cart, crew storage, lavatory facade, luggage, folded jumpseat and extinguisher; amenities respect server colliders.','All task stations and collision logic remain separate.','cabin_emissive can be dimmed at runtime for blackout.','Textures are embedded PNGs; glTF uses standard PBR materials.']
}
(OUT/'aircraft-cabin.manifest.json').write_text(json.dumps(report,indent=2)+'\n')
print('CABIN_REPORT '+json.dumps(report))
if '--render' in sys.argv:
    scene.render.filepath=str(PREVIEW);bpy.ops.render.render(write_still=True)
    camera.location=xyz((0,1.73,12.1))
    camera.rotation_euler=(Vector(xyz((0,1.45,16.25)))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera_data.lens=19
    scene.render.filepath=str(PREVIEW.parent/'cabin-aft-vestibule.png');bpy.ops.render.render(write_still=True)
print('CABIN_COMPLETE')

