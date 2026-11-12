import { clamp, emptyPose, CONTRACT_VERSION, EXPERIENCE_VERSION, SYSTEMS, OPENING_DURATION } from './contract.js';
function freezeData(value) { if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeData(child); Object.freeze(value); } return value; }
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
export function createStore({ reducedMotion = false } = {}) {
  const state = { mode: 'loading', ready: false, error: null, renderStatus: 'loading', reducedMotion, overlay: false,
    scope: { systemId: null, partId: null }, selectedId: null, pose: emptyPose(), transition: null, revision: 0 };
  const touch = () => { state.revision++; };
  const stop = () => { state.transition = null; };
  const clearFocus = () => { state.scope = { systemId: null, partId: null }; state.selectedId = null; state.pose.emphasis = { systemId: null, partId: null }; };
  const begin = (kind, target, duration) => {
    stop(); clearFocus();
    if (state.reducedMotion) state.pose = target;
    else state.transition = { kind, from: structuredClone(state.pose), target, duration, elapsed: 0 };
    touch();
  };
  return {
    state,
    ready(renderStatus = 'webgl') {
      Object.assign(state, { ready: true, mode: 'intro', renderStatus, error: null });
      stop(); touch();
    },
    enterExhibit() {
      if (!state.ready || state.mode !== 'intro') return false;
      if (state.reducedMotion) {
        state.mode = 'explore';
        const target = emptyPose(); target.assembly = 1; state.pose = target;
      } else state.mode = 'entrance';
      touch(); return true;
    },
    entranceComplete() {
      if (!state.ready || state.mode !== 'entrance') return false;
      state.mode = 'explore';
      const target = emptyPose(); target.assembly = 1;
      begin('opening', target, OPENING_DURATION);
      return true;
    },
    fail(message) { Object.assign(state, { ready: false, mode: 'loading', error: message, transition: null }); touch(); },
    focus(systemId, partId = null) { stop(); state.scope = { systemId, partId }; state.selectedId = partId; state.pose.emphasis = { systemId, partId }; touch(); },
    setDepth(systemId, value) { stop(); if (systemId === null) state.pose.assembly = clamp(value); else state.pose.systems[systemId] = clamp(value); touch(); },
    setControl(axis, value) { stop(); state.pose.controls[axis] = clamp(value, -1, 1); touch(); },
    setSection(section) { stop(); state.pose.section = structuredClone(section); touch(); },
    expand() { const target = emptyPose(); target.assembly = 1; begin('explode', target, OPENING_DURATION); },
    assemble() { begin('assemble', emptyPose(), .6); },
    stopTransition() { if (state.transition) { stop(); touch(); } },
    overlay(value) { state.overlay = value; if (value) stop(); touch(); },
    reduced(value) {
      state.reducedMotion = value;
      if (value && state.mode === 'entrance') {
        state.mode = 'explore';
        const target = emptyPose(); target.assembly = 1; state.pose = target;
        stop();
      } else if (value && state.transition) { state.pose = state.transition.target; stop(); }
      touch();
    },
    tick(delta) {
      if (!state.ready || state.overlay || !state.transition) return false;
      const t = state.transition; t.elapsed += delta;
      if (t.elapsed >= t.duration) { state.pose = t.target; stop(); touch(); return true; }
      const pose = structuredClone(t.from), ratio = t.elapsed / t.duration;
      if (t.kind === 'assemble') {
        for (const axis of Object.keys(pose.controls)) pose.controls[axis] *= 1 - ease(ratio / .2);
        if (ratio >= .2) pose.section = null;
        for (const id of Object.keys(pose.systems)) pose.systems[id] *= 1 - ease((ratio - .2) / .3);
        pose.assembly *= 1 - ease((ratio - .5) / .5);
      } else {
        const amount = ease(ratio);
        pose.assembly += (t.target.assembly - pose.assembly) * amount;
        for (const id of Object.keys(pose.systems)) pose.systems[id] *= 1 - amount;
        for (const axis of Object.keys(pose.controls)) pose.controls[axis] *= 1 - amount;
        pose.section = null;
      }
      state.pose = pose; touch(); return true;
    },
    frame(viewport) {
      const s = structuredClone(state);
      return freezeData({ contractVersion: CONTRACT_VERSION, experienceVersion: EXPERIENCE_VERSION, revision: s.revision,
        mode: s.mode, ready: s.ready, renderStatus: s.renderStatus, error: s.error, reducedMotion: s.reducedMotion,
        overlay: s.overlay, scope: s.scope, selectedId: s.selectedId, pose: s.pose, transition: s.transition?.kind ?? null,
        title: s.transition?.kind === 'assemble' ? '复原整机' : s.scope.systemId ? `${SYSTEMS[s.scope.systemId]} · 自由探索` : '自由探索整架飞机', viewport: { ...viewport } });
    },
  };
}
