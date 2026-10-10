"""Original FLIGHT 404 deformable airline cast. Blender 5.x, metres.
No imported human meshes or textures: all geometry, colours, rig and clips authored here.
Run Blender --background --factory-startup --python scripts/blender/build_animated_crew.py
"""
import bpy, math, json, hashlib, sys
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'client/public/models/animated'; SRC=ROOT/'models/blender'; PRE=ROOT/'docs/previews'
for p in [OUT,SRC,PRE]:p.mkdir(parents=True,exist_ok=True)
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
for s in list(bpy.data.scenes)[1:]:bpy.data.scenes.remove(s)
# Author directly in Blender: +Z up, +Y forward, exporting maps forward to glTF -Z.
def V(p):return Vector(p)
def linear(h):
    c=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)+(1,)
MAT=bpy.data.materials.new('Original cast · vertex colour');MAT.use_nodes=True
bs=MAT.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.68
vc=MAT.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='CastColour';MAT.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color'])
active=[]
PALETTE={'navy':'#233e58','burgundy':'#7a354c','white':'#eee9df','gold':'#c4a467','teal':'#4d98a5','shoe':'#27313c','dark':'#27303b','eyes':'#f4ece2','iris':'#3b4d4a','pupil':'#151c22','lip':'#a66b64','denim':'#456986'}
VARIANTS={
 'attendant':dict(female=True,skin='#b47c5c',hair='#292526',top='#243e58',pants='#263b52',accent='#60adb1',style='attendant',hairdo='bun'),
 'attendant-player':dict(female=True,skin='#d4a17e',hair='#50362b',top='#71384f',pants='#663348',accent='#d1b179',style='attendant',hairdo='bun'),
 'pilot':dict(female=False,skin='#c89b7a',hair='#45413d',top='#ede9dd',pants='#263b52',accent='#cbb16f',style='pilot',hairdo='short'),
 'marshal':dict(female=False,skin='#875b47',hair='#292726',top='#6b777e',pants='#444c55',accent='#9dadae',style='jacket',hairdo='short'),
 'engineer':dict(female=False,skin='#c3956f',hair='#513b2c',top='#506f7c',pants='#354853',accent='#b6c4c5',style='utility',hairdo='short'),
 'passenger-a':dict(female=False,skin='#a87554',hair='#33302b',top='#587360',pants='#b29b7a',accent='#829789',style='sweater',hairdo='short'),
 'passenger-b':dict(female=True,skin='#e0b59b',hair='#6a3d2d',top='#a7584b',pants='#475567',accent='#e4d4b8',style='cardigan',hairdo='bob'),
 'passenger-c':dict(female=False,skin='#d0a480',hair='#736d64',top='#7c9bad',pants='#425b74',accent='#d1dcdf',style='polo',hairdo='short'),
}
JOINTS={
 'Root':((0,0,0),(0,0,.15),None),
 'Hips':((0,0,.94),(0,0,1.08),'Root'),
 'Spine':((0,0,1.08),(0,0,1.29),'Hips'),
 'Chest':((0,0,1.29),(0,0,1.44),'Spine'),
 'Neck':((0,0,1.44),(0,0,1.53),'Chest'),
 'Head':((0,0,1.53),(0,0,1.73),'Neck'),
}
for side,label in [(-1,'L'),(1,'R')]:
    JOINTS.update({
      'Thigh.'+label:((side*.087,0,.94),(side*.09,.023,.59),'Hips'),
      'Shin.'+label:((side*.09,.023,.59),(side*.09,0,.11),'Thigh.'+label),
      'Foot.'+label:((side*.09,0,.11),(side*.09,.155,.065),'Shin.'+label),
      'UpperArm.'+label:((side*.19,0,1.415),(side*.27,0,1.145),'Chest'),
      'Forearm.'+label:((side*.27,0,1.145),(side*.30,.012,.91),'UpperArm.'+label),
      'Hand.'+label:((side*.30,.012,.91),(side*.31,.018,.815),'Forearm.'+label),
    })
def smooth(a,b,v):
    t=max(0,min(1,(v-a)/(b-a)));return t*t*(3-2*t)
def rigid(bone):return lambda p:{bone:1}
def skin_weights(p,kind,side=1):
    x,y,z=p;label='R' if side>0 else 'L'
    if kind=='torso':
        if z<1.10:
            t=smooth(1.00,1.12,z);return {'Hips':1-t,'Spine':t}
        t=smooth(1.19,1.36,z);return {'Spine':1-t,'Chest':t}
    if kind=='leg':
        t=smooth(.545,.64,z);hip=smooth(.86,.97,z);return {'Hips':hip,'Thigh.'+label:t*(1-hip),'Shin.'+label:(1-t)*(1-hip)}
    if kind=='arm':
        t=smooth(1.095,1.19,z);shoulder=.68*smooth(1.37,1.447,z);return {'Chest':shoulder,'UpperArm.'+label:t*(1-shoulder),'Forearm.'+label:(1-t)*(1-shoulder)}
    return {'Hips':1}
