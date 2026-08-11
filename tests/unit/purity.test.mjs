import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { calculate, seatsForSelection } from '../../src/lib/calculator.js';
import { repoRoot } from './helpers/fixtures.mjs';

/**
 * `ARCHITECTURE_PLAN.md` Phase 3 requires `src/lib/*` to be "pure functions, no
 * DOM/globals". That is not a style preference — it is what lets Phase 4 swap
 * the entire view layer, and any future redesign swap it again, without the
 * majority arithmetic moving. A single `document.querySelector` creeping into
 * this layer would re-fuse logic and view, which is precisely the failure that
 * sank the last redesign (commit 4dae72b).
 *
 * So the constraint is enforced, not just documented.
 */

const libDir = join(repoRoot, 'src/lib');
const libFiles = readdirSync(libDir).filter((name) => name.endsWith('.js'));

const FORBIDDEN = [
  'document',
  'window',
  'navigator',
  'localStorage',
  'sessionStorage',
  'fetch(',
  'XMLHttpRequest',
  'alert(',
  'require(',
  'process.',
];

test('the lib directory is not empty', () => {
  assert.deepEqual(libFiles.sort(), ['calculator.js', 'factions.js']);
});

for (const name of libFiles) {
  test(`${name} touches no DOM, no browser globals and does no I/O`, () => {
    const source = readFileSync(join(libDir, name), 'utf8');
    // Strip block and line comments so prose about the DOM does not trip the check.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    for (const token of FORBIDDEN) {
      assert.equal(code.includes(token), false, `${name} references "${token}"`);
    }
  });

  test(`${name} imports nothing outside src/lib`, () => {
    const source = readFileSync(join(libDir, name), 'utf8');
    const imports = [...source.matchAll(/^import\s.*?from\s+'([^']+)'/gm)].map((m) => m[1]);
    for (const specifier of imports) {
      assert.ok(
        specifier.startsWith('./'),
        `${name} imports "${specifier}" — src/lib must depend on nothing but itself`,
      );
    }
  });
}

test('the modules load in a bare Node process with no globals available', async () => {
  // Importing must not throw, which it would if module-level code touched a
  // browser global — there is no DOM here.
  const calculator = await import('../../src/lib/calculator.js');
  const factions = await import('../../src/lib/factions.js');

  assert.equal(typeof calculator.seatsForSelection, 'function');
  assert.equal(typeof calculator.hasSimpleMajority, 'function');
  assert.equal(typeof calculator.hasConstitutionalMajority, 'function');
  assert.equal(typeof factions.buildRoster, 'function');
  assert.equal(typeof factions.votingBlocPartyId, 'function');
});

test('repeated calls with the same arguments return the same answer', () => {
  // Cheap guard against hidden state creeping into the module scope.
  const roster = [
    { uuid: 'x', name: 'X', registeredPartyId: 'p', votingBlocPartyId: 'p', unaligned: false },
    { uuid: 'y', name: 'Y', registeredPartyId: 'p', votingBlocPartyId: 'p', unaligned: false },
  ];
  const selection = { parties: ['p'], added: [], excluded: [] };

  const results = Array.from({ length: 5 }, () => JSON.stringify(calculate(selection, roster)));
  assert.equal(new Set(results).size, 1);
  assert.equal(calculate(selection, roster).seats, 2);
});

test('the modules hold no state between selections', () => {
  const roster = [
    { uuid: 'x', name: 'X', registeredPartyId: 'p', votingBlocPartyId: 'p', unaligned: false },
    { uuid: 'y', name: 'Y', registeredPartyId: 'q', votingBlocPartyId: 'q', unaligned: false },
  ];

  const first = seatsForSelection({ parties: ['p'], added: [], excluded: [] }, roster);
  seatsForSelection({ parties: ['p', 'q'], added: ['x', 'y'], excluded: ['x'] }, roster);
  const again = seatsForSelection({ parties: ['p'], added: [], excluded: [] }, roster);

  assert.equal(first, again);
});
