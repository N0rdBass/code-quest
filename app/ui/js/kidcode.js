// Typed code (code mode). A small tokenizer does several jobs:
//   - colours the code in the editor
//   - checks the code while the kid types, like VS Code does: missing } or ",
//     a loop without { }, a command that doesn't exist (bit.mvoe), a direction
//     that doesn't exist ('downn'), a missing ;. Each problem knows exactly
//     which characters are wrong, so the editor can underline them.
//   - puts a guard inside every loop, so `while (true) {}` can't freeze the app,
//     and tags every command with its place in the code, so an error while the
//     game runs can point at the exact command (in every browser engine)
// Then the code is turned into the same kind of program the blocks make.

import { LoopError } from './errors.js';

// The functions a kid writes, and the event each one belongs to.
export const EVENT_FUNCS = {
  whenRunClicked: 'start',
  everyTick: 'tick',
  whenKeyUp: 'up',
  whenKeyDown: 'down',
  whenKeyLeft: 'left',
  whenKeyRight: 'right',
  whenSquareClicked: 'click',
  whenSquareRightClicked: 'rightClick',
  whenCreated: 'created',
  whenHit: 'hit',
};

const KEYWORDS = new Set([
  'function', 'for', 'while', 'do', 'if', 'else', 'let', 'const', 'var', 'return',
  'true', 'false', 'null', 'undefined', 'break', 'continue', 'new', 'of', 'in', 'typeof',
]);
const OBJECTS = new Set(['bit', 'snake', 'game', 'console', 'Math', 'field', 'garden', 'me']);
const PAIRS = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = new Set([')', ']', '}']);

const SOURCE_NAME = 'player-code';

// ---------------------------------------------------------------------------
// Tokenizer

/**
 * Splits code into tokens: id, num, str, comment, punct, ws, nl.
 * Good enough for kid code; it doesn't know regex literals.
 */
export function tokenize(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  let line = 1;
  while (i < n) {
    const c = src[i];
    const start = i;
    const startLine = line;
    let type;
    let unclosed = false;
    if (c === '\n') {
      i++;
      line++;
      type = 'nl';
    } else if (c === ' ' || c === '\t' || c === '\r') {
      while (i < n && (src[i] === ' ' || src[i] === '\t' || src[i] === '\r')) i++;
      type = 'ws';
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      type = 'comment';
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      unclosed = end < 0;
      i = unclosed ? n : end + 2;
      line += countNewlines(src, start, i);
      type = 'comment';
    } else if (c === '"' || c === "'" || c === '`') {
      i++;
      unclosed = true;
      while (i < n) {
        const d = src[i];
        if (d === '\\') {
          i += 2;
          continue;
        }
        if (d === c) {
          i++;
          unclosed = false;
          break;
        }
        if (d === '\n') {
          if (c !== '`') break;
          line++;
        }
        i++;
      }
      type = 'str';
    } else if (/[\p{L}_$]/u.test(c)) {
      while (i < n && /[\p{L}\p{N}_$]/u.test(src[i])) i++;
      type = 'id';
    } else if (c >= '0' && c <= '9') {
      while (i < n && /[\w.]/.test(src[i])) i++;
      type = 'num';
    } else {
      i++;
      type = 'punct';
    }
    out.push({ type, value: src.slice(start, i), start, end: i, line: startLine, unclosed });
  }
  return out;
}

function countNewlines(s, from, to) {
  let k = 0;
  for (let i = from; i < to; i++) if (s[i] === '\n') k++;
  return k;
}

const significant = (tokens) => tokens.filter((t) => t.type !== 'ws' && t.type !== 'nl' && t.type !== 'comment');

// ---------------------------------------------------------------------------
// Colours for the editor

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Coloured HTML for the code. `problems` ({ start, end, severity }) get a
 * squiggly underline over exactly their characters.
 */
