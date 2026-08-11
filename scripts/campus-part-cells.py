"""
부위 매핑 v3 — 단위를 **(메시, 칸, 뼈부류)** 로 잡는다.

v2 까지는 (메시, 칸) 이었는데 그걸로는 안 갈라지는 게 있었다:
  · female-a 는 **소매와 바지가 같은 보라 칸**을 쓴다 → 뼈로 쪼개야 갈린다
  · 검정 머리와 검정 눈썹이 같은 칸 → 앞뒤(z)로 갈라야 한다

UV 는 어차피 정점 단위로 옮기므로, 그룹을 잘게 잡는 데 드는 비용이 없다.

판정:
  살    : 머리 뼈와 팔 뼈가 함께 쓰는 칸 (얼굴 + 손)
  머리카락: 머리 뼈 · 살이 아님 · 정점이 주로 **뒤통수(z<0)** 에 있다
  이목구비: 머리 뼈 · 살이 아님 · 주로 앞면(z>0) — 눈·입·수염·안경
  상의   : 팔·몸통 뼈
  하의/신발: 다리 뼈. 높이 0.12 로 가름
"""
import json, struct, os, io, glob
from collections import defaultdict
import numpy as np
from PIL import Image

CELL = 64
CT = {5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
NC = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}

def read_glb(p):
    d = open(p,'rb').read(); _,_,L = struct.unpack('<III', d[:12])
    off, js, b = 12, None, None
    while off < L:
        cl, ct = struct.unpack('<II', d[off:off+8]); ch = d[off+8:off+8+cl]
        if ct == 0x4E4F534A: js = json.loads(ch)
        elif ct == 0x004E4942: b = ch
        off += 8 + cl + (-cl % 4)
    return js, b

def acc(js, b, i):
    a = js['accessors'][i]; fmt, sz = CT[a['componentType']]; n = NC[a['type']]
    bv = js['bufferViews'][a['bufferView']]
    st = bv.get('byteStride') or sz*n; base = bv.get('byteOffset',0)+a.get('byteOffset',0)
    return np.array([struct.unpack_from('<'+fmt*n, b, base+k*st) for k in range(a['count'])], float)

BONE_CLASS = {'head':'head', 'torso':'torso',
              'arm-left':'arm', 'arm-right':'arm',
              'leg-left':'leg', 'leg-right':'leg', 'root':'torso'}