def finish(o,name,color,weights):
    o.name=name
    if o.type!='MESH':
        bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o=bpy.context.object
    # Apply modifiers and object coordinates before painting and assigning deformation.
    bpy.context.view_layer.objects.active=o
    for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    o.data.materials.clear();o.data.materials.append(MAT)
    attr=o.data.color_attributes.new(name='CastColour',type='FLOAT_COLOR',domain='POINT')
    col=linear(color)
    for v in o.data.vertices:
        attr.data[v.index].color=col
        for n,w in weights(v.co).items():
            if w>.00001:
                vg=o.vertex_groups.get(n) or o.vertex_groups.new(name=n);vg.add([v.index],w,'REPLACE')
    for p in o.data.polygons:p.use_smooth=True
    active.append(o);o.select_set(False);return o

def ellipsoid(name,center,radius,color,weights,segments=20,rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=center);o=bpy.context.object;o.scale=radius
    return finish(o,name,color,weights)
def box(name,center,size,color,weights,bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1,location=center);o=bpy.context.object;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    m=o.modifiers.new('Tailored rounded edges','BEVEL');m.width=min(bevel,min(size)*.4);m.segments=2
    return finish(o,name,color,weights)
def tube(name,points,radius,color,weights):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=radius;c.bevel_resolution=1;c.resolution_u=1
    s=c.splines.new('POLY');s.points.add(len(points)-1)
    for q,p in zip(s.points,points):q.co=(*p,1)
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);return finish(o,name,color,weights)
def surface(name,rings,color,weights,segments=24):
    # (centre x,y,z, horizontal radius, depth radius) cross sections.
    verts=[];faces=[]
    for x,y,z,rx,ry in rings:
        for i in range(segments):
            a=math.tau*i/segments;verts.append((x+rx*math.cos(a),y+ry*math.sin(a),z))
    for j in range(len(rings)-1):
        for i in range(segments):
            a=j*segments+i;b=j*segments+(i+1)%segments;faces.append((a,b,b+segments,a+segments))
    faces.append(tuple(range(segments-1,-1,-1)));faces.append(tuple((len(rings)-1)*segments+i for i in range(segments)))
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
    return finish(o,name,color,weights)
def patch(name,verts,faces,color,weights):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
    return finish(o,name,color,weights)
def torso_radius(z,female):
    samples=[(.88,.165,.102),(.95,.17,.104),(1.07,.145 if female else .158,.09),(1.18,.146 if female else .169,.103),(1.29,.177 if female else .182,.106),(1.38,.19,.094),(1.43,.162,.078),(1.46,.085,.052)]
    for i in range(len(samples)-1):
        a,b=samples[i:i+2]
        if a[0]<=z<=b[0]:
            t=(z-a[0])/(b[0]-a[0]);return (a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t)
    return samples[0][1:] if z<samples[0][0] else samples[-1][1:]
def front_insert(name,profile,female,color,weights):
    verts=[];faces=[]
    for z,width in profile:
        rx,ry=torso_radius(z,female);y=ry*math.sqrt(max(.01,1-(width/rx)**2))+.008
        verts.extend([(-width,y,z),(width,y,z)])
    for i in range(len(profile)-1):faces.append((i*2,i*2+1,i*2+3,i*2+2))
    return patch(name,verts,faces,color,weights)
