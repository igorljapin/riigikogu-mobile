/** Polls use scaled integers throughout. Only the presentation rounds values. */
export const SERIES = Object.freeze({
  fourWeek: 'Four-week aggregate',
  weekly: 'Weekly results',
});
export const SOURCE_URL = 'https://reitingud.ee/reitingud/';
const DATASET_URL = 'https://kiir.kusitlus.com/_datasets_public/rk-ratings/ratings-compact.json';
const SAMPLE_FIELDS = ['total', 'voters', 'effectiveTotal', 'effectiveVoters'];
export const OVERDUE_DAYS = 14;
const DAY_MS = 86_400_000;
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isPollDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function check(condition, label) {
  if (!condition) throw new Error(`Invalid polls snapshot: ${label}`);
}

function isCount(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function hasKeys(record, keys) {
  return record && Object.keys(record).length === keys.length &&
    keys.every((key) => Object.hasOwn(record, key));
}

export function validatePolls(data) {
  check(data?.schema === 1, 'schema');
  check([1, 10, 100, 1000, 10000].includes(data.scale), 'scale');
  check(data.basis === 'voters' && data.nonvoterLabel === 'Mittevalija', 'denominator');
  check(data.source?.url === DATASET_URL && data.source.schema === 3 &&
    isCount(data.source.importerVersion) && typeof data.source.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(data.source.sha256), 'provenance');
  const retrievedAt = data.source?.retrievedAt;
  check(typeof retrievedAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(retrievedAt) &&
    Number.isFinite(Date.parse(retrievedAt)) &&
    new Date(retrievedAt).toISOString().slice(0, 23) === retrievedAt.slice(0, 23), 'retrieval time');
  check(Array.isArray(data.parties), 'party list');
  const ids = new Set(['other']);
  for (const party of data.parties) {
    check(typeof party?.id === 'string' && idPattern.test(party.id) &&
      !ids.has(party.id), 'party ID');
    check(typeof party.name === 'string' && party.name.trim() && party.name.length <= 100 &&
      /^#[0-9a-f]{6}$/i.test(party.color) && typeof party.other === 'boolean', 'party metadata');
    ids.add(party.id);
  }
  const partyIds = data.parties.map(({ id }) => id);
  check(partyIds.length > 0 && data.parties.some(({ other }) => other) &&
    data.parties.some(({ other }) => !other), 'party grouping');
  check(hasKeys(data.series, Object.keys(SERIES)), 'series');
  for (const [seriesId, waves] of Object.entries(data.series)) {
    check(Array.isArray(waves) && waves.length > 0, seriesId);
    let lastEnd = '';
    let lastStart = '';
    const waveIds = new Set();
    for (const wave of waves) {
      check(typeof wave?.id === 'string' && wave.id.trim() && !waveIds.has(wave.id),
        `${seriesId} wave ID`);
      check(isPollDate(wave.start) && isPollDate(wave.end) &&
        wave.start <= wave.end && wave.end > lastEnd && wave.start >= lastStart &&
        wave.end <= retrievedAt.slice(0, 10), `${seriesId} fieldwork dates`);
      check(wave.published === null || (isPollDate(wave.published) &&
        wave.published >= wave.end && wave.published <= retrievedAt.slice(0, 10)), 'publication date');
      check(typeof wave.startInferred === 'boolean', 'fieldwork start provenance');
      const { total, voters, effectiveTotal, effectiveVoters } = wave.sample ?? {};
      check(hasKeys(wave.sample, SAMPLE_FIELDS) && Object.values(wave.sample).every(isCount) &&
        voters <= total && effectiveTotal <= total &&
        effectiveVoters <= Math.min(voters, effectiveTotal), 'sample counts');
      check(hasKeys(wave.values, partyIds), 'party values');
      const values = Object.values(wave.values);
      check([...values, wave.nonvoter].every((value) => value === null ||
        (Number.isSafeInteger(value) && value >= 0 && value <= 100 * data.scale)), 'percentage');
      // Each displayed category can contribute at most half a source unit if rounded.
      const totalUnits = values.reduce((sum, value) => sum + value, 0);
      const tolerance = values.filter((value) => value !== null).length / 2;
      const maximum = 100 * data.scale + tolerance;
      const minimum = 100 * data.scale - tolerance;
      check(totalUnits <= maximum &&
        (values.includes(null) || totalUnits >= minimum), 'percentage total');
      waveIds.add(wave.id);
      lastStart = wave.start;
      lastEnd = wave.end;
    }
    check(Object.values(waves.at(-1).values).every((value) => value !== null), 'latest categories');
  }
  return data;
}

/** The aggregate is unavailable whenever any component is missing. */
export function pollValue(data, wave, id) {
  if (!wave) return null;
  if (id !== 'other') return wave.values[id] ?? null;
  const parts = data.parties.filter((party) => party.other).map((party) => wave.values[party.id]);
  return parts.includes(null) ? null : parts.reduce((sum, value) => sum + value, 0);
}

export function pollRankings(data, series) {
  const [latest, previous] = data.series[series].slice(-2).reverse();
  const rows = data.parties.filter((party) => !party.other)
    .map((party) => ({ ...party, value: pollValue(data, latest, party.id) }))
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  rows.push({ id: 'other', name: 'Other', color: '#64748b', value: pollValue(data, latest, 'other') });
  return rows.map((row) => {
    const prior = pollValue(data, previous, row.id);
    return { ...row, change: prior === null || row.value === null ? null : row.value - prior };
  });
}

export function pollHistory(waves, months) {
  if (!months || !waves.length) return waves;
  const latest = new Date(waves.at(-1).end);
  const day = latest.getUTCDate();
  latest.setUTCDate(1);
  latest.setUTCMonth(latest.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth() + 1, 0)).getUTCDate();
  latest.setUTCDate(Math.min(day, lastDay));
  const start = latest.toISOString().slice(0, 10);
  return waves.filter((wave) => wave.end >= start);
}

export function isPollOverdue(wave, now, days = OVERDUE_DAYS) {
  return now >= Date.parse(wave.end) + (days + 1) * DAY_MS;
}

export function pollGap(earlier, later) {
  return Date.parse(later.end) - Date.parse(earlier.end) > 10 * DAY_MS;
}
