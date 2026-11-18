import { el, replace } from '../dom.js';
import { pollCalendarTicks, pollGap, pollHistory, pollValue } from '../lib/polls.js';
import { formatDate, percentage } from './rankings.js';

const RANGES = [[3, 'Three months'], [6, 'Six months'], [12, 'One year'], [0, 'All history']];
const shortDate = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const yearOnly = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: 'UTC' });

function svgElement(tag, attributes = {}, label = '') {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (label) node.textContent = label;
  return node;
}

function chart(data, waves, parties) {
  const width = 400;
  const height = 208;
  const plot = { left: 42, right: 382, top: 30, bottom: 168 };
  const times = waves.map((wave) => Date.parse(wave.end));
  const first = times[0];
  const last = times.at(-1);
  const extent = last - first;
  const chartX = (time) => extent
    ? plot.left + (time - first) / extent * (plot.right - plot.left)
    : (plot.left + plot.right) / 2;
  const x = times.map(chartX);
  const values = parties.map(({ id }) => waves.map((wave) => pollValue(data, wave, id)));
  const peak = values.reduce((max, row) => row.reduce((best, value) => Math.max(best, value ?? 0), max), 0) / data.scale;
  const top = Math.max(10, Math.ceil(peak / 10) * 10);
  const y = (value) => plot.bottom - value / top * (plot.bottom - plot.top);
  const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}` });
  const frame = el('div', { 'data-testid': 'polls-chart', className: 'polls-chart', 'aria-hidden': 'true' }, [svg]);
  const labelAt = (text, x, y, placement) => frame.append(el('span', {
    className: `polls-axis ${placement}`,
    style: `left:${x / width * 100}%;top:${y / height * 100}%`,
  }, [text]));

  labelAt('Support (%)', plot.left, 14, 'polls-axis-title polls-axis-left');
  for (const value of [0, top / 2, top]) {
    svg.append(svgElement('line', {
      x1: plot.left, x2: plot.right, y1: y(value), y2: y(value),
      class: 'polls-gridline', 'vector-effect': 'non-scaling-stroke',
    }));
    labelAt(value.toString(), plot.left - 7, y(value), 'polls-axis-right');
  }

  const dates = pollCalendarTicks(first, last);
  const useYears = new Set(dates.map((date) => new Date(date).getUTCMonth())).size === 1 && dates.length > 1;
  const dateFormat = useYears ? yearOnly : shortDate;
  if (!dates.length) labelAt(shortDate.format(last), (plot.left + plot.right) / 2, 181, 'polls-axis-date');
  dates.forEach((date, index) => {
    const position = chartX(date);
    svg.append(svgElement('line', {
      x1: position, x2: position, y1: plot.top, y2: plot.bottom,
      class: 'polls-gridline polls-date-gridline', 'vector-effect': 'non-scaling-stroke',
    }));
    const alternate = index % 2 === 0 ? '' : ' polls-axis-date-alternate';
    labelAt(dateFormat.format(date), position, 181, `polls-axis-date${alternate}`);
  });
  labelAt('Fieldwork end date', (plot.left + plot.right) / 2, 199, 'polls-axis-title');

  values.forEach((observations, partyIndex) => {
    const color = parties[partyIndex].color;
    const joinsPrevious = (index) => index > 0 && observations[index - 1] !== null &&
      !pollGap(waves[index - 1], waves[index]);
    const paths = observations.map((value, index) => {
      if (value === null) return '';
      const point = `${x[index]} ${y(value / data.scale)}`;
      if (joinsPrevious(index)) return `L${point}`;
      if (index + 1 === observations.length || observations[index + 1] === null ||
        !joinsPrevious(index + 1)) {
        svg.append(svgElement('circle', { cx: x[index], cy: y(value / data.scale), r: 2, fill: color }));
      }
      return `M${point}`;
    });
    svg.append(svgElement('path', {
      d: paths.join(' '), fill: 'none', stroke: color, class: 'polls-series-line', 'vector-effect': 'non-scaling-stroke',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));
  });

  const selection = svgElement('g');
  const date = el('output', { className: 'polls-observation', 'data-testid': 'polls-observation' });
  const slider = el('input', {
    type: 'range', min: 0, max: waves.length - 1,
    value: waves.length - 1, 'aria-label': 'Fieldwork observation',
  });
  function select(index) {
    const wave = waves[index];
    const markers = [
      svgElement('line', { x1: x[index], x2: x[index], y1: plot.top, y2: plot.bottom, class: 'polls-cursor', 'vector-effect': 'non-scaling-stroke' }),
    ];
    const label = formatDate(wave.end);
    slider.value = index;
    slider.setAttribute('aria-valuetext', label);
    const readings = parties.map(({ name, color }, partyIndex) => {
      const value = values[partyIndex][index];
      if (value !== null) {
        markers.push(svgElement('circle', { cx: x[index], cy: y(value / data.scale), r: 4, fill: color, class: 'polls-marker', 'vector-effect': 'non-scaling-stroke' }));
      }
      return el('span', { className: 'polls-reading' }, [
        el('span', { className: 'polls-swatch', style: `background:${color}`, 'aria-hidden': 'true' }),
        `${name} ${percentage(value, data.scale, Math.max(1, Math.log10(data.scale)))}`,
      ]);
    });
    selection.replaceChildren(...markers);
    replace(date, el('strong', {}, [label]), ...readings);
  }
  slider.addEventListener('input', () => select(slider.valueAsNumber));
  const selectPointer = (event) => {
    const transform = svg.getScreenCTM();
    if (!transform) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
    if (point.y < plot.top || point.y > plot.bottom) return;
    const nearest = x.reduce((best, value, index) =>
      Math.abs(value - point.x) < Math.abs(x[best] - point.x) ? index : best, 0);
    select(nearest);
  };
  svg.addEventListener('pointerdown', selectPointer);
  svg.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse') selectPointer(event);
  });
  svg.append(selection);
  select(waves.length - 1);
  return [frame, el('label', { className: 'polls-slider' }, ['Choose an observation', slider]), date];
}

function historyTable(data, waves, parties) {
  return el('div', { className: 'polls-table-scroll', tabIndex: 0, 'aria-label': 'Scrollable results table', role: 'region' }, [
    el('table', { 'data-testid': 'polls-table' }, [
      el('caption', {}, ['Party support by fieldwork end date, newest first']),
      el('thead', {}, [el('tr', {}, [
        el('th', { scope: 'col' }, ['Fieldwork end']),
        ...parties.map(({ name }) => el('th', { scope: 'col' }, [name])),
      ])]),
      el('tbody', {}, [...waves].reverse().map((wave) => el('tr', {}, [
        el('th', { scope: 'row' }, [formatDate(wave.end)]),
        ...parties.map(({ id }) => el('td', {}, [percentage(pollValue(data, wave, id), data.scale, Math.max(1, Math.log10(data.scale)))])),
      ]))),
    ]),
  ]);
}

export function pollTrendsPanel(data, series, rankings) {
  let months = 6;
  const selected = new Set(rankings.filter(({ id, value }) => id !== 'other' && value !== null)
    .slice(0, 3).map(({ id }) => id));
  const plot = el('div', { className: 'polls-plot' });
  const table = el('details', { className: 'polls-disclosure' }, [el('summary', {}, ['View results as a table'])]);

  function redraw() {
    const waves = pollHistory(data.series[series], months);
    const parties = rankings.filter(({ id }) => selected.has(id));
    plot.hidden = !parties.length;
    table.hidden = !parties.length;
    const empty = el('p', { className: 'polls-muted', 'data-testid': 'polls-no-parties' }, ['Choose a party to display its results.']);
    empty.hidden = Boolean(parties.length);
    replace(plot, ...(parties.length ? chart(data, waves, parties) : []));
    replace(message, empty);
    table.querySelector('.polls-table-scroll')?.remove();
    if (parties.length && table.open) table.append(historyTable(data, waves, parties));
  }

  table.ontoggle = () => {
    if (table.open && table.childElementCount === 1 && selected.size) {
      table.append(historyTable(data, pollHistory(data.series[series], months),
        rankings.filter(({ id }) => selected.has(id))));
    }
  };
  const message = el('div', { role: 'status' });
  const range = el('select', {
    id: 'polls-range', 'data-testid': 'polls-range',
    onchange: (event) => {
      months = Number(event.target.value);
      redraw();
    },
  }, RANGES.map(([value, name]) => el('option', { value, selected: value === months }, [name])));
  const options = el('details', { className: 'polls-disclosure polls-party-options' }, [
    el('summary', {}, ['Compare parties']),
    el('fieldset', { 'aria-label': 'Parties to compare' }, rankings.map(({ id, name, color }) =>
      el('label', {}, [
        el('input', {
          type: 'checkbox', checked: selected.has(id),
          onchange: (event) => {
            if (event.target.checked) selected.add(id);
            else selected.delete(id);
            redraw();
          },
        }),
        el('span', { className: 'polls-swatch', style: `background:${color}`, 'aria-hidden': 'true' }),
        name,
      ]))),
  ]);
  redraw();
  return el('section', { className: 'polls-card', 'aria-labelledby': 'polls-trends' }, [
    el('h2', { id: 'polls-trends' }, ['Support over time']),
    el('div', { className: 'polls-chart-controls' }, [
      el('label', { htmlFor: range.id }, ['Date range']), range,
    ]),
    options, message, plot, table,
  ]);
}
