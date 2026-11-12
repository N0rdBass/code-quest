// "Find my mistake": compares the kid's typed code with the lesson's model
// solution, piece by piece (functions, ifs, loops, commands, and what's inside
// what), and says where the code differs:
//   - missing:   something the solution has that the kid's code doesn't
//   - misplaced: the right line, but inside the wrong { } (or outside it)
//   - different: almost the same line, e.g. a loop with a different number
//   - order:     a line that uses something before it's ready (count before counting)
//   - missingFunction: a whole function is missing
// Small differences don't count: loop variable names (i or j), spaces, quotes,
// `count++` vs `count = count + 1`, `===` vs `==`.

import { tokenize } from './kidcode.js';

const SKIP = new Set(['ws', 'nl', 'comment']);
const PAIRS = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = new Set([')', ']', '}']);
const KEYWORDS = new Set(['function', 'for', 'while', 'do', 'if', 'else', 'let', 'const', 'var', 'return', 'true', 'false', 'of', 'in', 'new', 'typeof', 'null', 'undefined']);

// ---------------------------------------------------------------------------
// Parsing code into a tree of statements

function parse(code) {
  const sig = tokenize(code).filter((t) => !SKIP.has(t.type));
  const closeOf = new Map();
  const stack = [];
  sig.forEach((t, i) => {
    if (PAIRS[t.value]) stack.push(i);
    else if (CLOSERS.has(t.value) && stack.length) closeOf.set(stack.pop(), i);
  });
  // Loop variables get standard names ($0, $1 …) so `i` and `j` count as the same.
  const renames = [];
  const norm = (from, to) => {
    let s = '';
    for (let i = from; i < to; i++) {
      const t = sig[i];
      let v = t.value;
      if (t.type === 'str') v = `'${v.slice(1, -1)}'`;
      else if (t.type === 'id' && sig[i - 1]?.value !== '.') {
        const r = [...renames].reverse().find((x) => x.from === v);
        if (r) v = r.to;
      }
      s += v;
    }
    return s.replace(/===/g, '==').replace(/!==/g, '!=').replace(/;$/, '');
  };
  const text = (from, to) => code.slice(sig[from].start, sig[to - 1].end);
  const ids = (from, to) => {
    const uses = new Set();
    const sets = new Set();
    for (let i = from; i < to; i++) {
      const t = sig[i];
      if (t.type !== 'id' || KEYWORDS.has(t.value) || sig[i - 1]?.value === '.') continue;
      uses.add(t.value);
      const next = sig[i + 1]?.value;
      const next2 = sig[i + 2]?.value;
      const declared = ['let', 'const', 'var'].includes(sig[i - 1]?.value);
      if (declared || (next === '=' && next2 !== '=') || (next === '+' && (next2 === '+' || next2 === '=')) || (next === '-' && (next2 === '-' || next2 === '='))) sets.add(t.value);
    }
    return { uses, sets };
  };

  /** Where a plain statement ends: at ; or }, or at a new line that starts a new statement. */
  function statementEnd(i, end) {
    let depth = 0;
    for (let k = i; k < end; k++) {
      const v = sig[k].value;
      if (PAIRS[v]) depth++;
      else if (CLOSERS.has(v)) {
        if (depth === 0) return { stop: k, next: k };
        depth--;
      } else if (v === ';' && depth === 0) return { stop: k, next: k + 1 };
      const nx = sig[k + 1];
      if (depth === 0 && nx && nx.line > sig[k].line && /[\w$)\]'"`]$/.test(v) && !/^[.([=+\-*/<>&|?:,]/.test(nx.value)) {
        return { stop: k + 1, next: k + 1 };
      }
    }
    return { stop: end, next: end };
  }

  /** A { } body, or a single statement without braces. Returns [nodes, index after it]. */
  function body(i, end) {
    if (sig[i]?.value === '{') {
      const close = closeOf.get(i) ?? end;
      return [block(i + 1, close), close + 1, sig[close] ?? sig[end - 1]];
    }
    const [node] = block(i, statementEnd(i, end).next);
    return [node ? [node] : [], statementEnd(i, end).next, sig[statementEnd(i, end).next - 1]];
  }

  function block(i, end) {
    const nodes = [];
    while (i < end) {
      const t = sig[i];
      const v = t.value;
      if (v === ';') {
        i++;
        continue;
      }
      if (v === '{') {
        const close = closeOf.get(i) ?? end;
        nodes.push(...block(i + 1, close));
        i = close + 1;
        continue;
      }
      if (t.type === 'id' && v === 'function' && sig[i + 1]?.type === 'id' && sig[i + 2]?.value === '(') {
        const headEnd = (closeOf.get(i + 2) ?? i + 2) + 1;
        const [kids, after, last] = body(headEnd, end);
        nodes.push(node('function', `fn:${sig[i + 1].value}`, i, headEnd, after, last, kids, { name: sig[i + 1].value }));
        i = after;
        continue;
      }
      if (t.type === 'id' && (v === 'if' || v === 'while' || v === 'for') && sig[i + 1]?.value === '(') {
        const close = closeOf.get(i + 1) ?? end;
        let pushed = 0;
        if (v === 'for' && ['let', 'const', 'var'].includes(sig[i + 2]?.value) && sig[i + 3]?.type === 'id') {
          renames.push({ from: sig[i + 3].value, to: `$${renames.length}` });
          pushed = 1;
        }
        const key = `${v}:${norm(i + 2, close)}`;
        const [kids, after, last] = body(close + 1, end);
        let elseKids = [];
        let next = after;
        if (sig[after]?.value === 'else') {
          const [ek, ea] = sig[after + 1]?.value === 'if' ? [block(after + 1, statementEndOfIf(after + 1, end)), statementEndOfIf(after + 1, end)] : body(after + 1, end);
          elseKids = ek;
          next = ea;
        }
        if (pushed) renames.pop();
        nodes.push(node(v, key, i, close + 1, after, last, kids, { elseKids }));
        i = next;
        continue;
      }
      const { stop, next } = statementEnd(i, end);
      if (stop > i) {
        let key = norm(i, stop);
        const m = key.match(/^([\w$.]+)(?:\+\+|\+=1)$/);
        if (m) key = `${m[1]}=${m[1]}+1`;
        const kind = ['let', 'const', 'var'].includes(v) ? 'let' : 'stmt';
        nodes.push(node(kind, `${kind}:${key}`, i, stop, stop, sig[stop - 1], null));
      }
      i = Math.max(next, i + 1);
    }
    return nodes;
  }

  function statementEndOfIf(i, end) {
    // `else if (…) { … }` (with maybe more else parts): find where the whole chain ends.
    let k = (closeOf.get(i + 1) ?? end) + 1;
    k = body(k, end)[1];
    while (sig[k]?.value === 'else') k = sig[k + 1]?.value === 'if' ? statementEndOfIf(k + 1, end) : body(k + 1, end)[1];
    return k;
  }

  function node(kind, key, from, headEnd, after, lastTok, kids, extra = {}) {
    const first = sig[from];
    const { uses, sets } = ids(from, after);
    const head = text(from, headEnd);
    const isCall = /^stmt:([\w$.]+)\(/.exec(key);
    const assign = /^(?:stmt|let):(?:let|const|var)?([\w$.]+)=(?!=)/.exec(key);
    return {
      kind,
      key,
      // What kind of line this is, for "almost right": the command, the variable, or if/for.
      family: kind === 'stmt' || kind === 'let' ? (isCall ? isCall[1] : assign ? `=${assign[1]}` : key) : kind,
      line: first.line,
      endLine: (lastTok ?? first).line,
      start: first.start,
      end: sig[headEnd - 1].end,
      show: kids ? `${head} { … }` : `${head.replace(/;$/, '')};`,
      // The whole piece, with what's inside it, lined up to start at the left.
      full: unindent(code.slice(first.start, (lastTok ?? first).end)),
      body: kids,
      uses,
      sets,
      ...extra,
    };
  }

  const nodes = block(0, sig.length);
  return { nodes, lastLine: sig.length ? sig[sig.length - 1].line : 0 };
}

