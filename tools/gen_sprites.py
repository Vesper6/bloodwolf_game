# -*- coding: utf-8 -*-
"""《血狼》原创像素素材生成器：8角色 + 5怪物，4帧行走拼条（256x64，帧64x64）"""
from PIL import Image, ImageDraw
import os

OUT = '/home/user/bloodwolf_game/public/assets'
os.makedirs(OUT, exist_ok=True)
S = 32   # 逻辑画布
UP = 2   # 放大倍数 -> 64

def outline(img):
    """给不透明像素加1px黑描边"""
    px = img.load()
    w, h = img.size
    edge = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    nx, ny = x+dx, y+dy
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] > 0 and px[nx, ny][:3] != (10,10,14):
                        edge.append((x, y)); break
    for x, y in edge:
        px[x, y] = (10, 10, 14, 255)
    return img

def shade(c, f):
    return tuple(max(0, min(255, int(v*f))) for v in c[:3]) + (255,)

def wolf_frame(fur, cloth, accent, deco, frame):
    """通用狼裔角色帧：身体+头+耳+腿(交替)+尾 + 角色装饰回调"""
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    bob = -1 if frame in (1, 3) else 0
    legA, legB = [(0,0),(-1,-2),(0,0),(2,-1)][frame], [(0,0),(2,-1),(0,0),(-1,-2)][frame]
    # 腿
    d.rectangle([11+legA[0], 24+legA[1], 14+legA[0], 29+legA[1]], fill=shade(fur, .7))
    d.rectangle([18+legB[0], 24+legB[1], 21+legB[0], 29+legB[1]], fill=shade(fur, .7))
    # 尾巴
    d.polygon([(6, 18+bob), (2, 14+bob), (7, 15+bob)], fill=shade(fur, .85))
    # 身体（衣服色）
    d.rounded_rectangle([9, 14+bob, 23, 25+bob], radius=3, fill=cloth)
    d.rectangle([9, 21+bob, 23, 25+bob], fill=shade(cloth, .75))
    # 头
    d.rounded_rectangle([10, 4+bob, 22, 14+bob], radius=3, fill=fur)
    d.rectangle([10, 11+bob, 22, 14+bob], fill=shade(fur, .8))
    # 吻部
    d.rectangle([14, 10+bob, 18, 13+bob], fill=shade(fur, 1.15))
    # 耳朵（随帧摆动）
    ew = 1 if frame == 1 else (-1 if frame == 3 else 0)
    d.polygon([(10, 6+bob), (9+ew, 0+bob), (14, 4+bob)], fill=fur)
    d.polygon([(22, 6+bob), (23+ew, 0+bob), (18, 4+bob)], fill=fur)
    d.polygon([(11, 5+bob), (10+ew, 2+bob), (13, 4+bob)], fill=shade(accent, .6))
    # 眼睛
    d.rectangle([12, 7+bob, 13, 8+bob], fill=accent)
    d.rectangle([19, 7+bob, 20, 8+bob], fill=accent)
    deco(d, bob, frame)
    return outline(img)

def strip(frames, name):
    w = 64 * len(frames)
    sheet = Image.new('RGBA', (w, 64), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f.resize((64, 64), Image.NEAREST), (i * 64, 0))
    sheet.save(f'{OUT}/{name}.png')
    print(name, sheet.size)

# ---------------- 8 角色 ----------------
def deco_rega(d, bob, f):   # 双手红爪
    for x in (7, 24):
        for i in range(3):
            d.polygon([(x, 17+i*2+bob), (x-2 if x==7 else x+2, 16+i*2+bob), (x, 15+i*2+bob)], fill=(255,45,45,255))
def deco_vera(d, bob, f):   # 银月长弓
    d.arc([23, 8+bob, 30, 24+bob], -80, 80, fill=(200,160,90,255), width=2)
    d.line([(27, 9+bob), (27, 23+bob)], fill=(220,230,255,255))
def deco_vivi(d, bob, f):   # 工程背包+扳手
    d.rounded_rectangle([4, 13+bob, 9, 22+bob], radius=1, fill=(122,90,52,255))
    d.rectangle([5, 15+bob, 8, 16+bob], fill=(255,210,74,255))
    d.rectangle([24, 16+bob, 28, 17+bob], fill=(170,180,190,255))
