// Formal exhibition art layer. Owns the three-screen introduction, the
// borderless interface and labels. Visitor guidance and sources live in the
// accompanying documents, outside the exhibition. Business state always
// comes from the host frame; the intro keeps only presentational step state and
// calls actions.enterExhibit() through the formal host interface.
import { SYSTEMS, NAVIGATION, PARTS } from '../state/contract.js';

const SYSTEM_TEXT = {
  fuselage: '蒙皮、环形框与纵向长桁，构成机身从表面到骨架的连续层次。',
  cabin: '地板、座椅与行李架，共同勾勒客舱内部的空间秩序。',
  wings: '蒙皮之下，前后梁贯穿翼展，翼肋与长桁交织成机翼的承载骨架。',
  tail: '垂直尾翼与水平尾翼在机身后方展开，方向舵与升降舵沿各自铰链偏转。',
  propulsion: '短舱包覆动力核心，挂架将动力单元连接至机翼。',
  'landing-gear': '前起落架与左右主起落架，共同构成飞机在地面的支撑。',
  'flight-controls': '副翼、升降舵与方向舵，分别对应滚转、俯仰与偏航。',
};
const OVERVIEW_TEXT = '从白色蒙皮到金属骨架，一架飞机的结构层层显现。';
// Exhibition copy only; model metadata and source records remain unchanged.
const PART_TEXT = {
  aircraft: OVERVIEW_TEXT,
  'fuselage.nose': '雷达罩、驾驶舱与前部蒙皮，共同塑造机头轮廓。',
  'fuselage.skin.front': '客舱窗与舱门沿前段机身分布，外表面延续机头的流线。',
  'fuselage.skin.mid': '连接前后机身，围合客舱中段，并与机翼根部相接。',
  'fuselage.skin.rear': '机身后段逐渐收束，向尾锥与尾翼过渡。',
  'fuselage.frames': '环形框沿机身排列，与纵向长桁共同支撑机身截面。',
  'fuselage.stringers': '沿机身纵向延伸，与环形框相交，支撑连续的蒙皮。',
  'cabin.floor': '地板将客舱空间与机身下部结构分开，纵向梁延续其下的承载关系。',
  'cabin.interior': '两侧座椅、中央过道与上方行李架，形成客舱的空间节奏。',
  'tail.vertical': '竖立于机尾，后缘连接方向舵。',
  'tail.vertical.rudder': '沿垂直尾翼后缘布置，绕铰链向两侧偏转。',
};
for (const [side, name] of [['left', '左'], ['right', '右']]) {
  Object.assign(PART_TEXT, {
    [`wing.${side}`]: `${name}侧主翼由上下蒙皮、翼梁、翼肋、长桁与副翼组成。`,
    [`wing.${side}.skin.upper`]: '上表面覆盖翼盒，随翼展逐渐收尖，并向翼尖过渡。',
    [`wing.${side}.skin.lower`]: '与上蒙皮围合翼内空间，呈现翼盒下方的轮廓。',
    [`wing.${side}.spar.front`]: '沿翼展延伸的前部翼梁，与后梁共同构成翼盒的纵向骨架。',
    [`wing.${side}.spar.rear`]: '位于翼盒后部，连接翼肋并延续至外翼。',
    [`wing.${side}.ribs`]: '翼肋横向连接前后梁，维持机翼截面并支撑蒙皮。',
    [`wing.${side}.stringers`]: '沿翼面纵向排列，将连续蒙皮与内部骨架联系起来。',
    [`wing.${side}.aileron`]: '位于机翼外侧后缘，左右副翼的差动偏转对应飞机滚转。',
    [`tail.horizontal.${side}`]: `${name}侧水平尾翼从机尾向外延伸，后缘连接升降舵。`,
    [`tail.horizontal.${side}.elevator`]: '沿水平尾翼后缘偏转，对应飞机的俯仰姿态。',
    [`engine.${side}.nacelle`]: '短舱外壳围合动力单元，前缘进气唇口形成连续曲面。',
    [`engine.${side}.core`]: '沿轴线展开风扇、压气机与涡轮的层次。',
    [`engine.${side}.pylon`]: '连接机翼与短舱，构成动力单元的悬挂支点。',
    [`gear.main.${side}`]: `${name}侧主起落架位于机翼根部下方，与前起落架共同支撑机体。`,
    [`gear.main.${side}.doors`]: '舱门围合起落架舱口，与支撑组件形成内外层次。',
  });
}
PART_TEXT['gear.nose'] = '位于机头下方，与左右主起落架共同形成地面支撑。';
PART_TEXT['gear.nose.doors'] = '围绕前起落架舱口展开，延续机身下表面的轮廓。';
const partName = part => part?.name?.replace('动力内部示意', '发动机内部') ?? '';
const REPS = {
  fuselage: ['fuselage.nose', 'fuselage.frames'],
  cabin: ['cabin.floor', 'cabin.interior'],
  wings: ['wing.left', 'wing.right'],
  tail: ['tail.vertical', 'tail.horizontal.right'],
  propulsion: ['engine.left.nacelle', 'engine.right.nacelle'],
  'landing-gear': ['gear.nose', 'gear.main.right'],
  'flight-controls': ['wing.left.aileron', 'tail.vertical.rudder'],
};
const AXES = [['roll', '滚转'], ['pitch', '俯仰'], ['yaw', '偏航']];
const INTRO = [
  { title: '八十年前，中国的天空还没有一架自己制造的喷气式飞机。', image: 'assets/intro/shenyang-j5.webp' },
  { title: '从沈阳的第一架喷气战机，到上海的总装厂房，\n几代航空人把图纸托上天空。', image: 'assets/intro/leap-1c.webp' },
  { title: '如今，我们叫它 C919。', image: 'assets/intro/c919-first-flight.webp' },
];
const INTRO_TEXT_MS = 1400;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const pct = value => `${Math.round(clamp(value, 0, 1) * 100)}%`;
const signed = value => {
  const n = Math.round(clamp(value, -1, 1) * 100);
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
};

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function rangeBlock({ id, label, output, centered, ends }) {
  const wrap = node('div', `exh-range${centered ? ' is-centered' : ''}`);
  const head = node('div', 'exh-range-head');
  const name = node('label', null, label);
  name.htmlFor = id;
  const readout = node('output', 'exh-range-output', '0%');
  readout.id = output;
  readout.setAttribute('for', id);
  head.append(name, readout);
  wrap.append(head);
  const body = node('div', 'exh-range-body');
  if (ends) body.append(node('span', 'exh-range-end', ends[0]));
  const track = node('div', 'exh-range-track');
  const input = document.createElement('input');
  input.type = 'range'; input.id = id; input.min = '0'; input.max = '100'; input.step = '1'; input.value = '0';
  track.append(input);
  body.append(track);
  if (ends) body.append(node('span', 'exh-range-end', ends[1]));
  wrap.append(body);
  if (centered) {
    const ticks = node('div', 'exh-range-ticks');
    ticks.append(node('span', null, '负向 −100'), node('span', null, '中立 0'), node('span', null, '正向 +100'));
    wrap.append(ticks);
  }
  return { wrap, input, readout };
}

