// The Minesweeper world. Like Snake, the engine only offers building blocks
// (open a square, is there a mine here?, place a flag ...). The rules (opening
// a mine ends the game, counting the mines around, winning) are what the kid
// builds, so nothing here ends or wins the game by itself.
//
// Squares have an address: column x (0 = left) and row y (0 = top). Numbers
// along the edges of the board show the columns and rows.

import { GameOverSignal, KidError } from '../errors.js';

const COLS = 9;
const ROWS = 9;
const CELL = 34;
const EDGE = 20; // room for the column and row numbers
const MAX_CLICK_DEPTH = 500;
const NUMBER_COLOURS = ['', '#1c7ed6', '#2f9e44', '#e03131', '#5f3dc4', '#c92a2a', '#0c8599', '#1e293b', '#868e96'];

const key = (x, y) => `${x},${y}`;

export class MinesWorld {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    canvas.width = EDGE + COLS * CELL + 4;
    canvas.height = EDGE + ROWS * CELL + 4;
    this.hover = null;
    this.reset();
  }

  reset() {
    this.mines = new Set();
    this.open = new Map(); // key → the number shown (null = no number)
    this.flags = new Set();
    this.exploded = null;
    this.minesShown = false;
    this.over = false;
    this.overReason = null;
    this.score = 0;
    this.clicks = 0;
    this.current = null; // the square whose click is being handled
    this.depth = 0;
    this.stats = { minesOpened: 0, wrongNumber: null, numbersShown: 0, nonZeroShown: 0, biggestClick: 0 };
    this.draw();
  }

  // ---- the API kid code calls (as `field` and `game`) ----

  api() {
    return {
      field: {
        placeMines: (n) => this.placeMines(n),
        reveal: (x, y, n) => this.reveal(x, y, n),
        hasMine: (x, y) => this.inside(x, y) && this.mines.has(key(x, y)),
        showMines: () => {
          this.minesShown = true;
        },
        toggleFlag: (x, y) => this.toggleFlag(x, y),
        hasFlag: (x, y) => this.flags.has(key(x, y)),
        neighbours: (x, y) => this.neighbours(x, y),
        clickAround: (x, y) => this.clickAround(x, y),
        allSafeOpen: () => this.mines.size > 0 && this.safeOpened() === COLS * ROWS - this.mines.size,
      },
      game: {
        changeScore: (n) => {
          this.score += Number(n) || 0;
          this.onScore?.(this.score);
        },
        over: () => {
          this.over = true;
          this.overReason = this.current && this.mines.has(key(this.current.x, this.current.y)) ? 'mine' : 'other';
          this.minesShown = true;
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

  /** Checks that (x, y) is a real square; kids may pass anything. */
  check(x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !this.inside(x, y)) {
      throw new KidError('msg.offField', { x: String(x), y: String(y), maxX: COLS - 1, maxY: ROWS - 1 });
    }
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < COLS && y < ROWS;
  }

  placeMines(n) {
    const count = Math.max(1, Math.min(COLS * ROWS - 9, Math.round(Number(n)) || 10));
    this.mines = new Set();
    while (this.mines.size < count) this.mines.add(key(randInt(COLS), randInt(ROWS)));
  }

  reveal(x, y, n) {
    this.check(x, y);
    const k = key(x, y);
    if (this.open.has(k)) return;
    if (n !== undefined && !(Number.isInteger(n) && n >= 0)) throw new KidError('msg.badNumber', { n: String(n) });
    this.open.set(k, n === undefined ? null : n);
    if (this.mines.has(k)) {
      this.exploded = { x, y };
      this.stats.minesOpened++;
      return;
    }
    if (n !== undefined) {
      this.stats.numbersShown++;
      const real = this.countAround(x, y);
      if (n > 0) this.stats.nonZeroShown++;
      if (n !== real && !this.stats.wrongNumber) this.stats.wrongNumber = { x, y, shown: n, real };
    }
  }

  toggleFlag(x, y) {
    this.check(x, y);
    const k = key(x, y);
    if (this.open.has(k)) return;
    if (this.flags.has(k)) this.flags.delete(k);
    else this.flags.add(k);
  }

  neighbours(x, y) {
    this.check(x, y);
    const list = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && this.inside(x + dx, y + dy)) list.push({ x: x + dx, y: y + dy });
      }
    }
    return list;
  }

  countAround(x, y) {
    return this.neighbours(x, y).filter((p) => this.mines.has(key(p.x, p.y))).length;
  }

  /** "Click" every closed square around (x, y): the kid's own click code runs for each. */
  clickAround(x, y) {
    for (const p of this.neighbours(x, y)) {
      const k = key(p.x, p.y);
      if (this.open.has(k) || this.flags.has(k)) continue;
      if (++this.depth > MAX_CLICK_DEPTH) throw new KidError('msg.tooDeep');
      try {
        this.handle(p.x, p.y, () => this.onClickRequest?.(p.x, p.y));
      } finally {
        this.depth--;
      }
    }
  }

  /** Run `fn` as the click on (x, y), so game over knows which square it was. */
  handle(x, y, fn) {
    const before = this.current;
    this.current = { x, y };
    try {
      return fn();
    } finally {
      this.current = before;
    }
  }

  /** A player's click (not one from clickAround). The first click is never a mine. */
  playerClick(x, y, fn) {
    if (this.clicks++ === 0 && this.mines.has(key(x, y))) this.moveMineAway(x, y);
    const openBefore = this.open.size;
    try {
      return this.handle(x, y, fn);
    } finally {
      this.stats.biggestClick = Math.max(this.stats.biggestClick, this.open.size - openBefore);
    }
  }

  moveMineAway(x, y) {
    this.mines.delete(key(x, y));
    for (;;) {
      const k = key(randInt(COLS), randInt(ROWS));
      if (k !== key(x, y) && !this.mines.has(k)) return this.mines.add(k);
    }
  }

  safeOpened() {
    let n = 0;
    for (const k of this.open.keys()) if (!this.mines.has(k)) n++;
    return n;
  }

  /** The square under a mouse position, or null. */
  squareAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const sx = ((clientX - r.left) * this.canvas.width) / r.width - EDGE;
    const sy = ((clientY - r.top) * this.canvas.height) / r.height - EDGE;
    const x = Math.floor(sx / CELL);
    const y = Math.floor(sy / CELL);
    return this.inside(x, y) ? { x, y } : null;
  }

  // ---- drawing ----

  draw() {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = '700 13px Nunito, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Column and row numbers, so kids can read each square's address.
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = this.hover?.x === x ? '#2e6fda' : '#5b6b82';
      ctx.fillText(String(x), EDGE + x * CELL + CELL / 2, EDGE / 2 + 1);
    }
    for (let y = 0; y < ROWS; y++) {
      ctx.fillStyle = this.hover?.y === y ? '#2e6fda' : '#5b6b82';
      ctx.fillText(String(y), EDGE / 2, EDGE + y * CELL + CELL / 2);
    }
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) this.drawSquare(x, y);
    }
    if (this.over && this.overReason === 'win') {
      ctx.fillStyle = 'rgba(47, 158, 68, 0.18)';
      ctx.fillRect(EDGE, EDGE, COLS * CELL, ROWS * CELL);
    }
  }

  drawSquare(x, y) {
    const { ctx } = this;
    const k = key(x, y);
    const px = EDGE + x * CELL;
    const py = EDGE + y * CELL;
    const isOpen = this.open.has(k);
    const mine = this.mines.has(k);
    if (isOpen) {
      ctx.fillStyle = this.exploded?.x === x && this.exploded?.y === y ? '#ffa8a8' : '#eef2f7';
      ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    } else {
      const hovered = this.hover?.x === x && this.hover?.y === y;
      ctx.fillStyle = hovered ? '#a5c8f5' : '#8fb4e3';
      ctx.beginPath();
      ctx.roundRect(px + 2, py + 2, CELL - 4, CELL - 4, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(px + 6, py + 5, CELL - 12, 4);
    }
    if (mine && (isOpen || this.minesShown)) drawMine(ctx, px + CELL / 2, py + CELL / 2);
    else if (isOpen) {
      const n = this.open.get(k);
      if (n) {
        ctx.font = '800 18px Nunito, "Segoe UI", sans-serif';
        ctx.fillStyle = NUMBER_COLOURS[n] || '#1e293b';
        ctx.fillText(String(n), px + CELL / 2, py + CELL / 2 + 1);
        ctx.font = '700 13px Nunito, "Segoe UI", sans-serif';
      }
    } else if (this.flags.has(k)) drawFlag(ctx, px, py);
  }
}

function randInt(n) {
  return Math.floor(Math.random() * n);
}

function drawMine(ctx, cx, cy) {
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2.5;
  for (let a = 0; a < 4; a++) {
    const ang = (a * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(ang) * 10, cy - Math.sin(ang) * 10);
    ctx.lineTo(cx + Math.cos(ang) * 10, cy + Math.sin(ang) * 10);
    ctx.stroke();
  }
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx - 3, cy - 3, 2.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawFlag(ctx, px, py) {
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(px + 13, py + 7, 3, 20);
  ctx.fillStyle = '#e03131';
  ctx.beginPath();
  ctx.moveTo(px + 16, py + 7);
  ctx.lineTo(px + 27, py + 12);
  ctx.lineTo(px + 16, py + 17);
  ctx.closePath();
  ctx.fill();
}
