/**
 * The three DOM helpers every view uses. Deliberately tiny — this is a
 * framework-free app, and a "small framework" here would be the beginning of
 * the fusion of design, data and logic that this rebuild exists to undo.
 */

/**
 * Build an element.
 *
 * `props` is applied as properties where the DOM has one (`className`,
 * `textContent`, `onclick`) and as attributes otherwise, so `data-testid`,
 * `data-mp-uuid` and ARIA all work without special cases.
 *
 * @param {string} tag
 * @param {object} [props]
 * @param {Array<Node|string|null|undefined|false>} [children]
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key in node && !key.startsWith('data-') && !key.startsWith('aria-')) {
      node[key] = value;
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Replace an element's children in one go. */
export function replace(node, ...children) {
  node.replaceChildren(...children.flat().filter(Boolean));
  return node;
}

/**
 * An inline SVG icon, always `aria-hidden`.
 *
 * That matters beyond accessibility: an icon that contributed to a button's
 * accessible name would change what the Usability Contract's text selectors
 * see. Icons are decoration; the label is the contract.
 */
export function icon(path, { size = 20, stroke = 2 } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(stroke));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const d = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  d.setAttribute('d', path);
  svg.append(d);
  return svg;
}

export const ICONS = {
  chevron: 'M9 18l6-6-6-6',
  back: 'M15 18l-6-6 6-6',
  building: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 11h.01M15 11h.01',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  calculator: 'M4 2h16v20H4zM8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v4',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
};

/* ------------------------------------------------------------------ *
 * Overlays
 * ------------------------------------------------------------------ */

/**
 * Every modal in the app — the party sheet, the MP popup, and the calculator's
 * two pickers — is an overlay created here and *removed from the DOM* when
 * closed. Removal rather than hiding is deliberate: it is what lets the tests
 * assert an overlay is gone rather than merely invisible, and it keeps exactly
 * one `×` button reachable at a time.
 *
 * @param {{testid: string, label: string, onClose?: () => void}} options
 * @returns {{root: HTMLElement, body: HTMLElement, header: HTMLElement, close: () => void}}
 */
export function openOverlay({ testid, label, onClose }) {
  const existing = document.querySelector(`[data-overlay][data-testid="${testid}"]`);
  if (existing) existing.remove();

  const body = el('div', { className: 'overlay-body' });
  const header = el('div', { className: 'overlay-header' });

  const close = () => {
    root.remove();
    document.body.classList.toggle('overlay-open', document.querySelector('[data-overlay]') !== null);
    onClose?.();
  };

  const sheet = el('div', {
    className: 'overlay-sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': label,
  }, [header, body]);

  const root = el('div', { className: 'overlay', 'data-overlay': 'true', 'data-testid': testid }, [sheet]);
  root.addEventListener('click', (event) => {
    if (event.target === root) close();
  });

  document.body.append(root);
  document.body.classList.add('overlay-open');
  return { root, body, header, close };
}

/**
 * The `×` an overlay closes with.
 *
 * Its label is the bare character on purpose: the Usability Contract finds it
 * by that label, and it is what the shipped app showed.
 */
export function closeButton(onClick, testid) {
  return el('button', {
    type: 'button',
    className: 'overlay-close',
    'data-testid': testid,
    onclick: onClick,
  }, ['×']);
}

/** Remove every open overlay — used when switching tabs. */
export function closeAllOverlays() {
  for (const overlay of document.querySelectorAll('[data-overlay]')) overlay.remove();
  document.body.classList.remove('overlay-open');
}