def make_character(key,cfg):
    global active;active=[];s=bpy.data.scenes.new(key);bpy.context.window.scene=s;s.unit_settings.system='METRIC';s.render.fps=24
    skin=cfg['skin'];hair=cfg['hair'];top=cfg['top'];pants=cfg['pants'];accent=cfg['accent'];f=cfg['female'];style=cfg['style']
    wt=lambda p:skin_weights(p,'torso')
    # Real volume and joint loops under tailored trousers, joined by a pelvis shell.
    ellipsoid('Trouser pelvis',(0,-.006,.925),(.169,.102,.098),pants,rigid('Hips'))
    for side,label in [(-1,'L'),(1,'R')]:
        rr=[]
        for z,rx,ry in [(.10,.037,.043),(.17,.039,.043),(.27,.045,.048),(.39,.049,.054),(.47,.049,.054),(.505,.052,.057),(.53,.054,.059),(.56,.055,.061),(.60,.060,.066),(.69,.066,.075),(.81,.071,.083),(.90,.077,.09),(.955,.080,.089)]:rr.append((side*(.09 if z<.7 else .087),.01 if .45<z<.62 else 0,z,rx,ry))
        surface('Continuous trouser leg '+label,rr,pants,lambda p,side=side:skin_weights(p,'leg',side))
        tube('Pressed trouser crease '+label,[(side*.09,.046,.17),(side*.09,.055,.38),(side*.09,.060,.53),(side*.087,.077,.78)],.0013,accent,lambda p,side=side:skin_weights(p,'leg',side))
        ellipsoid('Leather shoe '+label,(side*.09,.052,.060),(.053,.113,.056),PALETTE['shoe'],rigid('Foot.'+label),24,12)
        ellipsoid('Shoe sole '+label,(side*.09,.052,.018),(.054,.113,.019),'#202a32',rigid('Foot.'+label),24,8)
        tube('Shoe welt '+label,[(side*.09+.047*math.cos(a),.052+.104*math.sin(a),.031) for a in [math.tau*i/32 for i in range(33)]],.0022,'#687079',rigid('Foot.'+label))
    rings=[]
    for z in [.92,.96,1.01,1.07,1.13,1.19,1.25,1.31,1.36,1.40,1.43,1.46]:
        rx,ry=torso_radius(z,f);rings.append((0,0,z,rx,ry))
    surface('Tailored upper garment',rings,top,wt,32)
    if style in ['attendant','jacket','utility']:
        # Centre opening, seams and inset panels follow the torso weights.
        tube('Centre tailored seam',[(0,torso_radius(z,f)[1]+.002,z) for z in [1.0,1.08,1.16,1.24,1.32,1.4]],.0022,accent,wt)
        for side in [-1,1]:
            tube('Jacket waist dart',[(side*.083,.073,1.02),(side*.064,.088,1.15),(side*.080,.091,1.27)],.0014,accent,wt)
            box('Lower welt pocket',(side*.098,.077,1.046),(.069,.008,.008),accent,wt,.002)
    if style in ['pilot','polo','utility']:
        for side in [-1,1]:
            box('Breast pocket',(side*.103,.093,1.28),(.073,.014,.08),top,wt,.006)
            tube('Pocket top stitch',[(side*.103-.032,.104,1.31),(side*.103+.032,.104,1.31)],.0015,accent,wt)
        for z in [1.03,1.10,1.18,1.26,1.34]:ellipsoid('Shirt button',(0,.108 if z>1.15 else .096,z),(.003,.003,.003),accent,wt,10,6)
    # Neck is a rounded continuous collar volume.
    surface('Neck',[(0,0,1.43,.044,.047),(0,0,1.47,.043,.045),(0,0,1.51,.040,.043),(0,.001,1.56,.044,.049)],skin,rigid('Neck'),24)
    for side in [-1,1]:
        patch('Folded shirt collar',[(side*.011,.067,1.451),(side*.061,.057,1.453),(side*.081,.098,1.403),(side*.035,.111,1.382)],[(0,1,2,3)],PALETTE['white'] if style in ['attendant','pilot'] else accent,wt)
    if style=='attendant':
        front_insert('Ivory blouse inset',[(1.444,.043),(1.40,.040),(1.35,.034),(1.30,.027),(1.257,.021)],f,PALETTE['white'],wt)
        for side in [-1,1]:
            patch('Tailored jacket lapel',[(side*.072,.083,1.445),(side*.116,.086,1.379),(side*.027,.112,1.27),(side*.044,.112,1.355)],[(0,1,2,3)],accent,wt)
        ellipsoid('Silk neck scarf knot',(.030,.067,1.478),(.030,.022,.022),accent,rigid('Neck'),16,8)
        patch('Scarf hanging silk',[(-.001,.090,1.47),(.035,.092,1.48),(.065,.125,1.35),(.030,.13,1.32)],[(0,1,2,3)],accent,wt)
        box('Crew name badge',(-.1,.098,1.333),(.052,.009,.022),'#dfd4b2',wt,.003)
        for x in [-.113,-.106,-.099,-.092]:box('Badge engraved mark',(x,.104,1.333),(.003,.002,.005),'#637780',wt,.0005)
        ellipsoid('Uniform wing pin',(-.1,.095,1.36),(.024,.004,.008),PALETTE['gold'],wt,16,8)
    if style=='pilot':
        front_insert('Pilot tie',[(1.435,.019),(1.4,.017),(1.35,.016),(1.3,.016),(1.24,.017),(1.18,.017),(1.158,.001)],f,PALETTE['navy'],wt)
        for side in [-1,1]:
            box('Pilot epaulette',(side*.147,0,1.437),(.085,.067,.013),PALETTE['navy'],rigid('Chest'),.003)
            for x in [.119,.138,.157,.176]:box('Captain rank gold band',(side*x,0,1.446),(.006,.063,.006),PALETTE['gold'],rigid('Chest'),.001)
        ellipsoid('Pilot wings badge',(-.1,.108,1.348),(.038,.005,.009),PALETTE['gold'],wt,20,8)
    if style=='cardigan':
        front_insert('Cardigan ivory undershirt',[(1.45,.040),(1.4,.043),(1.3,.044),(1.2,.044),(1.1,.044),(1.0,.044)],f,accent,wt)
    if style=='sweater':
        for z in [1.00,1.007,1.014]:tube('Sweater rib hem',[(.16*math.cos(a),.101*math.sin(a),z) for a in [math.tau*i/32 for i in range(33)]],.0015,accent,wt)
    box('Belt front',(0,.108,.958),(.25,.012,.028),PALETTE['shoe'],rigid('Hips'),.004)
    box('Brushed belt buckle',(0,.118,.958),(.030,.009,.023),PALETTE['gold'] if style in ['attendant','pilot'] else '#84979e',rigid('Hips'),.003)
    # Separate smooth arms, short / long sleeve shapes and intentionally articulated hands.
    short=style in ['pilot','utility','polo']
    for side,label in [(-1,'L'),(1,'R')]:
        armrings=[]
        for z,rx,ry in [(.894,.025,.029),(.93,.030,.032),(.99,.035,.037),(1.06,.039,.041),(1.11,.041,.044),(1.145,.045,.046),(1.18,.049,.05),(1.24,.054,.055),(1.31,.061,.06),(1.37,.067,.063),(1.42,.063,.062),(1.45,.042,.05)]:
            x=side*(.30-(z-.91)*.128) if z<=1.145 else side*(.27-(z-1.145)*.296)
            x-=side*.012*smooth(1.17,1.45,z)
            factor=.84 if f else .92
            armrings.append((x,0,z,rx*factor,ry*factor))
        surface('Skin arm '+label,[r for r in armrings if r[2]<=(1.24 if short else .99)],skin,lambda p,side=side:skin_weights(p,'arm',side),24)
        sleeve=[(x,y,z,rx+.005,ry+.005) for x,y,z,rx,ry in armrings if z>=(1.24 if short else .952) and z<1.45]
        sleeve.append((side*.145,0,1.442,.022,.030))
        surface('Tailored sleeve '+label,sleeve,top,lambda p,side=side:skin_weights(p,'arm',side),24)
        cz=1.243 if short else .974;cx=side*(.27-(cz-1.145)*.296) if short else side*(.30-(cz-.91)*.128)
        tube('Sleeve cuff piping '+label,[(cx+(.06 if short else .035)*math.cos(a),(.06 if short else .037)*math.sin(a),cz) for a in [math.tau*i/24 for i in range(25)]],.002,accent,lambda p,side=side:skin_weights(p,'arm',side))
        ellipsoid('Palm '+label,(side*.305,.016,.870),(.033,.022,.046),skin,rigid('Hand.'+label),20,10)
        # Four shaped fingers and a thumb, all inherit the hand action pose.
        for i in range(4):
            y=.018;z=.819+(abs(i-1.5)*.004)
            ellipsoid('Finger '+label+str(i),(side*(.282+i*.016),y,z),(.009,.012,.030-abs(i-1.5)*.003),skin,rigid('Hand.'+label),12,8)
        thumb=ellipsoid('Thumb '+label,(side*.278,.025,.853),(.012,.015,.026),skin,rigid('Hand.'+label),12,8)
    # Sculpted head silhouette with cheek / jaw loops rather than a sphere-only face.
    headrings=[(0,-.002,1.525,.034,.044),(0,.001,1.545,.055,.057),(0,.004,1.573,.073,.067),(0,.001,1.61,.085,.079),(0,-.004,1.649,.088,.082),(0,-.010,1.688,.083,.080),(0,-.013,1.724,.069,.067),(0,-.014,1.749,.039,.040),(0,-.014,1.758,.008,.009)]
    surface('Sculpted face and skull',headrings,skin,rigid('Head'),32)
    for side in [-1,1]:
        ellipsoid('Ear',(side*.087,-.005,1.62),(.016,.020,.033),skin,rigid('Head'),16,10)
        ellipsoid('Ear inner fold',(side*.097,.003,1.619),(.006,.012,.022),'#a16f59',rigid('Head'),12,8)
        # Eyeballs sit into the face; curved lids frame a human scale eye.
        ellipsoid('Eye white',(side*.034,.0745,1.649),(.022,.011,.0095),PALETTE['eyes'],rigid('Head'),20,10)
        ellipsoid('Iris',(side*.034,.0843,1.649),(.0072,.003,.0072),PALETTE['iris'],rigid('Head'),16,8)
        ellipsoid('Pupil',(side*.034,.0865,1.649),(.0036,.0015,.0044),PALETTE['pupil'],rigid('Head'),12,8)
        ellipsoid('Eye highlight',(side*.032,.0875,1.652),(.0018,.001,.0018),'#ffffff',rigid('Head'),8,6)
        tube('Upper eyelid',[(side*.034+.022*math.cos(a),.080+ .005*math.sin(a),1.649+.010*math.sin(a)) for a in [math.pi*i/12 for i in range(13)]],.0025,skin,rigid('Head'))
        tube('Eyebrow',[(side*.016,.081,1.670),(side*.029,.084,1.675),(side*.048,.079,1.674),(side*.055,.074,1.671)],.0032,hair,rigid('Head'))
    ellipsoid('Nose bridge',(0,.078,1.625),(.011,.013,.028),skin,rigid('Head'),16,10)
    ellipsoid('Nose tip',(0,.091,1.609),(.015,.016,.011),skin,rigid('Head'),16,10)
    for side in [-1,1]:ellipsoid('Nostril crease',(side*.009,.098,1.605),(.0033,.002,.002),'#8a6153',rigid('Head'),10,6)
    tube('Upper lip',[(-.022,.069,1.580),(-.01,.075,1.582),(0,.076,1.580),(.01,.075,1.582),(.022,.069,1.580)],.0032,'#99635d' if f else '#ae8171',rigid('Head'))
    tube('Lower lip',[(-.020,.070,1.577),(0,.075,1.575),(.020,.070,1.577)],.0028,'#ba8277' if f else '#bd8e7e',rigid('Head'))
    # Hair cap has a clean asymmetric hairline, sculpted sideburns and optional bun/bob.
    verts=[];faces=[];seg=32
    for j in range(9):
        t=j/8
        for i in range(seg):
            a=math.tau*i/seg;front=max(0,math.sin(a));limit=1.75-.47*front
            theta=.03+(limit-.03)*t
            z=1.672+.090*math.cos(theta)
            verts.append((.091*math.sin(theta)*math.cos(a),-.014+.088*math.sin(theta)*math.sin(a),z))
    for j in range(8):
        for i in range(seg):a=j*seg+i;b=j*seg+(i+1)%seg;faces.append((a,a+seg,b+seg,b))
    patch('Sculpted hair cap',verts,faces,hair,rigid('Head'))
    for side in [-1,1]:ellipsoid('Hair temple',(side*.077,-.02,1.662),(.018,.056,.054),hair,rigid('Head'),16,10)
    if cfg['hairdo']=='bun':
        ellipsoid('Neat airline hair bun',(0,-.09,1.635),(.057,.043,.052),hair,rigid('Head'),24,14)
        tube('Bun ribbon',[(.043*math.cos(a),-.087+.009*math.sin(a),1.635+.043*math.sin(a)) for a in [math.tau*i/32 for i in range(33)]],.004,accent,rigid('Head'))
        for side in [-1,1]:ellipsoid('Small pearl earring',(side*.09,.001,1.594),(.006,.006,.006),'#e4d5b4',rigid('Head'),12,8)
    if cfg['hairdo']=='bob':
        for side in [-1,1]:ellipsoid('Soft bob side',(side*.077,-.028,1.605),(.023,.065,.087),hair,rigid('Head'),24,14)
        ellipsoid('Bob nape',(0,-.067,1.613),(.077,.032,.076),hair,rigid('Head'),24,14)
    for side in [-1,1]:
        tube('Combed hair contour',[(side*.01,.045,1.750),(side*.046,.039,1.741),(side*.074,.012,1.713),(side*.083,-.035,1.676)],.0018,'#716054' if cfg['hairdo']!='short' else '#82786c',rigid('Head'))
    if key=='passenger-c':
        for side in [-1,1]:
            tube('Eyeglass frame',[(side*.034+.027*math.cos(a),.086,1.65+.018*math.sin(a)) for a in [math.tau*i/24 for i in range(25)]],.0022,'#56616b',rigid('Head'))
        tube('Glasses bridge',[(-.007,.088,1.65),(0,.092,1.655),(.007,.088,1.65)],.0022,'#56616b',rigid('Head'))
    # Join the authored surfaces into one skinned, vertex-coloured draw call.
    bpy.ops.object.select_all(action='DESELECT')
    for o in active:o.select_set(True)
    bpy.context.view_layer.objects.active=active[0];bpy.ops.object.join();mesh=bpy.context.object;mesh.name='Original '+key+' deformable mesh'
    armdata=bpy.data.armatures.new('Flight404 humanoid skeleton');arm=bpy.data.objects.new('CrewRig',armdata);s.collection.objects.link(arm)
    bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);bpy.context.view_layer.objects.active=arm;bpy.ops.object.mode_set(mode='EDIT')
    for n,(h,t,parent) in JOINTS.items():
        b=armdata.edit_bones.new(n);b.head=h;b.tail=t
        if parent:b.parent=armdata.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT');mesh.parent=arm;mod=mesh.modifiers.new('Humanoid skin deformation','ARMATURE');mod.object=arm
    arm['forward']='Blender +Y / glTF -Z';arm['service_tray_mount']='[0, 1.04, -0.34]';arm['seat_cushion_height']=.57
    return s,mesh,arm

