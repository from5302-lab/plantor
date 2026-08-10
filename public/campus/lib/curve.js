// ══════════════════════════════════════════════════════════════════
//  곡면 월드 (동물의 숲 지평선)
//
//  버텍스 셰이더에서 뷰공간 좌표를 아래로 말아 내린다. GPU 에서만 굽고
//  좌표계·충돌·존은 평평한 그대로다.
//
//  ⚠ 지형만 굽히면 안 된다. 캐릭터가 안 굽으면 발밑 땅만 내려앉아
//    **캐릭터가 공중에 뜬다** — 야외는 카메라가 42m 밖이라 2.8m 나 떴었다.
//    지형·건물·캐릭터가 전부 같은 uniform 을 공유해야 한다.
//
//  기준점은 카메라가 아니라 **플레이어**다(uFocus = 플레이어의 뷰공간 z).
//  플레이어 자리에서 변형량이 0 이라, 이름표 같은 스프라이트(셰이더를 못 타는 것)도
//  어긋나지 않는다. 멀어질수록 양방향으로 말린다.
// ══════════════════════════════════════════════════════════════════

// 두 값 모두 map.js 의 프레임 루프가 갱신한다.
export const CURVE = { value: 0 };     // 굽힘 세기 (실내 0)
export const FOCUS = { value: 0 };     // 플레이어의 뷰공간 z (음수)

export const CURVE_K = 0.0015;

/** 머티리얼에 곡면 변형을 주입한다. 같은 uniform 객체를 공유하므로 한 번에 움직인다. */
export function bend(mat){
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCurve = CURVE;
    sh.uniforms.uFocus = FOCUS;
    sh.vertexShader = 'uniform float uCurve;\nuniform float uFocus;\n' + sh.vertexShader.replace(
      // three 의 project_vertex 를 대체한다(인스턴싱·배칭은 안 쓴다).
      // 이후 fog_vertex 가 이 mvPosition 을 그대로 읽어 안개도 맞는다.
      '#include <project_vertex>',
      // transformed 는 skinning_vertex 를 이미 거친 값이라 스킨드 메시도 그대로 맞다.
      // ⚠ 인스턴싱 분기를 빠뜨리면 InstancedMesh 가 전부 원점에 겹쳐 그려진다.
      `vec4 mvPosition = vec4( transformed, 1.0 );
       #ifdef USE_BATCHING
         mvPosition = batchingMatrix * mvPosition;
       #endif
       #ifdef USE_INSTANCING
         mvPosition = instanceMatrix * mvPosition;
       #endif
       mvPosition = modelViewMatrix * mvPosition;
       float d = mvPosition.z - uFocus;
       mvPosition.y -= d * d * uCurve;
       gl_Position = projectionMatrix * mvPosition;`);
  };
  // 같은 셰이더를 쓰는 머티리얼끼리 프로그램을 공유하게 한다.
  // (스키닝·인스턴싱 여부는 three 가 내부 키에 이미 넣으므로 상수로 충분하다)
  mat.customProgramCacheKey = () => 'campus-curve';
  return mat;
}
