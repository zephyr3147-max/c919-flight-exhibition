import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createStore } from '../state/store.js';
import { SYSTEMS, CONTRACT_VERSION, EXPERIENCE_VERSION, emptyPose, validateModel } from '../state/contract.js';
import { bindInput } from '../input/bind.js';
import { getStylesheet, loadModules } from './modules.js';
import { visibleIntersections } from './picking.js';

const params = new URLSearchParams(location.search), inspect = params.has('inspect');
const profile = params.get('profile') ?? document.querySelector('meta[name=flight-profile]')?.content ?? 'engineering';
const canvas = document.querySelector('#scene'), mount = document.querySelector('#art-mount');
const loading = document.querySelector('#loading'), message = document.querySelector('#load-message');
const progress = document.querySelector('#load-progress'), notice = document.querySelector('#notice');
const fallback = document.querySelector('#fallback'), retry = document.querySelector('#retry');
const preferences = matchMedia('(prefers-reduced-motion: reduce)');
const store = createStore({ reducedMotion: preferences.matches });
const abort = new AbortController(), scene = new THREE.Scene(); scene.background = new THREE.Color(0x101c27);
const camera = new THREE.PerspectiveCamera(32, 1, .05, 600);
let model, lookdev, rig, art, modules, renderer, controls, input, viewport, lastFrame, lastView, disposed = false;
let wholeViewBeforeFocus = null;
let raf = null, priorTime = 0, inFrame = false, drawAgain = false, frameCount = 0;
const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
const controlsDefaults = { minDistance: 0, maxDistance: Infinity, minPolarAngle: 0, maxPolarAngle: Math.PI,
  minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity, enablePan: false };