def aim(arm,name,head,tail):
    pb=arm.pose.bones[name];rest=pb.bone;head=V(head);tail=V(tail)
    turn=(rest.tail_local-rest.head_local).rotation_difference(tail-head)
    pb.matrix=Matrix.Translation(head)@turn.to_matrix().to_4x4()@Matrix.Translation(-rest.head_local)@rest.matrix_local
    bpy.context.view_layer.update()
def solve(a,b,l1,l2,bend):
    a=V(a);b=V(b);axis=b-a;distance=max(.001,min(axis.length,(l1+l2)*.995));axis.normalize()
    along=(l1*l1-l2*l2+distance*distance)/(2*distance)
    pole=V(bend);pole-=axis*pole.dot(axis);pole.normalize()
    return a+axis*along+pole*math.sqrt(max(0,l1*l1-along*along))
def pose(arm,clip,u):
    for pb in arm.pose.bones:pb.rotation_mode='QUATERNION';pb.rotation_quaternion=(1,0,0,0);pb.location=(0,0,0)
    bpy.context.view_layer.update()
    phase=u*math.tau;moving=clip in ['Walk','Carry'];seat=1 if clip in ['Seated','Brace'] else (smooth(0,1,u) if clip=='Sit' else 1-smooth(0,1,u) if clip=='Stand' else 0)
    dead=clip=='Dead';seathip=.68
    hipz=.94+(.018*math.cos(phase*2)-.045 if moving else .002*math.sin(phase))
    hipz=hipz*(1-seat)+seathip*seat
    hip=(0,0,hipz);spine=(0,0,hipz+.14);chest=(0,.008,hipz+.35);neck=(0,.004,hipz+.50);head=(0,.005,hipz+.59);crown=(0,.005,hipz+.79)
    if clip=='Brace':
        chest=(0,.014,hipz+.349);neck=(0,.045,hipz+.495);head=(0,.077,hipz+.579);crown=(0,.125,hipz+.773)
    if dead:
        # A looping non-graphic seated slump is safe for passenger chairs and cockpit.
        seat=1;hipz=seathip;hip=(0,0,hipz);spine=(0,0,hipz+.14);chest=(0,.027,hipz+.348);neck=(0,.076,hipz+.490);head=(0,.120,hipz+.569);crown=(0,.197,hipz+.753)
    aim(arm,'Hips',hip,spine);aim(arm,'Spine',spine,chest);aim(arm,'Chest',chest,neck);aim(arm,'Neck',neck,head);aim(arm,'Head',head,crown)
    for side,label in [(-1,'L'),(1,'R')]:
        h=V((side*.087,0,hipz));ph=phase+(math.pi if side<0 else 0)
        standingfoot=V((side*.09,.205*math.sin(ph) if moving else 0,.11+(.075*max(0,-math.cos(ph)) if moving else 0)))
        if clip=='DeadStanding':standingfoot+=V((0,(.12 if side>0 else .04)*smooth(0,.7,u),.02*smooth(0,.7,u)))
        seatedfoot=V((side*.105,.397,.11));foot=standingfoot.lerp(seatedfoot,seat)
        if dead:foot=seatedfoot
        knee=solve(h,foot,arm.data.bones['Thigh.'+label].length,arm.data.bones['Shin.'+label].length,(0,1,0))
        aim(arm,'Thigh.'+label,h,knee);aim(arm,'Shin.'+label,knee,foot);aim(arm,'Foot.'+label,foot,foot+V((0,.155,-.045)))
        shoulder=V(chest)+V((side*.19,-.008,.125))
        hand=V((side*.30,.012+( -.10*math.sin(ph) if moving else .003*math.sin(phase)),hipz-.03))
        if seat:hand=hand.lerp(V((side*.12,.30,hipz+.015)),seat)
        if clip in ['Carry','Serve']:
            reach=.34+(.038*math.sin(math.pi*u) if clip=='Serve' else 0)
            hand=V((side*.183,reach,1.032+(hipz-.94)*.3))
        if clip=='Gesture' and side<0:hand=V((-.25,.26,1.30+.06*math.sin(phase)))
        if clip=='Brace':hand=V((side*.085,.124,hipz+.580))
        if clip=='Weapon':hand=V((side*.045,.44,1.22))
        if dead:hand=V((side*.21,.26,.70))
        elbow=solve(shoulder,hand,arm.data.bones['UpperArm.'+label].length,arm.data.bones['Forearm.'+label].length,(side,-.3,-.1))
        aim(arm,'UpperArm.'+label,shoulder,elbow);aim(arm,'Forearm.'+label,elbow,hand)
        direction=V((0,.095,0)) if clip in ['Carry','Serve','Weapon'] or seat else V((side*.01,.006,-.094))
        if clip=='Brace':direction=V((0,.02,.092))
        aim(arm,'Hand.'+label,hand,hand+direction)
    if clip=='DeadStanding':
        # Full-body collapse into a settled side pose; no gore. Quaternion relative to root.
        from mathutils import Quaternion
        t=smooth(0,.7,u)
        root=arm.pose.bones['Root'];root.rotation_mode='QUATERNION'
        root.rotation_quaternion=Quaternion(root.bone.matrix_local.to_3x3().inverted()@V((0,1,0)),-math.pi*.49*t)
        root.location=root.bone.matrix_local.to_3x3().inverted()@V((0,0,.345*t))
    bpy.context.view_layer.update()

