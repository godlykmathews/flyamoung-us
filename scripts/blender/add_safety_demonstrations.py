"""Augment the original FLIGHT 404 cast with authored safety demonstration actions.
Preserves original meshes, palette, rig, and 12 clips; saves a separate editable source.
Blender --background --factory-startup --python scripts/blender/add_safety_demonstrations.py
All figures and equipment are original procedural geometry. No imported/provider assets.
"""
import bpy, math, json, hashlib, ast, sys
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[2]
SRC=ROOT/'models/blender'; OUT=ROOT/'client/public/models/animated'; PROPS=ROOT/'client/public/models/safety'; PRE=ROOT/'docs/previews'
PROPS.mkdir(parents=True,exist_ok=True); PRE.mkdir(parents=True,exist_ok=True)
# Load only helper definitions, without the original script's scene reset/production loop.
tree=ast.parse((ROOT/'scripts/blender/build_animated_crew.py').read_text())
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)],type_ignores=[]),'<original-cast-helpers>','exec'))
bpy.ops.wm.open_mainfile(filepath=str(SRC/'animated-crew.blend'))
CLIPS=['SafetySeatbelt','SafetyOxygen','SafetyLifeVest','SafetyExits']
KEYS=['attendant','attendant-player','pilot','marshal','engineer','passenger-a','passenger-b','passenger-c']

def lerp(a,b,t):return V(a).lerp(V(b),max(0,min(1,t)))
def path(t,keys):
    if t<=keys[0][0]:return V(keys[0][1])
    for (a,p),(b,q) in zip(keys,keys[1:]):
        if a<=t<=b:return lerp(p,q,smooth(a,b,t))
    return V(keys[-1][1])
def safety_pose(arm,clip,t):
    pose(arm,'Idle',t/4)
    # All gestures use the original IK lengths; a restrained breathing sway keeps them alive.
    chest=arm.pose.bones['Chest'].head.copy()
    for side,label in [(-1,'L'),(1,'R')]:
        start=(side*.30,.02,.91)
        if clip=='SafetySeatbelt':
            hand=path(t,[(0,start),(.65,(side*.155,.29,1.19)),(1.35,(side*.15,.30,1.19)),(2.25,(side*.028,.26,1.01)),(3.4,(side*.028,.26,1.01)),(4,(side*.028,.26,1.01))])
            handdir=V((0,.095,0))
        elif clip=='SafetyOxygen':
            # Right hand reaches overhead, then demonstrates the mask against nose/mouth.
            if side>0:
                hand=path(t,[(0,start),(.75,(.16,.10,1.89)),(1.1,(.15,.10,1.86)),(1.95,(.028,.17,1.595)),(3.6,(.028,.17,1.595)),(4,(.028,.17,1.595))])
                handdir=path(t,[(0,(0,.095,0)),(.9,(0,0,.095)),(1.9,(0,.005,.095)),(4,(0,.005,.095))])
            else:
                hand=path(t,[(0,start),(1.25,(-.22,.18,1.25)),(2.4,(-.15,.23,1.38)),(4,(-.15,.23,1.38))])
                handdir=V((0,.095,0))
        elif clip=='SafetyLifeVest':
            hand=path(t,[(0,start),(.65,(side*.13,.26,1.21)),(1.35,(side*.16,.20,1.43)),(2.05,(side*.14,.18,1.31)),(2.6,(side*.09,.23,1.05)),(3.15,(side*.18,.24,1.00)),(3.75,(side*.15,.21,1.30)),(4,(side*.15,.21,1.30))])
            handdir=V((0,.095,0))
        else:
            # Deliberate open-hand exit indications, first left, then right, then both.
            if side<0:
                hand=path(t,[(0,start),(.7,(-.61,.12,1.41)),(1.45,(-.61,.12,1.41)),(2.15,(-.38,.18,1.13)),(2.9,(-.61,.12,1.41)),(4,(-.61,.12,1.41))])
            else:
                hand=path(t,[(0,start),(.7,(.32,.13,1.03)),(1.4,(.32,.13,1.03)),(2.15,(.61,.12,1.41)),(2.9,(.61,.12,1.41)),(4,(.61,.12,1.41))])
            handdir=V((side*.090,.015,.005))
        shoulder=chest+V((side*.19,-.008,.125))
        elbow=solve(shoulder,hand,arm.data.bones['UpperArm.'+label].length,arm.data.bones['Forearm.'+label].length,(side,-.3,-.1) if clip=='SafetyExits' else (side*.45,-.12,-1))
        aim(arm,'UpperArm.'+label,shoulder,elbow);aim(arm,'Forearm.'+label,elbow,hand);aim(arm,'Hand.'+label,hand,hand+handdir)
    # A small head turn follows each exit indication; all other clips look toward passengers.
    if clip=='SafetyExits':
        pb=arm.pose.bones['Head'];from mathutils import Quaternion
        turn=path(t,[(0,(0,0,0)),(.8,(0,0,.20)),(1.45,(0,0,.20)),(2.15,(0,0,-.20)),(3,(0,0,0)),(4,(0,0,0))]).z
        pb.rotation_quaternion=Quaternion((0,1,0),turn)
    bpy.context.view_layer.update()

