// Bit's grid world for the basics course.
// Maps are rows of characters: S = start, F = flag, C = coin, # = wall, . = floor.
//
// Kid code runs instantly on the world's state (so `bit.isOnCoin()` is always
// right), and every action is recorded as a frame. play() then animates the
// frames. Kid code never has to wait, so typed code needs no `await`.

import { KidError } from '../errors.js';

const STEPS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const STEP_MS = 260;
const MAX_ACTIONS = 400;
const CELL = 64;

export class RobotWorld {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  load(rows) {
    this.rows = rows;
    this.h = rows.length;
    this.w = Math.max(...rows.map((r) => r.length));
    this.walls = new Set();
    this.coins = new Set();
    this.flag = null;
    this.pos = { x: 0, y: 0 };
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === '#') this.walls.add(key(x, y));
        if (ch === 'C') this.coins.add(key(x, y));
        if (ch === 'F') this.flag = { x, y };
        if (ch === 'S') this.pos = { x, y };
      }),
    );
    this.facing = 'right';
    this.score = 0;
    this.actions = 0;
    this.frames = [];
    // What the screen shows. It catches up with the real state as frames play.
    this.view = { pos: { ...this.pos }, facing: 'right', coins: new Set(this.coins), score: 0 };
    this.drawPos = { ...this.pos };
    this.stopped = false;
    // Every load starts a new "generation". Playback from an older run sees the
    // number changed and quietly stops instead of moving Bit in the new run.
    this.gen = (this.gen || 0) + 1;
    this.bumpAt = null;
    this.canvas.width = this.w * CELL;
    this.canvas.height = this.h * CELL;
    this.draw();
  }

  stop() {
    this.stopped = true;
  }

  // ---- the API kid code calls (as `bit` and `game`) ----

  api() {
    return {
      bit: {
        move: (dir) => this.move(dir),
        pickUpCoin: () => this.pickUp(),
        isOnCoin: () => this.coins.has(key(this.pos.x, this.pos.y)),
      },
      game: {
        changeScore: (n) => {
          this.score += Number(n) || 0;
          this.record('score');
        },
        over: () => {},
        faster: () => {},
      },
    };
  }

  countAction() {
    if (++this.actions > MAX_ACTIONS) throw new KidError('msg.tooManySteps');
  }

  record(kind) {
    this.frames.push({ kind, pos: { ...this.pos }, facing: this.facing, coins: new Set(this.coins), score: this.score });
  }

  /** The frames recorded since the last call. */
  takeFrames() {
    const f = this.frames;
    this.frames = [];
    return f;
  }

  move(dir) {
    if (!STEPS[dir]) throw new KidError('msg.badDirection', { dir: String(dir) });
    this.countAction();
    const [dx, dy] = STEPS[dir];
    this.facing = dir;
    const nx = this.pos.x + dx;
    const ny = this.pos.y + dy;
    if (this.isBlocked(nx, ny)) {
      this.record('bump');
      throw new KidError('msg.bump');
    }
    this.pos = { x: nx, y: ny };
    this.record('move');
  }

  pickUp() {
    this.countAction();
    this.coins.delete(key(this.pos.x, this.pos.y));
    this.record('pickup');
  }

  /** Animate frames one after another. Resolves false if stopped or reloaded. */
  async play(frames) {
    const gen = this.gen;
    const alive = () => gen === this.gen && !this.stopped;
    for (const f of frames) {
      if (!alive()) return false;
      this.view.facing = f.facing;
      if (f.kind === 'move') await this.animate(this.view.pos, f.pos);
      else if (f.kind === 'bump') await this.bump();
      else if (f.kind === 'pickup') {
        this.view.coins = f.coins;
        this.draw();
        await sleep(STEP_MS / 2);
      }
      if (gen !== this.gen) return false;
      this.view.pos = f.pos;
      this.view.coins = f.coins;
      if (f.score !== this.view.score) {
        this.view.score = f.score;
        this.onScore?.(f.score);
      }
    }
    return alive();
  }

  isBlocked(x, y) {
    return x < 0 || y < 0 || x >= this.w || y >= this.h || this.walls.has(key(x, y)) || (this.rows[y][x] ?? ' ') === ' ';
  }

  // ---- goal checks ----

  atFlag(pos = this.pos) {
    return !!this.flag && pos.x === this.flag.x && pos.y === this.flag.y;
  }

  // ---- drawing ----

  /** Slide Bit from one square to the next. Finishes on a timer, so a slow or
   *  hidden window can't make the program wait forever. */
  animate(from, to) {
    const gen = this.gen;
    return new Promise((resolve) => {
      const t0 = performance.now();
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (gen === this.gen) {
          this.drawPos = { ...to };
          this.draw();
        }
        resolve();
      };
      const frame = (now) => {
        if (finished || gen !== this.gen || this.stopped) return finish();
        const p = Math.min(1, (now - t0) / STEP_MS);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        this.drawPos = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
        this.draw();
        if (p < 1) requestAnimationFrame(frame);
        else finish();
      };
      requestAnimationFrame(frame);
      setTimeout(finish, STEP_MS + 40);
    });
  }

  async bump() {
    this.bumpAt = true;
    const base = { ...this.view.pos };
    for (const off of [0.18, -0.12, 0.08, 0]) {
      const [dx, dy] = STEPS[this.view.facing];
      this.drawPos = { x: base.x + dx * off, y: base.y + dy * off };
      this.draw();
      await sleep(60);
    }
    this.bumpAt = null;
    this.draw();
  }

  draw() {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const ch = this.rows[y][x] ?? ' ';
        if (ch === ' ') continue;
        const px = x * CELL;
        const py = y * CELL;
        if (this.walls.has(key(x, y))) {
          ctx.fillStyle = '#5b6b82';
          roundRect(ctx, px + 2, py + 2, CELL - 4, CELL - 4, 10);
          ctx.fill();
          ctx.fillStyle = '#6f80999a';
          roundRect(ctx, px + 8, py + 8, CELL - 16, 12, 5);
          ctx.fill();
        } else {
          ctx.fillStyle = (x + y) % 2 ? '#e8f1fb' : '#f4f8fd';
          ctx.fillRect(px, py, CELL, CELL);
        }
      }
    }
    if (this.flag) drawFlag(ctx, this.flag.x * CELL, this.flag.y * CELL);
    for (const k of this.view.coins) {
      const [x, y] = k.split(',').map(Number);
      drawCoin(ctx, x * CELL + CELL / 2, y * CELL + CELL / 2);
    }
    drawBit(ctx, this.drawPos.x * CELL, this.drawPos.y * CELL, this.view.facing, !!this.bumpAt);
  }
}

