# ══════════════════════════════════════════════════════════════════
#  캠퍼스 캐릭터 체형 리셰이프 — public/campus/models/chibi-base/chibi-slim.glb 생성기
#
#  원본 chibi.glb 의 메시 정점과 **본 head/tail 좌표**에 같은 변형을 순서대로
#  적용한다. 새 레스트 포즈가 새 메시와 정확히 일치하므로 리그가 살아 있다.
#  (본 스케일은 쓰지 않는다 — 이 리그는 임포트된 본 로컬 축이 팔다리 방향과
#   무관해서 스케일이 엉뚱한 축으로 먹는다. 실험으로 확인함.)
#
#  체형을 바꾸려면 아래 TARGET(키 대비 비율)·TH(두께 배수)만 만지면 된다.
#  배수는 소스 메시를 실측해 역산하므로, 원하는 비율을 넣으면 그 비율이 나온다.
#
#  A포즈는 굽지 않는다 — 런타임(avatar-glb.js)이 T→A 변환을 이미 한다.
#  본 방향·롤은 원본을 유지한다 — 틀어지면 얼굴 데칼 축이 같이 돈다.
#
#  실행:
#    CHIBI_SRC=public/campus/models/chibi-base/chibi.glb \
#      blender --background --python scripts/campus-reshape-character.py
#    → 같은 폴더에 chibi-slim-rigged.glb + 확인용 렌더 2장
import bpy, os, math, mathutils

OUT = os.environ.get('CHIBI_OUT', os.path.dirname(os.path.abspath(SRC := os.environ['CHIBI_SRC'])))

# 레퍼런스(측면 컨셉) 실측 비율: 다리 53% · 몸통 26% · 머리+목 21% · 팔(어깨~손끝) 32%
# 소스 메시를 재서 이 비율이 되도록 배수를 역산한다. 두께는 레퍼런스 눈대중.
TARGET = dict(legs=0.53, torso=0.26, headneck=0.21, arm=0.32)
TH = dict(legTh=0.8, armTh=0.55, torso=(0.75,0.8), hand=0.9)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
for m in [o for o in bpy.data.objects if o.type=='MESH']:
    if len(m.data.vertices) < 300:
        bpy.data.objects.remove(m, do_unlink=True)
mesh = next(o for o in bpy.data.objects if o.type=='MESH')
arm = next(o for o in bpy.data.objects if o.type=='ARMATURE')
mesh.data = mesh.data.copy()

# 평탄화 — 메시·아머처 모두 월드 좌표가 곧 로컬이 되게
for o in (mesh, arm):
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
for o in [o for o in bpy.data.objects if o.type == 'EMPTY']:
    bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True); arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# 메시는 아머처 모디파이어를 유지한다 (레스트=메시라 변형량 0)

me = mesh.data
gi = {g.name: g.index for g in mesh.vertex_groups}
names = list(gi.keys())

def weights(groups):
    idx = {gi[g] for g in groups if g in gi}
    w = [0.0]*len(me.vertices)
    for v in me.vertices:
        s = sum(g.weight for g in v.groups if g.group in idx)
        w[v.index] = min(1.0, s)
    return w

def region_box(w, thr=0.5):
    mn = mathutils.Vector((1e9,)*3); mx = mathutils.Vector((-1e9,)*3)
    for v in me.vertices:
        if w[v.index] < thr: continue
        mn = mathutils.Vector(map(min, mn, v.co)); mx = mathutils.Vector(map(max, mx, v.co))
    return mn, mx

def wlerp_scale(w, pivot, s):
    for v in me.vertices:
        k = w[v.index]
        if k <= 0: continue
        d = v.co - pivot
        target = pivot + mathutils.Vector((d.x*s[0], d.y*s[1], d.z*s[2]))
        v.co = v.co.lerp(target, k)

L_ARM  = [n for n in names if 'Left'  in n and any(k in n for k in ('Arm','Hand'))]
R_ARM  = [n for n in names if 'Right' in n and any(k in n for k in ('Arm','Hand'))]
L_LEG  = [n for n in names if 'Left'  in n and any(k in n for k in ('Leg','Foot','Toe'))]
R_LEG  = [n for n in names if 'Right' in n and any(k in n for k in ('Leg','Foot','Toe'))]
FOOT_L = [n for n in names if 'Left'  in n and ('Foot' in n or 'Toe' in n)]
FOOT_R = [n for n in names if 'Right' in n and ('Foot' in n or 'Toe' in n)]
HAND_L = [n for n in names if 'Left'  in n and 'Hand' in n]
HAND_R = [n for n in names if 'Right' in n and 'Hand' in n]
TORSO  = ['Hips_01','Spine_02','Spine1_03','Spine2_04']
HEADG  = ['Head_06','Neck_05']

