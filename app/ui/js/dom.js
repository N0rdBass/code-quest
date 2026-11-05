// Tiny DOM helper: h('button', { class: 'btn', onclick }, 'Text', childNode)

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'hidden' || k === 'disabled') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
}

/** In-app yes/no box (window.confirm is not reliable inside the desktop app). */
export function confirmBox(text, yesLabel) {
  return new Promise((resolve) => {
    const done = (answer) => {
      backdrop.remove();
      resolve(answer);
    };
    const backdrop = h(
      'div',
      { class: 'modal-backdrop' },
      h(
        'div',
        { class: 'modal' },
        h('p', {}, text),
        h(
          'div',
          { class: 'modal-buttons' },
          h('button', { class: 'btn stop', onclick: () => done(true) }, yesLabel),
          h('button', { class: 'btn ghost', onclick: () => done(false) }, '✕'),
        ),
      ),
    );
    document.body.append(backdrop);
  });
}
