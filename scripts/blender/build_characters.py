"""Colour and rig two variants of the user-supplied FLIGHT404 attendant scan.

Originals remain unchanged. Blender 5.x; source metadata retained in manifest.
"""
import bpy, math, json, hashlib, sys
from pathlib import Path
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'client/public/models/characters';SRC=ROOT/'models/blender';PRE=ROOT/'docs/previews'
for p in [OUT,SRC,PRE]:p.mkdir(parents=True,exist_ok=True)
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
for s in list(bpy.data.scenes)[1:]:bpy.data.scenes.remove(s)
def rgb(h):
    v=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    return tuple(x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v)+(1,)
def mat(n,c,rough=.65,metal=0):
    m=bpy.data.materials.new(n);m.diffuse_color=rgb(c);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=rgb(c);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    return m
M={
 'navy':mat('Airline navy wool','#1d344f'), 'teal':mat('Airline teal trim','#237b87'),
 'burgundy':mat('Airline burgundy wool','#702f4c'), 'white':mat('Ivory cotton blouse','#e6e3d7'),
 'skin':mat('Warm skin','#c68d70',.58), 'hair':mat('Chestnut hair','#52382d',.75),
 'shoe':mat('Polished dark leather','#17212d',.34), 'gold':mat('Brass uniform insignia','#c9ae67',.3,.63),
 'pilot_skin':mat('Pilot skin','#bc8970',.61), 'pilot_hair':mat('Pilot charcoal hair','#353536',.77),
 'lip':mat('Natural lip','#a86360',.62), 'eye':mat('Eyes and brows','#302827',.57),
 'clipboard':mat('Pilot flight folder','#344754',.59),
}
def g(v):return Vector((v.x,v.z,-v.y))
def b(v):return Vector((v[0],-v[2],v[1]))
def scene(n):
    s=bpy.data.scenes.new(n);bpy.context.window.scene=s;s.unit_settings.system='METRIC'
    s.world=bpy.data.worlds.new(n+' World');s.world.use_nodes=True
    s.world.node_tree.nodes['Background'].inputs[0].default_value=(.52,.58,.65,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.55
    return s
def metadata(filename):
    raw=(ROOT/'models'/filename).read_bytes();doc=json.loads(raw[20:20+int.from_bytes(raw[12:16],'little')]);return doc['asset'].get('extras',{})
def import_scan(filename,height,target):
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'models'/filename))
    objs=list(bpy.context.scene.objects);meshes=[o for o in objs if o.type=='MESH'];empties=[o for o in objs if o.type!='MESH']
    for o in meshes:
        world=o.matrix_world.copy();o.parent=None;o.matrix_world=world
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();o=bpy.context.object
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    for e in empties:bpy.data.objects.remove(e,do_unlink=True)
    lo=Vector(tuple(min(v.co[i] for v in o.data.vertices) for i in range(3)));hi=Vector(tuple(max(v.co[i] for v in o.data.vertices) for i in range(3)))
    centre=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z));k=height/(hi.z-lo.z)
    for v in o.data.vertices:v.co=(v.co-centre)*k
    # Source meshes were split by glTF index limits: weld shared seam vertices before decimation.
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.00001);bpy.ops.object.mode_set(mode='OBJECT')
    d=o.modifiers.new('Browser surface budget','DECIMATE');d.ratio=min(1,target/len(o.data.polygons));bpy.ops.object.modifier_apply(modifier=d.name)
    for p in o.data.polygons:p.use_smooth=True
    return o
