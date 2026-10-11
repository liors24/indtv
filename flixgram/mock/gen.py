# Procedural "film stills" for the browser mock (no network for real images).
import random, math
from PIL import Image, ImageDraw, ImageFilter
random.seed(7)
W,H=640,360
palettes=[((255,120,40),(40,10,30)),((30,90,160),(5,10,25)),((240,200,120),(60,30,20)),((120,200,180),(10,30,40)),((200,60,80),(20,5,20)),((250,230,180),(90,60,40)),((90,140,255),(20,10,60)),((255,170,90),(30,40,80)),((160,220,120),(20,40,20)),((230,90,200),(30,10,50))]
def still(i):
    top,bot=palettes[i%len(palettes)]
    jit=lambda c:tuple(max(0,min(255,v+random.randint(-30,30))) for v in c)
    top,bot=jit(top),jit(bot)
    im=Image.new('RGB',(W,H))
    d=ImageDraw.Draw(im)
    hz=random.randint(150,250)
    for y in range(H):
        t=y/H
        c=tuple(int(top[k]*(1-t)+bot[k]*t) for k in range(3))
        d.line([(0,y),(W,y)],fill=c)
    # sun / light source
    sx,sy=random.randint(80,560),random.randint(40,hz-20)
    glow=Image.new('L',(W,H),0); g=ImageDraw.Draw(glow)
    for r in range(160,0,-8): g.ellipse([sx-r,sy-r,sx+r,sy+r],fill=int(255*(1-r/160)**2))
    im=Image.composite(Image.new('RGB',(W,H),(255,240,210)),im,glow.point(lambda v:int(v*0.8)))
    d=ImageDraw.Draw(im)
    kind=i%4
    if kind==0: # city skyline
        x=0
        while x<W:
            w=random.randint(20,60); h=random.randint(40,200)
            d.rectangle([x,hz-h+100,x+w,H],fill=(10,8,16))
            for wy in range(hz-h+110,H,14):
                for wx in range(x+4,x+w-4,10):
                    if random.random()<0.35: d.rectangle([wx,wy,wx+4,wy+6],fill=(255,210,140))
            x+=w+random.randint(0,6)
    elif kind==1: # mountains
        for layer in range(3):
            pts=[(0,H)]
            for x in range(0,W+40,40): pts.append((x,hz+layer*40-random.randint(0,120)))
            pts.append((W,H)); shade=20+layer*12
            d.polygon(pts,fill=(shade//2,shade//2,shade))
    elif kind==2: # people silhouettes
        d.rectangle([0,hz+60,W,H],fill=(18,12,20))
        for p in range(random.randint(2,5)):
            px=random.randint(40,600); ph=random.randint(120,200)
            d.ellipse([px-14,H-ph-30,px+14,H-ph],fill=(8,6,10))
            d.rounded_rectangle([px-26,H-ph,px+26,H],radius=18,fill=(8,6,10))
    else: # sea + boat
        d.rectangle([0,hz,W,H],fill=tuple(int(v*0.5) for v in bot))
        for k in range(40):
            y=random.randint(hz,H); x=random.randint(0,W)
            d.line([(x,y),(x+random.randint(10,60),y)],fill=(255,220,170),width=1)
        bx=random.randint(100,500); d.polygon([(bx,hz+10),(bx+80,hz+10),(bx+65,hz+25),(bx+15,hz+25)],fill=(10,8,14)); d.line([(bx+40,hz+10),(bx+40,hz-50)],fill=(10,8,14),width=3)
    im=im.filter(ImageFilter.GaussianBlur(0.6))
    # vignette
    v=Image.new('L',(W,H),255); vd=ImageDraw.Draw(v)
    for r in range(0,60): vd.rectangle([r,r,W-r,H-r],outline=int(255*(r/60)))
    im=Image.composite(im,Image.new('RGB',(W,H),(0,0,0)),v.filter(ImageFilter.GaussianBlur(30)))
    return im
for i in range(40):
    im=still(i); im.save(f't/{1000+i}.jpg',quality=86)
    im.resize((40,22)).save(f't/mini{1000+i}.jpg',quality=60)
# avatars
for i in range(12):
    a=Image.new('RGB',(160,160),palettes[i%10][0]); d=ImageDraw.Draw(a)
    d.ellipse([30,30,130,130],fill=palettes[(i+3)%10][1]); a.save(f't/{2000+i}.jpg')
print('ok')