export function highlight(code, problems = []) {
  const tokens = tokenize(code);
  // Places where the underline starts or stops, so tokens can be cut there.
  const cuts = new Set();
  for (const p of problems) {
    cuts.add(p.start);
    cuts.add(p.end);
  }
  const squiggle = (at) => {
    let sev = null;
    for (const p of problems) if (p.start <= at && at < p.end) sev = sev === 'error' ? sev : p.severity;
    return sev;
  };
  let html = '';
  tokens.forEach((t, k) => {
    let cls = null;
    if (t.type === 'comment') cls = 'c';
    else if (t.type === 'str') cls = 's';
    else if (t.type === 'num') cls = 'n';
    else if (t.type === 'id') {
      const prev = tokens[k - 1];
      if (prev && prev.value === '.') cls = 'm';
      else if (KEYWORDS.has(t.value)) cls = 'k';
      else if (OBJECTS.has(t.value)) cls = 'o';
      else if (t.value in EVENT_FUNCS) cls = 'e';
    }
    // Split the token wherever an underline starts or stops.
    let from = t.start;
    for (let at = t.start + 1; at <= t.end; at++) {
      if (at < t.end && !cuts.has(at)) continue;
      const text = escapeHtml(code.slice(from, at));
      const sev = squiggle(from);
      const classes = [cls && `t-${cls}`, sev && `sq-${sev}`].filter(Boolean).join(' ');
      html += classes ? `<span class="${classes}">${text}</span>` : text;
      from = at;
    }
  });
  return html;
}

// ---------------------------------------------------------------------------
// Checking

/**
 * A mistake the kid can fix: a translation key, its values, the line, and
 * the exact characters that are wrong (start/end offsets in the code).
 */
export class CodeProblem extends Error {
  constructor(key, vars = {}, line = null, start = null, end = null, severity = 'error') {
    super(key);
    Object.assign(this, { key, vars, line, start, end, severity });
  }
}

const problemAt = (tok, key, vars, severity) => new CodeProblem(key, vars, tok.line, tok.start, tok.end, severity);

/** Unclosed strings and comments, and brackets that don't match. */
function checkBrackets(tokens) {
  const stack = [];
  for (const t of tokens) {
    if (t.type === 'str' && t.unclosed) throw problemAt(t, 'code.err.string', { q: t.value[0] });
    if (t.type === 'comment' && t.unclosed) throw problemAt(t, 'code.err.comment', {});
    if (t.type !== 'punct') continue;
    if (PAIRS[t.value]) stack.push(t);
    else if (CLOSERS.has(t.value)) {
      // No opener of this kind is waiting at all: it's simply one too many.
      if (!stack.some((o) => PAIRS[o.value] === t.value)) throw problemAt(t, 'code.err.extraClose', { ch: t.value });
      const open = stack.pop();
      // An open ( or [ is almost always closed on its own line, so point there.
      if (PAIRS[open.value] !== t.value && open.value !== '{') {
        throw problemAt(open, 'code.err.unclosed', { open: open.value, close: PAIRS[open.value] });
      }
      if (PAIRS[open.value] !== t.value) {
        throw problemAt(t, 'code.err.mismatch', { open: open.value, close: t.value, want: PAIRS[open.value], openLine: open.line });
      }
    }
  }
  if (stack.length) {
    const open = stack[stack.length - 1];
    throw problemAt(open, 'code.err.unclosed', { open: open.value, close: PAIRS[open.value] });
  }
}

/** Index of the token that closes sig[from] (an opening bracket). */
function matching(sig, from) {
  let depth = 0;
  for (let j = from; j < sig.length; j++) {
    if (PAIRS[sig[j].value]) depth++;
    else if (CLOSERS.has(sig[j].value) && --depth === 0) return j;
  }
  return -1;
}

const isKeyword = (sig, j, word) => sig[j].type === 'id' && sig[j].value === word && sig[j - 1]?.value !== '.';