CLIPS={'Idle':2,'Walk':1.2,'Carry':1.2,'Serve':2,'Sit':1.2,'Seated':2,'Stand':1.2,'Gesture':2,'Brace':2,'Dead':2,'DeadStanding':1.6,'Weapon':2}
def animate(s,arm):
    arm.animation_data_create()
    for clip,duration in CLIPS.items():
        action=bpy.data.actions.new(clip);arm.animation_data.action=action;frames=round(duration*24)
        # Full resampling guarantees identical joint timing in Three AnimationMixer.
        for frame in range(frames+1):
            pose(arm,clip,frame/frames)
            for pb in arm.pose.bones:
                pb.keyframe_insert('rotation_quaternion',frame=frame+1,group=pb.name);pb.keyframe_insert('location',frame=frame+1,group=pb.name)
        track=arm.animation_data.nla_tracks.new();track.name=clip;strip=track.strips.new(clip,1,action);strip.action_frame_start=1;strip.action_frame_end=frames+1;track.mute=True;arm.animation_data.action=None
    for pb in arm.pose.bones:pb.rotation_quaternion=(1,0,0,0);pb.location=(0,0,0)
    bpy.context.view_layer.update()
def export(s,mesh,arm,key):
    bpy.context.window.scene=s;bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);arm.select_set(True);bpy.context.view_layer.objects.active=arm
    bpy.ops.export_scene.gltf(filepath=str(OUT/(key+'.glb')),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=True,export_frame_range=False,export_cameras=False,export_lights=False,export_extras=True)
    print('EXPORTED ORIGINAL',key,flush=True)
