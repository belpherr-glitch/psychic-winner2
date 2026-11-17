// Shader "cozy": toon de 3 tons + luz de contorno (rim) + vento nas plantas.
// É o MeshToonMaterial do three com dois remendos pequenos, então continua bem leve.
import * as THREE from 'three';

export const windTime = { value: 0 };

const _grads = {};
// 4 faixas: sombra, sombra, meio-tom, luz. "soft" = sombra bem leve (pele e rosto de anime)
function gradient(soft) {
  const key = soft ? 'soft' : 'hard';
  if (_grads[key]) return _grads[key];
  const g = new THREE.DataTexture(new Uint8Array(soft ? [205, 205, 238, 255] : [118, 118, 196, 255]), 4, 1, THREE.RedFormat);
  g.minFilter = g.magFilter = THREE.NearestFilter;
  g.needsUpdate = true;
  return (_grads[key] = g);
}

export function cozyMat({ color = 0xffffff, map = null, wind = 0, rim = 0.28, alphaTest = 0, side = THREE.FrontSide, soft = false, transparent = false, frontBack = false } = {}) {
  const m = new THREE.MeshToonMaterial({ color, map, gradientMap: gradient(soft), alphaTest, side, transparent, depthWrite: !transparent });
  const W = wind.toFixed(4), R = rim.toFixed(4);
  m.onBeforeCompile = (sh) => {
    if (wind > 0) {
      sh.uniforms.uTime = windTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 wp4 = modelMatrix * instanceMatrix * vec4(position, 1.0);
        #else
          vec4 wp4 = modelMatrix * vec4(position, 1.0);
        #endif
        float swayH = max(position.y, 0.0);
        float sway = sin(uTime * 1.7 + wp4.x * 0.6 + wp4.z * 0.45) + 0.5 * sin(uTime * 2.9 + wp4.x * 1.3 - wp4.z * 0.8);
        transformed.x += sway * ${W} * swayH;
        transformed.z += sway * ${W} * 0.5 * swayH;`
      );
    }
    if (frontBack) {
      // textura dividida em duas metades: esquerda = frente do modelo, direita = costas
      sh.vertexShader = 'varying float vRestZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRestZ = position.z;');
      sh.fragmentShader = 'varying float vRestZ;\n' + sh.fragmentShader.replace(
        '#include <map_fragment>',
        'diffuseColor *= texture2D(map, vec2(vMapUv.x * 0.5 + (vRestZ < 0.0 ? 0.5 : 0.0), vMapUv.y));'
      );
    }
    if (rim > 0) {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <opaque_fragment>',
        `float rimF = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 3.0);
        outgoingLight += diffuseColor.rgb * rimF * ${R};
        #include <opaque_fragment>`
      );
    }
  };
  m.customProgramCacheKey = () => `cozy_${W}_${R}_${frontBack}`;
  return m;
}

// água do lago: faixas toon com brilhos "pixelados" que se movem
export function waterMat(center, radius) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: windTime,
      uC: { value: new THREE.Vector2(center.x, center.z) },
      uR: { value: radius },
      deep: { value: new THREE.Color('#3f8fc4') },
      shallow: { value: new THREE.Color('#6fc3d9') },
      spark: { value: new THREE.Color('#c9f2f5') },
    },
    vertexShader: `varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec3 vW; uniform float uTime, uR; uniform vec2 uC; uniform vec3 deep, shallow, spark;
      void main(){
        vec2 p = floor(vW.xz * 8.0) / 8.0;
        vec2 q = p - uC;
        float d = length(q) / uR;
        float w = sin(p.x * 2.1 + uTime * 0.8) + sin(p.y * 2.7 - uTime * 0.6) + sin((p.x + p.y) * 1.3 + uTime * 0.5);
        vec3 col = mix(deep, shallow, step(0.55, d) * 0.5 + step(0.8, d) * 0.5);
        col = mix(col, spark, step(2.3, w) * 0.7);
        float foam = step(0.94 + 0.025 * sin(uTime * 1.4 + atan(q.y, q.x) * 9.0), d);
        col = mix(col, vec3(0.9, 0.98, 1.0), foam);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