/** Loops must have ( ) and { }. Returns where each loop body starts (for the guards). */
function findLoops(sig) {
  const loops = [];
  for (let j = 0; j < sig.length; j++) {
    if (isKeyword(sig, j, 'do')) {
      if (sig[j + 1]?.value !== '{') throw problemAt(sig[j], 'code.err.loopBraces', { kw: 'do' });
      loops.push({ kw: sig[j], body: sig[j + 1] });
      continue;
    }
    const kw = sig[j].value;
    if (!(isKeyword(sig, j, 'for') || isKeyword(sig, j, 'while'))) continue;
    if (sig[j + 1]?.value !== '(') throw problemAt(sig[j], 'code.err.loopParen', { kw });
    const next = sig[matching(sig, j + 1) + 1];
    if (next?.value === '{') {
      loops.push({ kw: sig[j], body: next });
      continue;
    }
    // The end of a do { ... } while (...); loop. Its body already has a guard.
    if (kw === 'while' && sig[j - 1]?.value === '}' && (!next || next.value === ';' || next.value === '}')) continue;
    throw problemAt(sig[j], 'code.err.loopBraces', { kw });
  }
  return loops;
}

/** Functions whose name is almost an event name, like `whenrunclicked`. */
function checkEventNames(sig) {
  const lower = Object.fromEntries(Object.keys(EVENT_FUNCS).map((k) => [k.toLowerCase(), k]));
  for (let j = 0; j < sig.length - 1; j++) {
    if (!isKeyword(sig, j, 'function') || sig[j + 1].type !== 'id') continue;
    const name = sig[j + 1].value;
    const want = lower[name.toLowerCase()];
    if (want && want !== name) throw problemAt(sig[j + 1], 'code.err.eventName', { name, want });
  }
}

// What each object can do, and which words its commands accept.
const DIRECTIONS = ['up', 'down', 'left', 'right'];
const COLOURS = ['green', 'blue', 'purple', 'orange', 'pink'];
const API = {
  bit: { move: DIRECTIONS, pickUpCoin: null, isOnCoin: null },
  snake: { move: null, turn: DIRECTIONS, grow: null, placeFood: null, isOnFood: null, hitsWall: null, bitesItself: null, setColour: COLOURS },
  game: { changeScore: null, over: null, faster: null, win: null, changeCoins: null, coins: null, every: null },
  garden: { build: null, buildFence: null, isEmpty: null, newBug: null, bugAtHouse: null, stopped: null },
  me: {}, // depends on the script: see ME_API
  field: { placeMines: null, reveal: null, hasMine: null, showMines: null, toggleFlag: null, hasFlag: null, neighbours: null, clickAround: null, allSafeOpen: null },
  console: { log: null, info: null, warn: null, error: null },
};
const WORLD_OBJECTS = { robot: ['bit', 'game', 'console'], snake: ['snake', 'game', 'console'], minesweeper: ['field', 'game', 'console'], garden: ['garden', 'game', 'console'] };

// Games with several scripts (Garden defence): what each script can use. In an
// object's script, `me` is the object running it ("this bug", "this sprinkler").
// 'prop' marks a value (me.speed), not a command, so it takes no ( ).
const SCRIPT_OBJECTS = {
  garden: ['garden', 'game', 'console'],
  bug: ['me', 'game', 'garden', 'console'],
  sprinkler: ['me', 'game', 'garden', 'console'],
};
const ME_API = {
  bug: { move: null, squash: null, speed: 'prop', hp: 'prop', kind: 'prop', x: 'prop', y: 'prop' },
  sprinkler: { shoot: null, x: 'prop', y: 'prop' },
};
const isProp = (u, script) => u.obj.value === 'me' && ME_API[script]?.[u.member.value] === 'prop';

/** Each use of an object, like `bit.move('right')`: where it is and what's in it. */
function apiUses(sig) {
  const uses = [];
  for (let j = 0; j < sig.length; j++) {
    const t = sig[j];
    if (t.type !== 'id' || !API[t.value] || sig[j - 1]?.value === '.' || sig[j + 1]?.value !== '.') continue;
    const member = sig[j + 2];
    if (member?.type !== 'id') continue;
    const call = sig[j + 3]?.value === '(' ? j + 3 : -1;
    const close = call >= 0 ? matching(sig, call) : -1;
    uses.push({ j, obj: t, member, call, close, end: close >= 0 ? sig[close].end : member.end });
  }
  return uses;
}

