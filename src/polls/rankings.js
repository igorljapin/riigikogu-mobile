import { el } from '../dom.js';
import { pollValue, SOURCE_URL } from '../lib/polls.js';

const longDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});
export const formatDate = (value) => longDate.format(new Date(value));
export function percentage(value, scale, digits = 1) {
  if (value === null) return 'Unavailable';
  const power = 10 ** digits;
  return `${(Math.round(value * power / scale) / power).toFixed(digits)}%`;
}

function changeLabel(change, scale) {
  if (change === null) return 'Unavailable';
  const magnitude = (Math.round(Math.abs(change) * 10 / scale) / 10).toFixed(1);
  const sign = Number(magnitude) === 0 ? '' : change > 0 ? '+' : '−';
  return `${sign}${magnitude} pp`;
}

export function pollRankingsPanel(data, wave, rows) {
  const maximum = Math.max(1, ...rows.map(({ value }) => value ?? 0));
  const changes = el('p', { className: 'polls-muted' }, [
    'Changes are in percentage points (pp) from the previous result in this series.',
  ]);
  return el('section', { className: 'polls-card', 'aria-labelledby': 'polls-latest' }, [
    el('h2', { id: 'polls-latest' }, ['Latest ratings']),
    el('p', { className: 'polls-fieldwork' }, [
      'Fieldwork ', el('time', { dateTime: wave.start }, [formatDate(wave.start)]),
      ' – ', el('time', { dateTime: wave.end }, [formatDate(wave.end)]),
    ]),
    el('p', { className: 'polls-muted' }, [
      'Norstat Eesti for the Institute for the Study of Societal Issues (Ühiskonnauuringute Instituut). ',
      el('a', { href: SOURCE_URL }, ['Reitingud.ee']),
    ]),
    el('p', { className: 'polls-muted' }, [
      wave.published ? `Published ${formatDate(wave.published)}` :
        `Source snapshot retrieved ${formatDate(data.source.retrievedAt)}`,
    ]),
    el('ul', { className: 'polls-rankings', 'data-testid': 'polls-rankings' },
      rows.map(({ name, id, value, change, color }) => el('li', { 'data-party': id }, [
        el('span', { className: 'polls-party-name' }, [name]),
        el('strong', { className: 'polls-value' }, [percentage(value, data.scale)]),
        el('span', {
          className: 'polls-change', 'aria-label': `Change ${changeLabel(change, data.scale)}`,
        }, [changeLabel(change, data.scale)]),
        el('div', {
          className: 'polls-bar', 'aria-hidden': 'true',
          hidden: value === null,
        }, [el('span', { style: `width:${value / maximum * 100}%;background:${color}` })]),
      ]))),
    changes,
    el('details', { className: 'polls-disclosure' }, [
      el('summary', {}, ['What’s included in Other']),
      el('ul', { className: 'polls-parts' },
        data.parties.filter((party) => party.other).map(({ id, name }) => el('li', {}, [
          el('span', {}, [name]),
          el('strong', {}, [percentage(pollValue(data, wave, id), data.scale)]),
        ]))),
    ]),
  ]);
}

export function pollMethodology(wave) {
  const formatCount = (value) => value === null ? 'Unavailable' : value.toLocaleString('en-GB');
  return el('details', { className: 'polls-card polls-disclosure', 'data-testid': 'polls-methodology' }, [
    el('summary', {}, ['Methodology']),
    el('p', {}, ['Support percentages are calculated among respondents who expressed a party preference.']),
    el('dl', { className: 'polls-sample' }, [
      el('dt', {}, ['Total respondents']),
      el('dd', {}, [formatCount(wave.sample.total)]),
      el('dt', {}, ['Respondents with a party preference']),
      el('dd', {}, [formatCount(wave.sample.voters)]),
    ]),
    el('p', {}, ['Adjacent four-week aggregates share most of their fieldwork. Small movements can reflect sampling variation.']),
  ]);
}
