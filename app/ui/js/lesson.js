// The lesson screen: blocks or typed code on the left, the task and the game on
// the right. Turns the kid's program into code, runs it in the right world, and
// checks the lesson goal.
//
// Three modes, same lessons: 'blocks', 'both' (blocks + the code they make) and
// 'code' (typed). Blocks and typed code are saved separately for each lesson,
// so switching mode never throws work away.

import { t, tr } from './i18n.js';
import * as storage from './storage.js';
import { defineBlocks, toolboxFor, workspaceCode, codeFromBlocks } from './blocks.js';
import { compileTyped, diagnose, countUses, explainJsError, errorLine, CodeProblem } from './kidcode.js';
import { createEditor } from './editor.js';
import { commandsFor, SYMBOLS } from './codehelp.js';
import { explainAt } from './explain.js';
import { findHints } from './hints.js';
import { RobotWorld } from './worlds/robot.js';
import { SnakeWorld } from './worlds/snake.js';
import { MinesWorld } from './worlds/mines.js';
import { StopSignal, GameOverSignal, LoopError, KidError } from './errors.js';
import { h, clear, confirmBox } from './dom.js';

const MODE_ICONS = { blocks: '🧩', both: '🧩 + </>', code: '</>' };
const MAX_OUTPUT_LINES = 200;
const CHECK_DELAY_MS = 400; // check the code this long after typing stops

const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

export function openLesson(root, opts) {
  const ctl = new LessonController(root, opts);
  ctl.render();
  return () => ctl.close();
}

class LessonController {
  constructor(root, { course, index, profileId, onBack, onNext, onDiploma }) {
    Object.assign(this, { root, course, index, profileId, onBack, onNext, onDiploma });
    this.lesson = course.lessons[index];
    this.runId = 0;
    this.timer = null;
    this.keyHandler = null;
    this.mode = storage.mode(profileId);
    this.onKeyDown = (e) => this.handleKey(e);
    window.addEventListener('keydown', this.onKeyDown, true);
  }

  // ---- layout ----

  render() {
    const L = this.lesson;
    const typed = this.mode === 'code';
    clear(this.root);

    this.statusEl = h('div', { class: 'status' });
    this.scoreEl = h('div', { class: 'score' });
    this.messageEl = h('div', { class: 'message', role: 'status' });
    this.capacityEl = h('div', { class: 'capacity' });
    this.canvas = h('canvas', { class: 'world' });
    this.hintEl = h('p', { class: 'hint', hidden: true }, tr((typed && L.hintCode) || L.hint));
    this.runBtn = h('button', { class: 'btn run', onclick: () => this.run() }, `▶ ${t('lesson.run')}`);
    this.stopBtn = h('button', { class: 'btn stop', onclick: () => this.stop(true), disabled: true }, `■ ${t('lesson.stop')}`);

    this.root.append(
      h(
        'header',
        { class: 'topbar' },
        h('button', { class: 'btn ghost', onclick: () => this.onBack() }, `← ${t('lesson.back')}`),
        h('h1', {}, `${this.index + 1}. ${tr(L.title)}`),
        this.modeSwitch(),
      ),
      h(
        'main',
        { class: 'lesson' },
        typed ? this.codeWorkspace() : this.blocksWorkspace(),
        h(
          'aside',
          { class: 'side' },
          h(
            'div',
            { class: 'guide' },
            h('div', { class: 'bubble' }, h('img', { src: 'ui/img/bit.svg', alt: '', class: 'avatar' }), h('p', {}, tr(L.story))),
            h('div', { class: 'task' }, h('h2', {}, t('lesson.goal')), h('p', {}, tr((typed && L.taskCode) || L.task))),
            h(
              'div',
              { class: 'guide-extra' },
              h('p', { class: 'concept' }, `💡 ${tr(L.concept)}`),
              h('button', { class: 'btn small ghost', onclick: () => (this.hintEl.hidden = !this.hintEl.hidden) }, `🔍 ${t('lesson.hint')}`),
            ),
            this.hintEl,
          ),
          h(
            'section',
            { class: 'stage' },
            h(
              'div',
              { class: 'controls' },
              this.runBtn,
              this.stopBtn,
              h('button', { class: 'btn ghost', onclick: () => this.reset() }, `↺ ${t('lesson.reset')}`),
            ),
            h('div', { class: 'stage-info' }, this.statusEl, this.scoreEl),
            h('div', { class: 'canvas-wrap' }, this.canvas),
            this.messageEl,
          ),
        ),
      ),
    );

    const World = { snake: SnakeWorld, minesweeper: MinesWorld }[this.course.world] || RobotWorld;
    this.world = new World(this.canvas);
    this.world.onScore = (s) => this.showScore(s);
    if (this.course.world === 'minesweeper') this.listenToBoard();
    // Test hook: only when opened with ?debug in a browser, never in the app.
    if (new URLSearchParams(location.search).has('debug')) window.cqLesson = this;
    this.reset();
    if (typed) this.refreshCapacity();
    else this.injectBlockly();
  }