/** Commands that don't exist, objects not in this lesson, and wrong words like 'downn'. */
function checkApi(sig, world, script) {
  const problems = [];
  const here = (script && SCRIPT_OBJECTS[script]) || WORLD_OBJECTS[world] || Object.keys(API);
  for (const u of apiUses(sig)) {
    const obj = u.obj.value;
    if (!here.includes(obj)) {
      problems.push(problemAt(u.obj, obj === 'me' ? 'code.err.noMeHere' : 'code.err.notInLesson', { name: obj }));
      continue;
    }
    const allowed = obj === 'me' ? ME_API[script] || {} : API[obj];
    if (!(u.member.value in allowed)) {
      const near = Object.keys(allowed).find((m) => m.toLowerCase() === u.member.value.toLowerCase());
      problems.push(problemAt(u.member, near ? 'code.err.wrongCase' : 'code.err.noCommand', { name: `${obj}.${u.member.value}`, want: `${obj}.${near}`, obj }));
      continue;
    }
    if (allowed[u.member.value] === 'prop') {
      // A value like me.speed: it's read or set, never run with ( ).
      if (u.call >= 0) problems.push(problemAt(u.member, 'code.err.propCalled', { name: `${obj}.${u.member.value}` }));
      continue;
    }
    if (u.call < 0) {
      problems.push(problemAt(u.member, 'code.err.needParens', { name: `${obj}.${u.member.value}` }));
      continue;
    }
    // A word the command doesn't know: bit.move('downn')
    const words = allowed[u.member.value];
    const arg = sig[u.call + 1];
    if (words && arg?.type === 'str' && !arg.unclosed && !arg.value.startsWith('`')) {
      const word = arg.value.slice(1, -1);
      if (!words.includes(word)) {
        problems.push(problemAt(arg, 'code.err.badWord', { word, name: `${obj}.${u.member.value}`, list: words.map((w) => `'${w}'`).join(', ') }));
      }
    }
  }
  return problems;
}

// Commands that ask a question (they answer true/false or give a list).
// Alone on a line they do nothing: the answer is thrown away.
const QUESTIONS = new Set([
  'bit.isOnCoin', 'snake.isOnFood', 'snake.hitsWall', 'snake.bitesItself',
  'field.hasMine', 'field.hasFlag', 'field.allSafeOpen', 'field.neighbours',
  'garden.isEmpty', 'garden.bugAtHouse', 'garden.stopped', 'game.coins', 'game.every',
]);

/** Is this use of an object the start of a command (not part of a bigger expression)? */
function startsCommand(sig, u) {
  const before = sig[u.j - 1];
  const newLine = before && before.line < u.obj.line && /[\w$)\]'"`]$/.test(before.value);
  return !before || ['{', '}', ';'].includes(before.value) || newLine;
}

/**
 * The ( ) after if / while may only hold a question. Two common mix-ups:
 *  - a command inside it: if (field.hasMine(x, y) field.reveal(x, y)) …
 *  - two questions side by side without && (and) or || (or) between them
 */
function checkConditions(sig, script) {
  const problems = [];
  const uses = apiUses(sig).filter((u) => !isProp(u, script));
  for (let j = 0; j < sig.length; j++) {
    if (!(isKeyword(sig, j, 'if') || isKeyword(sig, j, 'while')) || sig[j + 1]?.value !== '(') continue;
    const kw = sig[j].value;
    const open = j + 1;
    const close = matching(sig, open);
    if (close < 0) continue;
    const command = uses.find((u) => u.j > open && u.j < close && !QUESTIONS.has(`${u.obj.value}.${u.member.value}`));
    if (command) {
      const name = `${command.obj.value}.${command.member.value}`;
      problems.push(new CodeProblem('code.err.commandInIf', { name, kw }, command.obj.line, command.obj.start, command.end));
      continue;
    }
    // Two things next to each other at the top level of the ( ): `a() b()`
    let depth = 0;
    for (let k = open + 1; k < close; k++) {
      const v = sig[k].value;
      if (PAIRS[v]) depth++;
      else if (CLOSERS.has(v)) depth--;
      const next = sig[k + 1];
      const ends = sig[k].type === 'id' || sig[k].type === 'num' || sig[k].type === 'str' || v === ')';
      const starts = next && k + 1 < close && (next.type === 'id' || next.type === 'num' || next.type === 'str');
      if (depth === 0 && ends && starts && !KEYWORDS.has(next.value)) {
        problems.push(new CodeProblem('code.err.twoInIf', { kw }, next.line, next.start, next.end));
        break;
      }
    }
  }
  return problems;
}

