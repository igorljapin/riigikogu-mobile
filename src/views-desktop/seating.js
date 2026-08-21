/**
 * The floor plan: `data/seating.json` joined to the roster.
 *
 * This is the desktop surface's own slice of the data layer, and it lives here
 * rather than in `src/data.js` for one reason: `src/data.js` is shared with the
 * mobile app and is reused untouched (`USABILITY.md` §10.5). Mobile has no
 * seating grid and must not grow a fetch for a file it never reads.
 *
 * `seating.json` is hand-maintained — the API publishes no seat — so the join
 * can rot in two directions, and `scripts/validate_data.py` fails the build on
 * either: a seat for someone who has left, or a member with nowhere to sit. The
 * grid built here therefore trusts the file, but never assumes an entry
 * resolves: `cellFor` yields `null` for an unknown uuid rather than an
 * undefined MP that a view would try to colour.
 */

/** Resolve `data/seating.json` against this module, so any base path works. */
function seatingUrl() {
  return new URL('../../data/seating.json', import.meta.url);
}

let cache = null;

/** @returns {Promise<{gridDimensions: {rows: number, cols: number}, seats: object}>} */
export async function loadSeating() {
  if (cache) return cache;
  const response = await fetch(seatingUrl(), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`data/seating.json: HTTP ${response.status}`);
  cache = await response.json();
  return cache;
}

/** Reset the cache. Only used by tests and the dev console. */
export function clearSeatingCache() {
  cache = null;
}

/**
 * The grid every floor plan renders: `rows × cols` cells in **row-major order**,
 * each either an MP or an empty placeholder.
 *
 * The empty cells are kept rather than skipped. 19 of the 120 cells in the XV
 * Riigikogu's hall have no seat, and dropping them would let the remaining 101
 * reflow into a solid block — a floor plan that no longer matches the room.
 *
 * @returns {{rows: number, cols: number, cells: Array<{row: number, col: number, mp: object|null}>,
 *            seatOf: (uuid: string) => {row: number, col: number}|null}}
 */
export function buildGrid(seating, data) {
  const { rows, cols } = seating.gridDimensions;
  const byCell = new Map();
  const seats = new Map();

  for (const [uuid, seat] of Object.entries(seating.seats)) {
    seats.set(uuid, { row: seat.row, col: seat.col });
    byCell.set(`${seat.row}:${seat.col}`, uuid);
  }

  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const uuid = byCell.get(`${row}:${col}`);
      cells.push({ row, col, mp: (uuid && data.mpsByUuid.get(uuid)) || null });
    }
  }

  return { rows, cols, cells, seatOf: (uuid) => seats.get(uuid) ?? null };
}
