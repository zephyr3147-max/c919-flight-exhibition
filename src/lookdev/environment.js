// Procedural studio environment. No addon or external HDRI is used: a soft
// vertical gradient plus a few HDR softboxes gives the white paint its long
// reflection without star fields or decorative glow.
import * as THREE from 'three';

const PRESETS = {
  high: { sigma: 0.025, segments: 48 },
  balanced: { sigma: 0.045, segments: 40 },
  low: { sigma: 0.09, segments: 28 },
};

function gradientSphere(radius, segments) {
  const geometry = new THREE.SphereGeometry(radius, segments, Math.max(12, segments >> 1));
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const top = new THREE.Color(0xb0c4d2);
  const horizon = new THREE.Color(0x506877);
  const bottom = new THREE.Color(0x0b1218);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const t = Math.max(0, Math.min(1, position.getY(i) / radius * 0.5 + 0.5));
    if (t >= 0.5) color.copy(horizon).lerp(top, (t - 0.5) * 2);
    else color.copy(bottom).lerp(horizon, t * 2);
    colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  return new THREE.Mesh(geometry, material);
}

function softbox(scene, width, height, position, target, rgb) {
  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(rgb[0], rgb[1], rgb[2]),
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.lookAt(target[0], target[1], target[2]);
  scene.add(mesh);
}

// The exhibit background is a plain black color in lookdev; no screen-space
// canvas texture is created. The procedural PMREM below only supplies
// reflections and never appears as the scene background.

export function createProceduralEnvironment(renderer, quality = 'balanced') {
  const supported = renderer && typeof renderer.getRenderTarget === 'function'
    && typeof renderer.setRenderTarget === 'function' && typeof renderer.getClearColor === 'function';
  if (!supported) return null;
  const preset = PRESETS[quality] ?? PRESETS.balanced;
  const scene = new THREE.Scene();
  scene.add(gradientSphere(120, preset.segments));
  // Upper-left-front key softbox (from the fixed guide camera), a long overhead
  // strip for the fuselage highlight, a cool tail rim and a weak shadow fill.
  softbox(scene, 22, 14, [26, 32, -11], [0, 0, 0], [3.5, 3.35, 3.1]);
  softbox(scene, 76, 4, [0, 30, 2], [0, 0, 0], [2.7, 2.85, 3.0]);
  softbox(scene, 42, 18, [4, 16, 38], [0, 6, 0], [0.95, 1.6, 2.1]);
  softbox(scene, 30, 12, [-34, 12, -14], [0, 2, 0], [0.32, 0.45, 0.56]);
  const generator = new THREE.PMREMGenerator(renderer);
  let target = null;
  try {
    target = generator.fromScene(scene, preset.sigma, 0.1, 300);
  } catch {
    target = null;
  } finally {
    generator.dispose();
    scene.traverse(object => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
      else object.material?.dispose();
    });
    scene.clear();
  }
  return target ? { texture: target.texture, target } : null;
}
