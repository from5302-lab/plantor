# ══════════════════════════════════════════════════════════════════
#  Kenney 키트 모델 → 캠퍼스용 GLB (텍스처 embed)
#
#  Kenney 배포본은 GLB 라도 텍스처를 **외부 파일**(Textures/colormap.png)로
#  참조한다. 모델만 복사하면 색이 통째로 날아가 회색 덩어리가 된다(실측).
#  Nature Kit 은 아예 GLTF+bin 조각 배포라 그대로는 못 쓴다.
#
#  그래서 여기서 전부 다시 구워 **텍스처를 GLB 안에 넣는다.** 파일 하나만
#  옮기면 되고, 외부 경로가 깨질 여지가 사라진다.
#
#  실행:
#    KIT_LIST="<src.glb|out이름> ..." KIT_OUT=public/campus/models/kenney \
#      blender --background --python scripts/campus-prep-kit.py
#  (KIT_LIST 는 개행 구분, 각 줄은 "소스경로 → 출력 상대경로")
# ══════════════════════════════════════════════════════════════════
import bpy, os
import numpy as np

OUT = os.environ['KIT_OUT']
jobs = [l.strip() for l in os.environ['KIT_LIST'].strip().split('\n') if l.strip()]


def split_family(obj, fx, fy, name):
    """
    팔레트 **계열 하나**를 따로 떼어 이름 붙인 재질로 만든다.
    KIT_SPLIT="3,3=>fridge-glass" 처럼 쓴다.

    런타임이 그 부분만 다르게 다루고 싶을 때 쓴다 — 냉장고 문을 유리로
    비치게 하는 것이 첫 용도다. 모델이 mesh 1 · material 1 이라
    이렇게 갈라 두지 않으면 몸통까지 같이 투명해진다.
    """
    me = obj.data
    src = me.materials[0].copy()
    src.name = name
    me.materials.append(src)
    gi = len(me.materials) - 1
    uv = me.uv_layers.active.data
    n = 0
    for poly in me.polygons:
        u = sum(uv[l].uv[0] for l in poly.loop_indices) / poly.loop_total
        v = 1.0 - sum(uv[l].uv[1] for l in poly.loop_indices) / poly.loop_total
        if (min(int(u * 8), 7), min(int(v * 4), 3)) == (fx, fy):
            poly.material_index = gi
            n += 1
    return n


def split_glow(obj):
    """
    빛나는 면을 `lamp-glow` 재질로 떼어낸다. KIT_GLOW=1 일 때만 부른다.

    가로등은 mesh 1 · material 1 이라 그대로 두면 **기둥까지 같이 빛난다.**
    그런데 등 전체가 무채색 회백이고 **렌즈만 유채색**이다 — 면의 UV 중심에서
    텍스처를 찍어 채도로 가른다. 셀 좌표를 박는 것보다 등 4종에 두루 통한다.
    """
    me = obj.data
    mat = me.materials[0]
    img = next((n.image for n in mat.node_tree.nodes
                if n.type == 'TEX_IMAGE' and n.image), None)
    if not img: return 0
    buf = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(buf)
    px = buf.reshape(img.size[1], img.size[0], 4)[::-1, :, :3]   # 블렌더는 아래→위
    H, W = px.shape[:2]

    glow = mat.copy()
    glow.name = 'lamp-glow'
    me.materials.append(glow)
    gi = len(me.materials) - 1

    uv = me.uv_layers.active.data
    n = 0
    for poly in me.polygons:
        u = sum(uv[l].uv[0] for l in poly.loop_indices) / poly.loop_total
        v = sum(uv[l].uv[1] for l in poly.loop_indices) / poly.loop_total
        c = px[min(int((1 - v) * H), H - 1), min(int(u * W), W - 1)]
        sat = 0 if c.max() <= 0 else (c.max() - c.min()) / c.max()
        if sat > 0.25:
            poly.material_index = gi
            n += 1
    return n

for job in jobs:
    src, rel = [p.strip() for p in job.split('=>')]
    dst = os.path.join(OUT, rel + '.glb')
    os.makedirs(os.path.dirname(dst), exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    ext = os.path.splitext(src)[1].lower()
    if ext in ('.glb', '.gltf'):
        bpy.ops.import_scene.gltf(filepath=src)
    elif ext == '.obj':
        bpy.ops.wm.obj_import(filepath=src)
    else:
        print('SKIP-UNKNOWN', src); continue

    # 텍스처를 blend 안으로 끌어와야 exporter 가 GLB 에 심는다
    for img in bpy.data.images:
        if img.source == 'FILE' and not img.packed_file:
            try: img.pack()
            except Exception as e: print('PACK-FAIL', img.name, e)

    # 가로등은 빛나는 면을 갈라 둬야 런타임이 등갓만 켤 수 있다 — KIT_GLOW=1.
    if os.environ.get('KIT_GLOW') == '1':
        for o in bpy.data.objects:
            if o.type == 'MESH' and o.data.materials:
                print('GLOW', rel, o.name, split_glow(o))

    # 계열 하나를 떼어 낸다 — KIT_SPLIT="3,3=>fridge-glass"
    if os.environ.get('KIT_SPLIT'):
        cell, mname = [p.strip() for p in os.environ['KIT_SPLIT'].split('=>')]
        fx, fy = [int(v) for v in cell.split(',')]
        for o in bpy.data.objects:
            if o.type == 'MESH' and o.data.materials:
                print('SPLIT', rel, o.name, split_family(o, fx, fy, mname))

    # 소품은 애니메이션을 버려 용량을 줄인다. 펫(cube-pets)은 클립이 본체다 —
    # KIT_ANIM=1 로 켠다.
    bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB',
                              export_animations=os.environ.get('KIT_ANIM') == '1')
    print('WROTE', rel, os.path.getsize(dst))

print('DONE')
