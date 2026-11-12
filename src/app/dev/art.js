import { PARTS, SYSTEMS, NAVIGATION } from '../../state/contract.js';
export function createArtLayer({ mount, actions, model }) {
  mount.innerHTML = `
    <header class="engineering-heading"><p class="eyebrow">自由探索 / 交互预览</p><h1>解构飞行</h1><p id="chapter-title">自由探索整架飞机</p><p class="fixture">全机占位 · 非最终模型与视觉</p></header>
    <section id="controls" class="engineering-controls" aria-label="工程操作区" tabindex="-1">
      <fieldset id="operation-fieldset" disabled><legend>操作</legend>
      <div class="row"><button id="reset-view">重置视角</button><button id="sources">资料</button></div>
      <nav id="systems" aria-label="系统目录">${NAVIGATION.map(([id, name]) => `<button data-system="${id}">${name}</button>`).join('')}</nav>
      <div id="explore-tools">
        <label for="part">部件</label><select id="part"><option value="">选择部件</option>${PARTS.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
        <label for="assembly">全机展开 <output id="assembly-value">0%</output></label><input id="assembly" type="range" min="0" max="100" step="1" value="0">
        <div id="system-depth-wrap" hidden><label for="system-depth">系统深入 <output id="system-depth-value">0%</output></label><input id="system-depth" type="range" min="0" max="100" step="1" value="0"></div>
        <div id="control-tools" hidden>${[['roll', '滚转'], ['pitch', '俯仰'], ['yaw', '偏航']].map(([id, name]) => `<label for="${id}">${name}示意</label><input id="${id}" type="range" min="-100" max="100" value="0">`).join('')}</div>
        <p id="section-status">当前部件未开放剖切。</p>
        <button id="whole">返回全机</button>
      </div>
      <div class="row"><button id="restore">整机复原</button><button id="expand">展开全机</button></div>
      <label class="check"><input id="reduced" type="checkbox">减少动效</label>
      <p class="hint">拖动旋转 · 滚轮缩放 · 点选部件 · Esc 返回全机</p>
      </fieldset>
    </section>
    <section class="engineering-detail" aria-live="polite"><h2 id="selection-name">整机</h2><p id="selection-description">通用外形工程占位，用于检查框架。</p><p id="stats"></p></section>
    <div id="labels" aria-label="当前部件标签"></div>
    <dialog id="source-dialog" aria-labelledby="source-heading"><h2 id="source-heading">资料与展示边界</h2><p>当前为工程占位，不含下载模型原件，不代表C919真实内部结构。全部七系统元数据保留，正式模型和静态输出图待后续交付。</p><p>坐标：+Y向上，-Z机头，+X机体右侧。首尾起落架放下、舵面中立；运动仅为简化展示。</p><div id="source-list"></div><button id="close-sources">关闭资料</button></dialog>`;
  const $ = id => mount.querySelector(`#${id}`), cleanups = [];
  const realModel = [...model.parts.values()].some(part => part.sourceType !== 'placeholder');
  if (realModel) {
    mount.querySelector('.fixture').textContent = '模型评审 · 镜头与界面为工程占位';
    mount.querySelector('#source-dialog p').textContent = '当前接入C919外形模型与补建的典型内部结构，不代表真实制造参数。模型仍处于评审，正式镜头、艺术层和静态输出图待交付。';
  }
  const on = (id, type, callback) => { $(id).addEventListener(type, callback); cleanups.push(() => $(id).removeEventListener(type, callback)); };
  on('sources', 'click', () => actions.setSourcesOpen(true)); on('close-sources', 'click', () => actions.setSourcesOpen(false));
  on('source-dialog', 'cancel', e => { e.preventDefault(); actions.setSourcesOpen(false); });
  on('part', 'change', e => e.target.value && actions.selectPart(e.target.value));
  on('assembly', 'input', e => actions.setAssembly(Number(e.target.value) / 100));
  on('system-depth', 'input', e => actions.setSystemDepth(last.scope.systemId, Number(e.target.value) / 100));
  for (const axis of ['roll', 'pitch', 'yaw']) on(axis, 'input', e => actions.setControl(axis, Number(e.target.value) / 100));
  on('whole', 'click', () => actions.returnToAircraft());
  on('restore', 'click', () => actions.restoreAircraft()); on('expand', 'click', () => actions.expandAircraft()); on('reset-view', 'click', () => actions.resetView());
  on('reduced', 'change', e => actions.setReducedMotion(e.target.checked));
  const nav = e => { const button = e.target.closest('[data-system]'); if (button) button.dataset.system === 'aircraft' ? actions.returnToAircraft() : actions.selectSystem(button.dataset.system); };
  $('systems').addEventListener('click', nav); cleanups.push(() => $('systems').removeEventListener('click', nav));
  const labels = new Map(); let last = null, priorFocus = null;
  return {
    getLabelIds(frame) {
      const id = frame.selectedId ?? frame.scope.partId;
      if (!id || id === 'aircraft') return [];
      const parent = model.parts.get(id)?.parentId;
      return [id, parent !== 'aircraft' ? parent : null, PARTS.find(p => p.parentId === id)?.id].filter(Boolean).slice(0, 3);
    },
    render(frame, view) {
      last = frame; const exploring = frame.mode === 'explore';
      $('operation-fieldset').disabled = !frame.ready; $('chapter-title').textContent = frame.title;
      $('explore-tools').hidden = !exploring;
      $('assembly').value = String(frame.pose.assembly * 100); $('assembly-value').textContent = `${Math.round(frame.pose.assembly * 100)}%`;
      const systemId = frame.scope.systemId; $('system-depth-wrap').hidden = !systemId || !model.systems.get(systemId)?.capabilities.expand;
      if (systemId) { $('system-depth').value = String(frame.pose.systems[systemId] * 100); $('system-depth-value').textContent = `${Math.round(frame.pose.systems[systemId] * 100)}%`; }
      $('control-tools').hidden = systemId !== 'flight-controls';
      for (const axis of ['roll', 'pitch', 'yaw']) $(axis).value = String(frame.pose.controls[axis] * 100);
      $('reduced').checked = frame.reducedMotion; $('part').value = frame.selectedId ?? '';
      const selectedId = frame.selectedId ?? frame.scope.partId ?? (systemId ? null : 'aircraft');
      const selected = model.parts.get(selectedId);
      $('selection-name').textContent = selected?.name ?? SYSTEMS[systemId] ?? '整机'; $('selection-description').textContent = selected?.description ?? '';
      $('section-status').textContent = selected?.capabilities.section ? '已批准样段可通过剖切动作操作。' : '当前部件未开放剖切。';
      $('stats').textContent = view.renderer ? `${view.renderer.triangles.toLocaleString()} 三角形 · ${view.renderer.calls} 次绘制 · ${view.renderer.status}` : '等待渲染';
      for (const button of $('systems').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.system === (systemId === 'cabin' ? 'fuselage' : systemId ?? 'aircraft')));
      if (frame.overlay && !$('source-dialog').open) { priorFocus = document.activeElement; $('source-list').textContent = `${PARTS.length}个语义节点；系统：${Object.values(SYSTEMS).join('、')}。来源类别：${[...new Set([...model.parts.values()].map(p => p.sourceType))].join('、')}。`; $('source-dialog').showModal(); }
      if (!frame.overlay && $('source-dialog').open) { $('source-dialog').close(); priorFocus?.focus(); }
      const active = new Set();
      for (const label of view.labels) {
        active.add(label.id); let node = labels.get(label.id);
        if (!node) { node = document.createElement('button'); node.className = 'part-label'; node.textContent = label.name; node.addEventListener('click', () => actions.selectPart(label.id)); $('labels').append(node); labels.set(label.id, node); }
        node.hidden = !label.visible; node.style.transform = `translate(${label.x}px,${label.y}px)`;
      }
      for (const [id, node] of labels) if (!active.has(id)) { node.remove(); labels.delete(id); }
    },
    resize() {},
    dispose() { for (const cleanup of cleanups) cleanup(); mount.replaceChildren(); },
  };
}
