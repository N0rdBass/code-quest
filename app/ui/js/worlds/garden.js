// Hageforsvar / Garden defence: Bit's garden vs bugs.
// A lawn of 5 rows and 9 columns, with Bit's house on the left. Snails and
// beetles crawl in from the right. Bit builds sprinklers (they shoot water
// drops along their row) and fences (they hold bugs back). Every squashed bug
// leaves a coin.
//
// Like Snake and Minesweeper, the engine only offers building blocks. The rules
// (when bugs come, when sprinklers shoot, what building costs, losing, winning)
// are what the kid builds. Only "physics" happens by itself: water drops fly,
// a drop that hits a bug hurts it, and a bug eats whatever stands in its way.

import { GameOverSignal, KidError } from '../errors.js';

const COLS = 9;
const ROWS = 5;
const CELL = 46;
const LEFT = 58; // the house strip + row numbers
const TOP = 20; // column numbers
const TICK_MS = 150;
const DROP_SPEED = 0.35;
const START_COINS = 0;
const BUGS = {
  snail: { hp: 3, speed: 0.05, body: '#c08552', shell: '#e0a458' },
  beetle: { hp: 2, speed: 0.08, body: '#1e293b', shell: '#e03131' },
};
const GADGET_HP = { sprinkler: 15, fence: 60 };

const key = (x, y) => `${x},${y}`;