  modeSwitch() {
    return h(
      'div',
      { class: 'mode-switch', role: 'group', 'aria-label': t('mode.label') },
      storage.MODES.map((m) =>
        h(
          'button',
          {
            class: `btn small ${m === this.mode ? 'active' : 'ghost'}`,
            title: t(`mode.${m}Tip`),
            'aria-pressed': m === this.mode ? 'true' : 'false',
            onclick: () => this.setMode(m),
          },
          `${MODE_ICONS[m]} ${t(`mode.${m}`)}`,
        ),
      ),
    );
  }

  setMode(m) {
    if (m === this.mode) return;
    this.teardownWorkspace();
    this.stop(false);
    this.mode = m;
    storage.setMode(this.profileId, m);
    this.render();
  }

  teardownWorkspace() {
    clearTimeout(this.checkTimer);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.ws) {
      this.saveWorkspace();
      this.ws.dispose();
      this.ws = null;
    }
    if (this.editor) {
      this.saveCode();
      this.editor = null;
    }
  }

  // ---- blocks ----

  blocksWorkspace() {
    this.blocklyDiv = h('div', { class: 'blockly' });
    this.codeEl = h('pre', { class: 'code-view' });
    this.codePanel = h('div', { class: 'code-panel', hidden: this.mode !== 'both' }, h('h3', {}, t('lesson.codeTitle')), this.codeEl);
    return h('section', { class: 'workspace' }, this.blocklyDiv, this.capacityEl, this.codePanel);
  }

  injectBlockly() {
    const L = this.lesson;
    defineBlocks();
    this.ws = Blockly.inject(this.blocklyDiv, {
      toolbox: toolboxFor(L.toolbox),
      renderer: 'zelos',
      media: 'vendor/blockly/media/',
      // Limits are per kind of block (e.g. 1 repeat + 2 move). Blockly's overall
      // maxBlocks would also count event blocks and number bubbles, which kids can't see as blocks.
      maxInstances: { event_start: 1, event_tick: 1, ...(L.limits || {}) },
      trashcan: true,
      sounds: true,
      grid: { spacing: 24, length: 2, colour: '#dfe6ee', snap: true },
      zoom: { controls: true, wheel: false, startScale: 0.9, maxScale: 1.8, minScale: 0.4 },
      move: { scrollbars: true, drag: true, wheel: true },
    });
    const { json, carried } = this.initialWorkspace();
    Blockly.serialization.workspaces.load(json, this.ws);
    // Blocks carried over from the last lesson may overlap as they grew; tidy them once.
    if (carried) this.ws.cleanUp();
    // Blocks not connected to an event can never run: grey them out so kids see it.
    this.ws.addChangeListener(Blockly.Events.disableOrphans);
    this.ws.addChangeListener((e) => {
      if (e.isUiEvent) return;
      this.saveWorkspace();
      this.refreshCode();
    });
    this.refreshCode();
    this.resizeObserver = new ResizeObserver(() => Blockly.svgResize(this.ws));
    this.resizeObserver.observe(this.blocklyDiv);
  }

  initialWorkspace() {
    const L = this.lesson;
    const own = storage.lessonState(this.profileId, L.id).workspace;
    if (own) return { json: own, carried: false };
    if (L.carryFrom) {
      const previous = storage.lessonState(this.profileId, L.carryFrom).workspace;
      if (previous) return { json: previous, carried: true };
    }
    return { json: { blocks: { languageVersion: 0, blocks: L.starter || [] } }, carried: false };
  }

  saveWorkspace() {
    storage.lessonState(this.profileId, this.lesson.id).workspace = Blockly.serialization.workspaces.save(this.ws);
    storage.save();
  }

  refreshCode() {
    const limits = Object.entries(this.lesson.limits || {});
    this.capacityEl.textContent = limits.length
      ? t('lesson.blocksLeft', {
          n: limits
            .map(([type, max]) => `${Math.max(0, max - this.ws.getBlocksByType(type, false).length)} × ${t(`blockNames.${type}`)}`)
            .join(', '),
        })
      : '';
    if (this.mode !== 'both') return;
    this.codeEl.textContent = workspaceCode(this.ws, { display: true }).trim();
  }

  // ---- typed code ----

  codeWorkspace() {
    this.outputEl = h('pre', { class: 'output', hidden: true, 'aria-live': 'polite' });
    this.editor = createEditor({
      value: this.initialCode(),
      label: t('code.editorLabel'),
      onChange: () => {
        this.saveCode();
        this.refreshCapacity();
        // The code changed, so an open hint may no longer fit.
        if (this.mistakeEl) this.mistakeEl.hidden = true;
        clearTimeout(this.checkTimer);
        this.checkTimer = setTimeout(() => this.checkCode(), CHECK_DELAY_MS);
      },
      onRun: () => this.run(),
      onCursor: (code, pos) => this.explain(code, pos),
    });
    this.explainEl = h('div', { class: 'explain', 'aria-live': 'polite' });
    this.mistakeEl = h('div', { class: 'hint-box', hidden: true, 'aria-live': 'polite' });
    this.problems = [];
    this.explain('', 0);
    queueMicrotask(() => this.checkCode());
    const commands = commandsFor(this.lesson, this.course.world).map((c) =>
      h(
        'button',
        { class: 'command', title: t('code.addCommand'), onclick: () => this.editor.insertSnippet(c.code) },
        h('code', {}, c.label),
        h('span', {}, c.help),
      ),
    );
    return h(
      'section',
      { class: 'workspace code-mode' },
      h(
        'div',
        { class: 'commands' },
        h('h3', {}, t('code.commands')),
        h('p', { class: 'commands-tip' }, t('code.commandsTip')),
        ...commands,
        h('h3', { class: 'symbols-title' }, t('code.symbols')),
        h('p', { class: 'commands-tip' }, t('code.symbolsTip')),
        h('dl', { class: 'symbols' }, SYMBOLS.flatMap(([sym, key]) => [h('dt', {}, h('code', {}, sym)), h('dd', {}, t(key))])),
      ),
      h(
        'div',
        { class: 'code-main' },
        h(
          'div',
          { class: 'code-toolbar' },
          h('span', { class: 'code-tip' }, t('code.runTip')),
          this.capacityEl,
          this.lesson.solution ? h('button', { class: 'btn small ghost find-mistake', onclick: () => this.findMistake() }, t('hint.button')) : null,
          h('button', { class: 'btn small ghost', onclick: () => this.restartCode() }, `↺ ${t('code.startOver')}`),
        ),
        this.editor.el,
        this.mistakeEl,
        this.explainEl,
        this.outputEl,
      ),
    );
  }

  /**
   * Where typed code starts: the kid's own code for this lesson, else their code
   * from the lesson before, else their blocks turned into code, else the starter.
   */
  initialCode() {
    const L = this.lesson;
    const own = storage.lessonState(this.profileId, L.id);
    if (typeof own.code === 'string') return own.code;
    const prev = L.carryFrom ? storage.lessonState(this.profileId, L.carryFrom) : {};
    if (typeof prev.code === 'string') return prev.code;
    return this.codeFromBlocksOrStarter();
  }

  codeFromBlocksOrStarter() {
    const L = this.lesson;
    defineBlocks();
    const own = storage.lessonState(this.profileId, L.id).workspace;
    const prev = L.carryFrom && storage.lessonState(this.profileId, L.carryFrom).workspace;
    const json = own || prev || { blocks: { languageVersion: 0, blocks: L.starter || [] } };
    try {
      return codeFromBlocks(json);
    } catch (e) {
      console.error('Could not turn blocks into code', e);
      return '';
    }
  }

  async restartCode() {
    if (!(await confirmBox(t('code.startOverConfirm'), t('code.startOver')))) return;
    this.stop(true);
    // Start again from the blocks (or the starter), not from the code typed so far.
    delete storage.lessonState(this.profileId, this.lesson.id).code;
    this.editor.value = this.codeFromBlocksOrStarter();
    this.saveCode();
    this.refreshCapacity();
    this.checkCode();
  }

  saveCode() {
    if (!this.editor) return;
    storage.lessonState(this.profileId, this.lesson.id).code = this.editor.value;
    storage.save();
  }

  refreshCapacity() {
    const limits = this.lesson.limits || {};
    if (!Object.keys(limits).length) return;
    const used = countUses(this.editor.value, limits);
    this.capacityEl.textContent = t('code.usesLeft', {
      n: Object.entries(limits)
        .map(([type, max]) => `${Math.max(0, max - used[type])} × ${t(`codeNames.${type}`)}`)
        .join(', '),
    });
  }

  /** Explain the symbol or word at the cursor, in the bar under the editor. */
  /** Check the code like VS Code does while you type, and underline the mistakes. */
  checkCode() {
    if (!this.editor) return;
    this.problems = diagnose(this.editor.value, { world: this.course.world }).map((p) => this.problemView(p));
    this.editor.setProblems(this.problems);
  }

  problemView(p) {
    return { start: p.start, end: p.end, line: p.line, severity: p.severity, message: t(p.key, p.vars) };
  }

  /** Explain the symbol or word at the cursor; a mistake there is explained first. */
  explain(code, pos) {
    const problem = code ? this.editor?.problemAt(pos) : null;
    if (problem) {
      const icon = problem.severity === 'error' ? '❌' : '⚠️';
      this.explainEl.replaceChildren(h('span', { class: `explain-${problem.severity}` }, `${icon} ${problem.message}`));
      return;
    }
    const found = code ? explainAt(code, pos) : null;
    if (!found) {
      this.explainEl.replaceChildren(h('span', { class: 'explain-idle' }, `💡 ${t('explain.idle')}`));
      return;
    }
    const vars = { ...found.vars };
    if (vars.helpKey) vars.help = t(vars.helpKey).replace(/%\d/g, '…');
    if (vars.key) vars.key = t(`blocks.key.${vars.key}`);
    this.explainEl.replaceChildren(`💡 ${t(found.key, vars)}`);
  }

  /** console.log and alert print here, so kids can see what their code is doing. */
  log(args) {
    if (!this.outputEl) return;
    const text = args.map((a) => (typeof a === 'string' ? a : safeString(a))).join(' ');
    const lines = `${this.outputEl.textContent}${text}\n`.split('\n');
    this.outputEl.textContent = lines.slice(-MAX_OUTPUT_LINES - 1).join('\n');
    this.outputEl.hidden = false;
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }

  // ---- running ----

  /** Returns fn(events, bit, snake, game), from the blocks or the typed code. */
  compile() {
    const kidConsole = { log: (...a) => this.log(a), info: (...a) => this.log(a), warn: (...a) => this.log(a), error: (...a) => this.log(a) };
    const alert = (...a) => this.log(a);
    if (this.mode === 'code') {
      this.typed = compileTyped(this.editor.value, { world: this.course.world });
      return (events, bit, snake, game, field) => this.typed.run(events, bit, snake, game, kidConsole, alert, field);
    }
    const code = workspaceCode(this.ws, { loopTrap: 'if (--__loopGuard < 0) throw new __LoopError();\n' });
    const fn = new Function('__events', 'bit', 'snake', 'game', 'console', '__LoopError', 'field', `"use strict";\nlet __loopGuard = 100000;\n${code}`);
    return (events, bit, snake, game, field) => fn(events, bit, snake, game, kidConsole, LoopError, field);
  }

  /** In code mode, more uses of a limited command than the lesson allows. */
  limitProblem() {
    const limits = this.lesson.limits || {};
    if (this.mode !== 'code' || !Object.keys(limits).length) return null;
    const used = countUses(this.editor.value, limits);
    for (const [type, max] of Object.entries(limits)) {
      if (used[type] > max) return ['code.err.tooMany', { name: t(`codeNames.${type}`), max, used: used[type] }];
    }
    return null;
  }

  makeEvents() {
    const ev = { start: [], tick: [], keys: { up: [], down: [], left: [], right: [] }, click: [], rightClick: [] };
    const api = {
      onStart: (f) => ev.start.push(f),
      onTick: (f) => ev.tick.push(f),
      onKey: (k, f) => ev.keys[k]?.push(f),
      onClick: (f) => ev.click.push(f),
      onRightClick: (f) => ev.rightClick.push(f),
    };
    return { ev, api };
  }

  run() {
    this.stop(false);
    this.say('');
    const id = ++this.runId;
    this.runBtn.disabled = true;
    this.stopBtn.disabled = false;
    document.activeElement?.blur?.();
    this.editor?.markLine(null);
    if (this.outputEl) {
      this.outputEl.textContent = '';
      this.outputEl.hidden = true;
    }
    const tooMany = this.limitProblem();
    if (tooMany) return this.fail(...tooMany);
    let fn;
    try {
      fn = this.compile();
    } catch (e) {
      if (e instanceof CodeProblem) return this.failAt(e.line, e.key, e.vars, e);
      return this.fail('msg.error', { error: e.message });
    }
    if (this.course.world === 'snake') this.runSnake(fn, id);
    else if (this.course.world === 'minesweeper') this.runMines(fn, id);
    else this.runRobot(fn, id);
  }

  async runRobot(fn, id) {
    const L = this.lesson;
    const maps = L.maps;
    for (let i = 0; i < maps.length; i++) {
      this.world.load(maps[i]);
      this.showScore(0);
      this.statusEl.textContent = maps.length > 1 ? t('lesson.test', { n: i + 1, total: maps.length }) : '';
      const { ev, api } = this.makeEvents();
      const { bit, game } = this.world.api();
      // Kid code runs instantly; the world records each step, then plays them back.
      let error = null;
      try {
        fn(api, bit, null, game);
      } catch (e) {
        error = e;
      }
      if (!error && L.mode === 'play') return this.playRobot(ev, id);
      if (!error && !ev.start.length) return this.fail(this.mode === 'code' ? 'msg.noStartCode' : 'msg.noStart');
      try {
        if (!error) for (const handler of ev.start) handler();
      } catch (e) {
        error = e;
      }
      const played = await this.world.play(this.world.takeFrames());
      if (!played || id !== this.runId) return;
      if (error) return this.handleError(error, id);
      const problem = this.robotGoalProblem();
      if (problem) return this.fail(...problem);
      if (i < maps.length - 1) await sleep(600);
      if (id !== this.runId) return;
    }
    this.succeed();
  }

  robotGoalProblem() {
    const goal = this.lesson.goal || {};
    const w = this.world;
    if (goal.collectAll && w.coins.size) return ['msg.coinsLeft', { n: w.coins.size }];
    if (goal.score != null && w.score !== goal.score) return ['msg.scoreWrong', { score: w.score, want: goal.score }];
    if (goal.reach && !w.atFlag()) return ['msg.notAtFlag'];
    return null;
  }

  playRobot(ev, id) {
    const hasKeys = Object.values(ev.keys).some((list) => list.length);
    if (!hasKeys) return this.fail(this.mode === 'code' ? 'msg.noKeysCode' : 'msg.noKeys');
    this.say(t('lesson.useArrows'), 'info');
    let chain = Promise.resolve();
    let waiting = 0;
    this.keyHandler = (dir) => {
      // Holding a key down shouldn't pile up a long queue of moves.
      if (waiting > 2) return;
      let error = null;
      try {
        for (const handler of ev.keys[dir]) handler();
      } catch (e) {
        error = e;
      }
      const frames = this.world.takeFrames();
      waiting++;
      chain = chain.then(async () => {
        const played = await this.world.play(frames);
        waiting--;
        if (!played || id !== this.runId) return;
        if (error instanceof KidError && error.key === 'msg.bump') this.say(t('msg.bump'), 'warn');
        else if (error) this.handleError(error, id);
        else if (frames.some((f) => this.world.atFlag(f.pos))) this.succeed();
      });
    };
  }

  // ---- Minesweeper ----

  /** Mouse on the board: hovering shows the square's address, clicks go to the kid's code. */
  listenToBoard() {
    const w = this.world;
    const showSquare = (sq) => {
      this.statusEl.textContent = sq ? t('lesson.square', { x: sq.x, y: sq.y }) : '';
    };
    this.canvas.addEventListener('mousemove', (e) => {
      const sq = w.squareAt(e.clientX, e.clientY);
      if (sq?.x === w.hover?.x && sq?.y === w.hover?.y) return;
      w.hover = sq;
      w.draw();
      showSquare(sq);
    });
    this.canvas.addEventListener('mouseleave', () => {
      w.hover = null;
      w.draw();
      showSquare(null);
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const sq = w.squareAt(e.clientX, e.clientY);
      if (sq && this.clickHandler) this.clickHandler(sq.x, sq.y, e.button === 2 ? 'right' : 'left');
    });
  }

  runMines(fn, id) {
    const w = this.world;
    w.reset();
    this.showScore(0);
    const { ev, api } = this.makeEvents();
    const { field, game } = w.api();
    // Remember which field.reveal(...) showed a wrong number, so it can be underlined.
    const reveal = field.reveal;
    field.reveal = (...args) => {
      const before = w.stats.wrongNumber;
      reveal(...args);
      if (!before && w.stats.wrongNumber) w.stats.wrongNumber.place = this.typed?.lastPlace?.() ?? null;
    };
    try {
      fn(api, null, null, game, field);
      for (const handler of ev.start) handler();
    } catch (e) {
      return this.handleError(e, id);
    }
    w.draw();
    if (!ev.click.length) return this.fail(this.mode === 'code' ? 'msg.noClickCode' : 'msg.noClick');
    this.say(t(w.mines.size ? (ev.rightClick.length ? 'lesson.clickSquaresFlags' : 'lesson.clickSquares') : 'msg.noMines'), 'info');

    // field.clickAround(x, y) "clicks" squares: the kid's click code runs again for each.
    w.onClickRequest = (x, y) => {
      for (const handler of ev.click) handler(x, y);
    };
    this.clickHandler = (x, y, button) => {
      if (id !== this.runId || w.over) return;
      const handlers = button === 'right' ? ev.rightClick : ev.click;
      if (!handlers.length) return;
      const runAll = () => {
        for (const handler of handlers) handler(x, y);
      };
      try {
        if (button === 'right') w.handle(x, y, runAll);
        else w.playerClick(x, y, runAll);
      } catch (e) {
        if (!(e instanceof GameOverSignal)) {
          w.draw();
          return this.handleError(e, id);
        }
      }
      w.draw();
      this.minesGoalCheck();
    };
  }

  minesGoalCheck() {
    const goal = this.lesson.goal || {};
    const w = this.world;
    const s = w.stats;
    if (s.wrongNumber) {
      const { place, ...vars } = s.wrongNumber;
      const key = vars.shown < vars.real ? 'msg.wrongNumberLow' : 'msg.wrongNumberHigh';
      return this.failAt(place?.line ?? null, key, vars, place);
    }
    const won =
      (goal.type === 'opened' && w.safeOpened() >= goal.n) ||
      (goal.type === 'gameOver' && w.over && w.overReason === goal.reason) ||
      (goal.type === 'numbers' && s.numbersShown >= goal.n && s.nonZeroShown > 0) ||
      (goal.type === 'flags' && w.flags.size >= goal.n) ||
      (goal.type === 'bigOpen' && s.biggestClick >= goal.n) ||
      w.overReason === 'win';
    if (won) return this.succeed();
    if (w.over) return this.fail('msg.boom');
    if (s.minesOpened) this.say(t(goal.type === 'gameOver' ? 'msg.mineNoRule' : 'msg.mineNoRuleYet'), goal.type === 'gameOver' ? 'warn' : 'info');
  }

  runSnake(fn, id) {
    const w = this.world;
    w.reset();
    this.showScore(0);
    this.statusEl.textContent = '';
    const { ev, api } = this.makeEvents();
    const { snake, game } = w.api();
    try {
      fn(api, null, snake, game);
      for (const handler of ev.start) handler();
    } catch (e) {
      if (!(e instanceof GameOverSignal)) return this.handleError(e);
    }
    w.draw();
    if (!w.stats.foodPlaced) this.say(t('msg.noFood'), 'info');

    this.keyHandler = (dir) => {
      if (w.over) return;
      try {
        for (const handler of ev.keys[dir]) handler();
      } catch (e) {
        if (!(e instanceof GameOverSignal)) this.handleError(e);
      }
    };

    const step = () => {
      if (id !== this.runId) return;
      try {
        for (const handler of ev.tick) handler();
      } catch (e) {
        if (!(e instanceof GameOverSignal)) return this.handleError(e);
      }
      w.draw();
      this.showScore(w.score);
      if (this.snakeGoalCheck()) return;
      if (w.goneOffScreen()) {
        const knowsWalls = this.lesson.toolbox.includes('snake_hits_wall');
        return this.fail(knowsWalls ? 'msg.snakeLeftHint' : 'msg.snakeLeft');
      }
      this.timer = setTimeout(step, w.tickMs());
    };
    this.timer = setTimeout(step, w.tickMs());
  }

  /** Returns true when the run has ended (won or lost). */
  snakeGoalCheck() {
    const goal = this.lesson.goal || {};
    const w = this.world;
    const won =
      (goal.type === 'moves' && w.stats.moves >= goal.n) ||
      (goal.type === 'turns' && w.stats.dirsMoved.size >= 4) ||
      (goal.type === 'score' && w.score >= goal.n) ||
      (goal.type === 'gameOver' && w.over && w.overReason === goal.reason);
    if (won) {
      this.succeed();
      return true;
    }
    if (!w.over) return false;
    if (goal.type === 'gameOver' && goal.reason === 'wall') this.fail('msg.gameOverNotWall');
    else if (goal.type === 'gameOver' && goal.reason === 'self') this.fail('msg.gameOverNotSelf');
    else if (goal.type === 'score') this.fail('msg.scoreGoal', { score: w.score, want: goal.n });
    else this.fail('msg.gameOver', { score: w.score });
    return true;
  }

  handleKey(e) {
    const dir = KEYS[e.key];
    if (!dir || !this.keyHandler) return;
    // While a game runs, the arrows belong to the game, not to Blockly or the page.
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat || this.course.world === 'robot') this.keyHandler(dir);
  }

  handleError(e, id = this.runId) {
    // Errors from an older run (before Stop/Run was pressed again) don't count.
    if (id !== this.runId || e instanceof StopSignal) return;
    // Where in the typed code it went wrong. A failing command (bit.move('downn'))
    // or loop knows its own place, in every browser engine; other errors fall
    // back on the stack trace.
    const place = this.mode === 'code' && (e instanceof KidError || e instanceof LoopError || e instanceof TypeError) ? this.typed?.lastPlace() : null;
    const line = this.mode === 'code' ? place?.line ?? errorLine(e) : null;
    if (e instanceof KidError) return this.failAt(line, e.key, e.vars, place);
    if (e instanceof LoopError) return this.failAt(line, this.mode === 'code' ? 'msg.loopCode' : 'msg.loop', {}, place);
    if (this.mode === 'code') return this.failAt(line, ...explainJsError(e), place);
    console.error(e);
    this.fail('msg.error', { error: e?.message || String(e) });
  }

  stop(byButton) {
    this.runId++;
    clearTimeout(this.timer);
    this.timer = null;
    this.keyHandler = null;
    this.clickHandler = null;
    if (this.world?.stop) this.world.stop();
    this.runBtn.disabled = false;
    this.stopBtn.disabled = true;
    if (byButton) this.say('');
  }

  reset() {
    this.stop(true);
    if (this.course.world === 'robot') this.world.load(this.lesson.maps[0]);
    else this.world.reset();
    this.statusEl.textContent = '';
    this.showScore(0);
  }

  // ---- feedback ----

  showScore(s) {
    this.scoreEl.textContent = `⭐ ${t('lesson.score')}: ${s}`;
  }

  say(text, kind = 'info') {
    this.messageEl.textContent = text;
    this.messageEl.className = `message ${text ? kind : ''}`;
    // On short screens the message can sit below the game: bring it into view.
    if (text && kind === 'warn') this.messageEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  fail(key, vars) {
    this.stop(false);
    this.say(t(key, vars), 'warn');
    this.offerHint();
  }

  // ---- "Find my mistake" ----

  /** After a failed run in code mode: a button that opens the hints. */
  offerHint() {
    if (this.mode !== 'code' || !this.lesson.solution) return;
    this.messageEl.append(' ', h('button', { class: 'btn small ghost', onclick: () => this.findMistake() }, t('hint.offer')));
  }

  /**
   * Compare the kid's code with the lesson's solution and show the first
   * difference: first only where it is, then (on "Show me more") what it is.
   */
  findMistake() {
    if (!this.editor || !this.lesson.solution) return;
    this.checkCode();
    const error = this.problems.find((p) => p.severity === 'error');
    this.hints = error
      ? [{ type: 'fixError', line: error.line, start: error.start, end: error.end, vars: { message: error.message } }]
      : findHints(this.editor.value, this.lesson.solution);
    this.hintIndex = 0;
    this.hintLevel = 1;
    this.showHint();
  }

  showHint() {
    const hint = this.hints[this.hintIndex];
    const close = h('button', { class: 'btn small ghost', title: t('hint.close'), onclick: () => this.closeHint() }, '✕');
    this.mistakeEl.hidden = false;
    if (!hint) {
      this.editor.setHint(null);
      this.mistakeEl.replaceChildren(h('p', {}, `🤔 ${t('hint.none')}`), h('div', { class: 'hint-buttons' }, close));
      return;
    }
    const vars = { ...hint.vars, line: hint.line };
    if (vars.whereKey) vars.where = t(vars.whereKey, { n: vars.whereLine });
    const detailed = this.hintLevel > 1 || hint.type === 'fixError';
    const text = t(detailed ? `hint.what.${hint.type}` : `hint.where.${hint.type}`, vars);
    const showCode = detailed && vars.code && hint.type !== 'order';
    const buttons = [];
    if (!detailed) buttons.push(h('button', { class: 'btn small', onclick: () => ((this.hintLevel = 2), this.showHint()) }, t('hint.more')));
    else if (this.hintIndex < this.hints.length - 1) {
      buttons.push(h('button', { class: 'btn small', onclick: () => (this.hintIndex++, (this.hintLevel = 1), this.showHint()) }, t('hint.next')));
    }
    buttons.push(close);
    this.mistakeEl.replaceChildren(
      h('p', {}, `🔍 ${text}`),
      ...(showCode ? [h('pre', { class: 'hint-code' }, vars.full || vars.code)] : []),
      h('div', { class: 'hint-buttons' }, this.hints.length > 1 ? h('span', { class: 'hint-count' }, t('hint.count', { n: this.hintIndex + 1, total: this.hints.length })) : null, ...buttons),
    );
    this.editor.setHint({ line: hint.line, start: hint.start, end: hint.end, insertAfter: hint.insertAfter, message: text });
  }

  closeHint() {
    this.mistakeEl.hidden = true;
    this.editor?.setHint(null);
  }

  /** Like fail(), and in code mode also marks the line with the mistake. */
  /** Like fail(), and in code mode also underlines the mistake (`place` = { start, end }). */
  failAt(line, key, vars, place = null) {
    this.stop(false);
    const text = t(key, vars);
    this.say(line ? t('code.onLine', { line, text }) : text, 'warn');
    if (!this.editor) return;
    if (place?.start != null) {
      const warnings = this.problems.filter((p) => p.severity === 'warning');
      this.editor.setProblems([...warnings, { start: place.start, end: place.end, line, severity: 'error', message: text }]);
    }
    if (line) this.editor.markLine(line);
    this.offerHint();
  }

  succeed() {
    this.stop(false);
    const L = this.lesson;
    const st = storage.lessonState(this.profileId, L.id);
    st.done = true;
    st.doneAt ||= new Date().toISOString();
    storage.save();
    this.say(t('msg.successSub'), 'good');

    const hasNext = this.index < this.course.lessons.length - 1;
    const buttons = [];
    if (L.final) buttons.push(h('button', { class: 'btn run', onclick: () => this.onDiploma() }, `🏆 ${t('lesson.diploma')}`));
    if (hasNext) buttons.push(h('button', { class: 'btn run', onclick: () => this.onNext() }, `${t('lesson.next')} →`));
    buttons.push(h('button', { class: 'btn ghost', onclick: () => this.onBack() }, t('lesson.toHome')));
    buttons.push(h('button', { class: 'btn ghost', onclick: () => modal.remove() }, t('lesson.again')));

    const modal = h(
      'div',
      { class: 'modal-backdrop' },
      h(
        'div',
        { class: 'modal' },
        h('div', { class: 'stars' }, '⭐⭐⭐'),
        h('h2', {}, L.final ? t('msg.gameDone', { game: t(`games.${this.course.game}`) }) : t('msg.success')),
        h('p', {}, L.final ? t('msg.gameDoneSub') : t('msg.successSub')),
        h('div', { class: 'modal-buttons' }, ...buttons),
      ),
    );
    this.root.append(modal);
  }

  close() {
    this.stop(false);
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.teardownWorkspace();
  }
}

function safeString(v) {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
