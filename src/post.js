// Ink outline post-process: finds depth edges and draws dark cartoon lines.
import * as THREE from 'three';

export class OutlinePass {
  constructor(renderer) {
    this.renderer = renderer;
    this.rt = null;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tDepth: { value: null },
        uTexel: { value: new THREE.Vector2() }, uNear: { value: 0.05 }, uFar: { value: 900 },
        uFade: { value: 80 }, uInk: { value: new THREE.Color(0.05, 0.04, 0.08) }, uStrength: { value: 0.8 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tColor; uniform sampler2D tDepth;
        uniform vec2 uTexel; uniform float uNear; uniform float uFar; uniform float uFade;
        uniform vec3 uInk; uniform float uStrength;
        varying vec2 vUv;
        float lin(vec2 uv) { float d = texture2D(tDepth, uv).x; float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
        // grass and plants write alpha 0.5; they never create or receive outlines (stops shimmering)
        float pick(vec2 uv, float d0) { vec4 c = texture2D(tColor, uv); return c.a < 0.9 ? d0 : lin(uv); }
        void main() {
          vec4 c = texture2D(tColor, vUv);
          if (c.a < 0.9) { gl_FragColor = vec4(c.rgb, 1.0); return; }
          float d0 = lin(vUv);
          float dl = pick(vUv - vec2(uTexel.x, 0.0), d0), dr = pick(vUv + vec2(uTexel.x, 0.0), d0);
          float du = pick(vUv + vec2(0.0, uTexel.y), d0), dd = pick(vUv - vec2(0.0, uTexel.y), d0);
          float m = min(min(dl, dr), min(du, dd));
          // silhouette only: the far side of a real depth jump (scaled so distant lines don't flicker)
          float sil = (d0 - m) / max(m, 0.001);
          float edge = smoothstep(0.06 + m * 0.002, 0.14 + m * 0.004, sil);
          edge *= 1.0 - smoothstep(uFade * 0.45, uFade * 0.85, m);
          gl_FragColor = vec4(mix(c.rgb, uInk, edge * uStrength), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  ensure() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    if (this.rt && this.rt.width === size.x && this.rt.height === size.y) return;
    if (this.rt) this.rt.dispose();
    const dt = new THREE.DepthTexture(size.x, size.y);
    dt.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { depthTexture: dt, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const thick = this.renderer.getPixelRatio() > 1.3 ? 1.6 : 1.0;
    this.mat.uniforms.uTexel.value.set(thick / size.x, thick / size.y);
  }
  render(scene, camera, clearColor, fade) {
    const r = this.renderer;
    this.ensure();
    r.setRenderTarget(this.rt);
    r.setClearColor(clearColor);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(null);
    const u = this.mat.uniforms;
    u.tColor.value = this.rt.texture; u.tDepth.value = this.rt.depthTexture;
    u.uNear.value = camera.near; u.uFar.value = camera.far; u.uFade.value = fade;
    r.clear();
    r.render(this.scene, this.cam);
  }
}