def deco_kane(d, bob, f):   # 法师尖帽+法杖
    d.polygon([(9, 5+bob), (23, 5+bob), (16, -3+bob)], fill=(42,26,74,255))
    d.rectangle([9, 4+bob, 23, 6+bob], fill=(74,42,120,255))
    d.line([(26, 10+bob), (26, 26+bob)], fill=(90,60,30,255), width=2)
    d.ellipse([24, 7+bob, 29, 12+bob], fill=(176,106,255,255))
def deco_gordon(d, bob, f): # 铁壁盾牌
    d.rounded_rectangle([2, 13+bob, 9, 24+bob], radius=2, fill=(154,162,178,255))
    d.rectangle([2, 17+bob, 9, 19+bob], fill=(255,176,46,255))
def deco_rin(d, bob, f):    # 影刃双匕+围巾
    d.rectangle([9, 13+bob, 23, 15+bob], fill=(90,30,120,255))
    d.polygon([(6, 16+bob), (3, 22+bob), (7, 20+bob)], fill=(200,220,255,255))
    d.polygon([(26, 16+bob), (29, 22+bob), (25, 20+bob)], fill=(200,220,255,255))
def deco_sika(d, bob, f):   # 毒瓶+滴落
    d.ellipse([23, 15+bob, 28, 21+bob], fill=(122,255,90,200))
    d.rectangle([25, 13+bob, 26, 15+bob], fill=(90,60,30,255))
    if f in (1, 3):
        d.rectangle([25, 23+bob, 26, 25+bob], fill=(122,255,90,255))
def deco_laojin(d, bob, f): # 金币+礼帽
    d.rectangle([10, 2+bob, 22, 4+bob], fill=(30,30,36,255))
    d.rectangle([12, -1+bob, 20, 3+bob], fill=(30,30,36,255))
    d.ellipse([23, 14+bob, 29, 20+bob], fill=(255,215,0,255))
    d.ellipse([25, 16+bob, 27, 18+bob], fill=(200,160,0,255))

CHARS = {
    'rega':   ((74,74,92,255),   (122,22,38,255),  (255,60,60,255),  deco_rega),
    'vera':   ((216,220,232,255),(58,90,140,255),  (111,208,255,255),deco_vera),
    'vivi':   ((200,144,88,255), (122,90,52,255),  (255,210,74,255), deco_vivi),
    'kane':   ((90,74,108,255),  (42,26,74,255),   (176,106,255,255),deco_kane),
    'gordon': ((106,106,114,255),(154,162,178,255),(255,176,46,255), deco_gordon),
    'rin':    ((51,51,63,255),   (26,26,38,255),   (201,138,255,255),deco_rin),
    'sika':   ((74,106,58,255),  (42,74,34,255),   (122,255,90,255), deco_sika),
    'laojin': ((184,154,90,255), (138,42,42,255),  (255,215,0,255),  deco_laojin),
}
for name, (fur, cloth, accent, deco) in CHARS.items():
    strip([wolf_frame(fur, cloth, accent, deco, f) for f in range(4)], f'player_{name}')

# ---------------- 5 怪物 ----------------
def bat_frame(f):
    img = Image.new('RGBA', (S, S), (0,0,0,0)); d = ImageDraw.Draw(img)
    wing = [8, 16, 10, 4][f]  # 翅膀上下拍
    d.polygon([(10, 14), (1, wing), (9, 18)], fill=(120,70,190,255))
    d.polygon([(22, 14), (31, wing), (23, 18)], fill=(120,70,190,255))
    d.ellipse([10, 10, 22, 22], fill=(138,79,208,255))
    d.rectangle([10, 17, 22, 22], fill=shade((138,79,208,255), .75))
    d.polygon([(12, 11), (11, 7), (15, 10)], fill=(138,79,208,255))
    d.polygon([(20, 11), (21, 7), (17, 10)], fill=(138,79,208,255))
    d.rectangle([13, 14, 14, 15], fill=(255,32,32,255))
    d.rectangle([18, 14, 19, 15], fill=(255,32,32,255))
    return outline(img)

