// "What does this mean?" for code mode. Given the code and the cursor position,
// explains the symbol or word there, in context: the ( after `if` holds a
// question, but the ( after `bit.move` gives the command extra information,
// and a } says which function or loop it closes.
// Returns { key, vars } for t(), or null when there's nothing to explain.

import { tokenize, EVENT_FUNCS } from './kidcode.js';
import { memberHelpKey } from './codehelp.js';

// Symbols made of more than one character. Longest first.
const OPS = ['===', '!==', '==', '!=', '<=', '>=', '++', '--', '+=', '-=', '&&', '||', '=>'];

const OP_KEYS = {
  '.': 'dot', ',': 'comma', '=': 'assign', '<': 'less', '>': 'greater', '<=': 'lessEq', '>=': 'greaterEq',
  '===': 'equals', '==': 'equals', '!==': 'notEquals', '!=': 'notEquals', '++': 'plusPlus', '--': 'minusMinus',
  '+': 'plus', '-': 'minus', '*': 'times', '/': 'divide', '%': 'remainder', '!': 'not', '&&': 'and', '||': 'or',
  '[': 'squareBrackets', ']': 'squareBrackets', '+=': 'plusEquals', '-=': 'minusEquals', '=>': 'arrow', ':': 'colon',
};

const WORD_KEYS = {
  function: 'function', for: 'for', while: 'while', do: 'do', if: 'if', else: 'else', let: 'let', const: 'const',
  var: 'let', return: 'return', true: 'true', false: 'false', break: 'break', continue: 'continue',
  null: 'nothing', undefined: 'nothing', of: 'of',
};

// What `me` can have and do, in an object's script (Garden defence).
const ME_WORDS = new Set(['speed', 'hp', 'kind', 'x', 'y', 'move', 'squash', 'shoot']);

const OBJECT_KEYS = { bit: 'bit', snake: 'snake', game: 'game', console: 'console', Math: 'math', field: 'field', garden: 'garden', me: 'me' };
const SKIP = new Set(['ws', 'nl']);

export function explainAt(code, pos) {
  const tokens = tokenize(code);
  // The token under the cursor, or else the one just before it.
  let k = tokens.findIndex((t) => t.start <= pos && pos < t.end && !SKIP.has(t.type));
  if (k < 0) k = tokens.findIndex((t) => t.end === pos && !SKIP.has(t.type));
  if (k < 0) return null;
  const tok = tokens[k];

  if (tok.type === 'comment') return { key: 'explain.comment' };
  if (tok.type === 'str') return { key: 'explain.string', vars: { text: tok.value } };
  if (tok.type === 'num') return { key: 'explain.number', vars: { n: tok.value } };

  const sig = tokens.filter((t) => !SKIP.has(t.type) && t.type !== 'comment');
  const j = sig.indexOf(tok);
  if (tok.type === 'id') return explainWord(sig, j);
  return explainSymbol(code, sig, j);
}

// ---- symbols ----

function explainSymbol(code, sig, j) {
  const ch = sig[j].value;
  if (ch === '{' || ch === '}') return explainBrace(sig, ch === '{' ? j : matchBack(sig, j));
  if (ch === '(' || ch === ')') return explainParen(sig, ch === '(' ? j : matchBack(sig, j));
  if (ch === ';') return insideForHeader(sig, j) ? { key: 'explain.semicolonFor' } : { key: 'explain.semicolon' };
  const op = operatorAt(code, sig[j].start);
  const key = OP_KEYS[op];
  return key ? { key: `explain.${key}`, vars: { op } } : null;
}

/** The whole operator that the character at `at` is part of, e.g. '=' inside '==='. */
function operatorAt(code, at) {
  for (const op of OPS) {
    for (let s = at - op.length + 1; s <= at; s++) {
      if (s >= 0 && code.slice(s, s + op.length) === op) return op;
    }
  }
  return code[at];
}

/** What comes before an opening bracket says what the bracket is for. */
function owner(sig, open) {
  const before = sig[open - 1];
  if (!before) return { kind: 'none' };
  if (before.value === 'function') return { kind: 'anon' };
  if (before.type === 'id' && sig[open - 2]?.value === 'function') return { kind: 'function', name: before.value };
  if (before.type === 'id' && sig[open - 2]?.value === '.') return { kind: 'call', name: `${sig[open - 3]?.value ?? ''}.${before.value}` };
  if (before.type === 'id' && WORD_KEYS[before.value]) return { kind: before.value };
  if (before.type === 'id') return { kind: 'call', name: before.value };
  return { kind: 'other', before };
}