def load(path):
    js, b = read_glb(path)
    bv = js['bufferViews'][js['images'][0]['bufferView']]; o = bv.get('byteOffset',0)
    px = np.array(Image.open(io.BytesIO(b[o:o+bv['byteLength']])).convert('RGB'))
    H, W = px.shape[:2]
    bones = [js['nodes'][j].get('name',str(j)) for j in js['skins'][0]['joints']]
    prims = []
    groups = defaultdict(lambda: {'n':0,'y':[],'z':[],'px':set()})
    for m in js['meshes']:
        for pr in m['primitives']:
            pos = acc(js,b,pr['attributes']['POSITION']); uv = acc(js,b,pr['attributes']['TEXCOORD_0'])
            jo = acc(js,b,pr['attributes']['JOINTS_0']); we = acc(js,b,pr['attributes']['WEIGHTS_0'])
            idx = acc(js,b,pr['indices']).astype(int).ravel()
            keys = []
            for i in range(len(pos)):
                cx = min(int(uv[i][0]*W),W-1); cy = min(int(uv[i][1]*H),H-1)
                w = defaultdict(float)
                for t in range(4):
                    if we[i][t] > 0: w[BONE_CLASS[bones[int(jo[i][t])]]] += we[i][t]
                cls = max(w.items(), key=lambda kv: kv[1])[0]
                k = (m['name'][0], cx//CELL, cy//(CELL*2), cls)
                keys.append(k)
                g = groups[k]; g['n'] += 1; g['y'].append(pos[i][1]); g['z'].append(pos[i][2])
                g['px'].add((cx,cy))
            prims.append({'pos':pos,'idx':idx,'key':keys})
    return prims, groups, px

# 팔레트는 세로로 짝지어져 있다 — 같은 열의 두 줄이 한 색의 밝은/어두운 쌍이다.
# 그래서 단위는 64px 칸이 아니라 **64×128 색 계열**이다(가로 8 × 세로 4 = 32계열).
# 머리카락이 두 칸에 걸쳐 있던 것도 실은 한 계열이었다.
# 살색 구역도 계열로 잡는다. 색을 근거로
# 쓰되 "이 캐릭터의 무슨 색"이 아니라 "팔레트의 어느 자리"를 본다 — 이건 12종에
# 공통인 에셋 구조다.
SKIN_CELLS = {(5,3),(6,3),(7,3),(0,2)}   # 계열 좌표(가로 8 × 세로 4)

def label(groups):
    """
    살 판정의 기준은 **손**이다. 손은 어느 캐릭터든 맨살이라, 손이 쓰는 칸이 곧
    그 캐릭터의 살색 칸이다. 얼굴도 같은 칸을 쓴다.

    이게 중요한 이유: 금발은 팔레트의 크림색 칸(살색 구역)에 있다. 팔레트 자리만
    보면 금발이 살로 잡힌다(male-d·male-e). 손이 쓰는 칸인지까지 봐야 갈린다 —
    같은 칸이면 대머리, 다른 칸이면 금발이다.
    """
    hand = {(k[1],k[2]) for k in groups
            if k[3] == 'arm' and k[0] == 'b' and (k[1],k[2]) in SKIN_CELLS}
    if not hand:                                   # 장갑·긴소매로 손이 안 보이는 경우
        hand = {(k[1],k[2]) for k in groups if k[0] == 'h' and (k[1],k[2]) in SKIN_CELLS}
    top, top_k = -1e9, None
    for k, g in groups.items():
        if k[3] != 'head' or (k[1],k[2]) in hand: continue
        if max(g['y']) > top: top, top_k = max(g['y']), k
    head_top = max((max(g['y']) for k, g in groups.items() if k[0] == 'h'), default=0)
    if top_k and top < head_top - 0.04: top_k = None    # 정수리가 살 = 대머리
    out = {}
    for k, g in groups.items():
        m, gx, gy, cls = k
        if k == top_k: out[k] = '머리카락'
        elif (gx,gy) in hand and cls in ('head','arm','leg'): out[k] = '살'
        elif cls == 'head': out[k] = '이목구비'
        elif cls == 'leg': out[k] = '신발' if max(g['y']) < 0.12 else '하의'
        else: out[k] = '상의'
    return out

# ── 손으로 고친 것 ────────────────────────────────────────────────
#  12종을 부위별 형광색으로 렌더해 눈으로 확인했고(scratchpad/sheet3-*.py),
#  자동 판정이 틀린 둘만 여기서 덮는다. 규칙을 더 비틀어 맞추면 나머지 열이
#  틀어진다 — 예외는 예외로 적어 두는 편이 읽기도 고치기도 쉽다.
#
#  female-f : 긴 머리가 **실제로 두 계열**이다(윗머리 h5,3 + 옆머리 h6,3).
#             규칙은 가장 높은 계열 하나만 잡아서 윗머리만 바뀌었다.
#  male-e   : 긴소매라 **맨손이 없다**. 손이 없으면 머리의 살색 계열을 전부 얼굴로
#             치는데, 그 중 h6,3(갈색)은 실은 머리카락이다.
EN = {'살':'skin', '머리카락':'hair', '상의':'top',
      '하의':'bottom', '신발':'shoes', '이목구비':'face'}

#  아래 셋은 '대머리'(머리카락 숨기기)를 넣으며 드러났다. 머리 위 장식이 색이
#  달라 다른 계열에 있고, 그래서 이목구비로 묶여 머리를 지워도 혼자 떠 있었다.
#  female-b·female-c : 정수리의 머리끈(y 0.51~0.68, 가운데)
#  male-c            : 모자의 노란 장식
OVERRIDE = {
    'female-f': {'머리카락': [('h',6,3,'head')]},
    'male-e':   {'머리카락': [('h',6,3,'head')]},
    'female-b': {'머리카락': [('h',2,2,'head')]},
    'female-c': {'머리카락': [('h',4,2,'head')]},
    'male-c':   {'머리카락': [('h',2,2,'head')]},
}

def apply_override(nm, agg):
    for part, keys in OVERRIDE.get(nm, {}).items():
        for k in keys:
            for other, a in agg.items():
                if other != part and k in a['keys']: a['keys'].remove(k)
            if k not in agg[part]['keys']: agg[part]['keys'].append(k)
    return agg

# ── 대머리 ────────────────────────────────────────────────────────
#  머리카락을 색으로 찾으면 안 된다. 눈썹·입이 같은 색이면 딸려오고, 모자 장식이
#  다른 색이면 안 딸려온다. 기하로 보면 정확하다 — 머리카락·모자·눈썹은 각각
#  **떨어져 있는 덩어리**다.
#
#  12종의 머리 메시는 구조가 같다:
#    두개골 n136 · 귀 n42×2 · 머리카락 캡 · 눈썹 n8×2 · 입 n10 (+ 안경·수염 등)
#  (male-b 만 머리카락 캡이 없다 — 원래 대머리다)
def components(prim):
    """정점을 공유하는 삼각형끼리 묶는다. UV 가 달라 쪼개진 정점은 위치로 다시 붙인다."""
    idx = prim['idx']; n = len(prim['pos'])
    par = list(range(n))
    def find(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    def uni(a, b):
        ra, rb = find(a), find(b)
        if ra != rb: par[ra] = rb
    seen = {}
    for i, p in enumerate(map(tuple, np.round(prim['pos'], 4))):
        if p in seen: uni(i, seen[p])
        else: seen[p] = i
    for t in range(0, len(idx), 3):
        uni(idx[t], idx[t+1]); uni(idx[t+1], idx[t+2])
    out = {}
    for i in range(n): out.setdefault(find(i), []).append(i)
    return list(out.values())

def bald_hide(prims, tab):
    """대머리로 만들 때 감출 정점 — 머리 메시의 '머리카락 덩어리' 전부."""
    hide = []
    for pr in prims:
        if pr['key'][0][0] != 'h': continue            # 머리카락은 head-mesh 에만 있다
        skin_y = [pr['pos'][i][1] for i, k in enumerate(pr['key'])
                  if tab.get(f'{k[0]},{k[1]},{k[2]},{k[3]}') == 'skin']
        top = max(skin_y) if skin_y else 0.66          # 두개골 정수리
        for comp in components(pr):
            parts = {tab.get(f'{k[0]},{k[1]},{k[2]},{k[3]}')
                     for k in (pr['key'][i] for i in comp)}
            if parts == {'skin'}: continue             # 두개골·귀
            a = np.array([pr['pos'][i] for i in comp])
            # 머리카락은 셋 중 하나다: 정수리를 덮거나 · 귀보다 옆으로 나가거나 ·
            # 뒤통수 뒤로 흐르거나. 눈썹·입·안경·수염은 셋 다 아니다.
            if (a[:,1].max() >= top - 0.005
                    or np.abs(a[:,0]).max() > 0.24
                    or a[:,2].min() < -0.20):
                hide += comp
    return sorted(set(hide))

if __name__ == '__main__':
    table, builtin, bald = {}, [], {}
    for path in sorted(glob.glob('public/campus/models/kenney/*.glb')):
        nm = os.path.basename(path)[:-4]
        prims, groups, px = load(path)
        lab = label(groups)
        agg = defaultdict(lambda: {'n':0,'keys':[],'px':set()})
        for k, g in groups.items():
            a = agg[lab[k]]; a['n'] += g['n']; a['keys'].append(k); a['px'] |= g['px']
        agg = apply_override(nm, agg)
        print(f'── {nm}')
        for part in ['살','머리카락','상의','하의','신발','이목구비']:
            if part not in agg: continue
            a = agg[part]
            # 대표색은 눈으로 훑기 위한 것이다. 손으로 고친 부위는 픽셀 집합이
            # 옮겨 오지 않아 비어 있을 수 있다 — 그때는 색 없이 열쇠만 찍는다.
            cols = [px[y,x] for (x,y) in a['px']]
            rep = max(cols, key=lambda c:int(c[0])+int(c[1])+int(c[2])) if cols else None
            hexc = '#%02x%02x%02x' % tuple(rep) if rep is not None else '   —   '
            keys = ' '.join(f'{k[0]}{k[1]},{k[2]}/{k[3]}' for k in sorted(a['keys']))
            print(f'   {part:<5} 정점{a["n"]:4d} {hexc}  {keys}')
        # 런타임이 쓰기 좋은 모양: "메시,계열x,계열y,뼈부류" → 부위
        # (런타임은 정점마다 이 열쇠를 만들어 표에서 부위를 찾는다)
        table[nm] = {f'{k[0]},{k[1]},{k[2]},{k[3]}': EN[p]
                     for p, a in agg.items() for k in sorted(a['keys'])}
        # 안경이 이미 메시에 박혀 있는 캐릭터에 소품 안경을 또 씌우면 두 겹이 된다.
        # 렌즈는 연회청 계열(3,3)에 **귀에서 귀까지** 걸쳐 있다 — 폭으로 가른다
        # (male-b 에도 같은 계열이 있지만 폭 0.03 짜리 작은 조각이다).
        lens = [pr['pos'][i] for pr in prims for i, k in enumerate(pr['key'])
                if k[0] == 'h' and (k[1], k[2]) == (3, 3)]
        if lens:
            xs = [p[0] for p in lens]
            if max(xs) - min(xs) > 0.25: builtin.append(nm)
        bald[nm] = bald_hide(prims, table[nm])
        print(f'   대머리로 감출 정점 {len(bald[nm])}개')
        print()
    out = 'public/campus/models/kenney/part-cells.json'
    json.dump({'family': [CELL, CELL*2], 'models': table,
               'builtinGlasses': builtin, 'bald': bald},
              open(out, 'w'), ensure_ascii=False, indent=0, separators=(',', ':'))
    print('wrote', out)
