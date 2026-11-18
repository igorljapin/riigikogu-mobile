import { el, replace } from '../dom.js';
import { isPollOverdue, pollRankings, SERIES } from '../lib/polls.js';
import { loadPolls } from '../polls-data.js';
import { pollMethodology, pollRankingsPanel } from './rankings.js';
import { pollTrendsPanel } from './trends.js';

function notice(text, warning = false) {
  return el('p', {
    className: `polls-notice${warning ? ' polls-warning' : ''}`,
    role: 'status', 'data-testid': 'polls-status',
  }, [text]);
}

export function pollScreen(layout) {
  const content = el('div', { className: 'polls-content', 'data-testid': 'polls-content' });

  async function refresh() {
    replace(content, notice('Loading polling data…'));
    try {
      const { data, cached, offline } = await loadPolls();
      if (!data) {
        replace(content, offline ? notice('You’re offline. Connect to load polling results.', true) :
          notice('No polling results are available yet.'), retry);
        return;
      }
      let series = 'fourWeek';
      const body = el('div', { className: 'polls-results' });
      const select = el('select', {
        id: 'polls-series', 'data-testid': 'polls-series',
        onchange: (event) => { series = event.target.value; renderSeries(); },
      }, Object.entries(SERIES).map(([id, name]) => el('option', { value: id }, [name])));
      function renderSeries() {
        const wave = data.series[series].at(-1);
        if (!wave) {
          replace(body, notice('No results are available for this series.'));
          return;
        }
        const overdue = isPollOverdue(wave, Date.now()) ? notice('Update overdue. The latest available fieldwork is shown below.', true) : null;
        const rows = pollRankings(data, series);
        replace(body, overdue, layout(
          pollRankingsPanel(data, wave, rows),
          pollTrendsPanel(data, series, rows),
          pollMethodology(wave),
        ));
      }
      renderSeries();
      replace(content,
        cached ? notice(offline ? 'Offline results from this device.' :
          'The latest snapshot could not be loaded. Showing saved results.', true) : null,
        cached ? retry : null,
        el('div', { className: 'polls-series' }, [el('label', { htmlFor: select.id }, ['Polling series']), select]),
        body,
      );
    } catch {
      replace(content, notice('Polling results could not be loaded. Please try again.', true), retry);
    }
  }

  const retry = el('button', { className: 'polls-retry', type: 'button', onclick: refresh }, ['Retry']);
  refresh();
  return content;
}