/**
 * Mistakes that run without crashing but make the game wrong:
 *  - a question alone on a line: field.hasMine(x, y); (should be inside an if)
 *  - opening the square inside the counting loop, before counting is done
 */
function checkLogic(sig) {
  const problems = [];
  const uses = apiUses(sig);
  for (const u of uses) {
    const name = `${u.obj.value}.${u.member.value}`;
    if (u.close < 0 || !QUESTIONS.has(name) || !startsCommand(sig, u)) continue;
    const after = sig[u.close + 1];
    if (after && ![';', '}'].includes(after.value) && after.line === sig[u.close].line) continue;
    problems.push(new CodeProblem('code.err.unusedQuestion', { name }, u.obj.line, u.obj.start, sig[u.close].end));
  }
  // for (const square of field.neighbours(...)) { ... field.reveal(...) ... }
  for (let j = 0; j < sig.length; j++) {
    if (!isKeyword(sig, j, 'for') || sig[j + 1]?.value !== '(' || sig[j + 4]?.value !== 'of') continue;
    const headClose = matching(sig, j + 1);
    if (sig[headClose + 1]?.value !== '{' || !sig.slice(j + 5, headClose).some((t) => t.value === 'neighbours')) continue;
    const bodyOpen = headClose + 1;
    const bodyClose = matching(sig, bodyOpen);
    for (const u of uses) {
      if (u.j > bodyOpen && u.j < bodyClose && u.obj.value === 'field' && u.member.value === 'reveal') {
        problems.push(new CodeProblem('code.err.revealInLoop', { line: sig[bodyClose].line }, u.obj.line, u.obj.start, u.end));
      }
    }
  }
  return problems;
}

/**
 * Gentle warnings for a command without ; at the end. JavaScript doesn't
 * need it, but the lessons teach that every command ends with ;.
 */
function checkSemicolons(sig) {
  const problems = [];
  for (const u of apiUses(sig)) {
    if (u.close < 0) continue;
    const after = sig[u.close + 1];
    if (!startsCommand(sig, u) || [';', '.', ')', ','].includes(after?.value)) continue;
    const close = sig[u.close];
    problems.push(new CodeProblem('code.warn.semicolon', {}, close.line, close.start, close.end, 'warning'));
  }
  return problems;
}

/** For a syntax error the engine doesn't place: find the line that breaks it. */
function findBadLine(code) {
  const lines = code.split('\n');
  for (let k = 0; k < lines.length; k++) {
    const keepBraces = lines[k].replace(/[^{}]/g, '');
    const trial = [...lines.slice(0, k), keepBraces, ...lines.slice(k + 1)].join('\n');
    try {
      make(trial);
      return k + 1;
    } catch {
      /* not this line */
    }
  }
  return null;
}

/** The text of a line (without the spaces around it), as start/end offsets. */
function lineRange(code, line) {
  let start = 0;
  for (let n = 1; n < line; n++) start = code.indexOf('\n', start) + 1;
  let end = code.indexOf('\n', start);
  if (end < 0) end = code.length;
  const text = code.slice(start, end);
  const lead = text.length - text.trimStart().length;
  return { start: start + lead, end: Math.max(start + lead + 1, start + text.trimEnd().length) };
}

/**
 * Every problem in the code, most important first. Used while typing and
 * before running. `world` is 'robot' or 'snake'.
 */