const info = { status: 'loading', triangles: 0, calls: 0, textures: 0, geometries: 0, frames: 0 };
function invalidate() { if (disposed || document.hidden) return; if (inFrame) drawAgain = true; else if (raf === null) raf = requestAnimationFrame(draw); }
function feedback(ok, code = 'ok', detail = '') { if (!ok) { notice.textContent = detail; setTimeout(() => { if (notice.textContent === detail) notice.textContent = ''; }, 3500); } return { ok, code, message: detail }; }
function guard(explore = false) {
  if (!store.state.ready) return feedback(false, 'not-ready', '资源尚未就绪。');
  if (store.state.overlay) return feedback(false, 'blocked', '请先关闭资料层。');
  if (explore && store.state.mode !== 'explore') return feedback(false, 'wrong-mode', '请先进入探索。');
  return null;
}
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function configureControls() {
  if (!controls) return;
  controls.enabled = store.state.ready && store.state.mode === 'explore' && !store.state.overlay && info.status === 'webgl';
  document.body.dataset.mode = store.state.mode;
  document.documentElement.style.overflowY = 'hidden';
}
function cancelPointer() {
  input?.cancelPointer();
}
function rememberWholeView() {
  if (!store.state.scope.systemId && !store.state.scope.partId) wholeViewBeforeFocus = rig.getSnapshot();
}
function focusCamera(systemId, partId, snapshot = null) {
  Object.assign(controls, controlsDefaults);
  model.applyPose(store.state.pose); model.root.updateWorldMatrix(true, true);
  if (snapshot) rig.restoreView(snapshot, { reducedMotion: store.state.reducedMotion });
  else rig.focusPart({ systemId, partId, reducedMotion: store.state.reducedMotion });
  Object.assign(controls, rig.getExploreLimits({ systemId, partId }));
}
const actions = {
  enterExhibit() {
    if (!store.state.ready || store.state.overlay) return feedback(false, 'not-ready', '资源尚未就绪。');
    if (!store.enterExhibit()) return feedback(false, 'wrong-mode', '入场已经启动。');
    wholeViewBeforeFocus = null;
    if (store.state.reducedMotion) {
      model.applyPose(store.state.pose); model.root.updateWorldMatrix(true, true);
      rig.setOverview({ reducedMotion: true });
    } else rig.startEntrance({ reducedMotion: false });
    configureControls(); invalidate(); return feedback(true);
  },
  selectSystem(id) {
    const blocked = guard(); if (blocked) return blocked; if (typeof id !== 'string' || !Object.hasOwn(SYSTEMS, id)) return feedback(false, 'invalid-id', '未知系统。');
    rememberWholeView(); store.focus(id, null); focusCamera(id, null); configureControls(); invalidate(); return feedback(true);
  },
  selectPart(id) {
    const blocked = guard(); if (blocked) return blocked; const part = model.parts.get(id);
    if (!part?.capabilities.focus) return feedback(false, 'invalid-id', '该部件不可选择。');
    rememberWholeView(); store.focus(part.systemId, id); focusCamera(part.systemId, id); configureControls(); invalidate(); return feedback(true);
  },
  setAssembly(value) {
    const blocked = guard(true); if (blocked) return blocked; if (!finite(value)) return feedback(false, 'invalid-value', '展开量必须为有限数值。');
    rig?.cancelTransition(); store.setDepth(null, value); configureControls(); invalidate(); return feedback(true);
  },
  setSystemDepth(id, value) {
    const blocked = guard(true); if (blocked) return blocked;
    if (!model.systems.get(id)?.capabilities.expand) return feedback(false, 'unsupported', '该系统未开放深入展开。');
    if (!finite(value)) return feedback(false, 'invalid-value', '展开量必须为有限数值。');
    rig?.cancelTransition(); store.setDepth(id, value); configureControls(); invalidate(); return feedback(true);
  },
  setControl(axis, value) {
    const blocked = guard(true); if (blocked) return blocked;
    if (!['roll', 'pitch', 'yaw'].includes(axis) || !finite(value)) return feedback(false, 'invalid-value', '无效舵面输入。');
    if (store.state.scope.systemId !== 'flight-controls') return feedback(false, 'unsupported', '请先选择舵面系统。');
    rig?.cancelTransition(); store.setControl(axis, value); configureControls(); invalidate(); return feedback(true);
  },
  setSection(id, position) {
    const blocked = guard(true); if (blocked) return blocked;
    if (id !== null && !model.parts.get(id)?.capabilities.section) return feedback(false, 'unsupported', '此部件没有经批准的封闭剖切样段。');
    if (id !== null && !finite(position)) return feedback(false, 'invalid-value', '无效剖切位置。');
    rig?.cancelTransition(); store.setSection(id === null ? null : { partId: id, position: Math.min(1, Math.max(0, position)) }); invalidate(); return feedback(true);
  },
  returnToAircraft() {
    const blocked = guard(); if (blocked) return blocked;
    const snapshot = wholeViewBeforeFocus;
    store.focus(null, null); focusCamera(null, null, snapshot); configureControls(); invalidate(); return feedback(true);
  },
  restoreAircraft() { return transformAircraft('assemble'); },
  expandAircraft() { return transformAircraft('expand'); },
  resetView() { const blocked = guard(); if (blocked) return blocked; cancelPointer(); if (!store.state.scope.systemId && !store.state.scope.partId) wholeViewBeforeFocus = null; focusCamera(store.state.scope.systemId, store.state.scope.partId); invalidate(); return feedback(true); },
  stopTransition() { store.stopTransition(); rig?.cancelTransition(); invalidate(); return feedback(true); },
  setSourcesOpen(value) {
    if (typeof value !== 'boolean') return feedback(false, 'invalid-value', '资料状态必须为布尔值。');
    if (!store.state.ready) return feedback(false, 'not-ready', '资源尚未就绪。');
    cancelPointer(); store.overlay(value); configureControls(); invalidate(); return feedback(true);
  },
  setReducedMotion(value) {
    if (typeof value !== 'boolean') return feedback(false, 'invalid-value', '动效偏好必须为布尔值。');
    const cameraMoving = value && Boolean(rig?.getSnapshot().transition);
    store.reduced(value);
    if (cameraMoving) {
      const restoring = !store.state.scope.systemId && !store.state.scope.partId ? wholeViewBeforeFocus : null;
      focusCamera(store.state.scope.systemId, store.state.scope.partId, restoring);
    }
    configureControls(); invalidate(); return feedback(true);
  },
};
function transformAircraft(kind) {
  const blocked = guard(); if (blocked) return blocked;
  cancelPointer(); rig.cancelTransition(); Object.assign(controls, controlsDefaults); wholeViewBeforeFocus = null;
  if (kind === 'assemble') store.assemble(); else store.expand();
  focusCamera(null, null); configureControls(); invalidate(); return feedback(true);
}
function updateViewport() {
  const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, innerWidth <= 700 ? 1 : 1.5);
  viewport = { width: Math.max(1, rect.width), height: Math.max(1, rect.height), left: rect.left, top: rect.top, dpr };
  renderer?.setPixelRatio(dpr); renderer?.setSize(viewport.width, viewport.height, false);
  if (rig) rig.resize(viewport); else { camera.aspect = viewport.width / viewport.height; camera.updateProjectionMatrix(); }
  art?.resize(viewport); invalidate();
}
function pick(x, y) {
  pointer.set((x - viewport.left) / viewport.width * 2 - 1, -(y - viewport.top) / viewport.height * 2 + 1);
  ray.setFromCamera(pointer, camera); return visibleIntersections(ray, model.pickables)[0]?.object.userData.partId ?? null;
}
function projectLabels(ids) {
  const forward = camera.getWorldDirection(new THREE.Vector3());
  return ids.slice(0, 3).map(id => {
    const part = model.parts.get(id); if (!part) return null;
    const world = part.object.localToWorld(part.anchor.clone()), ndc = world.clone().project(camera);
    const vector = world.clone().sub(camera.position), behind = vector.dot(forward) <= 0;
    const inViewport = !behind && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && Math.abs(ndc.z) <= 1;
    ray.set(camera.position, vector.clone().normalize()); const hit = visibleIntersections(ray, model.pickables)[0];
    const hitId = hit?.object.userData.partId;
    const occluded = !!hit && hit.distance < vector.length() - .2 && hitId !== id && !hitId?.startsWith(`${id}.`);
    return { id, name: part.name, x: (ndc.x * .5 + .5) * viewport.width, y: (-ndc.y * .5 + .5) * viewport.height,
      behind, inViewport, occluded, visible: inViewport && !occluded, world: world.toArray() };
  }).filter(Boolean);
}
function draw(now) {
  raf = null; if (disposed || !model || !rig || !art) return;
  inFrame = true; drawAgain = false; const delta = Math.min(.05, priorTime ? (now - priorTime) / 1000 : 1 / 60); priorTime = now;
  const changed = store.tick(delta), frame = store.frame(viewport);
  model.applyPose(frame.pose); model.root.updateWorldMatrix(true, true); lookdev.applyFrame(frame);
  const cameraChanged = rig.update(delta);
  if (store.state.mode === 'entrance' && !rig.getSnapshot().transition) store.entranceComplete();
  camera.updateMatrixWorld();
  if (renderer) { renderer.render(scene, camera); Object.assign(info, { triangles: renderer.info.render.triangles, calls: renderer.info.render.calls,
    textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries }); }
  info.frames = ++frameCount;
  const view = { viewport: { ...viewport }, labels: projectLabels(art.getLabelIds(frame)), renderer: { ...info },
    cameraTransition: cameraChanged ? rig.getSnapshot().transition ?? null : null };
  art.render(frame, view); lastFrame = frame; lastView = view;
  document.querySelector('#fallback-current').textContent = `${frame.title}；当前系统：${SYSTEMS[frame.scope.systemId] ?? '整机'}。`;
  configureControls();
  inFrame = false;
  if (changed || cameraChanged || drawAgain || store.state.transition) invalidate();
}
function destroy() {
  if (disposed) return; disposed = true; abort.abort(); if (raf !== null) cancelAnimationFrame(raf);
  input?.dispose(); observer.disconnect(); preferences.removeEventListener('change', preferenceChanged);
  controls?.dispose(); art?.dispose(); rig?.dispose(); model?.dispose(); lookdev?.dispose();
  renderer?.renderLists.dispose(); renderer?.dispose(); document.documentElement.style.overflowY = '';
}
const observer = new ResizeObserver(updateViewport); observer.observe(canvas);
const preferenceChanged = e => actions.setReducedMotion(e.matches); preferences.addEventListener('change', preferenceChanged);
retry.addEventListener('click', () => { const next = new URL(location.href); next.searchParams.delete('check'); location.replace(next); });
addEventListener('pagehide', destroy, { once: true });
async function loadStylesheet() {
  const href = getStylesheet(profile);
  if (!href) return;
  const style = document.createElement('link');
  style.id = 'exhibition-style'; style.rel = 'stylesheet'; style.href = href;
  await new Promise((resolve, reject) => {
    style.onload = resolve;
    style.onerror = () => reject(new Error('展览样式加载失败，请重新加载。'));
    document.head.append(style);
  });
  document.querySelector('#engineering-style').disabled = true;
  document.body.dataset.art = 'registered';
}
try {
  await loadStylesheet();
  if (params.get('renderer') !== 'static') {
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; info.status = 'webgl'; }
    catch { info.status = 'static'; }
  } else info.status = 'static';
  if (info.status === 'static') { canvas.style.visibility = 'hidden'; fallback.hidden = false; }
  updateViewport();
  controls = new OrbitControls(camera, canvas); controls.enabled = false; controls.enableDamping = false; controls.enablePan = false;
  controls.addEventListener('change', invalidate); controls.addEventListener('start', () => { rig?.cancelTransition(); store.stopTransition(); invalidate(); });
  progress.value = 1; message.textContent = '正在载入飞机与场景…';
  modules = await loadModules(profile);
  if (params.get('check') === 'load-failure') throw new Error('工程验收：模拟模型加载失败');
  lookdev = modules.lookdev.createLookdev({ renderer, scene, quality: 'balanced' });
  model = await modules.model.createAircraft({ assetRoot: new URL('../../assets/', import.meta.url).href, materials: lookdev.materials, quality: 'balanced', signal: abort.signal });
  abort.signal.throwIfAborted(); validateModel(model); scene.add(model.root); progress.value = 2; message.textContent = '正在连接操作与标签…';
  const expanded = emptyPose(); expanded.assembly = 1; model.applyPose(expanded);
  rig = modules.camera.createCameraRig({ camera, controls, model, viewport });
  rig.setOverview({ reducedMotion: true }); model.applyPose(store.state.pose);
  art = modules.art.createArtLayer({ mount, actions, model, viewport });
  input = bindInput({ canvas, actions, store, pick, invalidate, beginCameraDrag: () => { rig.cancelTransition(); store.stopTransition(); } });
  // CSS and canvas size are already ready. Refitting here would replace the
  // expanded opening camera with a fit of the temporarily closed model.
  art.resize(viewport); store.ready(info.status); progress.value = 3; loading.hidden = true;
  configureControls(); invalidate();
} catch (error) {
  store.fail(error.message); message.textContent = `加载失败：${error.message}`; retry.hidden = false;
  model?.dispose(); lookdev?.dispose(); info.status = 'failed';
}
if (inspect) {
  window.__FLIGHT_TEST__ = Object.freeze({ actions,
    read: () => ({ state: structuredClone(store.state), frame: structuredClone(lastFrame), view: structuredClone(lastView), camera: rig?.getSnapshot(),
      stats: { ...info }, resources: renderer ? { ...renderer.info.memory } : null, assetVersion: model?.assetVersion ?? null, motionVersion: model?.motionVersion ?? null, manifest: modules?.manifest, contractVersion: CONTRACT_VERSION, experienceVersion: EXPERIENCE_VERSION, userAgent: navigator.userAgent,
      canvas: { css: { ...viewport }, pixels: { width: canvas.width, height: canvas.height } },
      parts: model ? [...model.parts.values()].map(({ id, systemId, parentId, name, capabilities, sourceType }) => ({ id, systemId, parentId, name, capabilities, sourceType })) : [] }),
    destroy, project: id => projectLabels([id])[0],
  });
}
