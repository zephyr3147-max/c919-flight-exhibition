// Contract 1.0. Runtime identifiers are shared by all module owners.
export const CONTRACT_VERSION = '1.0';
export const EXPERIENCE_VERSION = '2.0';
export const SYSTEMS = Object.freeze({
  fuselage: '机身', cabin: '客舱', wings: '主翼', tail: '尾翼',
  propulsion: '动力', 'landing-gear': '起落架', 'flight-controls': '舵面',
});
export const NAVIGATION = Object.freeze([
  ['aircraft', '整机', null], ['fuselage', '机身与客舱', 'fuselage'],
  ['wings', '主翼', 'wings'], ['tail', '尾翼', 'tail'],
  ['propulsion', '动力', 'propulsion'], ['landing-gear', '起落架', 'landing-gear'],
  ['flight-controls', '舵面', 'flight-controls'],
]);
export const PARTS = [
  ['aircraft', null, null, '整机'],
  ['fuselage.nose', 'fuselage', 'aircraft', '机头'],
  ...['front', 'mid', 'rear'].map((p, i) => [`fuselage.skin.${p}`, 'fuselage', 'aircraft', ['前段蒙皮', '中段蒙皮', '后段蒙皮'][i]]),
  ['fuselage.frames', 'fuselage', 'aircraft', '机身框'],
  ['fuselage.stringers', 'fuselage', 'aircraft', '机身长桁'],
  ['cabin.floor', 'cabin', 'aircraft', '客舱地板'],
  ['cabin.interior', 'cabin', 'aircraft', '客舱内饰组'],
  ...['left', 'right'].flatMap(side => {
    const id = `wing.${side}`, name = side === 'left' ? '左' : '右';
    return [[id, 'wings', 'aircraft', `${name}主翼`],
      ...[['skin.upper', '上蒙皮'], ['skin.lower', '下蒙皮'], ['spar.front', '前梁'],
        ['spar.rear', '后梁'], ['ribs', '翼肋组'], ['stringers', '长桁组']]
        .map(([suffix, label]) => [`${id}.${suffix}`, 'wings', id, `${name}翼${label}`]),
      [`${id}.aileron`, 'flight-controls', id, `${name}副翼`]];
  }),
  ['tail.vertical', 'tail', 'aircraft', '垂直尾翼'],
  ...['left', 'right'].flatMap(side => {
    const id = `tail.horizontal.${side}`, name = side === 'left' ? '左' : '右';
    return [[id, 'tail', 'aircraft', `${name}水平尾翼`], [`${id}.elevator`, 'flight-controls', id, `${name}升降舵`]];
  }),
  ['tail.vertical.rudder', 'flight-controls', 'tail.vertical', '方向舵'],
  ...['left', 'right'].flatMap(side => ['nacelle', 'core', 'pylon'].map((p, i) =>
    [`engine.${side}.${p}`, 'propulsion', 'aircraft', `${side === 'left' ? '左' : '右'}${['短舱', '动力内部示意', '挂架'][i]}`])),
  ...['nose', 'main.left', 'main.right'].flatMap((p, i) => {
    const id = `gear.${p}`, name = ['前起落架', '左主起落架', '右主起落架'][i];
    return [[id, 'landing-gear', 'aircraft', name], [`${id}.doors`, 'landing-gear', id, `${name}舱门`]];
  }),
].map(([id, systemId, parentId, name]) => Object.freeze({ id, systemId, parentId, name }));
Object.freeze(PARTS);
export const OPENING_DURATION = .24;
export function clamp(value, min = 0, max = 1) { return Math.min(max, Math.max(min, value)); }
export function emptyPose() {
  return { assembly: 0, systems: Object.fromEntries(Object.keys(SYSTEMS).map(id => [id, 0])),
    controls: { roll: 0, pitch: 0, yaw: 0 }, section: null, emphasis: { systemId: null, partId: null } };
}
export function capabilities(overrides = {}) {
  return { focus: true, expand: true, section: false, control: false, ...overrides };
}
export function validateModel(model) {
  if (!model?.root?.isObject3D || !(model.parts instanceof Map) || !(model.systems instanceof Map)) throw new Error('模型根节点或登记表不符合合同1.0');
  for (const { id } of PARTS) {
    const part = model.parts.get(id);
    if (!part?.object?.isObject3D || !part.anchor?.isVector3 || !part.capabilities || !part.sourceType || !Array.isArray(part.sourceRefs)) throw new Error(`部件登记不完整：${id}`);
  }
  for (const id of Object.keys(SYSTEMS)) if (!model.systems.has(id)) throw new Error(`缺少系统：${id}`);
  for (const name of ['applyPose', 'getBounds', 'setQuality', 'dispose']) if (typeof model[name] !== 'function') throw new Error(`模型缺少 ${name}`);
  if (!Array.isArray(model.pickables) || !model.assembledBounds?.isBox3) throw new Error('缺少可点选对象或装配包围盒');
  if (typeof model.assetVersion !== 'string' || !model.assetVersion) throw new Error('缺少资产版本');
  return true;
}