def colour(o,kind,uniform='navy'):
    names=list(M);o.data.materials.clear()
    for n in names:o.data.materials.append(M[n])
    for p in o.data.polygons:
        q=sum((g(o.data.vertices[i].co) for i in p.vertices),Vector())/len(p.vertices);x,y,z=q
        if kind=='attendant':
            m=uniform
            if y<.12:m='shoe'
            elif y<.565:m='skin'
            if y>1.425:m='skin'
            # Hair contours surround the face and nape; retain the sculpted cap.
            if y>1.453 and (z<-.005 or abs(x)>.125):m='hair'
            if y>1.635:m=uniform
            if 1.616<y<1.641:m='teal' if uniform=='navy' else 'gold'
            if y>.985 and y<1.45 and abs(x)<max(.015,(y-1.14)*.32) and z>.05:m='white'
            if y<1.01 and y>.89 and x<-.22:m='skin'
            if 1.025<y<1.145 and .11<x<.225 and z>.075:m='skin'
            if .982<y<1.002 and abs(x)<.14:m='teal'
        else:
            m='white' if y>.89 else 'navy'
            if y<.12:m='shoe'
            if y>1.49:m='pilot_skin'
            if y>1.638 or (y>1.59 and z<-.025):m='pilot_hair'
            # Forearms and hands around the folder, exposed below short sleeves.
            if .94<y<1.23 and (abs(x)>.13 or z>.15):m='pilot_skin'
            if 1.005<y<1.17 and abs(x)<.135 and z>.1:m='clipboard'
            if .875<y<.915:m='shoe'
            if 1.30<y<1.48 and abs(x)<.027 and z>.06:m='navy'
            if 1.443<y<1.465 and abs(x)>.17:m='navy'
        p.material_index=names.index(m)
    if kind=='attendant':
        # Vertex colour transitions avoid jagged material-ID cuts across scan triangles.
        m=mat('Coloured airline uniform / skin', '#ffffff',.66)
        n=m.node_tree.nodes.new('ShaderNodeVertexColor');n.layer_name='CrewColour'
        m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
        o.data.materials.clear();o.data.materials.append(m)
        for p in o.data.polygons:p.material_index=0
        attr=o.data.color_attributes.new(name='CrewColour',type='FLOAT_COLOR',domain='POINT')
        def smooth(a,c,x):
            t=max(0,min(1,(x-a)/(c-a)));return t*t*(3-2*t)
        palette={n:Vector(M[n].diffuse_color[:3]) for n in M}
        for v in o.data.vertices:
            x,y,z=g(v.co);c=palette[uniform].copy()
            # Continuous skin boundaries at the skirt hem, wrist cuffs, neckline and hat.
            c=c.lerp(palette['skin'],1-smooth(.446,.466,y))
            c=c.lerp(palette['shoe'],1-smooth(.079,.098,y))
            neck=smooth(1.37,1.40,y)*(1-smooth(.055,.072,abs(x-.048)))
            head=smooth(1.411,1.433,y)
            c=c.lerp(palette['skin'],max(neck,head))
            hair=head*max(1-smooth(-.032,.007,z),smooth(.09,.112,abs(x-.055)))
            c=c.lerp(palette['hair'],hair)
            hat=max(smooth(1.642,1.65,y),smooth(1.6,1.619,y)*(1-smooth(.014,.054,z)))
            c=c.lerp(palette[uniform],hat)
            white=(1-smooth(.012,.038,abs(x)-max(0,(y-1.15)*.20)))*smooth(1.055,1.12,y)*(1-smooth(1.355,1.39,y))*smooth(.035,.065,z)
            c=c.lerp(palette['white'],white)
            left_hand=(1-smooth(-.281,-.261,x))*(1-smooth(.941,.969,y))
            right_hand=smooth(.141,.153,x)*(1-smooth(.20,.213,x))*smooth(1.015,1.026,y)*(1-smooth(1.063,1.074,y))*smooth(.103,.116,z)
            c=c.lerp(palette['skin'],max(left_hand,right_hand))
            attr.data[v.index].color=(*c,1)

def bone_segment_distance(point,a,c):
    delta=c-a;t=max(0,min(1,(point-a).dot(delta)/delta.length_squared));return (point-(a+t*delta)).length,t
