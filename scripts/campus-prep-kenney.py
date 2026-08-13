# ══════════════════════════════════════════════════════════════════
#  Kenney mini-* 캐릭터 → 캠퍼스용 GLB 전처리
#
#  캐릭터 파일에 **애니메이션 30개가 통째로 중복** 들어 있다(개당 ~250KB).
#  뼈대가 7개로 전부 동일하고 이름도 같아서, 애니메이션은 한 벌만 있으면
#  three.js AnimationMixer 가 어느 캐릭터에든 그대로 물린다.
#
#  그래서:
#    · 기본 캐릭터 1종 = 메시 + 애니메이션 전체     (클립 공급원)
#    · 나머지         = 메시만                     (개당 ~95KB)
#
#  Icosphere(부모 없는 42정점 잔재)도 여기서 지운다.
#
#  ── 팩이 여러 개가 되며 생긴 것 ──────────────────────────────────
#  ROSTER 가 "소스 => 출력이름" 리스트다(campus-prep-kit.py 와 같은 규약).
#  글롭이 아닌 이유: mini-arcade 와 mini-market 에 **같은 이름의**
#  character-employee.glb 가 있어서 출력 이름이 충돌한다.
#
#  그리고 팩마다 **colormap.png 가 다르다.** 색 세트는 거의 같은데 자리가
#  다르다(mini-arcade·mini-market 만 mini-characters 와 완전히 동일).
#  런타임은 팔레트 한 장을 전 캐릭터에 갈아 끼우므로, 자리가 다르면 색이
#  통째로 어긋난다 — 여기서 **UV 를 기준 팔레트 자리로 옮겨** 굽는다.
#
#  실행:
#    KENNEY_ROOT=assets/kenney KENNEY_OUT=public/campus/models/kenney \
#      blender --background --python scripts/campus-prep-kenney.py
# ══════════════════════════════════════════════════════════════════
import bpy, os
import numpy as np

ROOT = os.environ.get('KENNEY_ROOT', 'assets/kenney')
OUT = os.environ['KENNEY_OUT']
# 이 한 종만 애니메이션을 들고 간다. 런타임이 여기서 클립을 꺼내 전원에게 물린다.
CLIP_SOURCE = 'male-a'
# 팔레트 기준. 여기 자리로 다른 팩의 UV 를 옮긴다.
REF_PACK = 'mini-characters'

ROSTER = """
mini-characters/character-male-a    => male-a
mini-characters/character-male-b    => male-b
mini-characters/character-male-c    => male-c
mini-characters/character-male-d    => male-d
mini-characters/character-male-e    => male-e
mini-characters/character-male-f    => male-f
mini-characters/character-female-a  => female-a
mini-characters/character-female-b  => female-b
mini-characters/character-female-c  => female-c
mini-characters/character-female-d  => female-d
mini-characters/character-female-e  => female-e
mini-characters/character-female-f  => female-f
mini-arcade/character-gamer         => gamer
mini-arcade/character-employee      => arcade-clerk
mini-market/character-employee      => market-clerk
mini-skate/character-skate-boy      => skate-boy
mini-skate/character-skate-girl     => skate-girl
mini-forest/character-archer        => archer
mini-dungeon/character-human        => hero
mini-dungeon/character-orc          => orc
mini-arena/character-soldier        => soldier
"""

GLB = '{root}/{pack}/Models/GLB format/{name}.glb'
TEXTURE = '{root}/{pack}/Models/GLB format/Textures/colormap.png'
# 팔레트는 세로로 짝지어져 있다 — 색의 단위는 64px 칸이 아니라 **64×128 계열**
# (가로 8 × 세로 4). 자세한 근거는 avatar-kenney.js 의 '색 바꾸기' 주석.
FW, FH, TEX = 64, 128, 512
GX, GY = TEX // FW, TEX // FH
# 옮겨 갈 자리는 원래 16색(아래 두 줄)뿐이다. 윗줄 빈 계열에는 런타임이 살색을
# 찍어 두므로(campus-skin-tones.py) 거기에 옷을 주차하면 살색 목록이 오염된다.
TARGET_ROWS = (2, 3)