export function diagnose(code, { world, script } = {}) {
  const tokens = tokenize(code);
  const sig = significant(tokens);
  const problems = [];
  let structureOk = true;
  try {
    checkBrackets(tokens);
    checkEventNames(sig);
    findLoops(sig);
  } catch (p) {
    if (!(p instanceof CodeProblem)) throw p;
    problems.push(p);
    structureOk = false;
  }
  const apiProblems = checkApi(sig, world, script);
  problems.push(...apiProblems);
  const conditionProblems = structureOk ? checkConditions(sig, script) : [];
  problems.push(...conditionProblems);
  if (structureOk) problems.push(...checkLogic(sig));
  // JavaScript's own syntax message only if nothing clearer was found.
  if (structureOk && !apiProblems.length && !conditionProblems.length) {
    try {
      make(code);
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      const line = findBadLine(code);
      const range = line ? lineRange(code, line) : { start: null, end: null };
      problems.push(new CodeProblem('code.err.syntax', { detail: e.message }, line, range.start, range.end));
    }
  }
  problems.push(...checkSemicolons(sig));
  const rank = (p) => (p.severity === 'error' ? 0 : 1);
  return problems.sort((a, b) => rank(a) - rank(b) || (a.start ?? 0) - (b.start ?? 0));
}

// ---------------------------------------------------------------------------
// Limits ("you may use bit.move only twice here")

const LIMIT_MATCHERS = {
  bit_move: (sig, j) => sig[j].value === 'bit' && sig[j + 1]?.value === '.' && sig[j + 2]?.value === 'move',
  controls_repeat_ext: (sig, j) => isKeyword(sig, j, 'for') || (isKeyword(sig, j, 'while') && sig[j - 1]?.value !== '}'),
  count_set: (sig, j) => isKeyword(sig, j, 'let') && sig[j + 1]?.value === 'count',
};

