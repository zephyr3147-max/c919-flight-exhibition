// Lookdev for the whole-aircraft exhibit: semantic materials, a procedural
// PMREM studio, one fixed key direction, and interior fill tied to opening.
import * as THREE from 'three';
import { createMaterials, disposeMaterials } from './materials.js';
import { createProceduralEnvironment } from './environment.js';
import { createSky } from './sky.js';

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

// Fixed studio values from the art bible. High/low only trim cost, not the
// direction or the relative key/fill/rim hierarchy.
const LIGHT_PRESETS = {
  high: { key: 2.55, fill: 0.62, rim: 1.2, hemisphere: 0.3 },
  balanced: { key: 2.4, fill: 0.55, rim: 1.1, hemisphere: 0.28 },
  low: { key: 2.2, fill: 0.58, rim: 1.0, hemisphere: 0.36 },
};
const INTERIOR_PRESETS = {
  high: { z: [-10.2, -1.1, 8.2], intensity: 10.2, distance: 9.5 },
  balanced: { z: [-8.2, 4.2], intensity: 9.5, distance: 9.5 },
  low: { z: [-2.2], intensity: 8.6, distance: 9.5 },
};

export function createLookdev({ renderer, scene, quality = 'balanced' } = {}) {
  const level = quality === 'high' || quality === 'low' ? quality : 'balanced';
  const lightPreset = LIGHT_PRESETS[level];
  const interiorPreset = INTERIOR_PRESETS[level];
  const materials = createMaterials(level);
  const previousEnvironment = scene?.environment ?? null;
  const hadIntensity = scene ? 'environmentIntensity' in scene : false;
  const previousIntensity = scene?.environmentIntensity;
  const environment = createProceduralEnvironment(renderer, level);
  if (environment && scene) {
    scene.environment = environment.texture;
    scene.environmentIntensity = level === 'low' ? 0.55 : 0.65;
  }
  // The background is a lookdev-owned deep-blue cloudscape. The colour is the
  // pre-first-frame fallback; the dome paints the live sky on top of it. Both
  // are restored on dispose, and nothing is displaced through the canvas.
  const previousBackground = scene?.background ?? null;
  const backdrop = new THREE.Color(0x07111c);
  if (scene) scene.background = backdrop;
  const sky = createSky({ renderer, scene, level });

  const lights = new THREE.Group();
  lights.name = 'lookdev-lights';
  const hemisphere = new THREE.HemisphereLight(0xd9e7f0, 0x1c2730, lightPreset.hemisphere);
  lights.add(hemisphere);
  // The guide camera looks from (+X, +Y, -Z). Screen-upper-left-front therefore
  // sits at (+X, +Y, slightly -Z); this direction never follows the camera.
  const key = new THREE.DirectionalLight(0xfff1e2, lightPreset.key);
  key.position.set(24, 36, -10);
  const fill = new THREE.DirectionalLight(0xb9d7e8, lightPreset.fill);
  fill.position.set(-30, 16, -16);
  const rim = new THREE.DirectionalLight(0x9bc4da, lightPreset.rim);
  rim.position.set(6, 18, 38);
  for (const light of [key, fill, rim]) {
    light.target.position.set(0, 0, 0);
    lights.add(light);
    lights.add(light.target);
  }
  const interior = interiorPreset.z.map((z, index) => {
    const light = new THREE.PointLight(0xffe0c2, 0, interiorPreset.distance, 2);
    light.position.set(0, -1.85, z);
    light.name = `lookdev-interior-${index}`;
    lights.add(light);
    return { light, base: interiorPreset.intensity * (index === 0 ? 0.82 : 1) };
  });
  if (scene) scene.add(lights);

  let disposed = false;
  const applyFrame = frame => {
    if (disposed) return;
    const pose = frame?.pose ?? {};
    // The interior fill follows the real structural opening only: closed means
    // dark, and no light implies an engine is running.
    const opening = Math.max(clamp01(pose.assembly), clamp01(pose.systems?.cabin));
    const eased = opening * opening * (3 - 2 * opening);
    for (const entry of interior) entry.light.intensity = entry.base * eased;
    // The cloud clock advances on host frames; lookdev's own idle driver keeps
    // it advancing once the host has settled. Reduced motion freezes the sky.
    sky?.setReducedMotion(frame?.reducedMotion);
    if (!frame?.reducedMotion) sky?.update(performance.now());
  };

  return {
    materials,
    applyFrame,
    dispose() {
      if (disposed) return;
      disposed = true;
      sky?.dispose();
      lights.removeFromParent();
      disposeMaterials(materials);
      if (scene && environment && scene.environment === environment.texture) {
        scene.environment = previousEnvironment;
        if (hadIntensity) scene.environmentIntensity = previousIntensity;
        else delete scene.environmentIntensity;
      }
      if (scene && scene.background === backdrop) scene.background = previousBackground;
      environment?.target.dispose();
      for (const entry of interior) entry.light.dispose?.();
    },
  };
}
