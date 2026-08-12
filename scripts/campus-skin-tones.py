"""
팔레트에 살색을 더 만든다.

Kenney colormap 은 8 × 4 = 32 계열인데 실제로 쓰는 건 16 뿐이고, 그 중 살색은 넷
(살구·갈색·밝은살·크림)이다. 아이마다 피부가 다른데 넷은 너무 적다.

윗줄 절반(계열 y0)이 통째로 비어 있다(검정). 거기에 **기존 살색 램프의 명암은
그대로 두고 색조만 옮겨** 새 살색을 찍는다. 램프를 새로 그리지 않는 이유는,
그 안의 밝기 단계가 캐릭터 음영을 만들기 때문이다 — 단색으로 채우면 평평해진다.

결과는 GLB 안이 아니라 **바깥 PNG** 한 장으로 낸다. 12개 GLB 를 다시 굽지 않고
런타임에서 텍스처만 갈아 끼우면 되고, 원본 에셋도 안 건드린다.

실행: python3 scripts/campus-skin-tones.py
"""
import json, struct, io, colorsys
import numpy as np
from PIL import Image

SRC = 'public/campus/models/kenney/male-a.glb'
OUT = 'public/campus/models/kenney/colormap.png'
CELL_W, CELL_H = 64, 128          # 계열 하나의 크기(가로 8 × 세로 4)

# 밑그림으로 쓸 램프 — '밝은살'(7,3). 여기서 색조만 옮긴다.
BASE_FAMILY = (7, 3)

# 새로 찍을 살색. (계열 좌표, 이름, 목표 색상 H, 채도 배율, 밝기 배율)
#   H 는 0~1. 살색은 대개 0.03~0.08(주황~황) 사이에 있다.
NEW_TONES = [
    ((0, 0), 'porcelain', 0.065, 0.55, 1.06),   # 아주 밝은
    ((1, 0), 'ivory',     0.075, 0.70, 1.00),   # 밝은 황기
    ((2, 0), 'honey',     0.055, 1.00, 0.93),   # 중간
    ((3, 0), 'almond',    0.045, 1.15, 0.80),   # 중간 진한
    ((4, 0), 'chestnut',  0.035, 1.25, 0.62),   # 진한
    ((5, 0), 'espresso',  0.030, 1.20, 0.45),   # 아주 진한
]


def read_glb(path):
    d = open(path, 'rb').read()
    _, _, L = struct.unpack('<III', d[:12])
    off, js, b = 12, None, None
    while off < L:
        cl, ct = struct.unpack('<II', d[off:off + 8])
        ch = d[off + 8:off + 8 + cl]
        if ct == 0x4E4F534A: js = json.loads(ch)
        elif ct == 0x004E4942: b = ch
        off += 8 + cl + (-cl % 4)
    return js, b


js, buf = read_glb(SRC)
bv = js['bufferViews'][js['images'][0]['bufferView']]
o = bv.get('byteOffset', 0)
im = Image.open(io.BytesIO(buf[o:o + bv['byteLength']])).convert('RGB')
px = np.array(im).astype(np.float64) / 255.0
H, W = px.shape[:2]

bx, by = BASE_FAMILY
ramp = px[by * CELL_H:(by + 1) * CELL_H, bx * CELL_W:(bx + 1) * CELL_W].copy()

for (fx, fy), name, hue, sat_mul, val_mul in NEW_TONES:
    out = np.empty_like(ramp)
    for y in range(ramp.shape[0]):
        for x in range(ramp.shape[1]):
            r, g, b = ramp[y, x]
            _, s, v = colorsys.rgb_to_hsv(r, g, b)
            # 색조는 갈아 끼우고, 채도·밝기는 **원래 램프의 굴곡을 유지한 채** 배율만
            s2 = min(1.0, s * sat_mul)
            v2 = min(1.0, v * val_mul)
            out[y, x] = colorsys.hsv_to_rgb(hue, s2, v2)
    px[fy * CELL_H:(fy + 1) * CELL_H, fx * CELL_W:(fx + 1) * CELL_W] = out
    rep = out[out.shape[0] // 3, out.shape[1] // 2]
    print(f'  {name:<10} 계열({fx},{fy})  #%02x%02x%02x' % tuple(int(c * 255) for c in rep))

Image.fromarray((px * 255).round().astype(np.uint8)).save(OUT)
print('wrote', OUT)
