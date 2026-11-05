// A small code editor for kids: line numbers, colours, Tab and auto-indent,
// and, like VS Code, a squiggly line under mistakes (red) and warnings
// (yellow), with the message when you hover over it or its line number. A plain <textarea> lies on top of
// a coloured copy of the same text, so typing, selecting and undo are the
// browser's own and work everywhere.

import { h } from './dom.js';
import { highlight } from './kidcode.js';

const INDENT = '  ';

/** The indent a new line at `lineStart` should get, from the last non-empty line above it. */
function indentFromAbove(text, lineStart, restOfLine) {
  const above = text.slice(0, lineStart).split('\n').reverse().find((l) => l.trim());
  if (above == null) return '';
  let indent = above.match(/^[ \t]*/)[0];
  if (/[{(\[]\s*$/.test(above)) indent += INDENT;
  if (/^\s*[}\])]/.test(restOfLine)) indent = indent.slice(INDENT.length);
  return indent;
}

export function createEditor({ value = '', label = '', onChange, onRun, onCursor }) {
  const input = h('textarea', {
    class: 'ce-input',
    spellcheck: 'false',
    autocapitalize: 'off',
    autocomplete: 'off',
    autocorrect: 'off',
    wrap: 'off',
    'aria-label': label,
  });
  const colours = h('pre', { class: 'ce-hl', 'aria-hidden': 'true' });
  const gutter = h('div', { class: 'ce-gutter', 'aria-hidden': 'true' });
  const errBar = h('div', { class: 'ce-errbar', hidden: true });
  const insertBar = h('div', { class: 'ce-insertbar', hidden: true });
  const el = h('div', { class: 'code-editor' }, h('div', { class: 'ce-inner' }, gutter, h('div', { class: 'ce-text' }, errBar, insertBar, colours, input)));
  let errLine = null;
  let problems = []; // { start, end, severity, line, message }
  let hint = null; // "find my mistake": { line, start?, end?, insertAfter?, message }

  input.value = value;

  function refresh() {
    // The extra line keeps the coloured copy as tall as the textarea when the code ends in a newline.
    const marks = problems.filter((p) => p.start != null);
    if (hint?.start != null) marks.push({ start: hint.start, end: hint.end, severity: 'hint' });
    colours.innerHTML = `${highlight(input.value, marks)}\n `;
    const count = input.value.split('\n').length;
    const byLine = new Map();
    for (const p of problems) if (p.line) byLine.set(p.line, [...(byLine.get(p.line) || []), p]);
    gutter.replaceChildren();
    for (let n = 1; n <= count; n++) {
      const here = byLine.get(n);
      if (here || n === errLine) {
        const sev = n === errLine || here?.some((p) => p.severity === 'error') ? 'err' : 'warn';
        gutter.append(h('span', { class: sev, title: (here || []).map((p) => p.message).join('\n') || null }, String(n)), '\n');
      } else if (hint && n === hint.line) {
        gutter.append(h('span', { class: 'hint', title: hint.message }, String(n)), '\n');
      } else {
        gutter.append(`${n}\n`);
      }
    }
    errBar.hidden = errLine == null;
    // A missing line: a marker between two lines, where it should go.
    insertBar.hidden = hint?.insertAfter == null;
    if (hint?.insertAfter != null) insertBar.style.top = `calc(var(--ce-pad) + ${hint.insertAfter * 1.6}em - 2px)`;
    if (errLine != null) errBar.style.top = `calc(var(--ce-pad) + ${(errLine - 1) * 1.6}em)`;
  }

  function insert(text) {
    input.focus();
    // execCommand keeps the browser's undo (Ctrl+Z) working; setRangeText is the fallback.
    if (!document.execCommand('insertText', false, text)) {
      input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
      input.dispatchEvent(new Event('input'));
    }
  }

  function currentLine() {
    const before = input.value.slice(0, input.selectionStart);
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineEnd = input.value.indexOf('\n', input.selectionStart);
    return {
      before: before.slice(lineStart),
      after: input.value.slice(input.selectionEnd, lineEnd < 0 ? undefined : lineEnd),
      indent: before.slice(lineStart).match(/^[ \t]*/)[0],
    };
  }

  input.addEventListener('input', () => {
    // Old marks would sit in the wrong place now; the lesson checks again when typing stops.
    errLine = null;
    problems = [];
    hint = null;
    refresh();
    onChange?.(input.value);
  });

  // Tell the lesson where the cursor is, so it can explain the symbol there.
  const cursorMoved = () => onCursor?.(input.value, input.selectionStart);
  for (const ev of ['keyup', 'mouseup', 'input', 'focus']) input.addEventListener(ev, cursorMoved);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onRun?.();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      insert(INDENT);
    } else if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const { before, after, indent } = currentLine();
      if (/\{\s*$/.test(before) && /^\s*\}/.test(after)) {
        // Between { and }: open an empty, indented line in the middle.
        const pos = input.selectionStart + 1 + indent.length + INDENT.length;
        insert(`\n${indent}${INDENT}\n${indent}`);
        input.setSelectionRange(pos, pos);
      } else {
        insert(`\n${indent}${/[{(\[]\s*$/.test(before) ? INDENT : ''}`);
      }
    } else if (e.key === '}') {
      // Typing } on an empty line moves it back one step, under its {.
      const { before } = currentLine();
      if (/^[ \t]+$/.test(before) && before.length >= INDENT.length && input.selectionStart === input.selectionEnd) {
        e.preventDefault();
        input.setSelectionRange(input.selectionStart - INDENT.length, input.selectionStart);
        insert('}');
      }
    }
  });

  // Hovering over a squiggly line shows its message, like in VS Code.
  input.addEventListener('mousemove', (e) => {
    const at = offsetAt(e.clientX, e.clientY);
    const p = problemAt(at, true);
    const onHint = hint?.start != null && at >= hint.start && at < hint.end;
    const tip = p ? p.message : onHint ? hint.message : '';
    if (input.title !== tip) input.title = tip;
  });

  /** The character offset under a mouse position (monospace font, no wrapping). */
  function offsetAt(x, y) {
    const style = getComputedStyle(input);
    const rect = input.getBoundingClientRect();
    const lh = parseFloat(style.lineHeight) || 24;
    const line = Math.floor((y - rect.top - parseFloat(style.paddingTop)) / lh);
    const col = Math.floor((x - rect.left - parseFloat(style.paddingLeft)) / charWidth());
    const lines = input.value.split('\n');
    if (line < 0 || line >= lines.length || col < 0 || col >= lines[line].length) return -1;
    let off = 0;
    for (let k = 0; k < line; k++) off += lines[k].length + 1;
    return off + col;
  }

  let cw = 0;
  function charWidth() {
    if (!cw) {
      const probe = h('span', { style: 'position:absolute;visibility:hidden;white-space:pre' }, 'x'.repeat(100));
      colours.append(probe);
      cw = probe.getBoundingClientRect().width / 100 || 10;
      probe.remove();
    }
    return cw;
  }

  /** The problem at a character offset (also just after it, for the cursor). */
  function problemAt(pos, exact = false) {
    if (pos < 0) return null;
    const hits = problems.filter((p) => p.start != null && p.start <= pos && (exact ? pos < p.end : pos <= p.end));
    return hits.find((p) => p.severity === 'error') || hits[0] || null;
  }

  // Clicking below the last line still puts the cursor in the editor.
  el.addEventListener('mousedown', (e) => {
    if (e.target === input) return;
    e.preventDefault();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });

  function scrollToLine(n) {
    const lh = parseFloat(getComputedStyle(colours).lineHeight) || 24;
    const y = (n - 1) * lh;
    if (y < el.scrollTop || y > el.scrollTop + el.clientHeight - 2 * lh) el.scrollTop = Math.max(0, y - el.clientHeight / 3);
  }

  refresh();

  return {
    el,
    get value() {
      return input.value;
    },
    set value(v) {
      input.value = v;
      errLine = null;
      problems = [];
      refresh();
    },
    /** Show these problems as squiggly lines and marked line numbers. */
    setProblems(list) {
      problems = list;
      refresh();
    },
    problemAt,
    /** Show a "find my mistake" hint (null clears it), and scroll it into view. */
    setHint(next) {
      hint = next;
      refresh();
      if (next) scrollToLine(next.insertAfter ?? next.line);
    },
    focus: () => input.focus(),
    blur: () => input.blur(),
    /** Insert a snippet at the cursor. `¦` in the snippet marks where the cursor goes. */
    insertSnippet(snippet) {
      input.focus();
      const { before, after } = currentLine();
      let { indent } = currentLine();
      let lead = '';
      if (before.trim()) {
        lead = `\n${indent}`;
      } else {
        // On an empty line: indent like the code around it, whatever spaces are there now.
        indent = indentFromAbove(input.value, input.selectionStart - before.length, after);
        input.setSelectionRange(input.selectionStart - before.length, input.selectionEnd);
        lead = indent;
      }
      const text = lead + snippet.replace(/\n/g, `\n${indent}`);
      const mark = text.indexOf('¦');
      const start = input.selectionStart;
      insert(text.replace('¦', ''));
      if (mark >= 0) input.setSelectionRange(start + mark, start + mark);
    },
    /** Mark a line as having a mistake (null clears it). */
    markLine(n) {
      errLine = n;
      refresh();
      if (n != null) scrollToLine(n);
    },
  };
}
