import { el } from '../dom.js';
import { pollScreen } from '../polls/screen.js';

export default function renderPolls() {
  return el('section', { className: 'polls-page polls-mobile' }, [
    el('header', { className: 'screen-head' }, [
      el('h2', { className: 'screen-title' }, ['Party support']),
    ]),
    pollScreen((rankings, trends, methodology) =>
      el('div', { className: 'polls-stack' }, [rankings, trends, methodology])),
  ]);
}