function key(x, y) {
  return `${x},${y}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawCoin(ctx, cx, cy) {
  ctx.fillStyle = '#f2b705';
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c98f00';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#ffe37a';
  ctx.beginPath();
  ctx.arc(cx - 4, cy - 4, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawFlag(ctx, x, y) {
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(x + 22, y + 12, 5, 42);
  ctx.fillStyle = '#e5484d';
  ctx.beginPath();
  ctx.moveTo(x + 27, y + 12);
  ctx.lineTo(x + 50, y + 21);
  ctx.lineTo(x + 27, y + 30);
  ctx.closePath();
  ctx.fill();
}

function drawBit(ctx, x, y, facing, ouch) {
  const c = CELL;
  // antenna
  ctx.strokeStyle = '#2e6fda';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + c / 2, y + 16);
  ctx.lineTo(x + c / 2, y + 8);
  ctx.stroke();
  ctx.fillStyle = '#ffc400';
  ctx.beginPath();
  ctx.arc(x + c / 2, y + 7, 4, 0, Math.PI * 2);
  ctx.fill();
  // head
  ctx.fillStyle = ouch ? '#e5484d' : '#2e6fda';
  roundRect(ctx, x + 12, y + 16, c - 24, c - 26, 10);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x + 16, y + 21, c - 32, c - 38, 7);
  ctx.fill();
  // eyes look the way Bit is facing
  const [lx, ly] = { up: [0, -2], down: [0, 2], left: [-3, 0], right: [3, 0] }[facing] || [0, 0];
  ctx.fillStyle = '#1e293b';
  for (const ex of [x + 25, x + c - 25]) {
    ctx.beginPath();
    ctx.arc(ex + lx, y + 31 + ly, ouch ? 2 : 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(x + c / 2 - 6, y + 39, 12, 3);
}