// ---------------------------------------------------------------------------
// Comparing the kid's code with the solution

/** Remove the indent that all lines after the first share, so a piece of code starts at the left. */
function unindent(text) {
  const lines = text.split('\n');
  const rest = lines.slice(1).filter((l) => l.trim());
  const cut = rest.length ? Math.min(...rest.map((l) => l.match(/^ */)[0].length)) : 0;
  const lastIndent = lines.length > 1 ? lines[lines.length - 1].match(/^ */)[0].length : 0;
  const base = Math.min(cut, lastIndent);
  return [lines[0], ...lines.slice(1).map((l) => l.slice(base))].join('\n');
}

const all = (nodes) => nodes.flatMap((n) => [n, ...all(n.body || []), ...all(n.elseKids || [])]);

/**
 * The differences between the kid's code and the solution, in the order they
 * appear in the kid's code. Each hint: { type, line, start?, end?, insertAfter?, vars }.
 */
export { parse as parseCode };

export function findHints(kidCode, solutionCode) {
  const kid = parse(kidCode);
  const sol = parse(solutionCode);
  const hints = [];
  const used = new Set();

  const kidFns = new Map(kid.nodes.filter((n) => n.kind === 'function').map((n) => [n.name, n]));
  for (const s of sol.nodes) {
    if (s.kind !== 'function') continue;
    const k = kidFns.get(s.name);
    if (!k) {
      hints.push({ type: 'missingFunction', line: kid.lastLine, insertAfter: kid.lastLine, sol: s, vars: { code: s.show, full: s.full } });
      continue;
    }
    used.add(k);
    compare(s.body, k.body || [], k, k, hints, used);
  }
  return hints.sort((a, b) => (a.insertAfter ?? a.line) - (b.insertAfter ?? b.line));
}

