// The lesson screen: guide text on the left, Blockly in the middle, the game on
// the right. Turns the blocks into code, runs it in the right world, and checks
// the lesson goal.

import { t, tr } from './i18n.js';
import * as storage from './storage.js';
import { defineBlocks, toolboxFor, workspaceCode } from './blocks.js';
import { RobotWorld } from './worlds/robot.js';
import { SnakeWorld } from './worlds/snake.js';
import { StopSignal, GameOverSignal, LoopError, KidError } from './errors.js';
import { h, clear } from './dom.js';

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
    this.showCode = false;
    this.onKeyDown = (e) => this.handleKey(e);
    window.addEventListener('keydown', this.onKeyDown, true);
  }

  // ---- layout ----

  render() {
    const L = this.lesson;
    clear(this.root);

    this.statusEl = h('div', { class: 'status' });
    this.scoreEl = h('div', { class: 'score' });
    this.messageEl = h('div', { class: 'message', role: 'status' });
    this.capacityEl = h('div', { class: 'capacity' });
    this.canvas = h('canvas', { class: 'world' });
    this.codeEl = h('pre', { class: 'code-view' });
    this.codePanel = h('div', { class: 'code-panel', hidden: true }, h('h3', {}, t('lesson.codeTitle')), this.codeEl);
    this.blocklyDiv = h('div', { class: 'blockly' });
    this.hintEl = h('p', { class: 'hint', hidden: true }, tr(L.hint));
    this.codeBtn = h('button', { class: 'btn ghost', onclick: () => this.toggleCode() }, t('lesson.showCode'));
    this.runBtn = h('button', { class: 'btn run', onclick: () => this.run() }, `▶ ${t('lesson.run')}`);
    this.stopBtn = h('button', { class: 'btn stop', onclick: () => this.stop(true), disabled: true }, `■ ${t('lesson.stop')}`);

    this.root.append(
      h(
        'header',
        { class: 'topbar' },
        h('button', { class: 'btn ghost', onclick: () => this.onBack() }, `← ${t('lesson.back')}`),
        h('h1', {}, `${this.index + 1}. ${tr(L.title)}`),
        this.codeBtn,
      ),
      h(
        'main',
        { class: 'lesson' },
        h('section', { class: 'workspace' }, this.blocklyDiv, this.capacityEl, this.codePanel),
        h(
          'aside',
          { class: 'side' },
          h(
            'div',
            { class: 'guide' },
            h('div', { class: 'bubble' }, h('img', { src: 'ui/img/bit.svg', alt: '', class: 'avatar' }), h('p', {}, tr(L.story))),
            h('div', { class: 'task' }, h('h2', {}, t('lesson.goal')), h('p', {}, tr(L.task))),
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

    this.world = this.course.world === 'snake' ? new SnakeWorld(this.canvas) : new RobotWorld(this.canvas);
    this.world.onScore = (s) => this.showScore(s);
    // Test hook: only when opened with ?debug in a browser, never in the app.
    if (new URLSearchParams(location.search).has('debug')) window.cqLesson = this;
    this.reset();
    this.injectBlockly();
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

  toggleCode() {
    this.showCode = !this.showCode;
    this.codePanel.hidden = !this.showCode;
    this.codeBtn.textContent = this.showCode ? t('lesson.hideCode') : t('lesson.showCode');
    this.refreshCode();
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
    if (!this.showCode) return;
    this.codeEl.textContent = workspaceCode(this.ws, { display: true }).trim();
  }

  // ---- running ----

  compile() {
    const code = workspaceCode(this.ws, {
      async: this.course.world === 'robot',
      loopTrap: 'if (--__loopGuard < 0) throw new LoopError();\n',
    });
    // Kid code only sees the objects passed in here.
    return new Function('events', 'bit', 'snake', 'game', 'LoopError', `"use strict";\nlet __loopGuard = 100000;\n${code}`);
  }

  makeEvents() {
    const ev = { start: [], tick: [], keys: { up: [], down: [], left: [], right: [] } };
    const api = {
      onStart: (f) => ev.start.push(f),
      onTick: (f) => ev.tick.push(f),
      onKey: (k, f) => ev.keys[k]?.push(f),
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
    let fn;
    try {
      fn = this.compile();
    } catch (e) {
      return this.fail('msg.error', { error: e.message });
    }
    if (this.course.world === 'snake') this.runSnake(fn, id);
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
      try {
        fn(api, bit, null, game, LoopError);
      } catch (e) {
        return this.handleError(e, id);
      }

      if (L.mode === 'play') return this.playRobot(ev, id);

      if (!ev.start.length) return this.fail('msg.noStart');
      try {
        for (const handler of ev.start) await handler();
      } catch (e) {
        return this.handleError(e, id);
      }
      if (id !== this.runId) return;
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
    if (!hasKeys) return this.fail('msg.noKeys');
    this.say(t('lesson.useArrows'), 'info');
    this.world.onMove = () => {
      if (id === this.runId && this.world.atFlag()) this.succeed();
    };
    this.keyHandler = (dir) => {
      for (const handler of ev.keys[dir]) {
        handler().catch((e) => {
          if (e instanceof KidError && e.key === 'msg.bump' && id === this.runId) this.say(t('msg.bump'), 'warn');
          else this.handleError(e, id);
        });
      }
    };
  }

  runSnake(fn, id) {
    const w = this.world;
    w.reset();
    this.showScore(0);
    this.statusEl.textContent = '';
    const { ev, api } = this.makeEvents();
    const { snake, game } = w.api();
    try {
      fn(api, null, snake, game, LoopError);
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
    if (e instanceof KidError) return this.fail(e.key, e.vars);
    if (e instanceof LoopError) return this.fail('msg.loop');
    console.error(e);
    this.fail('msg.error', { error: e?.message || String(e) });
  }

  stop(byButton) {
    this.runId++;
    clearTimeout(this.timer);
    this.timer = null;
    this.keyHandler = null;
    if (this.world) {
      this.world.onMove = null;
      if (this.world.stop) this.world.stop();
    }
    this.runBtn.disabled = false;
    this.stopBtn.disabled = true;
    if (byButton) this.say('');
  }

  reset() {
    this.stop(true);
    if (this.course.world === 'snake') this.world.reset();
    else this.world.load(this.lesson.maps[0]);
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
  }

  fail(key, vars) {
    this.stop(false);
    this.say(t(key, vars), 'warn');
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
        h('h2', {}, L.final ? t('msg.gameDone') : t('msg.success')),
        h('p', {}, L.final ? t('msg.gameDoneSub') : t('msg.successSub')),
        h('div', { class: 'modal-buttons' }, ...buttons),
      ),
    );
    this.root.append(modal);
  }

  close() {
    this.stop(false);
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.resizeObserver?.disconnect();
    if (this.ws) {
      this.saveWorkspace();
      this.ws.dispose();
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
