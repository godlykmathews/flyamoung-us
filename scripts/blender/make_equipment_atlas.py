"""Original painted instrument/placard atlas for FLIGHT 404 (Pillow).

Run before build_equipment.py. No downloaded imagery or fonts are bundled.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json, math

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'models/blender'
OUT.mkdir(parents=True, exist_ok=True)
W = H = 2048
atlas = Image.new('RGB', (W, H), '#314250')
rects = {}
fontpath = '/System/Library/Fonts/Supplemental/Arial.ttf'
boldpath = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
def font(n, bold=False):
    return ImageFont.truetype(boldpath if bold else fontpath, n)
def tile(name, box, bg):
    x,y,w,h = box
    im = Image.new('RGB',(w,h),bg); d = ImageDraw.Draw(im)
    rects[name] = [x,y,w,h]
    return im,d
def put(name, im):
    x,y,_,_ = rects[name]; atlas.paste(im,(x,y))
def center(d, text, y, width, n, ink='#e8eef1', bold=False):
    d.text((width/2,y),text,font=font(n,bold),fill=ink,anchor='mt')

im,d=tile('checklist',(0,0,480,640),'#f4f1e9')
d.rectangle((28,37,452,97),fill='#214762'); center(d,'CABIN READINESS',48,480,29,bold=True)
d.text((32,119),'FLIGHT 404  /  CREW CHECKLIST',font=font(18),fill='#657078')
for i,(name,note) in enumerate([('Cabin secure','Baggage stowed / aisle clear'),('Door indicators','Verify all doors armed'),('Crew stations','Headcount and positions'),('Flight briefing','Confirm ready for departure')]):
    y=178+i*89
    d.rounded_rectangle((33,y+1,57,y+25),radius=3,outline='#53626c',width=2)
    d.text((73,y-3),name,font=font(25,True),fill='#253846')
    d.text((73,y+33),note,font=font(17),fill='#75818a')
    d.line((33,y+67,443,y+67),fill='#d1d4d0',width=1)
d.text((34,558),'INITIALS  ______    FLT  404',font=font(17),fill='#52636e')
for i in range(73):
    if i%5!=1:d.rectangle((35+i*3,600,36+i*3+(i%2),621),fill='#697780')
d.text((286,602),'F404-CC-021',font=font(17),fill='#697780'); put('checklist',im)

im,d=tile('fms',(512,0,512,384),'#071316')
center(d,'ACT RTE 1',18,512,28,bold=True)
for text,x in [('ORIGIN',25),('DEST',377)]:d.text((x,69),text,font=font(17),fill='#7fc2c6')
for text,x in [('VIDP',25),('WSSS',367)]:d.text((x,98),text,font=font(31),fill='#f1f6e8')
d.line((25,141,486,141),fill='#526f72',width=2)
d.text((25,156),'VIA',font=font(18),fill='#7fc2c6');d.text((359,156),'TO',font=font(18),fill='#7fc2c6')
for i,(via,to) in enumerate([('DCT','NOVA'),('DCT','KILO'),('DCT','LIMA'),('DCT','ECHO')]):
    d.text((25,190+i*35),via,font=font(25),fill='#d1dcce'); d.text((357,190+i*35),to,font=font(25),fill='#dc91d4' if i==1 else '#d1dcce')
d.line((25,336,486,336),fill='#526f72',width=2);center(d,'VERIFY SEQUENCE',351,512,21,ink='#e9bd68');put('fms',im)

im,d=tile('pfd',(1056,0,480,400),'#09121b')
d.rectangle((88,49,385,175),fill='#39749f');d.rectangle((88,175,385,297),fill='#88644a')
d.line((88,175,385,175),fill='#e1e5df',width=3)
for i in [-3,-2,-1,1,2,3]:
    y=175+i*24;w=40 if i%2 else 60
    d.line((238-w,y,238+w,y),fill='#e6dfd4',width=2)
    if i%2==0:d.text((246+w,y-9),str(abs(i)*5),font=font(14),fill='#e6dfd4')
d.line((185,178,213,178,224,191),fill='#f5dc60',width=5);d.line((252,191,263,178,291,178),fill='#f5dc60',width=5)
d.rectangle((12,74,76,286),fill='#263b46');d.rectangle((396,74,468,286),fill='#263b46')
for i in range(7):
    y=89+i*28;d.text((23,y),str(310-i*10),font=font(17),fill='#edf1ec');d.text((409,y),str(363+i*-1)+'00',font=font(13),fill='#edf1ec')
d.rectangle((8,164,83,201),fill='#06111a',outline='#eee6d5',width=2);d.text((22,169),'280',font=font(23),fill='#fcfded')
d.rectangle((388,164,473,201),fill='#06111a',outline='#eee6d5',width=2);d.text((396,170),'36000',font=font(21),fill='#fcfded')
center(d,'SPD    LNAV    ALT HOLD',13,480,19,ink='#6ce4a9')
d.arc((138,236,338,437),190,350,fill='#e6dfd4',width=2)
for i in range(-4,5):
    angle=math.radians(i*12);x=238+94*math.sin(angle);y=336-94*math.cos(angle)
    d.line((x,y,x+7*math.sin(angle),y-7*math.cos(angle)),fill='#e6dfd4',width=2)
center(d,'HDG 084   |   FL360',359,480,22,ink='#88dada');put('pfd',im)

im,d=tile('nd',(1568,0,480,400),'#07131a')
center(d,'NOVA   084°   124 NM',17,480,21,ink='#91d7ca')
for r in [80,145,215]:d.arc((240-r,326-r,240+r,326+r),190,350,fill='#486065',width=2)
for angle in range(-60,61,15):
    rad=math.radians(angle);x=240+215*math.sin(rad);y=326-215*math.cos(rad)
    d.line((x,y,x-10*math.sin(rad),y+10*math.cos(rad)),fill='#bdd1d4',width=2)
pts=[(241,315),(232,252),(295,184),(269,112),(343,67)]
d.line(pts,fill='#e397d3',width=3)
for i,(x,y) in enumerate(pts[1:]):
    d.polygon([(x,y-5),(x+5,y),(x,y+5),(x-5,y)],outline='#dce8de')
    d.text((x+12,y-5),['NOVA','KILO','LIMA','ECHO'][i],font=font(16),fill='#b8d3d2')
d.polygon([(240,289),(228,320),(240,314),(252,320)],fill='#f5f1db')
d.text((23,348),'GS 462',font=font(20),fill='#d2e0d9'); d.text((327,348),'TAS 460',font=font(20),fill='#d2e0d9');put('nd',im)

im,d=tile('coffee',(512,416,512,160),'#081d23')
center(d,'CABIN COFFEE',20,512,29,ink='#dbeee7',bold=True);center(d,'READY  •  92°C',73,512,23,ink='#84d1c5')
d.line((32,133,480,133),fill='#3c786d',width=3);put('coffee',im)

im,d=tile('keypad',(1056,432,512,288),'#253643')
keys=['INIT','RTE','DEP','ARR','VNAV','MENU','A','B','C','D','E','F','G','H','I','J','K','L','1','2','3','4','5','6','7','8','9','0','CLR','EXEC']
for i,k in enumerate(keys):
    x=(i%6)*84+4;y=(i//6)*56+4
    d.rounded_rectangle((x,y,x+74,y+47),radius=6,fill='#162530',outline='#4c5f6a',width=2)
    d.text((x+37,y+23),k,font=font(14 if len(k)>2 else 22,True),fill='#e9eee8',anchor='mm')
put('keypad',im)

labels=[('fms_title','FLIGHT MANAGEMENT UNIT'),('belt_title','SEAT BELT / ROW 02'),('belt_footer','LATCH  ·  WEBBING  ·  RELEASE'),('circuit_title','CABIN CIRCUIT DISTRIBUTION'),('circuit_footer','115V AC / BUS A'),('cabin','CABIN'),('galley','GALLEY'),('seats','SEATS'),('comms','COMMS'),('onoff','ON          OFF'),('service','CABIN SERVICE / 02'),('power','POWER DISTRIBUTION'),('caution','CAUTION / CREW ACCESS ONLY'),('water','STILL WATER'),('coffee_title','SERVICE 02'),('ovens','GALLEY HEATING'),('dry','DRY STORAGE'),('door','PUSH TO RELEASE'),('test','TEST / RESET'),('nav','NAV / COM'),('cb1','CB 01'),('cb2','CB 02'),('cb3','CB 03'),('cb4','CB 04'),('ready','CREW CHECK'),('note','F404  /  VERIFIED EQUIPMENT')]
for i,(key,label) in enumerate(labels):
    x=(i%4)*512;y=768+(i//4)*128
    bg='#e7e8de' if key in ['water','dry','door'] else '#253743';ink='#294856' if key in ['water','dry','door'] else '#dce7e7'
    im,d=tile(key,(x,y,496,112),bg)
    fs=min(36,int(760/max(len(label),1)))
    d.text((248,56),label,font=font(fs,True),fill=ink,anchor='mm')
    if key in ['caution']:d.rectangle((1,1,494,110),outline='#d7ac50',width=5)
    put(key,im)

# A tiling swatch carries actual woven detail through glTF, unlike a Blender-only noise shader.
im,d=tile('webbing',(0,1696,512,352),'#263647')
for y in range(0,352,4):
    for x in range(0,512,6):
        shade=(63,81,96) if ((x//6+y//4)%2)==0 else (42,58,72)
        d.rectangle((x,y,x+4,y+2),fill=shade)
for y in [7,12,339,344]:d.line((0,y,511,y),fill='#adb3aa',width=1)
put('webbing',im)

atlas.save(OUT/'equipment-atlas.png',optimize=True)
(OUT/'equipment-atlas.json').write_text(json.dumps({'size':[W,H],'rects':rects},indent=2))
print('Wrote original atlas:',OUT/'equipment-atlas.png')