def studio(s,camera=(3,6,3),target=(0,0,.9),scale=2.1,res=(800,900)):
    bpy.context.window.scene=s;s.world=bpy.data.worlds.new('Soft daylight studio');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.33,.39,.46,1)
    for p,e,size in [((3,4,5),700,4),((-4,2,3),500,3),((1,-3,4),800,3)]:
        bpy.ops.object.light_add(type='AREA',location=p);o=bpy.context.object;o.data.energy=e;o.data.size=size;o.rotation_euler=(V(target)-o.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=camera);o=bpy.context.object;o.rotation_euler=(V(target)-o.location).to_track_quat('-Z','Y').to_euler();o.data.type='ORTHO';o.data.ortho_scale=scale;s.camera=o
    s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=True;s.render.resolution_x=res[0];s.render.resolution_y=res[1];s.render.resolution_percentage=100;s.view_settings.view_transform='AgX';s.render.image_settings.file_format='PNG'
def render(s,name):s.render.filepath=str(PRE/name);bpy.ops.render.render(write_still=True)
def sidearm():
    global active;active=[];s=bpy.data.scenes.new('sidearm');bpy.context.window.scene=s
    box('Generic fictional sidearm slide',(0,.045,.033),(.033,.145,.030),'#566572',rigid('Root'),.005)
    box('Generic grip',(0,-.01,-.018),(.03,.044,.075),'#323f4a',rigid('Root'),.006)
    box('Receiver',(0,.030,.016),(.028,.108,.022),'#3d4d59',rigid('Root'),.004)
    tube('Trigger guard',[(-.002,.026,-.019),(-.002,.059,-.016),(-.002,.06,.011)],.004,'#3d4d59',rigid('Root'))
    for z in [-.048,-.036,-.024,-.012]:box('Grip texture',(0,-.032,z),(.024,.004,.003),'#5e6b73',rigid('Root'),.001)
    bpy.ops.object.select_all(action='DESELECT')
    for o in active:o.select_set(True)
    bpy.context.view_layer.objects.active=active[0];bpy.ops.object.join();o=bpy.context.object;o.name='Fictional sidearm'
    bpy.ops.export_scene.gltf(filepath=str(OUT/'sidearm.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
    return s

args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
quick='--quick' in args
chosen=['attendant'] if quick else list(VARIANTS)
assets={}
for key in chosen:
    s,mesh,arm=make_character(key,VARIANTS[key]);animate(s,arm);export(s,mesh,arm,key);assets[key]=(s,mesh,arm)
    if key=='attendant':
        studio(s);pose(arm,'Idle',0);render(s,'original-attendant.png')
        pose(arm,'Seated',0);render(s,'original-attendant-seated.png')
        bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-.05,.52));ref=bpy.context.object;ref.name='Preview-only 0.57 m seat cushion';ref.dimensions=(.51,.46,.1)
        s.camera.location=(5,.15,1.0);s.camera.rotation_euler=(V((0,.05,.8))-s.camera.location).to_track_quat('-Z','Y').to_euler();s.camera.data.ortho_scale=1.85
        render(s,'original-seat-fit.png');bpy.data.objects.remove(ref,do_unlink=True)
        s.camera.location=(3,6,3);s.camera.rotation_euler=(V((0,0,.9))-s.camera.location).to_track_quat('-Z','Y').to_euler();s.camera.data.ortho_scale=2.1
        pose(arm,'Walk',.2);render(s,'original-attendant-walk.png')
        pose(arm,'Serve',.4);render(s,'original-attendant-serve.png')
        pose(arm,'DeadStanding',1)
        s.camera.location=(1.4,5.0,2.2);s.camera.rotation_euler=(V((-.75,0,.25))-s.camera.location).to_track_quat('-Z','Y').to_euler();s.camera.data.ortho_scale=2.2
        render(s,'original-attendant-deadstanding.png')
        s.camera.location=(3,6,3);s.camera.rotation_euler=(V((0,0,.9))-s.camera.location).to_track_quat('-Z','Y').to_euler();s.camera.data.ortho_scale=2.1
        pose(arm,'Brace',0);render(s,'original-attendant-brace.png')
        pose(arm,'Weapon',0);render(s,'original-attendant-weapon.png')
        pose(arm,'Idle',0)