wl_leg, wr_leg = weights(L_LEG), weights(R_LEG)
wl_arm, wr_arm = weights(L_ARM), weights(R_ARM)
w_torso, w_head = weights(TORSO), weights(HEADG)
wl_foot, wr_foot = weights(FOOT_L), weights(FOOT_R)
wl_hand, wr_hand = weights(HAND_L), weights(HAND_R)

# ── 소스 실측 → 배수 역산 ──────────────────────────────────────────
_src_h = max(v.co.z for v in me.vertices) - min(v.co.z for v in me.vertices)
_leg_mn, _leg_mx = region_box(wl_leg)
_crotch_z = _leg_mx.z
_head_mn, _head_mx = region_box(w_head)
_legs_src = _crotch_z                      # 발이 바닥이므로 다리 길이 = 사타구니 높이
_headneck_src = _src_h - _head_mn.z
_torso_src = _head_mn.z - _crotch_z
Hp = _torso_src / TARGET['torso']          # 몸통은 안 늘리므로 여기서 최종 키가 정해진다
P = {}
P['legLen'] = TARGET['legs'] * Hp / _legs_src
_headF = TARGET['headneck'] * Hp / _headneck_src
P['head'] = (_headF*1.04, _headF*1.0, _headF)      # 폭을 아주 살짝 남겨 각진 인상
_arm_mn, _arm_mx = region_box(wl_arm)
_arm_src = _arm_mx.x - _arm_mn.x
P['armLen'] = TARGET['arm'] * Hp / _arm_src
# 발: 다리 z 스트레치를 역보정해 플랫폼 신발 높이(원본의 ~2.1배)로 되돌리고 옆·앞으로 키운다
P['foot'] = (1.8, 2.9, 2.6 / P['legLen'])
P.update(legTh=TH['legTh'], armTh=TH['armTh'], torso=TH['torso'], hand=TH['hand'])
print('CALC Hp', round(Hp,3), 'legLen', round(P['legLen'],2), 'headF', round(_headF,2),
      'armLen', round(P['armLen'],2))

# 본에도 같은 변형을 적용하기 위해 (대상 본 판별자, 피벗, 스케일) 목록을 기록
BONE_OPS = []   # (match_fn, pivot, scale_vec)
def bone_match(*keys, side=None):
    def f(n):
        if side and side not in n: return False
        if side == 'Left' and 'Right' in n: return False
        return any(k in n for k in keys)
    return f

def scale_op(w, pivot, s, match):
    wlerp_scale(w, pivot, s)
    if match: BONE_OPS.append((match, pivot.copy(), tuple(s)))

# ① 다리 길이 + 두께
for w, sd in ((wl_leg,'Left'), (wr_leg,'Right')):
    mn, mx = region_box(w)
    crotch = mathutils.Vector((0, 0, mx.z))
    scale_op(w, crotch, (1, 1, P['legLen']), bone_match('Leg','Foot','Toe', side=sd))
    mn, mx = region_box(w)
    c = (mn + mx) / 2
    scale_op(w, mathutils.Vector((c.x, c.y, 0)), (P['legTh'], P['legTh'], 1),
             bone_match('Leg','Foot','Toe', side=sd))
# ② 발
for w, sd in ((wl_foot,'Left'), (wr_foot,'Right')):
    mn, mx = region_box(w)
    c = (mn + mx) / 2
    scale_op(w, mathutils.Vector((c.x, c.y, mn.z)), P['foot'], bone_match('Foot','Toe', side=sd))
# ③ 몸통
mn, mx = region_box(w_torso)
c = (mn + mx) / 2
scale_op(w_torso, mathutils.Vector((c.x, c.y, 0)), (P['torso'][0], P['torso'][1], 1),
         bone_match('Hips','Spine','Shoulder'))
