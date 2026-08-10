# ══════════════════════════════════════════════════════════════════
#  Kenney Mini Characters → 캠퍼스용 GLB 전처리
#
#  12종 캐릭터 파일에 **애니메이션 30개가 통째로 중복** 들어 있다(개당 ~250KB).
#  뼈대가 7개로 전부 동일하고 이름도 같아서, 애니메이션은 한 벌만 있으면
#  three.js AnimationMixer 가 어느 캐릭터에든 그대로 물린다.
#
#  그래서:
#    · 기본 캐릭터 1종 = 메시 + 애니메이션 전체     (클립 공급원)
#    · 나머지 11종     = 메시만                     (개당 ~40KB)
#  파일 크기가 3MB → 0.7MB 로 준다.
#
#  Icosphere(부모 없는 42정점 잔재)도 여기서 지운다.
#
#  실행:
#    KENNEY_SRC=<압축 푼 폴더>/Models/GLB\ format \
#    KENNEY_OUT=public/campus/models/kenney \
#      blender --background --python scripts/campus-prep-kenney.py
# ══════════════════════════════════════════════════════════════════
import bpy, os, glob

SRC = os.environ['KENNEY_SRC']
OUT = os.environ['KENNEY_OUT']
# 이 한 종만 애니메이션을 들고 간다. 런타임이 여기서 클립을 꺼내 전원에게 물린다.
CLIP_SOURCE = 'character-male-a'

os.makedirs(OUT, exist_ok=True)
files = sorted(glob.glob(os.path.join(SRC, 'character-*.glb')))
print('FOUND', len(files))

for path in files:
    name = os.path.splitext(os.path.basename(path))[0]
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

    out = os.path.join(OUT, name.replace('character-', '') + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=out, export_format='GLB',
        export_animations=keep_anim,
        export_apply=False,
    )
    print('WROTE', os.path.basename(out), 'anim=', keep_anim,
          'bytes=', os.path.getsize(out))

print('DONE')