assets={}
for key in KEYS:
    s=bpy.data.scenes[key];bpy.context.window.scene=s
    arm=next(o for o in s.objects if o.type=='ARMATURE');mesh=next(o for o in s.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers))
    for clip in CLIPS:
        # Zero-based frames yield exact 4.0-second glTF clips at 24 fps.
        action=bpy.data.actions.new(clip);arm.animation_data.action=action
        for frame in range(97):
            safety_pose(arm,clip,frame/24)
            for pb in arm.pose.bones:
                pb.keyframe_insert('rotation_quaternion',frame=frame,group=pb.name);pb.keyframe_insert('location',frame=frame,group=pb.name)
        track=arm.animation_data.nla_tracks.new();track.name=clip;strip=track.strips.new(clip,0,action);strip.action_frame_start=0;strip.action_frame_end=96;track.mute=True;arm.animation_data.action=None
    pose(arm,'Idle',0);export(s,mesh,arm,key);assets[key]=(s,mesh,arm)

# Lightweight, bevelled equipment with distinct physical materials and dimensions.
ps=bpy.data.scenes.new('Safety demonstration equipment');bpy.context.window.scene=ps
materials={}
def material(name,color,metal=0,rough=.5):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;materials[name]=m;return m
navy=material('Woven navy safety belt',(.027,.050,.078),0,.85)
steel=material('Brushed buckle aluminium',(.48,.57,.62),.75,.30)
yellow=material('Safety yellow life vest',(.93,.57,.026),0,.64)
yellowlight=material('Mask golden yellow rim',(.94,.68,.045),0,.4)
orange=material('Pull tab orange',(.88,.16,.025),0,.57)
clear=material('Oxygen cup pale blue',(.51,.73,.77),.05,.25)
cream=material('Reservoir soft ivory',(.86,.90,.86),0,.86)
ink=material('Dark equipment detail',(.07,.12,.15),0,.75)
white=material('Reflective silver patch',(.88,.91,.91),.3,.32)
prop_objects=[]
def finish_prop(o,name,mat):
    o.name=name;o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    prop_objects.append(o);return o
def pbox(name,loc,size,mat,bevel=.005):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    m=o.modifiers.new('Soft sewn edges','BEVEL');m.width=min(bevel,min(size)*.4);m.segments=3;bpy.ops.object.modifier_apply(modifier=m.name)
    return finish_prop(o,name,mat)
def pell(name,loc,size,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=14,location=loc);o=bpy.context.object;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish_prop(o,name,mat)
def ptube(name,pts,r,mat):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=2;c.resolution_u=1;sp=c.splines.new('POLY');sp.points.add(len(pts)-1)
    for q,p in zip(sp.points,pts):q.co=(*p,1)
    o=bpy.data.objects.new(name,c);ps.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');return finish_prop(bpy.context.object,name,mat)
def webbing(name,side):
    verts=[];faces=[]
    for i in range(13):
        u=i/12;x=side*(.026+.15*u);z=-.020*math.sin(math.pi*u);y=-.014*math.sin(math.pi*u)
        verts.extend([(x,y,z-.0195),(x,y,z+.0195)])
    for i in range(12):faces.append((2*i,2*i+1,2*i+3,2*i+2))
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);ps.collection.objects.link(o)
    mod=o.modifiers.new('Woven strap thickness','SOLIDIFY');mod.thickness=.004;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name);finish_prop(o,name,navy)
    for edge in [-.014,.014]:ptube('Soft stitched webbing edge',[(side*(.026+.15*i/12),-.014*math.sin(math.pi*i/12)+.003,-.020*math.sin(math.pi*i/12)+edge) for i in range(13)],.0008,steel)
def start():
    global prop_objects;prop_objects=[];bpy.ops.object.select_all(action='DESELECT')