# ④ 머리
mn, mx = region_box(w_head)
neck = mathutils.Vector(((mn.x+mx.x)/2, (mn.y+mx.y)/2, mn.z + (mx.z-mn.z)*0.12))
scale_op(w_head, neck, P['head'], bone_match('Neck','Head'))
# ⑤ 팔 (T포즈 유지 — A포즈는 런타임이 건다)
for w, sd in ((wl_arm,'Left'), (wr_arm,'Right')):
    mn, mx = region_box(w)
    shoulder_x = mn.x if abs(mn.x) < abs(mx.x) else mx.x
    piv = mathutils.Vector((shoulder_x, (mn.y+mx.y)/2, (mn.z+mx.z)/2))
    scale_op(w, piv, (P['armLen'], P['armTh'], P['armTh']), bone_match('Arm','Hand', side=sd))
# ⑥ 손
for w, sd in ((wl_hand,'Left'), (wr_hand,'Right')):
    mn, mx = region_box(w)
    c = (mn + mx) / 2
    scale_op(w, c, (P['hand'],)*3, bone_match('Hand', side=sd))

# ⑦ 접지 (메시)
zmin = min(v.co.z for v in me.vertices)
for v in me.vertices: v.co.z -= zmin
h = max(v.co.z for v in me.vertices)
print('MESH height', round(h,3))

# ── 본을 같은 변형으로 이동 ─────────────────────────────────────────
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
ebs = arm.data.edit_bones
# ① 목표 좌표를 전부 원본 기준으로 선계산 — 대입 중에 커넥티드 본이 부모 tail을 따라
#    움직이면 이중 변위가 되므로(얼굴이 가슴에 붙는 사고, 실측), 읽기와 쓰기를 분리한다
def xform(name, p):
    p = p.copy()
    for match, piv, sc in BONE_OPS:
        if not match(name): continue
        d = p - piv
        p = piv + mathutils.Vector((d.x*sc[0], d.y*sc[1], d.z*sc[2]))
    p.z -= zmin
    return p
# 본 '방향/롤'은 원본을 유지한다 — 방향이 틀어지면 얼굴 데칼·포즈 축이 돌아간다(실측).
# 머리 위치만 옮기고, 꼬리는 원래 방향으로 새 길이만큼 뻗는다.
targets = {}
for eb in ebs:
    h0, t0 = eb.head.copy(), eb.tail.copy()
    h1, t1 = xform(eb.name, h0), xform(eb.name, t0)
    d0 = t0 - h0
    dir0 = d0.normalized() if d0.length > 1e-9 else mathutils.Vector((0, 0, 1))
    L = (t1 - h1).length or d0.length
    targets[eb.name] = (h1, h1 + dir0 * L)
# ② 연결을 끊고 일괄 대입
for eb in ebs: eb.use_connect = False
for eb in ebs:
    th_, tt_ = targets[eb.name]
    eb.head = th_; eb.tail = tt_
bpy.ops.object.mode_set(mode='OBJECT')

# 검증: 발끝·머리 본이 메시 대역 안에 있는가
hips_z = arm.pose.bones['Hips_01'].matrix.translation.z
head_z = arm.pose.bones['Head_06'].matrix.translation.z
foot_z = arm.pose.bones['Left_Foot_029'].matrix.translation.z
print('BONES hips', round(hips_z,3), 'head', round(head_z,3), 'foot', round(foot_z,3),
      'OK' if 0.35 < hips_z/h < 0.75 and head_z/h > 0.7 and foot_z/h < 0.2 else 'SUSPECT')

out = os.path.join(OUT, 'chibi-slim-rigged.glb')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB')
print('EXPORTED', out)

# 확인 렌더
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'SINGLE'
sc.display.shading.single_color = (0.85, 0.82, 0.77)
sc.render.resolution_x = 620; sc.render.resolution_y = 900
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 60
c2 = mathutils.Vector((0, 0, h/2))
for nm, ang in (('front', math.pi), ('quarter', math.pi - 0.7)):
    d = h * 2.2
    cam.location = (c2.x + d*math.sin(ang), c2.y - d*math.cos(ang), c2.z + h*0.1)
    look = c2 - mathutils.Vector(cam.location)
    cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(OUT, f'render-rigged-{nm}.png')
    bpy.ops.render.render(write_still=True)
print('DONE')
