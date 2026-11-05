// Typed code (code mode). A small tokenizer does three jobs:
//   - colours the code in the editor
//   - finds the mistakes kids make most (missing } or ", a loop without { })
//     and says which line they are on
//   - puts a guard inside every loop, so `while (true) {}` can't freeze the app
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
};

const KEYWORDS = new Set([
  'function', 'for', 'while', 'do', 'if', 'else', 'let', 'const', 'var', 'return',
  'true', 'false', 'null', 'undefined', 'break', 'continue', 'new', 'of', 'in', 'typeof',
]);
const OBJECTS = new Set(['bit', 'snake', 'game', 'console', 'Math']);
const PAIRS = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = new Set([')', ']', '}']);

const GUARD = ' if (--__loopGuard < 0) throw new __LoopError();';
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

export function highlight(code) {
  const tokens = tokenize(code);
  let html = '';
  tokens.forEach((t, k) => {
    const text = escapeHtml(t.value);
    let cls = null;
    if (t.type === 'comment') cls = 'c';
    else if (t.type === 'str') cls = 's';
    else if (t.type === 'num') cls = 'n';
    else if (t.type === 'id') {
      const prev = tokens[k - 1];
      const afterDot = prev && prev.value === '.';
      if (afterDot) cls = 'm';
      else if (KEYWORDS.has(t.value)) cls = 'k';
      else if (OBJECTS.has(t.value)) cls = 'o';
      else if (t.value in EVENT_FUNCS) cls = 'e';
    }
    html += cls ? `<span class="t-${cls}">${text}</span>` : text;
  });
  return html;
}

// ---------------------------------------------------------------------------
// Checking

/** A mistake the kid can fix: a translation key, its values, and the line. */
export class CodeProblem extends Error {
  constructor(key, vars = {}, line = null) {
    super(key);
    this.key = key;
    this.vars = vars;
    this.line = line;
  }
}

/** Unclosed strings and comments, and brackets that don't match. */
function checkBrackets(tokens) {
  const stack = [];
  for (const t of tokens) {
    if (t.type === 'str' && t.unclosed) throw new CodeProblem('code.err.string', { q: t.value[0] }, t.line);
    if (t.type === 'comment' && t.unclosed) throw new CodeProblem('code.err.comment', {}, t.line);
    if (t.type !== 'punct') continue;
    if (PAIRS[t.value]) stack.push(t);
    else if (CLOSERS.has(t.value)) {
      // No opener of this kind is waiting at all: it's simply one too many.
      if (!stack.some((o) => PAIRS[o.value] === t.value)) throw new CodeProblem('code.err.extraClose', { ch: t.value }, t.line);
      const open = stack.pop();
      // An open ( or [ is almost always closed on its own line, so point there.
      if (PAIRS[open.value] !== t.value && open.value !== '{') {
        throw new CodeProblem('code.err.unclosed', { open: open.value, close: PAIRS[open.value] }, open.line);
      }
      if (PAIRS[open.value] !== t.value) {
        throw new CodeProblem('code.err.mismatch', { open: open.value, close: t.value, want: PAIRS[open.value], openLine: open.line }, t.line);
      }
    }
  }
  if (stack.length) {
    const open = stack[stack.length - 1];
    throw new CodeProblem('code.err.unclosed', { open: open.value, close: PAIRS[open.value] }, open.line);
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

/**
 * Returns the code with a loop guard right after the { of every loop.
 * The guard goes on the same line, so line numbers stay the same.
 */
function guardLoops(code, tokens) {
  const sig = significant(tokens);
  const inserts = [];
  for (let j = 0; j < sig.length; j++) {
    if (isKeyword(sig, j, 'do')) {
      if (sig[j + 1]?.value !== '{') throw new CodeProblem('code.err.loopBraces', { kw: 'do' }, sig[j].line);
      inserts.push(sig[j + 1].end);
      continue;
    }
    const kw = sig[j].value;
    if (!(isKeyword(sig, j, 'for') || isKeyword(sig, j, 'while'))) continue;
    if (sig[j + 1]?.value !== '(') throw new CodeProblem('code.err.loopParen', { kw }, sig[j].line);
    const close = matching(sig, j + 1);
    const next = sig[close + 1];
    if (next?.value === '{') {
      inserts.push(next.end);
      continue;
    }
    // The end of a do { ... } while (...); loop. Its body already has a guard.
    if (kw === 'while' && sig[j - 1]?.value === '}' && (!next || next.value === ';' || next.value === '}')) continue;
    throw new CodeProblem('code.err.loopBraces', { kw }, sig[j].line);
  }
  let out = '';
  let last = 0;
  for (const at of inserts) {
    out += code.slice(last, at) + GUARD;
    last = at;
  }
  return out + code.slice(last);
}

/** Functions whose name is almost an event name, like `whenrunclicked`. */
function checkEventNames(tokens) {
  const sig = significant(tokens);
  const lower = Object.fromEntries(Object.keys(EVENT_FUNCS).map((k) => [k.toLowerCase(), k]));
  for (let j = 0; j < sig.length - 1; j++) {
    if (!isKeyword(sig, j, 'function') || sig[j + 1].type !== 'id') continue;
    const name = sig[j + 1].value;
    const want = lower[name.toLowerCase()];
    if (want && want !== name) throw new CodeProblem('code.err.eventName', { name, want }, sig[j + 1].line);
  }
}

// ---------------------------------------------------------------------------
// Limits ("you may use bit.move only twice here")

const LIMIT_MATCHERS = {
  bit_move: (sig, j) => sig[j].value === 'bit' && sig[j + 1]?.value === '.' && sig[j + 2]?.value === 'move',
  controls_repeat_ext: (sig, j) => isKeyword(sig, j, 'for') || (isKeyword(sig, j, 'while') && sig[j - 1]?.value !== '}'),
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
const PARAMS = ['__events', 'bit', 'snake', 'game', 'console', '__LoopError', 'alert', ...HIDDEN];

function wrap(body) {
  const returns = Object.keys(EVENT_FUNCS)
    .map((name) => `${name}: typeof ${name} === 'function' ? ${name} : null`)
    .join(', ');
  const register = Object.entries(EVENT_FUNCS)
    .map(([name, ev]) => {
      const call = `__safe(__kid.${name})`;
      if (ev === 'start') return `if (__kid.${name}) __events.onStart(${call});`;
      if (ev === 'tick') return `if (__kid.${name}) __events.onTick(${call});`;
      return `if (__kid.${name}) __events.onKey('${ev}', ${call});`;
    })
    .join('\n');
  return [
    '"use strict";',
    'let __loopGuard = 100000;',
    'const __safe = (f) => () => { __loopGuard = 100000; return f(); };',
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

/** The kid's line where an error happened, or null if we can't tell. */
export function errorLine(e) {
  const raw = rawLine(e);
  const off = measureOffset();
  return raw == null || off == null ? null : raw - off;
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

/**
 * Turns typed code into a program with the same shape as the blocks' program:
 * fn(events, bit, snake, game, console, LoopError, alert).
 * Throws a CodeProblem the kid can fix.
 */
export function compileTyped(code) {
  const tokens = tokenize(code);
  checkBrackets(tokens);
  checkEventNames(tokens);
  const guarded = guardLoops(code, tokens);
  let fn;
  try {
    fn = make(guarded);
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    throw new CodeProblem('code.err.syntax', { detail: e.message }, findBadLine(code));
  }
  return (events, bit, snake, game, console, alert) => fn(events, bit, snake, game, console, LoopError, alert);
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