export class GardenWorld {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    canvas.width = LEFT + COLS * CELL + 4;
    canvas.height = TOP + ROWS * CELL + 4;
    this.hover = null;
    this.reset();
  }

  reset() {
    this.gadgets = new Map(); // key → { type, x, y, hp }
    this.bugs = [];
    this.drops = [];
    this.puffs = [];
    this.coins = START_COINS;
    this.ticks = 0;
    this.nextId = 1;
    this.over = false;
    this.overReason = null;
    this.stats = { built: 0, sprinklers: 0, fences: 0, spawned: 0, stopped: 0, reachedHouse: 0, shots: 0, coinsWentNegative: false, spent: 0 };
    this.onScore?.(this.coins);
    this.draw();
  }

  tickMs() {
    return TICK_MS;
  }

  // ---- the API kid code calls (as `garden` and `game`) ----

  api() {
    return {
      garden: {
        build: (x, y) => this.build('sprinkler', x, y),
        buildFence: (x, y) => this.build('fence', x, y),
        isEmpty: (x, y) => {
          this.check(x, y);
          return !this.gadgets.has(key(x, y));
        },
        newBug: () => this.newBug(),
        moveBugs: () => this.moveBugs(),
        sprinklers: () => [...this.gadgets.values()].filter((g) => g.type === 'sprinkler').map((g) => ({ x: g.x, y: g.y })),
        shoot: (x, y) => this.shoot(x, y),
        bugAtHouse: () => this.bugs.some((b) => b.x < 0),
        stopped: () => this.stats.stopped,
      },
      game: {
        changeCoins: (n) => {
          const d = Math.round(Number(n)) || 0;
          this.coins += d;
          if (d < 0) this.stats.spent -= d;
          if (this.coins < 0) this.stats.coinsWentNegative = true;
          this.onScore?.(this.coins);
        },
        coins: () => this.coins,
        every: (n) => {
          const k = Math.round(Number(n));
          if (!(k > 0)) throw new KidError('msg.badEvery', { n: String(n) });
          return this.ticks % k === 0;
        },
        changeScore: (n) => {
          this.coins += Number(n) || 0;
          this.onScore?.(this.coins);
        },
        over: () => {
          this.over = true;
          this.overReason = this.bugs.some((b) => b.x < 0) ? 'house' : 'other';
          throw new GameOverSignal();
        },
        win: () => {
          this.over = true;
          this.overReason = 'win';
          throw new GameOverSignal();
        },
        faster: () => {},
      },
    };
  }

  check(x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= COLS || y >= ROWS) {
      throw new KidError('msg.offField', { x: String(x), y: String(y), maxX: COLS - 1, maxY: ROWS - 1 });
    }
  }

  build(type, x, y) {
    this.check(x, y);
    if (this.gadgets.has(key(x, y))) return;
    this.gadgets.set(key(x, y), { type, x, y, hp: GADGET_HP[type], cooldown: 0 });
    this.stats.built++;
    this.stats[type === 'fence' ? 'fences' : 'sprinklers']++;
  }

  newBug() {
    const kind = Math.random() < 0.4 ? 'beetle' : 'snail';
    const y = Math.floor(Math.random() * ROWS);
    this.bugs.push({ id: this.nextId++, kind, y, x: COLS - 0.01, hp: BUGS[kind].hp, eating: false, hurt: 0 });
    this.stats.spawned++;
  }

  /** Every bug crawls one small step left, or eats the gadget in its way. */
  moveBugs() {
    for (const bug of this.bugs) {
      const col = Math.floor(bug.x);
      const gadget = this.gadgets.get(key(col, bug.y));
      if (gadget && bug.x - col < 0.75 && bug.x > 0) {
        bug.eating = true;
        if (--gadget.hp <= 0) this.gadgets.delete(key(col, bug.y));
        continue;
      }
      bug.eating = false;
      bug.x -= BUGS[bug.kind].speed;
    }
  }

  shoot(x, y) {
    this.check(x, y);
    const g = this.gadgets.get(key(x, y));
    if (!g || g.type !== 'sprinkler') throw new KidError('msg.noSprinkler', { x, y });
    this.drops.push({ x: x + 0.6, y });
    this.stats.shots++;
  }

  /** Called by the lesson once per tick, after the kid's tick code. */
  physics() {
    for (const drop of this.drops) {
      drop.x += DROP_SPEED;
      const hit = this.bugs.find((b) => b.y === drop.y && b.hp > 0 && Math.abs(b.x + 0.5 - drop.x) < 0.45);
      if (hit) {
        drop.gone = true;
        hit.hp--;
        hit.hurt = 3;
        if (hit.hp <= 0) {
          this.stats.stopped++;
          this.coins += 5; // a squashed bug leaves a coin
          this.onScore?.(this.coins);
          this.puffs.push({ x: hit.x + 0.5, y: hit.y, t: 6 });
        }
      }
      if (drop.x > COLS) drop.gone = true;
    }
    this.drops = this.drops.filter((d) => !d.gone);
    // Bugs that got all the way into the house leave the board.
    for (const bug of this.bugs) if (bug.x < -0.9) this.stats.reachedHouse++;
    this.bugs = this.bugs.filter((b) => b.hp > 0 && b.x >= -0.9);
    for (const b of this.bugs) if (b.hurt) b.hurt--;
    for (const p of this.puffs) p.t--;
    this.puffs = this.puffs.filter((p) => p.t > 0);
  }

  /** The square under a mouse position, or null. */
  squareAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const sx = ((clientX - r.left) * this.canvas.width) / r.width - LEFT;
    const sy = ((clientY - r.top) * this.canvas.height) / r.height - TOP;
    const x = Math.floor(sx / CELL);
    const y = Math.floor(sy / CELL);
    return x >= 0 && y >= 0 && x < COLS && y < ROWS ? { x, y } : null;
  }

  // ---- drawing ----

  draw() {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 12px Nunito, "Segoe UI", sans-serif';
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = this.hover?.x === x ? '#2e6fda' : '#5b6b82';
      ctx.fillText(String(x), LEFT + x * CELL + CELL / 2, TOP / 2 + 1);
    }
    drawHouse(ctx, 2, TOP, LEFT - 22, ROWS * CELL);
    for (let y = 0; y < ROWS; y++) {
      ctx.fillStyle = this.hover?.y === y ? '#2e6fda' : '#5b6b82';
      ctx.fillText(String(y), LEFT - 10, TOP + y * CELL + CELL / 2);
      for (let x = 0; x < COLS; x++) {
        const hovered = this.hover?.x === x && this.hover?.y === y;
        ctx.fillStyle = hovered ? '#c3eba0' : (x + y) % 2 ? '#a9d977' : '#b5e085';
        ctx.fillRect(LEFT + x * CELL, TOP + y * CELL, CELL, CELL);
      }
    }
    for (const g of this.gadgets.values()) (g.type === 'fence' ? drawFence : drawSprinkler)(ctx, LEFT + g.x * CELL, TOP + g.y * CELL, g.hp / GADGET_HP[g.type]);
    ctx.fillStyle = '#4dabf7';
    for (const d of this.drops) {
      ctx.beginPath();
      ctx.ellipse(LEFT + d.x * CELL, TOP + d.y * CELL + CELL / 2 - 4, 6, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const b of this.bugs) drawBug(ctx, LEFT + b.x * CELL, TOP + b.y * CELL, b, this.ticks);
    for (const p of this.puffs) {
      ctx.fillStyle = `rgba(242, 183, 5, ${p.t / 6})`;
      ctx.beginPath();
      ctx.arc(LEFT + p.x * CELL, TOP + p.y * CELL + CELL / 2 - (6 - p.t) * 3, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.over) {
      ctx.fillStyle = this.overReason === 'win' ? 'rgba(47, 158, 68, 0.2)' : 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(LEFT, TOP, COLS * CELL, ROWS * CELL);
    }
  }
}