export function createArtLayer({ mount, actions, model, viewport }) {
  if (!mount || !model || !actions) throw new Error('正式界面缺少挂载点、模型或操作接口');
  const root = node('div', 'exh');
  root.dataset.intro = 'pending';
  root.dataset.drawer = 'closed';
  root.innerHTML = `
    <div class="exh-ui">
      <header class="exh-title exh-reveal" style="--reveal-order:0">
        <h1>解构飞行</h1>
        <p>看见C919的骨架</p>
      </header>
      <div class="exh-tools exh-reveal" style="--reveal-order:1">
        <div class="exh-parts">
          <button id="parts-toggle" type="button" class="exh-parts-visual" aria-haspopup="dialog" aria-expanded="false" aria-controls="parts-dialog">
            <svg class="exh-parts-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round">
              <path d="M9 2.2 15.1 5.4 9 8.6 2.9 5.4 9 2.2Z"/>
              <path d="m2.9 9 6.1 3.2L15.1 9"/>
              <path d="m2.9 12.6 6.1 3.2 6.1-3.2"/>
            </svg>
            <span class="exh-parts-label">全部零件</span>
            <span class="exh-parts-count">43</span>
            <svg class="exh-parts-arrow" viewBox="0 0 12 12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="m3 4.5 3 3 3-3"/></svg>
          </button>
          <select id="part" aria-label="全部零件" tabindex="-1" aria-hidden="true"></select>
          <dialog id="parts-dialog" class="exh-parts-dialog" aria-labelledby="parts-heading">
            <div class="exh-parts-sheet">
              <header class="exh-parts-head">
                <div>
                  <h2 id="parts-heading" class="exh-parts-heading">全部零件</h2>
                </div>
                <button id="parts-close" type="button" class="exh-parts-close" aria-label="关闭全部零件">关闭<span aria-hidden="true">✕</span></button>
              </header>
              <label class="exh-parts-searchbox" for="parts-search">
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="7" cy="7" r="4.1"/><path d="m10.1 10.1 3.1 3.1"/></svg>
                <span class="exh-parts-search-label">搜索零件或系统</span>
                <input id="parts-search" type="search" autocomplete="off" spellcheck="false" placeholder="搜索零件或系统" aria-label="搜索零件或系统" aria-controls="parts-list">
              </label>
              <div class="exh-parts-scroll">
                <div id="parts-list" class="exh-parts-list" role="listbox" aria-label="全部零件"></div>
                <p id="parts-empty" class="exh-parts-empty" role="status" hidden>没有匹配的零件</p>
              </div>
            </div>
          </dialog>
        </div>
      </div>
      <div id="labels" class="exh-labels" aria-label="结构标签"></div>
      <div id="assembly-wrap" class="exh-lever exh-reveal" style="--reveal-order:2">
        <span class="exh-lever-name">解构</span>
        <div class="exh-lever-track">
          <span class="exh-lever-rail" aria-hidden="true"></span>
          <span class="exh-lever-grip" aria-hidden="true"></span>
          <input id="assembly" type="range" min="0" max="100" step="1" value="0" aria-label="整机解构" orient="vertical">
        </div>
        <output id="assembly-value" class="exh-lever-output" for="assembly">0%</output>
      </div>
      <div class="exh-flow">
        <aside id="drawer" class="exh-panel" aria-label="部件与说明" hidden>
          <p id="selection-kind" class="exh-kicker"></p>
          <h2 id="selection-name"></h2>
          <p id="selection-description" class="exh-description"></p>
          <dl id="selection-facts" class="exh-facts"></dl>
          <p class="exh-panel-links">
            <button id="cabin-view" type="button" class="exh-text-link" hidden>客舱视图</button>
          </p>
          <div id="system-depth-wrap" class="exh-capability" hidden></div>
          <div id="control-tools" class="exh-capability" hidden></div>
          <details id="debug-details" class="exh-debug"><summary>调试信息</summary><p id="stats"></p></details>
        </aside>
        <footer id="controls" class="exh-bottom exh-reveal" style="--reveal-order:3" tabindex="-1" aria-label="操作与导航">
          <nav id="systems" class="exh-nav" aria-label="选择系统"></nav>
          <div class="exh-actions">
            <button id="whole" type="button" class="exh-text-button" hidden>返回全机</button>
            <button id="restore" type="button" class="exh-text-button">复原</button>
            <button id="expand" type="button" class="exh-text-button">展开</button>
            <button id="reset-view" type="button" class="exh-text-button">重置视角</button>
            <button id="stop" type="button" class="exh-text-button" hidden>停止</button>
          </div>
        </footer>
      </div>
      <button id="drawer-collapse" type="button" hidden>收起</button>
      <button id="drawer-toggle" type="button" hidden>部件与说明</button>
    </div>
    <section id="intro" class="exh-intro" aria-label="中国航空历史入场" tabindex="0" hidden>
      <div class="exh-intro-scenes" aria-hidden="true">
        ${INTRO.map((screen, index) => `<figure class="exh-intro-scene${index === 0 ? ' is-active' : ''}"><img src="${screen.image}" alt="" draggable="false"></figure>`).join('')}
      </div>
      <div class="exh-intro-shade" aria-hidden="true"></div>
      <div class="exh-intro-panel" aria-live="polite">
        <h2 id="intro-title" class="exh-intro-title"></h2>
        <button id="intro-next" type="button" class="exh-intro-button" hidden>进入</button>
      </div>
    </section>
    <div id="feedback" class="exh-toast" role="status" hidden></div>`;
  mount.append(root);

  const $ = id => root.querySelector(`#${id}`);
  const systems = $('systems'), drawer = $('drawer'), partSelect = $('part');
  const partsToggle = $('parts-toggle'), partsList = $('parts-list');
  const partsDialog = $('parts-dialog'), partsSearch = $('parts-search');
  const partsEmpty = $('parts-empty'), partsClose = $('parts-close');
  const labelsLayer = $('labels'), intro = $('intro');
  const introPanel = intro.querySelector('.exh-intro-panel');
  const svgNS = 'http://www.w3.org/2000/svg';
  const leaderSvg = document.createElementNS(svgNS, 'svg');
  leaderSvg.setAttribute('class', 'exh-leaders');
  leaderSvg.setAttribute('aria-hidden', 'true');
  labelsLayer.append(leaderSvg);
  const labelEls = new Map();
  const controls = new AbortController();
  const { signal } = controls;
  const narrowQuery = window.matchMedia('(max-width: 900px)');
  const timers = new Set();
  const later = (fn, delay) => {
    const timer = window.setTimeout(() => { timers.delete(timer); fn(); }, delay);
    timers.add(timer);
    return timer;
  };

  const groups = new Map();
  const aircraftOption = node('option', null, '整机 · 43个节点');
  aircraftOption.value = '';
  partSelect.append(aircraftOption);
  for (const systemId of Object.keys(SYSTEMS)) {
    const group = node('optgroup');
    group.label = SYSTEMS[systemId];
    groups.set(systemId, group);
    partSelect.append(group);
  }
  for (const part of PARTS) {
    const { id, systemId } = part;
    if (!systemId) continue;
    const option = node('option', null, partName(part));
    option.value = id;
    groups.get(systemId)?.append(option);
  }

  // The visible catalogue lives in a native modal dialog, so it paints in the
  // browser top layer above the description, lever and model. The transparent
  // native select above the button remains the compatibility/test hook and
  // shares this same option list.
  const partChoices = new Map();
  const groupHeadings = [];
  // The visible names are precise engineering terms ("左翼上蒙皮", "前梁"),
  // while visitors search with everyday words ("机翼", "发动机"). These aliases
  // only widen search; they never rename a node or add a second part dataset.
  const SYSTEM_ALIASES = {
    fuselage: '机身 机体 结构 蒙皮 框架 长桁 机头 fuselage skin frame stringer',
    cabin: '客舱 座舱 内饰 座椅 地板 cabin interior floor seat',
    wings: '机翼 主翼 翼面 翼展 蒙皮 梁 翼肋 wing wings',
    tail: '尾翼 平尾 垂尾 水平尾翼 垂直尾翼 tail',
    propulsion: '动力 发动机 引擎 短舱 吊挂 推进 propulsion engine nacelle pylon',
    'landing-gear': '起落架 起落 轮 舱门 刹车 gear landing wheel',
    'flight-controls': '舵面 操纵面 飞控 机翼 尾翼 副翼 升降舵 方向舵 control aileron rudder elevator',
  };
  const addPartChoice = (id, label, keywords) => {
    const row = node('button', 'exh-parts-option');
    row.type = 'button';
    row.dataset.partId = id;
    row.dataset.keywords = `${label} ${keywords ?? ''}`.toLowerCase();
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', 'false');
    row.tabIndex = -1;
    row.append(node('span', 'exh-parts-option-label', label));
    row.append(node('span', 'exh-parts-option-meta'));
    row.addEventListener('click', () => choosePart(id, { focus: true }), { signal });
    partChoices.set(id, row);
    return row;
  };
  partsList.append(addPartChoice('', '整机', '总览 全部 飞机 overview aircraft 43个节点'));
  for (const [systemIndex, systemId] of Object.keys(SYSTEMS).entries()) {
    const systemParts = PARTS.filter(part => part.systemId === systemId);
    const heading = node('div', 'exh-parts-group');
    heading.setAttribute('role', 'presentation');
    heading.append(
      node('span', 'exh-parts-group-name', `${String(systemIndex + 1).padStart(2, '0')} ${SYSTEMS[systemId]}`),
      node('span', 'exh-parts-group-count', `${systemParts.length}`),
    );
    groupHeadings.push(heading);
    partsList.append(heading);
    const aliases = SYSTEM_ALIASES[systemId] ?? '';
    for (const part of systemParts) partsList.append(addPartChoice(part.id, partName(part), `${SYSTEMS[systemId]} ${aliases} ${part.id}`));
  }
  let menuSelection = null;
  let stopLingerTimer = 0, stopWasActive = false;

  function syncPartsMenu(selectedId) {
    const next = selectedId ?? '';
    if (next === menuSelection) return;
    menuSelection = next;
    partSelect.value = next;
    for (const [id, row] of partChoices) {
      const on = id === next;
      row.setAttribute('aria-selected', on ? 'true' : 'false');
      row.classList.toggle('is-current', on);
    }
  }

  function visibleChoices() {
    return [...partChoices.values()].filter(row => !row.hidden);
  }

  function filterParts(query) {
    const text = query.trim().toLowerCase();
    let count = 0;
    for (const row of partChoices.values()) {
      const shown = !text || row.dataset.keywords.includes(text);
      row.hidden = !shown;
      if (shown) count += 1;
    }
    for (const heading of groupHeadings) {
      let sibling = heading.nextElementSibling, shown = false;
      while (sibling && !sibling.classList.contains('exh-parts-group')) {
        if (sibling.classList.contains('exh-parts-option') && !sibling.hidden) { shown = true; break; }
        sibling = sibling.nextElementSibling;
      }
      heading.hidden = !shown;
    }
    partsEmpty.hidden = count > 0;
    partsList.setAttribute('aria-label', text ? `搜索结果，${count}项` : '全部零件');
    const active = document.activeElement?.closest?.('.exh-parts-option');
    const focusable = active && partChoices.get(active.dataset.partId) === active && !active.hidden
      ? active
      : visibleChoices()[0];
    for (const option of partChoices.values()) option.tabIndex = -1;
    if (focusable) focusable.tabIndex = 0;
  }

  function focusPartChoice(row) {
    if (!row || row.hidden) return;
    for (const option of partChoices.values()) option.tabIndex = -1;
    row.tabIndex = 0;
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest' });
  }

  function openPartsMenu() {
    if (partsDialog.open) return;
    partsSearch.value = '';
    filterParts('');
    partsToggle.setAttribute('aria-expanded', 'true');
    partsDialog.showModal();
    const current = partChoices.get(partSelect.value) ?? partChoices.get('');
    for (const option of partChoices.values()) option.tabIndex = -1;
    if (current) current.tabIndex = 0;
    partsSearch.focus({ preventScroll: true });
    // Keep the current semantic node in view without scrolling the page. The
    // search box stays focused so the palette is immediately typeable.
    if (current) later(() => {
      if (partsDialog.open) current.scrollIntoView({ block: 'center' });
    }, 0);
  }

  function closePartsMenu({ focus = false } = {}) {
    if (partsDialog.open) partsDialog.close();
    partsSearch.value = '';
    filterParts('');
    partsToggle.setAttribute('aria-expanded', 'false');
    if (focus) partsToggle.focus({ preventScroll: true });
  }

  function choosePart(id, { focus = false } = {}) {
    if (id) action('selectPart', id);
    else action('returnToAircraft');
    closePartsMenu({ focus });
  }
  const assembly = $('assembly'), assemblyReadout = $('assembly-value');
  const depth = rangeBlock({ id: 'system-depth', label: '系统深入', output: 'system-depth-value', ends: ['装配 0%', '深入 100%'] });
  $('system-depth-wrap').append(depth.wrap);
  const controlParts = [];
  const controlHead = node('div', 'exh-subhead');
  controlHead.append(node('span', null, '舵面'));
  const neutral = node('button', 'exh-text-link', '舵面中立');
  neutral.type = 'button'; neutral.id = 'controls-neutral';
  controlHead.append(neutral);
  $('control-tools').append(controlHead);
  const axisRanges = {};
  for (const [axis, name] of AXES) {
    const block = rangeBlock({ id: axis, label: name, output: `${axis}-value`, centered: true });
    axisRanges[axis] = block;
    $('control-tools').append(block.wrap);
    controlParts.push(block);
  }

  let lastFrame = null, lastView = lastViewport(viewport, null);
  let scopeKey = '', panelToken = 0;
  let introState = 'pending', introStep = 0, introBusy = false, sawEntrance = false;
  let introMotionToken = 0;
  let toastTimer = 0;
  const codePointLength = value => [...String(value)].length;

  function lastViewport(next, previous) {
    return next ? { ...next } : previous ?? { width: window.innerWidth, height: window.innerHeight, left: 0, top: 0, dpr: 1 };
  }

  // Navigation entry for aircraft must call returnToAircraft, not selectSystem.
  for (const [entryId, label] of NAVIGATION) {
    const button = node('button', 'exh-nav-button', label);
    button.type = 'button';
    button.dataset.system = entryId;
    button.setAttribute('aria-pressed', 'false');
    systems.append(button);
  }

  const showToast = text => {
    const toast = $('feedback');
    toast.textContent = text;
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 1800);
  };

  const action = (name, ...args) => {
    const fn = actions?.[name];
    if (typeof fn !== 'function') return null;
    return fn(...args);
  };

  // ---- Three historical scenes ---------------------------------------------------
  function introCopy(step) {
    introStep = step;
    const screen = INTRO[step] ?? INTRO[INTRO.length - 1];
    const last = step === INTRO.length - 1;
    $('intro-title').textContent = screen.title;
    const reduced = Boolean(lastFrame?.reducedMotion);
    const next = $('intro-next');
    next.hidden = !last;
    next.disabled = false;
    introBusy = false;
    intro.dataset.step = String(step);
    intro.setAttribute('aria-label', last ? '中国航空历史入场' : '中国航空历史入场，继续');
    intro.querySelectorAll('.exh-intro-scene').forEach((scene, index) => scene.classList.toggle('is-active', index === step));
    introPanel.classList.remove('is-leaving', 'is-entering');
    if (!reduced) {
      // Restart the entrance even when two clicks arrive in the same frame.
      void introPanel.offsetWidth;
      introPanel.classList.add('is-entering');
      const token = ++introMotionToken;
      later(() => {
        if (token === introMotionToken) introPanel.classList.remove('is-entering');
      }, INTRO_TEXT_MS + 60);
    }
  }

  function showIntro() {
    intro.hidden = false;
    introState = 'showing';
    root.dataset.intro = 'show';
    introCopy(0);
  }

  function markRevealShown() {
    for (const el of root.querySelectorAll('.exh-reveal')) el.classList.add('is-shown');
  }

  function revealNow() {
    root.dataset.intro = 'done';
    introState = 'done';
    for (const el of root.querySelectorAll('.exh-reveal')) el.classList.add('is-in');
    markRevealShown();
  }

  function beginReveal() {
    if (introState !== 'entering') return;
    if (lastFrame?.reducedMotion) { revealNow(); return; }
    root.dataset.intro = 'reveal';
    introState = 'reveal';
    for (const el of root.querySelectorAll('.exh-reveal')) el.classList.add('is-in');
    later(() => {
      if (introState !== 'reveal') return;
      root.dataset.intro = 'done';
      introState = 'done';
      markRevealShown();
    }, 460);
  }

  function finishIntro() {
    if (introBusy || introState !== 'showing') return;
    introBusy = true; $('intro-next').disabled = true;
    const enter = () => {
      const result = action('enterExhibit');
      if (!result || result.ok === false) {
        introPanel.classList.remove('is-leaving');
        introCopy(INTRO.length - 1);
        showToast(result?.message ?? '入场接口尚未接通');
        return;
      }
      intro.hidden = true;
      root.dataset.intro = 'entering';
      introState = 'entering';
      sawEntrance = false;
      if (lastFrame?.reducedMotion) revealNow();
    };
    if (lastFrame?.reducedMotion) enter();
    else { introPanel.classList.add('is-leaving'); later(enter, 140); }
  }

  $('intro-next').addEventListener('click', finishIntro, { signal });
  intro.addEventListener('click', event => {
    if (event.target.closest('button') || introBusy || introState !== 'showing') return;
    if (introStep < INTRO.length - 1) introCopy(introStep + 1);
  }, { signal });
  intro.addEventListener('keydown', event => {
    if (event.target !== intro || !['Enter', ' '].includes(event.key) || introBusy || introState !== 'showing') return;
    event.preventDefault();
    if (introStep < INTRO.length - 1) introCopy(introStep + 1);
    else finishIntro();
  }, { signal });

  // ---- Host actions --------------------------------------------------------------
  root.addEventListener('click', event => {
    const nav = event.target.closest('#systems button');
    if (nav) {
      const id = nav.dataset.system;
      if (id === 'aircraft') action('returnToAircraft');
      else action('selectSystem', id);
      return;
    }
    const labelButton = event.target.closest('.part-label');
    if (labelButton) action('selectPart', labelButton.dataset.partId);
  }, { signal });

  $('whole').addEventListener('click', () => action('returnToAircraft'), { signal });
  $('reset-view').addEventListener('click', () => action('resetView'), { signal });
  $('restore').addEventListener('click', () => action('restoreAircraft'), { signal });
  $('expand').addEventListener('click', () => action('expandAircraft'), { signal });
  $('stop').addEventListener('click', () => action('stopTransition'), { signal });
  $('cabin-view').addEventListener('click', () => action('selectSystem', 'cabin'), { signal });

  partsToggle.addEventListener('click', () => {
    if (partsDialog.open) closePartsMenu({ focus: true });
    else openPartsMenu();
  }, { signal });
  partsToggle.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openPartsMenu();
    }
  }, { signal });
  partsSearch.addEventListener('input', () => filterParts(partsSearch.value), { signal });
  partsSearch.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closePartsMenu({ focus: true }); return; }
    const order = visibleChoices();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!order.length) return;
      event.preventDefault();
      const current = partChoices.get(partSelect.value);
      if (event.key === 'ArrowUp') focusPartChoice(order.at(-1));
      else focusPartChoice(current && !current.hidden ? current : order[0]);
    } else if (event.key === 'Enter') {
      if (!order.length) return;
      event.preventDefault();
      const current = partChoices.get(partSelect.value);
      (current && !current.hidden ? current : order[0]).click();
    }
  }, { signal });
  partsList.addEventListener('keydown', event => {
    const order = visibleChoices();
    const index = order.indexOf(document.activeElement);
    let next = null;
    if (event.key === 'Escape') { event.preventDefault(); closePartsMenu({ focus: true }); return; }
    if (event.key === 'ArrowDown') next = order[Math.min(order.length - 1, index + 1)];
    else if (event.key === 'ArrowUp') next = order[Math.max(0, index - 1)];
    else if (event.key === 'Home') next = order[0];
    else if (event.key === 'End') next = order[order.length - 1];
    if (next) { event.preventDefault(); focusPartChoice(next); }
  }, { signal });
  partsClose.addEventListener('click', () => closePartsMenu({ focus: true }), { signal });
  partsDialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      closePartsMenu({ focus: true });
    } else if (event.key === 'Tab') {
      const focusable = [partsClose, partsSearch, ...visibleChoices().filter(row => row.tabIndex === 0)];
      const index = focusable.indexOf(document.activeElement);
      const next = event.shiftKey ? (index - 1 + focusable.length) % focusable.length : (index + 1) % focusable.length;
      event.preventDefault();
      focusable[next].focus({ preventScroll: true });
    }
  }, { signal });
  partsDialog.addEventListener('click', event => {
    if (event.target === partsDialog) closePartsMenu({ focus: true });
  }, { signal });
  // The search field is focused on open, and Chrome consumes Escape inside a
  // search input before the dialog can cancel itself. Handle Escape there as
  // well, and keep cancel as the fallback for every other focus position.
  partsDialog.addEventListener('cancel', event => {
    event.preventDefault();
    closePartsMenu({ focus: true });
  }, { signal });
  // Native showModal() restores focus on close. If the browser lands on the
  // body or the hidden compatibility select, put focus back on the entry.
  partsDialog.addEventListener('close', () => {
    partsToggle.setAttribute('aria-expanded', 'false');
    if (document.activeElement === document.body || document.activeElement === partSelect) {
      partsToggle.focus({ preventScroll: true });
    }
  }, { signal });

  // The native select stays in sync as the compatibility/test hook. It sits
  // above the pill only in geometry; pointer input belongs to the painted
  // button so the browser can never open an unstyled OS picker on top of the
  // catalogue.
  // The transparent native select owns the right edge as a 44px target. Cancel
  // its press so the OS picker cannot paint over the designed catalogue, then
  // use the resulting click to open the top-layer dialog.
  partSelect.addEventListener('pointerdown', event => event.preventDefault(), { signal });
  partSelect.addEventListener('click', event => { event.preventDefault(); openPartsMenu(); }, { signal });
  partSelect.addEventListener('change', () => choosePart(partSelect.value), { signal });

  const applyRange = (block, value, centered) => {
    const p = Math.round(clamp(value, 0, 1) * 100);
    block.input.value = String(p);
    block.input.style.setProperty('--lo', centered ? `${Math.min(p, 50)}%` : '0%');
    block.input.style.setProperty('--hi', centered ? `${Math.max(p, 50)}%` : `${p}%`);
    block.input.style.setProperty('--mid', '50%');
  };
  const applyAssembly = value => {
    const p = Math.round(clamp(value, 0, 1) * 100);
    assembly.value = String(p);
    $('assembly-wrap').style.setProperty('--assembly', String(p / 100));
    assemblyReadout.textContent = `${p}%`;
  };
  const beginManual = fn => { action('stopTransition'); fn(); };

  assembly.addEventListener('input', () => {
    beginManual(() => action('setAssembly', Number(assembly.value) / 100));
  }, { signal });
  depth.input.addEventListener('input', () => {
    const systemId = lastFrame?.scope.systemId;
    if (!systemId) return;
    beginManual(() => action('setSystemDepth', systemId, Number(depth.input.value) / 100));
  }, { signal });
  for (const [axis] of AXES) {
    axisRanges[axis].input.addEventListener('input', () => {
      const raw = Number(axisRanges[axis].input.value);
      beginManual(() => action('setControl', axis, raw / 100 * 2 - 1));
    }, { signal });
  }
  neutral.addEventListener('click', () => {
    beginManual(() => { for (const [axis] of AXES) action('setControl', axis, 0); });
  }, { signal });
  root.addEventListener('keydown', event => {
    const range = event.target.closest?.('input[type=range]');
    if (!range) return;
    const step = Number(range.step) || 1;
    const min = Number(range.min), max = Number(range.max);
    let next = null;
    if (range.id === 'assembly') {
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = Number(range.value) + step;
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = Number(range.value) - step;
    }
    if (event.key === 'PageUp') next = Number(range.value) + (max - min) * .1;
    else if (event.key === 'PageDown') next = Number(range.value) - (max - min) * .1;
    else if (event.key === 'Home') next = min;
    else if (event.key === 'End') next = max;
    if (next == null) return;
    event.preventDefault();
    range.value = String(clamp(Math.round(next / step) * step, min, max));
    range.dispatchEvent(new Event('input', { bubbles: true }));
  }, { signal });

  // ---- Right-hand description ----------------------------------------------------
  function fillPanel(frame) {
    const selected = frame.selectedId ? model.parts.get(frame.selectedId) : null;
    const systemId = selected?.systemId ?? frame.scope.systemId;
    const system = systemId ? model.systems.get(systemId) : null;
    const name = selected ? partName(selected) : (systemId ? (SYSTEMS[systemId] ?? system?.name ?? systemId) : '整机');
    $('selection-name').textContent = name;
    $('selection-kind').textContent = selected ? '部件' : systemId ? (systemId === 'cabin' ? '客舱' : '系统') : '整机';
    $('selection-description').textContent = selected ? (PART_TEXT[selected.id] ?? SYSTEM_TEXT[systemId] ?? OVERVIEW_TEXT) : (SYSTEM_TEXT[systemId] ?? OVERVIEW_TEXT);

    const facts = $('selection-facts');
    facts.replaceChildren();
    const rows = [];
    const systemName = systemId ? (SYSTEMS[systemId] ?? system?.name ?? systemId) : '整机';
    if (systemId) rows.push(['系统', systemName]);
    if (selected) {
      const parent = selected.parentId && selected.parentId !== 'aircraft' ? model.parts.get(selected.parentId) : null;
      rows.push(['装配关系', parent ? `隶属于${partName(parent)}` : '整机总装']);
    } else if (system) {
      rows.push(['结构组成', `${system.partIds.length} 个部件`]);
    }
    for (const [term, value] of rows) {
      const row = node('div', 'exh-fact');
      const dt = node('dt', null, term);
      const dd = node('dd');
      dd.textContent = value;
      row.append(dt, dd);
      facts.append(row);
    }
    $('cabin-view').hidden = systemId !== 'fuselage';
    partSelect.value = selected?.id ?? '';

    const depthAvailable = Boolean(system?.capabilities?.expand) && frame.renderStatus === 'webgl';
    $('system-depth-wrap').hidden = !depthAvailable;
    if (depthAvailable) {
      $('system-depth-wrap').querySelector('label').textContent = `${SYSTEMS[systemId] ?? system.name}深入`;
      applyRange(depth, frame.pose.systems[systemId] ?? 0, false);
      depth.readout.textContent = pct(frame.pose.systems[systemId] ?? 0);
      depth.input.disabled = !frame.ready;
    }
    $('control-tools').hidden = systemId !== 'flight-controls';
    if (systemId === 'flight-controls') {
      for (const [axis] of AXES) {
        applyRange(axisRanges[axis], (frame.pose.controls[axis] + 1) / 2, true);
        axisRanges[axis].readout.textContent = signed(frame.pose.controls[axis]);
        axisRanges[axis].input.disabled = !frame.ready;
      }
      neutral.disabled = !frame.ready;
    }
    if (lastView) $('stats').textContent = `三角面 ${lastView.renderer?.triangles ?? '—'} · 绘制 ${lastView.renderer?.calls ?? '—'} · 纹理 ${lastView.renderer?.textures ?? '—'} · 节点 ${model.parts.size}`;
  }

  function renderPanel(frame, view) {
    const hasScope = Boolean(frame.scope.systemId || frame.scope.partId);
    if (!hasScope || (frame.renderStatus === 'webgl' && view.cameraTransition)) {
      drawer.hidden = true;
      scopeKey = '';
      panelToken += 1;
      drawer.classList.remove('is-leaving', 'is-entering');
      root.dataset.drawer = 'closed';
      return;
    }
    const wasHidden = drawer.hidden;
    drawer.hidden = false;
    root.dataset.drawer = 'open';
    const key = `${frame.scope.systemId ?? ''}|${frame.selectedId ?? ''}`;
    fillPanel(frame);
    if ((wasHidden || key !== scopeKey) && !frame.reducedMotion) {
      const token = ++panelToken;
      drawer.classList.add('is-entering');
      later(() => { if (token === panelToken) drawer.classList.remove('is-entering'); }, 180);
    }
    scopeKey = key;
  }

  // ---- Bottom navigation and state readouts -------------------------------------
  function syncConsole(frame) {
    const ready = frame.ready;
    const pose = frame.pose;
    const neutralSystems = Object.values(pose.systems).every(value => value === 0);
    const neutralControls = Object.values(pose.controls).every(value => value === 0);
    const neutral = neutralSystems && neutralControls && pose.section == null;
    const staticMode = frame.renderStatus !== 'webgl';
    $('whole').hidden = !frame.scope.systemId && !frame.scope.partId;
    $('reset-view').disabled = !ready || staticMode;
    $('restore').disabled = !ready || staticMode || (pose.assembly === 0 && neutral);
    $('expand').disabled = !ready || staticMode || (pose.assembly === 1 && neutral);
    assembly.disabled = !ready || staticMode;
    applyAssembly(pose.assembly);
    for (const button of systems.querySelectorAll('button')) {
      const id = button.dataset.system;
      const active = id === 'aircraft'
        ? !frame.scope.systemId && !frame.scope.partId
        : frame.scope.systemId === id || (id === 'fuselage' && frame.scope.systemId === 'cabin');
      button.setAttribute('aria-pressed', String(active));
      button.disabled = !ready;
    }
    root.classList.toggle('is-focused', Boolean(frame.scope.systemId || frame.scope.partId));
    root.classList.toggle('is-reduced', Boolean(frame.reducedMotion));
  }

  function syncTransition(frame, view) {
    if (!frame) return;
    const mechanical = frame.transition;
    const cameraTransition = view?.cameraTransition ?? null;
    const active = Boolean(mechanical) || Boolean(cameraTransition);
    if (active) {
      stopWasActive = true;
      if (stopLingerTimer) { window.clearTimeout(stopLingerTimer); stopLingerTimer = 0; }
      $('stop').hidden = false;
    } else if (stopWasActive) {
      // Keep the stop affordance through the end of the movement instead of
      // yanking it away between the last host frame and the visitor's click.
      // It disables itself naturally (no active transition), then fades out of
      // the action row after a short hold.
      if (!stopLingerTimer) stopLingerTimer = later(() => {
        stopLingerTimer = 0;
        stopWasActive = false;
        $('stop').hidden = true;
      }, 1600);
    }
    $('stop').disabled = frame.renderStatus !== 'webgl';
  }

  // ---- Labels --------------------------------------------------------------------
  function ensureLabel(id, name) {
    let button = labelEls.get(id);
    if (!button) {
      button = node('button', 'part-label');
      button.type = 'button';
      button.dataset.partId = id;
      button.setAttribute('aria-label', name);
      labelsLayer.append(button);
      labelEls.set(id, button);
    }
    button.textContent = name;
    return button;
  }

  const uiAvoidance = () => {
    const rects = [];
    for (const selector of ['.exh-title', '.exh-tools', '#drawer', '#controls', '.exh-lever']) {
      const el = root.querySelector(selector);
      if (!el || el.hidden) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      const pad = selector === '.exh-title' ? 20 : 16;
      rects.push({ x0: rect.left - pad, y0: rect.top - pad, x1: rect.right + pad, y1: rect.bottom + pad });
    }
    return rects;
  };

  function renderLabels(frame, view) {
    const entries = view.labels ?? [];
    const seen = new Set();
    leaderSvg.innerHTML = '';
    const width = view.viewport.width, height = view.viewport.height, left = view.viewport.left, top = view.viewport.top;
    leaderSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    leaderSvg.style.left = `${left}px`; leaderSvg.style.top = `${top}px`;
    leaderSvg.style.width = `${width}px`; leaderSvg.style.height = `${height}px`;
    const avail = uiAvoidance();
    const accepted = [];
    entries.forEach((label, index) => {
      const labelName = partName(model.parts.get(label.id)) || label.name;
      const button = ensureLabel(label.id, labelName);
      seen.add(label.id);
      const w = Math.min(180, Math.max(64, codePointLength(labelName) * 12 + 26));
      const x = label.x + left, y = label.y + top;
      let boxY = y - 50, below = false;
      if (y < 80) { boxY = y + 18; below = true; }
      const boxX = clamp(x - w / 2, 8, window.innerWidth - w - 8);
      let visible = Boolean(label.visible) && frame.renderStatus === 'webgl' && !frame.overlay;
      const localTop = boxY - top, localBottom = localTop + 44;
      if (visible && (localTop < 0 || localBottom > height)) visible = false;
      const box = { x0: boxX - 6, y0: boxY - 6, x1: boxX + w + 6, y1: boxY + 50 };
      if (visible) {
        for (const rect of avail) if (box.x1 > rect.x0 && box.x0 < rect.x1 && box.y1 > rect.y0 && box.y0 < rect.y1) { visible = false; break; }
      }
      if (visible) {
        for (const other of accepted) if (box.x1 > other.x0 && box.x0 < other.x1 && box.y1 > other.y0 && box.y0 < other.y1) { visible = false; break; }
      }
      if (!visible) { button.hidden = true; return; }
      accepted.push(box);
      button.hidden = false;
      button.style.width = `${w}px`;
      button.style.left = `${boxX}px`;
      button.style.top = `${boxY}px`;
      button.style.opacity = index === 0 ? '1' : index === 1 ? '.9' : '.85';
      button.classList.toggle('is-current', label.id === frame.selectedId);
      const anchorX = x, anchorY = y;
      const targetX = clamp(x, boxX + 12, boxX + w - 12);
      const targetY = below ? boxY : boxY + 44;
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', String(anchorX)); line.setAttribute('y1', String(anchorY));
      line.setAttribute('x2', String(targetX)); line.setAttribute('y2', String(targetY));
      line.setAttribute('class', 'exh-leader-line');
      leaderSvg.append(line);
      const dot = document.createElementNS(svgNS, 'circle');
      dot.setAttribute('cx', String(anchorX)); dot.setAttribute('cy', String(anchorY)); dot.setAttribute('r', '2.4');
      dot.setAttribute('class', 'exh-leader-dot');
      leaderSvg.append(dot);
    });
    for (const [id, button] of labelEls) if (!seen.has(id)) { button.hidden = true; }
  }

  function render(frame, view) {
    lastFrame = frame; lastView = view;
    if (frame.mode === 'intro') {
      if (introState === 'pending') showIntro();
    } else if (introState === 'pending') {
      revealNow();
    }
    if (introState === 'entering') {
      const transition = view.cameraTransition;
      if (transition?.kind === 'entrance') sawEntrance = true;
      if (frame.mode === 'explore' && frame.reducedMotion && !frame.transition) revealNow();
      else if (sawEntrance && frame.mode === 'explore' && !frame.transition) beginReveal();
    }
    renderPanel(frame, view);
    syncPartsMenu(frame.selectedId);
    if (frame.overlay || frame.mode !== 'explore') closePartsMenu();
    syncConsole(frame);
    syncTransition(frame, view);
    renderLabels(frame, view);
  }

  function resize(next) {
    lastView = lastViewport(next, lastView);
    if (lastFrame) render(lastFrame, { ...lastView, viewport: { ...next } });
  }

  return {
    getLabelIds(frame) {
      if (!frame?.ready || frame.overlay || frame.renderStatus !== 'webgl') return [];
      const { systemId, partId } = frame.scope;
      if (!systemId) return [];
      const max = narrowQuery.matches ? 2 : 3;
      const ids = [];
      const add = id => { if (id && model.parts.has(id) && !ids.includes(id)) ids.push(id); };
      if (partId) add(partId);
      for (const id of REPS[systemId] ?? []) add(id);
      if (partId) {
        const part = model.parts.get(partId);
        if (part?.parentId && part.parentId !== 'aircraft') add(part.parentId);
        else {
          for (const other of model.parts.values()) if (other.parentId === partId) { add(other.id); break; }
        }
      }
      return ids.slice(0, max);
    },
    render,
    resize,
    dispose() {
      controls.abort();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      if (toastTimer) clearTimeout(toastTimer);
      labelEls.clear();
      root.remove();
    },
  };
}