function explainBrace(sig, open) {
  if (open < 0) return { key: 'explain.brace' };
  const before = sig[open - 1];
  if (before?.value === 'else') return { key: 'explain.braceElse' };
  if (before?.value === 'do') return { key: 'explain.braceLoop' };
  if (before?.value === ')') {
    const paren = matchBack(sig, open - 1);
    const o = paren < 0 ? { kind: 'none' } : owner(sig, paren);
    if (o.kind === 'function') return { key: o.name in EVENT_FUNCS ? 'explain.braceEvent' : 'explain.braceFunction', vars: { name: o.name } };
    if (o.kind === 'if') return { key: 'explain.braceIf' };
    if (o.kind === 'for' || o.kind === 'while') return { key: 'explain.braceLoop' };
  }
  return { key: 'explain.brace' };
}

function explainParen(sig, open) {
  if (open < 0) return { key: 'explain.paren' };
  const o = owner(sig, open);
  if (o.kind === 'if') return { key: 'explain.parenIf' };
  if (o.kind === 'for') return { key: sig[open + 3]?.value === 'of' ? 'explain.parenForOf' : 'explain.parenFor' };
  if (o.kind === 'while') return { key: 'explain.parenWhile' };
  if (o.kind === 'function') return { key: 'explain.parenFunction', vars: { name: o.name } };
  if (o.kind === 'call') {
    const empty = sig[open + 1]?.value === ')';
    return { key: empty ? 'explain.parenCallEmpty' : 'explain.parenCall', vars: { name: o.name } };
  }
  return { key: 'explain.paren' };
}

function insideForHeader(sig, j) {
  let depth = 0;
  for (let i = j - 1; i >= 0; i--) {
    const v = sig[i].value;
    if (v === ')' || v === '}' || v === ']') depth++;
    else if (v === '(' || v === '{' || v === '[') {
      if (depth === 0) return v === '(' && sig[i - 1]?.value === 'for';
      depth--;
    }
  }
  return false;
}

/** Index of the opening bracket that sig[j] (a closing one) belongs to, or -1. */
function matchBack(sig, j) {
  let depth = 0;
  for (let i = j; i >= 0; i--) {
    const v = sig[i].value;
    if (v === ')' || v === '}' || v === ']') depth++;
    else if ((v === '(' || v === '{' || v === '[') && --depth === 0) return i;
  }
  return -1;
}

// ---- words ----

function explainWord(sig, j) {
  const word = sig[j].value;
  const prev = sig[j - 1];
  if (prev?.value === '.') {
    const obj = sig[j - 2]?.value ?? '';
    if (obj === 'square' && (word === 'x' || word === 'y')) return { key: `explain.square_${word}` };
    if (obj === 'me' && ME_WORDS.has(word)) return { key: `explain.me_${word}` };
    if ((word === 'x' || word === 'y') && isLoopItem(sig, obj)) return { key: `explain.item_${word}`, vars: { name: obj } };
    const help = memberHelpKey(obj, word);
    return help ? { key: 'explain.member', vars: { name: `${obj}.${word}`, helpKey: help } } : { key: 'explain.memberUnknown', vars: { name: `${obj}.${word}`, obj } };
  }
  if (WORD_KEYS[word]) return { key: `explain.${WORD_KEYS[word]}` };
  if (word in EVENT_FUNCS) {
    const ev = EVENT_FUNCS[word];
    if (['start', 'tick', 'click', 'rightClick', 'created', 'hit'].includes(ev)) return { key: `explain.event_${ev}`, vars: { name: word } };
    return { key: 'explain.event_key', vars: { name: word, key: ev } };
  }
  if (OBJECT_KEYS[word]) return { key: `explain.${OBJECT_KEYS[word]}` };
  if (prev?.value === 'function') return { key: 'explain.ownFunction', vars: { name: word } };
  if (word === 'x' || word === 'y') return { key: `explain.coord_${word}` };
  if (isLoopItem(sig, word)) return { key: 'explain.loopItem', vars: { name: word } };
  if (isLoopCounter(sig, word)) return { key: 'explain.counter', vars: { name: word } };
  if (prev?.value === 'let' || prev?.value === 'const' || prev?.value === 'var') return { key: 'explain.newVariable', vars: { name: word } };
  return { key: 'explain.name', vars: { name: word } };
}

/** Is `word` declared as `for (const word of ...`? */
function isLoopItem(sig, word) {
  return sig.some((t, i) => t.value === 'for' && sig[i + 1]?.value === '(' && sig[i + 3]?.value === word && sig[i + 4]?.value === 'of');
}

/** Is `word` declared as `for (let word = ...`? */
function isLoopCounter(sig, word) {
  return sig.some((t, i) => t.value === 'for' && sig[i + 1]?.value === '(' && sig[i + 3]?.value === word && sig[i + 4]?.value === '=');
}