/** How often each limited command is used: { bit_move: 3, ... } */
export function countUses(code, limits) {
  const sig = significant(tokenize(code));
  const counts = {};
  for (const type of Object.keys(limits)) {
    const match = LIMIT_MATCHERS[type];
    counts[type] = match ? sig.filter((_, j) => match(sig, j)).length : 0;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Compiling

// Globals kid code shouldn't reach by accident. Not a real sandbox (kids run
// their own code on their own computer), but it keeps mistakes harmless.
const HIDDEN = ['window', 'document', 'globalThis', 'self', 'top', 'parent', 'localStorage', 'sessionStorage', 'fetch', 'prompt', 'confirm', '__TAURI__'];
const PARAMS = ['__events', 'bit', 'snake', 'game', 'console', '__LoopError', '__trace', 'alert', 'field', 'garden', ...HIDDEN];

function wrap(body) {
  const returns = Object.keys(EVENT_FUNCS)
    .map((name) => `${name}: typeof ${name} === 'function' ? ${name} : null`)
    .join(', ');
  const register = Object.entries(EVENT_FUNCS)
    .map(([name, ev]) => {
      const call = `__safe(__kid.${name})`;
      if (ev === 'start') return `if (__kid.${name}) __events.onStart(${call});`;
      if (ev === 'tick') return `if (__kid.${name}) __events.onTick(${call});`;
      if (ev === 'click') return `if (__kid.${name}) __events.onClick(${call});`;
      if (ev === 'rightClick') return `if (__kid.${name}) __events.onRightClick(${call});`;
      if (ev === 'created') return `if (__kid.${name}) __events.onCreated?.(${call});`;
      if (ev === 'hit') return `if (__kid.${name}) __events.onHit?.(${call});`;
      return `if (__kid.${name}) __events.onKey('${ev}', ${call});`;
    })
    .join('\n');
  return [
    '"use strict";',
    'let __loopGuard = 100000;',
    // In an object's script, `me` is the object running it right now.
    'let me = null;',
    '__events.bindMe?.((m) => { me = m; });',
    'const __safe = (f) => (...args) => { __loopGuard = 100000; return f(...args); };',
    'const __t = (k, o) => ((__trace.at = k), o);',
    'const __kid = (function () {',
    body,
    `;return { ${returns} };`,
    '})();',
    register,
    `//# sourceURL=${SOURCE_NAME}`,
  ].join('\n');
}

const make = (body) => new Function(...PARAMS, wrap(body));

// Where line 1 of the kid's code ends up in error stack traces. Measured once,
// because every browser engine counts the lines of `new Function` differently.
let lineOffset;
function measureOffset() {
  if (lineOffset !== undefined) return lineOffset;
  lineOffset = null;
  try {
    make('null.x;')({ onStart() {}, onTick() {}, onKey() {} });
  } catch (e) {
    const raw = rawLine(e);
    if (raw != null) lineOffset = raw - 1;
  }
  return lineOffset;
}

function rawLine(e) {
  const m = String(e?.stack || '').match(new RegExp(`${SOURCE_NAME}:(\\d+)`));
  return m ? Number(m[1]) : null;
}

/** The kid's line where an error happened, from the stack trace, or null. */
export function errorLine(e) {
  const raw = rawLine(e);
  const off = measureOffset();
  return raw == null || off == null ? null : raw - off;
}

/**
 * Adds two things to the code, without moving any line:
 *  - a guard at the start of every loop body
 *  - a tag on every command: `bit.move(…)` becomes `__t(7, bit).move(…)`,
 *    so when a command fails, we know it was place 7 (its exact characters).
 *    The tag starts with a name, not a (, so code without ; still works:
 *    a line starting with ( would be glued onto the line above.
 */
function instrument(code, sig, loops) {
  const places = [];
  const edits = [];
  for (const { kw, body } of loops) {
    const k = places.push({ start: kw.start, end: kw.end, line: kw.line }) - 1;
    edits.push({ at: body.end, end: body.end, text: ` if (--__loopGuard < 0) { __trace.at = ${k}; throw new __LoopError(); }` });
  }
  for (const u of apiUses(sig)) {
    const k = places.push({ start: u.obj.start, end: u.end, line: u.obj.line }) - 1;
    edits.push({ at: u.obj.start, end: u.obj.end, text: `__t(${k}, ${u.obj.value})` });
  }
  edits.sort((a, b) => a.at - b.at);
  let out = '';
  let last = 0;
  for (const e of edits) {
    out += code.slice(last, e.at) + e.text;
    last = e.end;
  }
  return { code: out + code.slice(last), places };
}

/**
 * Turns typed code into a program with the same shape as the blocks' program.
 * Throws the first CodeProblem if the code has a mistake.
 * Returns { run(events, bit, snake, game, console, alert), placeOf(error) }.
 */
export function compileTyped(code, { world, script } = {}) {
  const first = diagnose(code, { world, script }).find((p) => p.severity === 'error');
  if (first) throw first;
  const tokens = tokenize(code);
  const sig = significant(tokens);
  const { code: tagged, places } = instrument(code, sig, findLoops(sig));
  const fn = make(tagged);
  const trace = { at: null };
  return {
    run(events, bit, snake, game, console, alert, field, garden) {
      trace.at = null;
      return fn(events, bit, snake, game, console, LoopError, trace, alert, field, garden);
    },
    /** Where the last tagged command was: { line, start, end }, or null. */
    lastPlace: () => (trace.at == null ? null : places[trace.at]),
  };
}

/** Makes JavaScript's own error messages kid-friendly. Returns [key, vars]. */
export function explainJsError(e) {
  const msg = String(e?.message || e);
  let m;
  if (e instanceof ReferenceError && (m = msg.match(/^(\S+) is not defined|Can't find variable: (\S+)/))) {
    return ['code.err.notDefined', { name: m[1] || m[2] }];
  }
  if (e instanceof TypeError && (m = msg.match(/^(.+?) is not a function/))) {
    return ['code.err.notFunction', { name: m[1].replace(/^\(|\)$/g, '') }];
  }
  if (e instanceof RangeError && /call stack/i.test(msg)) return ['code.err.recursion', {}];
  return ['msg.error', { error: msg }];
}