if not quick:
    sidearm()
    gallery=bpy.data.scenes.new('Cast lineup');bpy.context.window.scene=gallery
    for i,(key,(source,mesh,arm)) in enumerate(assets.items()):
        ac=arm.copy();ac.data=arm.data.copy();ac.animation_data_clear();gallery.collection.objects.link(ac)
        mc=mesh.copy();gallery.collection.objects.link(mc);mc.parent=ac
        for mod in mc.modifiers:
            if mod.type=='ARMATURE':mod.object=ac
        pose(ac,'Idle',0);ac.location.x=(i-3.5)*.59
    studio(gallery,camera=(1.5,9,2.7),target=(0,0,.9),scale=5.15,res=(1900,820));render(gallery,'original-airline-cast.png')
# Save one editable Blender file containing every character, skeleton, palette and all clips.
bpy.context.window.scene=assets['attendant'][0]
bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'animated-crew.blend'))
manifest={'author':'Original FLIGHT 404 procedural Blender production; no external meshes or textures','source':'scripts/blender/build_animated_crew.py','blender':bpy.app.version_string,'coordinates':'metres, glTF +Y up and -Z forward','standing_height_m':1.77,'seat_cushion_height_m':.57,'service_tray_mount':[0,1.04,-.34],'weapon_mount':[.04,1.22,-.49],'clips':CLIPS,'assets':{}}
for p in OUT.glob('*.glb'):
    data=p.read_bytes();doc=json.loads(data[20:20+int.from_bytes(data[12:16],'little')]);manifest['assets'][p.stem]={'bytes':len(data),'triangles':sum(doc['accessors'][p['indices']]['count']//3 for m in doc.get('meshes',[]) for p in m['primitives']),'skins':len(doc.get('skins',[])),'animations':[a['name'] for a in doc.get('animations',[])],'clip_durations_seconds':{a['name']:max(doc['accessors'][x['input']]['max'][0] for x in a['samplers']) for a in doc.get('animations',[])},'sha256':hashlib.sha256(data).hexdigest()}
(SRC/'animated-crew-manifest.json').write_text(json.dumps(manifest,indent=2));print(json.dumps(manifest),flush=True)