def saveprop(name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in prop_objects:o.select_set(True)
    bpy.context.view_layer.objects.active=prop_objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
    bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.export_scene.gltf(filepath=str(PROPS/(name+'.glb')),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
    o.hide_render=True;o.hide_set(True);return o
props={}
start();pbox('Left buckle shell',(0,0,0),(.053,.014,.041),steel);pbox('Lift release latch',(0,.009,.006),(.043,.008,.024),steel);pbox('Buckle dark inset',(.014,.009,-.009),(.013,.003,.011),ink)
webbing('Left curved navy webbing',-1)
props['belt-left']=saveprop('belt-left')
start();pbox('Right belt tongue',(-.007,0,0),(.047,.007,.031),steel);pbox('Tongue notch',(-.012,.004,0),(.014,.002,.016),ink);webbing('Right curved navy webbing',1)
props['belt-right']=saveprop('belt-right')
start();pell('Anatomical oxygen cup',(0,0,0),(.047,.030,.052),clear)
ptube('Yellow mask rim',[(.045*math.cos(a),-.008,.050*math.sin(a)) for a in [math.tau*i/48 for i in range(49)]],.005,yellowlight)
pell('Reservoir bag',(0,.022,-.102),(.035,.014,.063),cream);pbox('Oxygen valve',(0,.03,-.035),(.027,.024,.029),yellowlight)
ptube('Flexible oxygen hose',[(0,.035,-.037),(.055,.05,-.01),(.075,.04,.09),(.06,.025,.17),(.04,0,.23)],.004,cream)
ptube('Elastic mask strap',[(-.046,0,.01),(-.06,-.018,.026),(0,-.055,.041),(.06,-.018,.026),(.046,0,.01)],.0027,navy)
props['oxygen-mask']=saveprop('oxygen-mask')
start();pbox('Folded life vest yellow packet',(0,0,0),(.235,.058,.155),yellow,.018);pbox('Printed white instruction card',(0,.031,0),(.11,.004,.075),cream,.003)
for z in [-.024,-.011,.002,.015]:pbox('Instruction diagram line',(0,.034,z),(.074,.002,.004),ink,.0005)
pbox('Orange opening pull tab',(.09,.04,-.065),(.028,.01,.026),orange,.003);ptube('Packet seam',[(-.112,.031,.065),(-.112,.031,-.065),(.112,.031,-.065),(.112,.031,.065)],.0015,cream)
props['life-vest-folded']=saveprop('life-vest-folded')
start()
# Pivot is upper sternum; left and right chambers leave an open neck slot.
for side in [-1,1]:
    pell('Inflated left/right chest chamber',(side*.103,.022,-.06),(.082,.044,.18),yellow)
    pbox('Reflective shoulder patch',(side*.104,.061,.032),(.048,.006,.043),white,.005)
    ptube('Vest perimeter stitch',[(side*(.103+.069*math.cos(a)),.057,-.06+.156*math.sin(a)) for a in [math.tau*i/40 for i in range(41)]],.0018,yellowlight)
    ptube('Inflation pull cord',[(side*.10,.053,-.18),(side*.105,.067,-.265)],.0025,navy)
    pbox('Red inflation pull toggle',(side*.105,.067,-.267),(.021,.013,.033),orange,.004)
    pbox('Side strap',(side*.165,-.004,-.125),(.036,.037,.018),navy,.003)
ptube('Collar bridge',[(-.102,-.035,.065),(-.07,-.075,.083),(0,-.095,.085),(.07,-.075,.083),(.102,-.035,.065)],.034,yellow)
pbox('Waist harness',(0,-.003,-.185),(.275,.026,.021),navy,.004);pbox('Harness clasp',(0,.02,-.185),(.033,.022,.03),ink,.004)
ptube('Oral inflation tube',[(.139,.063,-.08),(.15,.07,.005),(.138,.069,.061)],.008,orange)
props['life-vest']=saveprop('life-vest')

# Preview each action on a dedicated clone; source characters retain their rest pose.
gallery=bpy.data.scenes.new('Safety demonstration contact sheet');bpy.context.window.scene=gallery
preview_times={'SafetySeatbelt':2.75,'SafetyOxygen':2.5,'SafetyLifeVest':3.7,'SafetyExits':3.3}
preview_contract={}
for i,clip in enumerate(CLIPS):
    _,mesh,arm=assets['attendant']
    ac=arm.copy();ac.data=arm.data.copy();ac.animation_data_clear();gallery.collection.objects.link(ac);mc=mesh.copy();gallery.collection.objects.link(mc);mc.parent=ac
    for mod in mc.modifiers:
        if mod.type=='ARMATURE':mod.object=ac
    safety_pose(ac,clip,preview_times[clip]);ac.location.x=(i-1.5)*1.40
    def place_prop(key,local):
        original=props[key];copy=original.copy();copy.hide_render=False;gallery.collection.objects.link(copy);copy.hide_set(False);copy.location=V(local)+ac.location;return copy
    def palm(label):
        pb=ac.pose.bones['Hand.'+label];return pb.head+(pb.tail-pb.head).normalized()*.04
    if clip=='SafetySeatbelt':place_prop('belt-left',palm('L')+V((0,.035,0)));place_prop('belt-right',palm('R')+V((0,.035,0)))
    if clip=='SafetyOxygen':place_prop('oxygen-mask',(0,.127,1.605))
    if clip=='SafetyLifeVest':place_prop('life-vest',(0,.103,1.38))
    # Legible graphite labels on an ivory presentation floor.
    bpy.ops.object.text_add(location=(ac.location.x,.21,-.10),rotation=(math.pi/2,0,math.pi));tx=bpy.context.object;tx.name=clip+' label';tx.data.body={'SafetySeatbelt':'FASTEN','SafetyOxygen':'FIT MASK','SafetyLifeVest':'LIFE VEST','SafetyExits':'EXITS'}[clip];tx.data.size=.12;tx.data.align_x='CENTER';tx.data.materials.append(ink)
    preview_contract[clip]={'time':preview_times[clip],'left_wrist_blender':list(ac.pose.bones['Hand.L'].head),'right_wrist_blender':list(ac.pose.bones['Hand.R'].head)}
studio(gallery,camera=(0,9,2.7),target=(0,0,.85),scale=6.2,res=(1920,780));gallery.cycles.samples=32;render(gallery,'safety-demonstrations.png')
# Save full cast + separate props + pose contact sheet in an editable source.
bpy.context.window.scene=assets['attendant'][0]
bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'animated-crew-safety.blend'))
manifest={'author':'Original FLIGHT 404 Blender geometry, rigs and keyframed actions','source':'scripts/blender/add_safety_demonstrations.py','base_source':'models/blender/animated-crew.blend','blender':bpy.app.version_string,'clip_duration_seconds':4,'playback':'LoopOnce, clampWhenFinished; time sampled from authoritative demonstration elapsed seconds','coordinates':'metres, glTF +Y up, -Z forward','prop_mounts':{'belt-left':'Left palm = HandL wrist world position + normalized hand bone direction * 0.04 m; move another character-forward 0.035 m. Keep prop world orientation equal to character yaw.','belt-right':'As belt-left using HandR.','oxygen-mask':'During 0.75–1.95 seconds move from right palm to face [0,1.605,-0.127]; thereafter hold against face. Origin at mask cup center.','life-vest-folded':'During 0.35–1.1 seconds place halfway between palms plus forward 0.025 m; remove when deployed vest appears.','life-vest':'At 1.1–1.6 seconds scale in onto sternum pivot [0,1.38,-0.103]; keep aligned to character yaw. Show through end.','exits':'No prop.'},'preview_pose_samples':preview_contract,'assets':{}}
for p in sorted([*(OUT.glob('*.glb')),*(PROPS.glob('*.glb'))]):
    data=p.read_bytes();doc=json.loads(data[20:20+int.from_bytes(data[12:16],'little')]);manifest['assets'][str(p.relative_to(ROOT/'client/public'))]={'bytes':len(data),'triangles':sum(doc['accessors'][p['indices']]['count']//3 for m in doc.get('meshes',[]) for p in m['primitives']),'skins':len(doc.get('skins',[])),'animations':[a['name'] for a in doc.get('animations',[])],'clip_durations_seconds':{a['name']:max(doc['accessors'][x['input']]['max'][0] for x in a['samplers']) for a in doc.get('animations',[])},'sha256':hashlib.sha256(data).hexdigest()}
(SRC/'safety-demonstration-manifest.json').write_text(json.dumps(manifest,indent=2))
base_manifest=json.loads((SRC/'animated-crew-manifest.json').read_text())
base_manifest['safety_augmentation_source']=manifest['source'];base_manifest['safety_editable_source']='models/blender/animated-crew-safety.blend'
base_manifest['clips'].update({name:4 for name in CLIPS})
for path,entry in manifest['assets'].items():
    if path.startswith('models/animated/'):base_manifest['assets'][Path(path).stem]=entry
(SRC/'animated-crew-manifest.json').write_text(json.dumps(base_manifest,indent=2))
print('SAFETY ASSETS COMPLETE',json.dumps(manifest),flush=True)
