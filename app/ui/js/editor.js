// A small code editor for kids: line numbers, colours, Tab and auto-indent,
// and a red mark on the line with a mistake. A plain <textarea> lies on top of
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

export function createEditor({ value = '', label = '', onChange, onRun }) {
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
  const el = h('div', { class: 'code-editor' }, h('div', { class: 'ce-inner' }, gutter, h('div', { class: 'ce-text' }, errBar, colours, input)));
  let errLine = null;

  input.value = value;

  function refresh() {
    // The extra line keeps the coloured copy as tall as the textarea when the code ends in a newline.
    colours.innerHTML = `${highlight(input.value)}\n `;
    const count = input.value.split('\n').length;
    let nums = '';
    for (let n = 1; n <= count; n++) nums += n === errLine ? `<span class="err">${n}</span>\n` : `${n}\n`;
    gutter.innerHTML = nums;
    errBar.hidden = errLine == null;
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
    errLine = null;
    refresh();
    onChange?.(input.value);
  });

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

  // Clicking below the last line still puts the cursor in the editor.
  el.addEventListener('mousedown', (e) => {
    if (e.target === input) return;
    e.preventDefault();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });

  refresh();

  return {
    el,
    get value() {
      return input.value;
    },
    set value(v) {
      input.value = v;
      errLine = null;
      refresh();
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
      if (n != null) {
        const lh = parseFloat(getComputedStyle(colours).lineHeight) || 24;
        const y = (n - 1) * lh;
        if (y < el.scrollTop || y > el.scrollTop + el.clientHeight - 2 * lh) el.scrollTop = Math.max(0, y - el.clientHeight / 3);
      }
    },
  };
}