def skel_frame(f):
    img = Image.new('RGBA', (S, S), (0,0,0,0)); d = ImageDraw.Draw(img)
    bob = -1 if f in (1,3) else 0
    la, lb = [(0,0),(-1,-2),(0,0),(2,-1)][f], [(0,0),(2,-1),(0,0),(-1,-2)][f]
    d.rectangle([12+la[0], 24+la[1], 14+la[0], 29+la[1]], fill=(190,190,205,255))
    d.rectangle([18+lb[0], 24+lb[1], 20+lb[0], 29+lb[1]], fill=(190,190,205,255))
    d.rounded_rectangle([10, 13+bob, 22, 25+bob], radius=2, fill=(200,200,216,255))
    for y in (16, 19, 22):
        d.rectangle([11, y+bob, 21, y+bob], fill=shade((200,200,216,255), .7))
    d.rounded_rectangle([10, 3+bob, 22, 13+bob], radius=3, fill=(216,216,230,255))
    d.rectangle([12, 7+bob, 14, 9+bob], fill=(20,20,26,255))
    d.rectangle([18, 7+bob, 20, 9+bob], fill=(20,20,26,255))
    d.rectangle([13, 7+bob, 13, 8+bob], fill=(255,40,40,255))
    d.rectangle([19, 7+bob, 19, 8+bob], fill=(255,40,40,255))
    d.rectangle([12, 11+bob, 20, 12+bob], fill=(150,150,165,255))
    return outline(img)

def boar_frame(f):
    img = Image.new('RGBA', (S, S), (0,0,0,0)); d = ImageDraw.Draw(img)
    bob = -1 if f in (1,3) else 0
    la, lb = [(0,0),(-2,-1),(0,0),(2,-1)][f], [(0,0),(2,-1),(0,0),(-2,-1)][f]
    for x, off in ((7, la), (14, lb), (20, la), (26, lb)):
        d.rectangle([x+off[0], 23+off[1], x+2+off[0], 28+off[1]], fill=(120,66,26,255))
    d.rounded_rectangle([4, 10+bob, 29, 24+bob], radius=4, fill=(168,98,46,255))
    d.rectangle([4, 19+bob, 29, 24+bob], fill=shade((168,98,46,255), .75))
    d.polygon([(6, 10+bob), (10, 5+bob), (13, 10+bob)], fill=(140,80,36,255))
    d.rectangle([1, 14+bob, 5, 18+bob], fill=(190,120,60,255))
    d.polygon([(2, 14+bob), (0, 10+bob), (4, 13+bob)], fill=(240,230,210,255))
    d.rectangle([7, 13+bob, 8, 14+bob], fill=(255,32,32,255))
    return outline(img)

def spiky_frame(f, base, size_pad=0):
    img = Image.new('RGBA', (S, S), (0,0,0,0)); d = ImageDraw.Draw(img)
    import math
    cx, cy, r = 16, 16, 10 + size_pad
    rot = f * 0.2
    for i in range(8):
        a = i / 8 * 6.283 + rot
        x0, y0 = cx + math.cos(a)*r, cy + math.sin(a)*r
        x1, y1 = cx + math.cos(a)*(r+4), cy + math.sin(a)*(r+4)
        d.line([(x0, y0), (x1, y1)], fill=shade(base, .8), width=3)
    d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=base)
    d.ellipse([cx-r, cy, cx+r, cy+r], fill=shade(base, .78))
    sq = [0, -1, 0, 1][f]
    d.rectangle([11, 13+sq, 13, 15+sq], fill=(255,240,240,255))
    d.rectangle([19, 13+sq, 21, 15+sq], fill=(255,240,240,255))
    d.rectangle([12, 14+sq, 12, 14+sq], fill=(255,32,32,255))
    d.rectangle([20, 14+sq, 20, 14+sq], fill=(255,32,32,255))
    d.polygon([(12, 20), (14, 18), (16, 20), (18, 18), (20, 20), (16, 22)], fill=(40,10,10,255))
    return outline(img)

strip([bat_frame(f) for f in range(4)], 'enemy_bat')
strip([skel_frame(f) for f in range(4)], 'enemy_skeleton')
strip([boar_frame(f) for f in range(4)], 'enemy_boar')
strip([spiky_frame(f, (255,176,46,255)) for f in range(4)], 'enemy_elite')
strip([spiky_frame(f, (224,34,34,255), 3) for f in range(4)], 'enemy_boss')
print('done')
