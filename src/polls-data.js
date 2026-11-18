import { validatePolls } from './lib/polls.js';

const URL_POLLS = new URL('../data/polls.json', import.meta.url);
const CACHE = 'riigikogu-polls-data-v1';
let pending;
let lastUsable;

function useSnapshot(candidate, current) {
  const parties = new Set(candidate.parties.map(({ id }) => id));
  if (current && (current.parties.some(({ id }) => !parties.has(id)) ||
    candidate.source.retrievedAt < current.source.retrievedAt ||
    candidate.scale !== current.scale ||
    Object.keys(current.series).some((id) => {
      const prior = current.series[id].at(-1);
      const next = candidate.series[id].at(-1);
      const retained = new Set(candidate.series[id].map(({ id: waveId }) => waveId));
      return prior && (!next || prior.end > next.end ||
        current.series[id].some(({ id: waveId }) => !retained.has(waveId)));
    }))) {
    throw new Error('The hosted snapshot is older than the stored data');
  }
  return candidate;
}

async function readStored(cache) {
  try {
    const stored = await cache?.match(URL_POLLS);
    if (!stored) return lastUsable;
    const snapshot = validatePolls(await stored.json());
    return lastUsable && lastUsable.source.retrievedAt > snapshot.source.retrievedAt ? lastUsable : snapshot;
  } catch {
    return lastUsable;
  }
}

async function refresh() {
  const cache = await globalThis.caches?.open(CACHE).catch(() => null);
  let networkUnavailable = false;
  try {
    const response = await fetch(URL_POLLS, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    }).catch((error) => {
      // The browser can report a network interface as online while the origin
      // is unreachable. Keep transport failures distinct from bad responses.
      networkUnavailable = error instanceof TypeError;
      throw error;
    });
    if (response.status === 204 && !await readStored(cache)) {
      return { data: null, cached: false, offline: false };
    }
    if (!response.ok || response.status === 204) throw new Error(`Polls request returned HTTP ${response.status}`);
    const snapshot = validatePolls(await response.json());
    const save = async () => {
      lastUsable = useSnapshot(snapshot, await readStored(cache));
      await cache?.put(URL_POLLS, new Response(JSON.stringify(snapshot), {
        headers: { 'Content-Type': 'application/json' },
      })).catch(() => {});
    };
    if (navigator.locks) await navigator.locks.request(CACHE, save);
    else await save();
    return { data: snapshot, cached: false, offline: false };
  } catch (error) {
    const data = await readStored(cache);
    const offline = networkUnavailable || !navigator.onLine;
    if (data) return { data, cached: true, offline };
    if (offline) return { data: null, cached: false, offline: true };
    throw error;
  }
}

export function loadPolls() {
  pending ??= refresh().finally(() => { pending = null; });
  return pending;
}
