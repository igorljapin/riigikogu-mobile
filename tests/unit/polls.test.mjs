import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePolls, pollRankings, pollValue, pollHistory, isPollOverdue, pollGap, pollCalendarTicks } from '../../src/lib/polls.js';
import { percentage } from '../../src/polls/rankings.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/polls/normalized.json', import.meta.url)));

test('poll series use their own preceding observations and keep Other last', () => {
  assert.equal(validatePolls(fixture), fixture);
  const aggregate = pollRankings(fixture, 'fourWeek');
  const weekly = pollRankings(fixture, 'weekly');
  assert.deepEqual([aggregate[0].id, aggregate[0].value, aggregate[0].change], ['center', 253, 4]);
  assert.deepEqual([weekly[0].id, weekly[0].value, weekly[0].change], ['center', 247, -4]);
  assert.deepEqual([aggregate.at(-1).id, aggregate.at(-1).value, weekly.at(-1).value], ['other', 28, 27]);
  assert.equal(percentage(125, 100), '1.3%');
  assert.equal(percentage(125, 100, 2), '1.25%');
});

test('shared parties use the same short name and color as the parliamentary views', () => {
  const parliamentary = JSON.parse(readFileSync(new URL('../../data/parties.json', import.meta.url)));
  const { parties } = JSON.parse(readFileSync(new URL('../../data/polls.json', import.meta.url)));
  for (const { id, short, color } of parliamentary) {
    if (id === 'independent') continue;
    const party = parties.find((candidate) => candidate.id === id);
    assert.equal(party?.name, short, id);
    assert.equal(party?.color, color, id);
  }
});

test('missing values and zeroes remain distinguishable', () => {
  const data = structuredClone(fixture);
  const earlier = data.series.weekly[0];
  earlier.values.stalnuhhin = null;
  assert.equal(validatePolls(data), data);
  assert.equal(pollValue(data, earlier, 'stalnuhhin'), null);
  assert.equal(pollValue(data, earlier, 'other'), null);
  assert.equal(pollValue(data, data.series.weekly.at(-1), 'stalnuhhin'), 0);
  assert.equal(percentage(null, 10), 'Unavailable');
  assert.equal(percentage(0, 10), '0.0%');
});

test('historical windows use calendar months and overdue uses the fieldwork end', () => {
  const waves = ['2024-01-01', '2024-02-28', '2024-02-29', '2024-04-02', '2024-05-31']
    .map((end) => ({ end }));
  assert.equal(pollHistory(waves, 0), waves);
  assert.deepEqual(pollHistory(waves, 3), waves.slice(2));
  assert.equal(pollHistory(waves, 6).length, 5);
  assert.equal(pollGap(waves[1], waves[2]), false);
  assert.equal(pollGap(waves[2], waves[3]), true);
  assert.equal(isPollOverdue(waves.at(-1), Date.parse('2024-06-14T23:59:59Z')), false);
  assert.equal(isPollOverdue(waves.at(-1), Date.parse('2024-06-15T00:00:00Z')), true);
  assert.equal(isPollOverdue(waves.at(-1), Date.parse('2024-06-03T00:00:00Z'), 2), true);
});

test('date grid ticks align with month, quarter and year boundaries', () => {
  const tickDates = (start, end) => pollCalendarTicks(Date.parse(start), Date.parse(end))
    .map((time) => new Date(time).toISOString().slice(0, 10));
  assert.deepEqual(tickDates('2026-05-17', '2026-11-15'), [
    '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01',
  ]);
  assert.deepEqual(tickDates('2025-11-16', '2026-11-15'), [
    '2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01',
  ]);
  assert.deepEqual(tickDates('2022-11-20', '2026-01-01'), [
    '2023-01-01', '2024-01-01', '2025-01-01', '2026-01-01',
  ]);
  assert.deepEqual(tickDates('2026-11-08', '2026-11-15'), []);
});

test('the browser validator rejects missing waves, sample errors, and invalid totals', () => {
  let data = structuredClone(fixture);
  data.series.weekly = [];
  assert.throws(() => validatePolls(data), /weekly/);
  data = structuredClone(fixture);
  data.series.weekly[0].sample.voters = data.series.weekly[0].sample.total + 1;
  assert.throws(() => validatePolls(data), /sample counts/);
  data = structuredClone(fixture);
  data.series.weekly.at(-1).values.center = 0;
  assert.throws(() => validatePolls(data), /percentage total/);
});