function drawHouse(ctx, x, y, w, h) {
  ctx.fillStyle = '#f1e3c8';
  ctx.fillRect(x, y + 14, w, h - 14);
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.moveTo(x - 2, y + 16);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x + w + 2, y + 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8d5a2b';
  ctx.fillRect(x + w / 2 - 7, y + h - 26, 14, 26);
  ctx.fillStyle = '#7ec8f2';
  ctx.fillRect(x + w / 2 - 8, y + h / 2 - 20, 16, 14);
}

function drawSprinkler(ctx, px, py, health) {
  const cx = px + 23;
  const cy = py + 23;
  ctx.fillStyle = '#5b6b82';
  ctx.fillRect(cx - 3, cy, 6, 15);
  ctx.fillStyle = '#2e6fda';
  ctx.beginPath();
  ctx.roundRect(cx - 12, cy - 13, 24, 18, 6);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(cx - 8, cy - 9, 16, 10, 4);
  ctx.fill();
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(cx - 5, cy - 6, 3, 3);
  ctx.fillRect(cx + 2, cy - 6, 3, 3);
  ctx.fillStyle = '#4dabf7';
  ctx.fillRect(cx + 12, cy - 8, 6, 6);
  drawHealth(ctx, px, py, health);
}

function drawFence(ctx, px, py, health) {
  ctx.fillStyle = '#a0703f';
  for (const dx of [8, 20, 32]) {
    ctx.beginPath();
    ctx.moveTo(px + dx, py + 8);
    ctx.lineTo(px + dx + 4, py + 4);
    ctx.lineTo(px + dx + 8, py + 8);
    ctx.lineTo(px + dx + 8, py + 40);
    ctx.lineTo(px + dx, py + 40);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(px + 5, py + 16, 38, 5);
  ctx.fillRect(px + 5, py + 30, 38, 5);
  drawHealth(ctx, px, py, health);
}

function drawHealth(ctx, px, py, health) {
  if (health >= 1) return;
  ctx.fillStyle = '#00000033';
  ctx.fillRect(px + 6, py + 41, 34, 3);
  ctx.fillStyle = health > 0.4 ? '#2f9e44' : '#e03131';
  ctx.fillRect(px + 6, py + 41, 34 * Math.max(0, health), 3);
}

function drawBug(ctx, px, py, bug, ticks) {
  const look = BUGS[bug.kind];
  const wiggle = bug.eating ? Math.sin(ticks) * 1.5 : 0;
  const cx = px + 23 + wiggle;
  const cy = py + 26;
  ctx.globalAlpha = bug.hurt ? 0.6 : 1;
  if (bug.kind === 'snail') {
    ctx.fillStyle = look.body;
    ctx.beginPath();
    ctx.roundRect(cx - 16, cy + 2, 30, 9, 5);
    ctx.fill();
    ctx.strokeStyle = look.body;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 13, cy + 3);
    ctx.lineTo(cx - 17, cy - 6);
    ctx.stroke();
    ctx.fillStyle = look.shell;
    ctx.beginPath();
    ctx.arc(cx + 2, cy - 2, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#a0603a';
    ctx.beginPath();
    ctx.arc(cx + 2, cy - 2, 6, 0, Math.PI * 1.6);
    ctx.stroke();
  } else {
    ctx.fillStyle = look.body;
    ctx.beginPath();
    ctx.arc(cx - 11, cy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = look.body;
    ctx.lineWidth = 2;
    for (const dx of [-5, 2, 9]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx, cy - 9);
      ctx.lineTo(cx + dx - 3, cy - 14);
      ctx.moveTo(cx + dx, cy + 9);
      ctx.lineTo(cx + dx - 3, cy + 14);
      ctx.stroke();
    }
    ctx.fillStyle = look.shell;
    ctx.beginPath();
    ctx.ellipse(cx + 3, cy, 13, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.lineTo(cx + 16, cy);
    ctx.stroke();
    ctx.fillStyle = '#1e293b';
    for (const [dx, dy] of [[-2, -5], [8, 4], [6, -5]]) {
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