def palette(pack):
    """colormap.png → 계열별 픽셀 블록. glTF 와 같은 방향(위→아래)으로 뒤집어 둔다."""
    img = bpy.data.images.load(os.path.abspath(TEXTURE.format(root=ROOT, pack=pack)))
    buf = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(buf)
    a = buf.reshape(img.size[1], img.size[0], 4)[::-1, :, :3]   # 블렌더는 아래→위
    bpy.data.images.remove(img)
    return {(x, y): a[y*FH:(y+1)*FH, x*FW:(x+1)*FW] for y in range(GY) for x in range(GX)}


def family_map(src_pack, used):
    """
    이 모델이 쓰는 계열마다 기준 팔레트에서 가장 가까운 자리를 찾는다.
    오차가 작은 것부터 배정하고 **이미 찬 자리는 건너뛴다** — 두 색이 한 자리로
    겹치면 서로 다른 부위가 같은 색이 돼 버린다(hero 의 살색과 가죽이 그랬다).
    """
    src, ref = palette(src_pack), palette(REF_PACK)
    cand = [(np.abs(ref[t] - src[f]).mean(), f, t)
            for f in used for t in ref if t[1] in TARGET_ROWS]
    cand.sort(key=lambda c: c[0])
    out, taken = {}, set()
    for diff, f, t in cand:
        if f in out or t in taken: continue
        out[f] = t
        taken.add(t)
        print(f'   계열 {f} → {t}  diff={diff:.2f}')
    return out


def used_families(meshes):
    fams = set()
    for me in meshes:
        for d in me.uv_layers.active.data:
            u, v = d.uv[0], 1.0 - d.uv[1]                       # 블렌더 V 는 뒤집혀 있다
            fams.add((min(int(u * GX), GX - 1), min(int(v * GY), GY - 1)))
    return fams


def shift_uvs(meshes, fmap):
    for me in meshes:
        for d in me.uv_layers.active.data:
            u, v = d.uv[0], 1.0 - d.uv[1]
            f = (min(int(u * GX), GX - 1), min(int(v * GY), GY - 1))
            t = fmap.get(f)
            if not t or t == f: continue
            d.uv[0] = u + (t[0] - f[0]) * FW / TEX
            d.uv[1] = 1.0 - (v + (t[1] - f[1]) * FH / TEX)


os.makedirs(OUT, exist_ok=True)
jobs = [[p.strip() for p in l.split('=>')]
        for l in ROSTER.strip().split('\n') if l.strip()]
print('JOBS', len(jobs))

for src, name in jobs:
    pack, base = src.split('/')
    path = os.path.abspath(GLB.format(root=ROOT, pack=pack, name=base))
    keep_anim = (name == CLIP_SOURCE)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)

    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    # 아머처에 안 붙은 메시는 캐릭터가 아니다(Icosphere 잔재)
    for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.parent is not arm]:
        bpy.data.objects.remove(o, do_unlink=True)

    if not keep_anim:
        # 액션을 끊고 지운다. 트랙이 남으면 exporter 가 다시 굽는다.
        if arm.animation_data:
            arm.animation_data.action = None
            arm.animation_data_clear()
        for act in list(bpy.data.actions):
            bpy.data.actions.remove(act)

    if pack != REF_PACK:
        print(f'── {name}: {pack} 팔레트 → {REF_PACK} 자리')
        meshes = [o.data for o in bpy.data.objects if o.type == 'MESH']
        shift_uvs(meshes, family_map(pack, used_families(meshes)))
        # 텍스처도 기준 팔레트로 갈아 끼운다. 런타임이 어차피 갈아 끼우지만,
        # GLB 안에 든 그림과 UV 가 어긋난 채로 두면 나중에 사람이 속는다.
        # ⚠ filepath 를 고쳐 reload 하는 길은 안 통한다 — 임포터가 이미지를
        #   pack 해 두기 때문에 디스크를 다시 읽지 않는다. 노드를 직접 바꾼다.
        ref_img = bpy.data.images.load(
            os.path.abspath(TEXTURE.format(root=ROOT, pack=REF_PACK)))
        for mat in bpy.data.materials:
            for n in (mat.node_tree.nodes if mat.use_nodes else []):
                if n.type == 'TEX_IMAGE': n.image = ref_img

    out = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=out, export_format='GLB',
        export_animations=keep_anim,
        export_apply=False,
    )
    print('WROTE', os.path.basename(out), 'anim=', keep_anim,
          'bytes=', os.path.getsize(out))

print('DONE')
