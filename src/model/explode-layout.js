// Deterministic exhibit layout, in normalized scene units and degrees.
// Early travel frees the joint; small presentation angles come afterwards.
export const MOTION_VERSION = 'staggered-1';
export const layout = {
  'fuselage.nose': { offset: [-.8, .7, -5.8], angles: [0, -6, -3], start: 0 },
  'fuselage.skin.front': { offset: [.7, 3.7, -2.2], angles: [3, -7, -5], start: .28, spread: 5.0 },
  'fuselage.skin.mid': { offset: [0, 6.7, .5], angles: [-4, 5, 4], start: .28, spread: 5.2 },
  'fuselage.skin.rear': { offset: [.25, 4.4, 3.4], angles: [2, -6, -4], start: .28, spread: 4.9 },
  'fuselage.frames': { offset: [0, .35, 0], angles: [0, 0, 0], spread: 2.2 },
  'fuselage.stringers': { offset: [0, .35, 0], angles: [0, 0, 0], spread: 2.2 },
  'cabin.floor': { offset: [-.25, -6.2, .7], angles: [1.1, -3.2, 1.5], start: .28, pivotGroup: 'cabin' },
  'cabin.interior': { offset: [-.25, -6.2, .7], angles: [1.1, -3.2, 1.5], start: .28, pivotGroup: 'cabin' },
  'wing.left': { offset: [-5.8, -.2, 1.2], angles: [-1.4, -3.4, 2.6] },
  'wing.right': { offset: [6.1, .8, -1.2], angles: [1.0, 3.0, -2.2] },
  'wing.left.skin.upper': { offset: [-.35, 3.15, -.55], angles: [3.1, -1, -2.8] },
  'wing.right.skin.upper': { offset: [.5, 2.7, .65], angles: [-2.6, .8, 2.1] },
  'wing.left.skin.lower': { offset: [-.25, -3.0, .6], angles: [-1.8, .7, 1.5] },
  'wing.right.skin.lower': { offset: [.3, -3.6, -.6], angles: [2.1, -.7, -1.5] },
  'wing.left.aileron': { offset: [0, -.8, 1.0], systemOffset: [0,-.45,.3], angles: [0, 0, 0] },
  'wing.right.aileron': { offset: [0, .8, .9], systemOffset: [0,.45,.3], angles: [0, 0, 0] },
  'tail.vertical': { offset: [.8, 4.9, 1.8], angles: [2.0, 1.5, 5.0] },
  'tail.vertical.rudder': { offset: [.65, .25, .9], systemOffset: [.45,0,.3], angles: [0, 0, 0] },
  'tail.horizontal.left': { offset: [-3.6, 1.8, 1.1], angles: [-1.5, -4, 2.2] },
  'tail.horizontal.right': { offset: [4.1, .55, 2.2], angles: [1, 4.5, -2.8] },
  'tail.horizontal.left.elevator': { offset: [0, .9, .9], systemOffset: [0,.45,.3], angles: [0, 0, 0] },
  'tail.horizontal.right.elevator': { offset: [0, 1.05, .75], systemOffset: [0,.45,.3], angles: [0, 0, 0] },
  'gear.nose': { offset: [.7, 0, -4.9], angles: [0, -7, 0] },
  'gear.main.left': { offset: [-3.4, 0, 3.1], angles: [0, -9, 0] },
  'gear.main.right': { offset: [3.9, 0, 1.6], angles: [0, 11, 0] },
};
for (const side of ['left', 'right']) {
  const sign = side === 'left' ? -1 : 1;
  for (const part of ['nacelle', 'core', 'pylon']) layout[`engine.${side}.${part}`] = {
    offset: [sign * (side === 'left' ? 2.3 : 2.9), -.3, side === 'left' ? .2 : 1.1],
    systemOffset: [sign * .5, 0, 0],
    axial: part === 'nacelle' ? -3.8 : part === 'core' ? 1.3 : .1,
    angles: [0, side === 'left' ? -5 : 7, 0], pivotGroup: `engine.${side}`,
  };
}
export function ramp(value, start = 0, end = 1) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start))); return t * t * (3 - 2 * t);
}
export function panelAngles(id, side) {
  if (id === 'fuselage.frames' || id === 'fuselage.stringers') return [0, 0, 0];
  if (id.endsWith('front')) return [side * 2, side * 6, side * 3.5];
  if (id.endsWith('mid')) return [-side * 2.5, side * 3.5, side * 2.2];
  return [side * 1.5, side * 7, -side * 3];
}