def rig_attendant(o):
    # Rig rest joints follow this scan's supplied pose. Small controlled walks preserve its silhouette.
    joints={
      'Root':((0,0,0),(0,.15,0),None),
      'Hips':((0,.94,0),(0,1.075,0),'Root'),
      'Spine':((0,1.075,0),(0,1.35,0),'Hips'),
      'Head':((0,1.35,0),(0,1.64,0),'Spine'),
      'Thigh.L':((-.083,.94,0),(-.087,.53,.02),'Hips'),
      'Shin.L':((-.087,.53,.02),(-.032,.10,.02),'Thigh.L'),
      'Foot.L':((-.032,.10,.02),(-.03,.055,.13),'Shin.L'),
      'Thigh.R':((.074,.94,0),(.034,.50,.06),'Hips'),
      'Shin.R':((.034,.50,.06),(.098,.10,.025),'Thigh.R'),
      'Foot.R':((.098,.10,.025),(.09,.055,.13),'Shin.R'),
      'UpperArm.L':((-.056,1.325,-.048),(-.13,1.094,-.12),'Spine'),
      'Forearm.L':((-.13,1.094,-.12),(-.292,.888,-.145),'UpperArm.L'),
      'Hand.L':((-.292,.888,-.145),(-.378,.862,-.159),'Forearm.L'),
      'UpperArm.R':((.155,1.37,0),(.278,1.145,0),'Spine'),
      'Forearm.R':((.278,1.145,0),(.166,1.077,.11),'UpperArm.R'),
      'Hand.R':((.166,1.077,.11),(.10,1.067,.14),'Forearm.R'),
    }
    armdata=bpy.data.armatures.new('Attendant deformation skeleton');arm=bpy.data.objects.new('CabinCrewRig',armdata);bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active=arm;arm.select_set(True);o.select_set(False);bpy.ops.object.mode_set(mode='EDIT')
    for n,(h,t,parent) in joints.items():
        bone=armdata.edit_bones.new(n);bone.head=b(h);bone.tail=b(t)
        if parent:bone.parent=armdata.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    groups={n:o.vertex_groups.new(name=n) for n in joints if n!='Root'}
    for v in o.data.vertices:
        q=g(v.co);x,y,z=q
        left_distance=min(bone_segment_distance(q,Vector(joints[n][0]),Vector(joints[n][1]))[0] for n in ['UpperArm.L','Forearm.L','Hand.L'])
        torso_distance=min(bone_segment_distance(q,Vector(joints[n][0]),Vector(joints[n][1]))[0] for n in ['Hips','Spine'])
        if y>1.44:candidates=['Head']
        elif x<0 and .82<y<1.29 and left_distance<.08 and left_distance<torso_distance*.9:candidates=['UpperArm.L','Forearm.L','Hand.L']
        elif y<.17:candidates=['Foot.L','Foot.R','Shin.L','Shin.R']
        elif y<.61:candidates=['Shin.L','Shin.R','Thigh.L','Thigh.R']
        elif y<.97 and abs(x)<.21 and not(x<-.10 and z<-.06 and y>.83):candidates=['Hips','Thigh.L','Thigh.R']
        elif (x<-.15 and y<1.29) or (x<-.06 and z<-.07 and 1.0<y<1.29):candidates=['UpperArm.L','Forearm.L','Hand.L']
        elif x<-.055 and 1.29<=y<1.40:candidates=['UpperArm.L','Spine']
        elif x>.12 and .97<y<1.4:candidates=['Spine']
        else:candidates=['Hips','Spine','Head']
        scored=[]
        for n in candidates:
            d,_=bone_segment_distance(q,Vector(joints[n][0]),Vector(joints[n][1]));scored.append((d,n))
        scored.sort();scored=scored[:2]
        if len(scored)==1:groups[scored[0][1]].add([v.index],1,'REPLACE')
        else:
            vals=[1/max(.005,d)**5 for d,n in scored];total=sum(vals)
            for weight,(d,n) in zip(vals,scored):groups[n].add([v.index],weight/total,'REPLACE')
    o.parent=arm;mod=o.modifiers.new('Crew body deformation','ARMATURE');mod.object=arm;mod.use_deform_preserve_volume=False
    # Rotation axes are set in armature space through bone-local quaternion conversion.
    def pose_axis(n,axis,angle):
        pb=arm.pose.bones[n];basis=pb.bone.matrix_local.to_3x3();local=basis.inverted()@b(axis)
        from mathutils import Quaternion
        pb.rotation_mode='QUATERNION';pb.rotation_quaternion=Quaternion(local,angle)
    def aim_bone(name,head,tail):
        pb=arm.pose.bones[name];rest=pb.bone
        turn=(rest.tail_local-rest.head_local).rotation_difference(tail-head)
        pb.matrix=Matrix.Translation(head)@turn.to_matrix().to_4x4()@Matrix.Translation(-rest.head_local)@rest.matrix_local
        bpy.context.view_layer.update()
    def carry_arms():
        # Analytic two-link IK: fingertips meet the tray, elbows stay outside the torso.
        for side,label in [(-1,'L')]:
            upper=arm.pose.bones['UpperArm.'+label].bone;fore=arm.pose.bones['Forearm.'+label].bone
            shoulder=upper.head_local.copy();target=b((side*.18,1.005,.308))
            direction=target-shoulder;distance=direction.length;direction.normalize()
            l1=upper.length;l2=fore.length;distance=min(distance,(l1+l2)*.995)
            along=(l1*l1-l2*l2+distance*distance)/(2*distance)
            bend=b((side,0,-.25));bend-=direction*bend.dot(direction);bend.normalize()
            elbow=shoulder+direction*along+bend*math.sqrt(max(0,l1*l1-along*along))
            aim_bone('UpperArm.'+label,shoulder,elbow)
            aim_bone('Forearm.'+label,elbow,target)
            aim_bone('Hand.'+label,target,b((side*.18,1.005,.394)))
    for clip in ['Idle','Walk','Carry','Serve']:
        arm.animation_data_create();arm.animation_data.action=bpy.data.actions.new(clip)
        for f in range(0,49,4):
            phase=f/48*math.tau;moving=clip in ['Walk','Carry'];carrying=clip in ['Carry','Serve']
            for pb in arm.pose.bones:pb.rotation_mode='QUATERNION';pb.rotation_quaternion=(1,0,0,0);pb.location=(0,0,0)
            if moving:
                pose_axis('Thigh.L',(1,0,0),.095*math.sin(phase));pose_axis('Thigh.R',(1,0,0),-.095*math.sin(phase))
                pose_axis('Shin.L',(1,0,0),-.065*max(0,-math.sin(phase)));pose_axis('Shin.R',(1,0,0),-.065*max(0,math.sin(phase)))
                pose_axis('Spine',(0,1,0),.025*math.sin(phase));arm.pose.bones['Root'].location.y=.009*(1-math.cos(phase*2))
            else:pose_axis('Spine',(1,0,0),.009*math.sin(phase));pose_axis('Head',(0,1,0),.018*math.sin(phase))
            if carrying:
                carry_arms()
            elif moving:
                pose_axis('UpperArm.L',(1,0,0),-.07*math.sin(phase))
            for pb in arm.pose.bones:
                pb.keyframe_insert('rotation_quaternion',frame=f+1,group=pb.name);pb.keyframe_insert('location',frame=f+1,group=pb.name)
        arm.animation_data.action.name=clip
        track=arm.animation_data.nla_tracks.new();track.name=clip;strip=track.strips.new(clip,1,arm.animation_data.action);strip.action_frame_start=1;strip.action_frame_end=49
        arm.animation_data.action=None
    for t in arm.animation_data.nla_tracks:t.mute=True
    for pb in arm.pose.bones:pb.rotation_quaternion=(1,0,0,0);pb.location=(0,0,0)
    bpy.context.view_layer.update()
    return arm

