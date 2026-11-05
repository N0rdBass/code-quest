// The Snake world. The engine only offers building blocks (move, turn, grow,
// "is on food?" ...). The rules of the game (eat, walls, biting yourself) are
// what the kid builds with blocks, so nothing here ends the game by itself.

import { GameOverSignal, KidError } from '../errors.js';

const COLS = 20;
const ROWS = 15;
const CELL = 30;
const START_SPEED = 4; // ticks per second
const MAX_SPEED = 14;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const COLOURS = {
  green: ['#2f9e44', '#40c057'],
  blue: ['#1c7ed6', '#4dabf7'],
  purple: ['#7048e8', '#9775fa'],
  orange: ['#e8590c', '#ff922b'],
  pink: ['#d6336c', '#f783ac'],
};

export class SnakeWorld {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    canvas.width = COLS * CELL;
    canvas.height = ROWS * CELL;
    this.reset();
  }

  reset() {
    this.body = [
      { x: 5, y: 7 },
      { x: 4, y: 7 },
      { x: 3, y: 7 },
    ];
    this.dir = 'right';
    this.lastMoved = 'right';
    this.growBy = 0;
    this.food = null;
    this.score = 0;
    this.speed = START_SPEED;
    this.colour = 'green';
    this.over = false;
    this.overReason = null;
    this.stats = { moves: 0, dirsMoved: new Set(), foodPlaced: false };
    this.draw();
  }

  api() {
    return {
      snake: {
        move: () => this.move(),
        turn: (d) => this.turn(d),
        grow: () => {
          this.growBy++;
        },
        placeFood: () => this.placeFood(),
        isOnFood: () => !!this.food && same(this.head(), this.food),
        hitsWall: () => this.hitsWall(),
        bitesItself: () => this.bitesItself(),
        setColour: (c) => {
          if (!COLOURS[c]) throw new KidError('msg.badColour', { colour: String(c), list: Object.keys(COLOURS).map((k) => `'${k}'`).join(', ') });
          this.colour = c;
        },
      },
      game: {
        changeScore: (n) => {
          this.score += Number(n) || 0;
          this.onScore?.(this.score);
        },
        over: () => {
          this.over = true;
          this.overReason = this.hitsWall() ? 'wall' : this.bitesItself() ? 'self' : 'other';
          throw new GameOverSignal();
        },
        faster: () => {
          this.speed = Math.min(MAX_SPEED, this.speed + 1);
        },
      },
    };
  }

  head() {
    return this.body[0];
  }

  move() {
    const [dx, dy] = DIRS[this.dir];
    const h = this.head();
    this.body.unshift({ x: h.x + dx, y: h.y + dy });
    if (this.growBy > 0) this.growBy--;
    else this.body.pop();
    this.lastMoved = this.dir;
    this.stats.moves++;
    this.stats.dirsMoved.add(this.dir);
  }

  turn(d) {
    if (!DIRS[d]) throw new KidError('msg.badDirection', { dir: String(d) });
    // Turning straight back would mean instantly biting yourself; real Snake ignores that.
    if (this.body.length > 1 && d === OPPOSITE[this.lastMoved]) return;
    this.dir = d;
  }

  placeFood() {
    const taken = new Set(this.body.map((p) => `${p.x},${p.y}`));
    const free = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!taken.has(`${x},${y}`)) free.push({ x, y });
    this.food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
    this.stats.foodPlaced = true;
  }

  hitsWall() {
    const h = this.head();
    return h.x < 0 || h.y < 0 || h.x >= COLS || h.y >= ROWS;
  }

  bitesItself() {
    const h = this.head();
    return this.body.slice(1).some((p) => same(p, h));
  }

  /** True once the whole snake has left the board (no wall rule yet). */
  goneOffScreen() {
    return this.body.every((p) => p.x < 0 || p.y < 0 || p.x >= COLS || p.y >= ROWS);
  }

  tickMs() {
    return Math.round(1000 / this.speed);
  }

  draw() {
    const { ctx } = this;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#a9d977' : '#b5e085';
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
    if (this.food) drawApple(ctx, this.food.x * CELL, this.food.y * CELL);
    const [dark, light] = COLOURS[this.colour];
    for (let i = this.body.length - 1; i >= 0; i--) {
      const p = this.body[i];
      ctx.fillStyle = i === 0 ? dark : i % 2 ? light : dark;
      ctx.beginPath();
      ctx.roundRect(p.x * CELL + 2, p.y * CELL + 2, CELL - 4, CELL - 4, i === 0 ? 10 : 7);
      ctx.fill();
    }
    drawEyes(ctx, this.head(), this.dir, this.over);
    if (this.over) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

function same(a, b) {
  return a.x === b.x && a.y === b.y;
}

function drawApple(ctx, x, y) {
  ctx.fillStyle = '#e03131';
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2 + 2, CELL / 2 - 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff88';
  ctx.beginPath();
  ctx.arc(x + CELL / 2 - 4, y + CELL / 2 - 2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5c3d1e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + CELL / 2, y + 7);
  ctx.lineTo(x + CELL / 2 + 2, y + 2);
  ctx.stroke();
  ctx.fillStyle = '#2f9e44';
  ctx.beginPath();
  ctx.ellipse(x + CELL / 2 + 6, y + 5, 4, 2, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawEyes(ctx, h, dir, dead) {
  const cx = h.x * CELL + CELL / 2;
  const cy = h.y * CELL + CELL / 2;
  const [dx, dy] = DIRS[dir];
  const px = -dy;
  const py = dx;
  for (const side of [-1, 1]) {
    const ex = cx + dx * 4 + px * side * 6;
    const ey = cy + dy * 4 + py * side * 6;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, ey, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    if (dead) {
      ctx.fillRect(ex - 3, ey - 0.75, 6, 1.5);
    } else {
      ctx.beginPath();
      ctx.arc(ex + dx * 1.5, ey + dy * 1.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
