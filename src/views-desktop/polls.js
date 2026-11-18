import { el } from '../dom.js';
import { pollScreen } from '../polls/screen.js';

export default function renderPolls() {
  return el('section', { className: 'polls-page polls-desktop', 'aria-label': 'Polling results' }, [
    pollScreen((rankings, trends, methodology) =>
      el('div', { className: 'polls-stack' }, [
        el('div', { className: 'polls-columns' }, [rankings, trends]),
        methodology,
      ])),
  ]);
}
