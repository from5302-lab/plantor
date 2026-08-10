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

OUT = os.environ['KIT_OUT']
jobs = [l.strip() for l in os.environ['KIT_LIST'].strip().split('\n') if l.strip()]

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

    bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB',
                              export_animations=False)
    print('WROTE', rel, os.path.getsize(dst))

print('DONE')