def face_forward(objects):
    root=bpy.data.objects.new('CharacterRoot',None);bpy.context.scene.collection.objects.link(root);root.rotation_euler.z=math.pi
    for o in objects:
        if o.parent is None:o.parent=root
    return root
def export(s,filename):
    bpy.context.window.scene=s;bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(OUT/filename),export_format='GLB',use_active_scene=True,use_selection=True,export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=True,export_frame_range=False,export_materials='EXPORT',export_cameras=False,export_lights=False,export_extras=True)
    print('EXPORTED',filename,flush=True)
def reset_pose(arm):
    arm.animation_data.action=None
    for track in arm.animation_data.nla_tracks:track.mute=True
    for pb in arm.pose.bones:pb.rotation_quaternion=(1,0,0,0);pb.location=(0,0,0)
    bpy.context.view_layer.update()
def preview(s,path,target=(0,0,1),ortho=2.05):
    bpy.context.window.scene=s
    for obj in list(s.objects):
        if obj.type in ['LIGHT','CAMERA']:bpy.data.objects.remove(obj,do_unlink=True)
    for p,e,size in [((3,-4,5),850,4),((-3,2,4),950,4),((-2,-2,2),450,3)]:
        bpy.ops.object.light_add(type='AREA',location=p);l=bpy.context.object;l.data.energy=e;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(Vector(target)-l.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=(1.1,4.9,2.7));cam=bpy.context.object;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=ortho;s.camera=cam
    s.render.engine='CYCLES';s.cycles.samples=32;s.cycles.use_denoising=True;s.render.resolution_x=800;s.render.resolution_y=1000;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.view_settings.view_transform='AgX';s.render.filepath=str(path);bpy.ops.render.render(write_still=True)