function compare(solNodes, kidNodes, owner, fn, hints, used) {
  const pairs = [];
  let prev = null;
  for (const s of solNodes) {
    const free = (k) => !used.has(k);
    let k = kidNodes.find((n) => free(n) && n.key === s.key);
    if (!k) {
      // The same line somewhere else in this function: it's in the wrong place.
      const elsewhere = all(fn.body || []).find((n) => free(n) && n.key === s.key && !kidNodes.includes(n));
      if (elsewhere) {
        used.add(elsewhere);
        const where = prev ? { key: 'hint.whereAfter', line: prev.endLine } : { key: 'hint.whereInside', line: owner.line };
        hints.push({ type: 'misplaced', line: elsewhere.line, start: elsewhere.start, end: elsewhere.end, sol: s, anchorLine: prev ? prev.line : owner.line, anchorInside: !prev, vars: { code: s.show, whereKey: where.key, whereLine: where.line } });
        continue;
      }
      // Almost the same line here: same command, same variable, or same kind of if/loop.
      k = kidNodes.find((n) => free(n) && n.kind === s.kind && n.family === s.family);
      if (k) {
        used.add(k);
        hints.push({ type: 'different', line: k.line, start: k.start, end: k.end, sol: s, vars: { code: s.show } });
        if (s.body) compare(s.body, k.body || [], k, fn, hints, used);
        pairs.push([s, k]);
        prev = k;
        continue;
      }
      const after = prev ? prev.endLine : owner.line;
      hints.push({ type: prev ? 'missingAfter' : 'missingInside', line: after, insertAfter: after, sol: s, anchorLine: prev ? prev.line : owner.line, vars: { code: s.show, full: s.full } });
      continue;
    }
    used.add(k);
    pairs.push([s, k]);
    if (s.body) compare(s.body, k.body || [], k, fn, hints, used);
    prev = k;
  }
  // Order: a line that uses something (like count) that a later line in the kid's code gets ready.
  pairs.forEach(([s, k], i) => {
    for (const [s2, k2] of pairs.slice(0, i)) {
      const name = [...s.uses].find((u) => s2.sets.has(u));
      if (name && k2.line > k.line) {
        hints.push({ type: 'order', line: k.line, start: k.start, end: k.end, anchorLine: k2.line, vars: { name, after: k2.endLine } });
        break;
      }
    }
  });
}
