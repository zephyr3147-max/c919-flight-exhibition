import * as THREE from 'three';
export function createLookdev({ scene }) {
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight(0xe2edf4, 0x4a5360, 2));
  const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(-20, 35, -25); lights.add(key);
  const fill = new THREE.DirectionalLight(0x9bb6c8, 1.5); fill.position.set(25, 10, 15); lights.add(fill);
  scene.add(lights);
  return { materials: {}, applyFrame() {}, dispose() { lights.removeFromParent(); } };
}