assets={}
for variant in ['attendant','attendant-player']:
    s=scene(variant);o=import_scan('flight_attendant_pin-up.glb',1.7,26000);o.name='Coloured cabin attendant';colour(o,'attendant','navy' if variant=='attendant' else 'burgundy');arm=rig_attendant(o);face_forward([arm]);s.frame_start=1;s.frame_end=49;s.render.fps=24
    export(s,variant+'.glb');assets[variant]=(s,metadata('flight_attendant_pin-up.glb'))
    reset_pose(arm)
    preview(s,PRE/(variant+'-blender.png'),target=(0,0,.9))
    if variant=='attendant':
        arm.animation_data.action=next(t.strips[0].action for t in arm.animation_data.nla_tracks if t.name=='Serve')
        arm.animation_data.action_slot=arm.animation_data.action.slots[0]
        s.frame_set(1);bpy.context.view_layer.update()
        # Preview-only tray matches the runtime attachment, and is omitted from exports.
        bpy.ops.mesh.primitive_cube_add(size=1,location=b((.18,1.015,-.37)));tray=bpy.context.object;tray.name='Preview tray reference';tray.scale=(.44,.28,.018);tray.data.materials.append(M['clipboard'])
        preview(s,PRE/'attendant-carry-blender.png',target=(0,0,.9))
        bpy.data.objects.remove(tray,do_unlink=True);reset_pose(arm)
        arm.animation_data.action=next(t.strips[0].action for t in arm.animation_data.nla_tracks if t.name=='Walk')
        arm.animation_data.action_slot=arm.animation_data.action.slots[0]
        s.frame_set(13);bpy.context.view_layer.update()
        preview(s,PRE/'attendant-walk-blender.png',target=(0,0,.9))
        reset_pose(arm)
bpy.context.window.scene=assets['attendant'][0];bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'cabin-characters.blend'))
manifest={'tool':bpy.app.version_string,'source_preserved':True,'source_file':'models/flight_attendant_pin-up.glb','coordinates':'metres; +Y up; -Z forward; 1.7 m standing','tray_mount':[.18,1.015,-.37],'pose_notes':'Restrained scan-derived gait. The source has crossed legs and one hand fused to the jacket; Carry and Serve animate the free arm only.','assets':{}}
for name,(s,meta) in assets.items():
    raw=(OUT/(name+'.glb')).read_bytes();doc=json.loads(raw[20:20+int.from_bytes(raw[12:16],'little')]);tri=sum(doc['accessors'][p['indices']]['count']//3 for m in doc.get('meshes',[]) for p in m['primitives'])
    durations={a['name']:max(doc['accessors'][sampler['input']]['max'][0] for sampler in a['samplers']) for a in doc.get('animations',[])}
    manifest['assets'][name]={'source':meta,'bytes':len(raw),'triangles':tri,'sha256':hashlib.sha256(raw).hexdigest(),'animations':[a['name'] for a in doc.get('animations',[])],'clip_durations_seconds':durations,'skins':len(doc.get('skins',[]))}
(SRC/'character-manifest.json').write_text(json.dumps(manifest,indent=2));print(json.dumps(manifest,indent=2),flush=True)
