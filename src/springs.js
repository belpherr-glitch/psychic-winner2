// "Spring bones": ossos soltos (cabelo, orelhas, fitas, capa, rabo) que balançam sozinhos.
// Cada osso guarda a posição da ponta no MUNDO; como a ponta tem inércia, ela fica pra trás quando
// o personagem anda, vira ou pula, e depois volta pro lugar. Vento e gravidade entram como forças.
import * as THREE from 'three';

const pPos = new THREE.Vector3(), pScale = new THREE.Vector3(), pQuat = new THREE.Quaternion();
const origin = new THREE.Vector3(), restDir = new THREE.Vector3(), restTip = new THREE.Vector3();
const next = new THREE.Vector3(), dir = new THREE.Vector3(), perp = new THREE.Vector3(), q = new THREE.Quaternion();

export class SpringSet {
  constructor() {
    this.list = [];
    this.needsReset = true;
  }
  clear() {
    this.list.length = 0;
    this.needsReset = true;
  }
  // bone: Object3D já posicionado/rotacionado em repouso. O osso "aponta" pelo eixo local -Y (ou +Y se up).
  add(bone, { len = 0.2, stiff = 16, drag = 0.3, gravity = 0.5, wind = 1, maxAngle = 0.9, up = false } = {}) {
    this.list.push({
      bone, len, stiff, drag, gravity, wind, cosMax: Math.cos(maxAngle), sinMax: Math.sin(maxAngle),
      restQ: bone.quaternion.clone(),
      restAxis: new THREE.Vector3(0, up ? 1 : -1, 0).applyQuaternion(bone.quaternion),
      cur: new THREE.Vector3(), prev: new THREE.Vector3(),
    });
    this.needsReset = true;
    return bone;
  }
  reset() {
    this.needsReset = true;
  }

  // root.updateMatrixWorld(true) deve ter sido chamado antes (depois da animação)
  update(dt, time) {
    const reset = this.needsReset;
    this.needsReset = false;
    for (const s of this.list) {
      const parent = s.bone.parent;
      parent.matrixWorld.decompose(pPos, pQuat, pScale);
      origin.copy(s.bone.position).applyMatrix4(parent.matrixWorld);
      restDir.copy(s.restAxis).applyQuaternion(pQuat);
      restTip.copy(origin).addScaledVector(restDir, s.len);
      if (reset) {
        s.cur.copy(restTip);
        s.prev.copy(restTip);
      }
      const gust = Math.sin(time * 1.7 + origin.x * 0.6 + origin.z * 0.45) + 0.5 * Math.sin(time * 2.9 + origin.x * 1.3 - origin.z * 0.8);
      next.copy(s.cur).sub(s.prev).multiplyScalar(1 - s.drag).add(s.cur);
      next.addScaledVector(restTip.sub(s.cur), Math.min(1, s.stiff * dt));
      next.x += gust * 0.28 * s.wind * dt;
      next.z += gust * 0.14 * s.wind * dt;
      next.y -= s.gravity * dt;
      // mantém o comprimento e limita o ângulo em relação ao repouso (não atravessa a cabeça)
      dir.copy(next).sub(origin).normalize();
      const d = dir.dot(restDir);
      if (d < s.cosMax) {
        perp.copy(dir).addScaledVector(restDir, -d);
        if (perp.lengthSq() < 1e-8) perp.set(1, 0, 0);
        perp.normalize();
        dir.copy(restDir).multiplyScalar(s.cosMax).addScaledVector(perp, s.sinMax);
      }
      s.prev.copy(s.cur);
      s.cur.copy(origin).addScaledVector(dir, s.len);
      // converte a direção do mundo pra rotação local do osso
      dir.applyQuaternion(pQuat.invert());
      q.setFromUnitVectors(s.restAxis, dir);
      s.bone.quaternion.copy(q).multiply(s.restQ);
      s.bone.updateMatrix();
      s.bone.matrixWorld.multiplyMatrices(parent.matrixWorld, s.bone.matrix);
    }
  }
}
