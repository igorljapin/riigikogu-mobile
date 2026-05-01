// Chunk 6 — Coalition calculator.
// Party toggles + individual MP additions + milestone badges.
// Milestones: 51 (simple majority), 61 (3/5), 68 (2/3), 81 (4/5).

const MILESTONES = [
  { seats: 51, label: '51', note: 'Simple majority' },
  { seats: 61, label: '61', note: '3/5 majority' },
  { seats: 68, label: '68', note: '2/3 majority' },
  { seats: 81, label: '81', note: '4/5 majority' },
];

// ─── Milestone badge ───
function MilestoneBadge({ tokens, label, note, reached }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <div style={{
        minWidth: 40, height: 28, paddingInline: 6,
        borderRadius: 8,
        background: reached ? tokens.accent : tokens.surfaceAlt,
        border: `0.5px solid ${reached ? tokens.accent : tokens.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700,
        color: reached ? '#fff' : tokens.textSubtle,
        transition: 'background 0.2s, color 0.2s',
        boxSizing: 'border-box',
      }}>{label}</div>
      <span style={{
        fontSize: 9.5, color: reached ? tokens.accentText : tokens.textSubtle,
        letterSpacing: 0.1, textAlign: 'center', maxWidth: 56,
        lineHeight: 1.2,
      }}>{note}</span>
    </div>
  );
}

// ─── AdjustRow — one party toggle row ───
// "Exclude MPs" button is hidden for v1 (renders null).
function AdjustRow({ tokens, party, active, onToggle, isFirst }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px',
      borderTop: isFirst ? 'none' : `0.5px solid ${tokens.border}`,
    }}>
      <div style={{
        width: 10, height: 10, borderRadius: 5,
        background: party.color, flexShrink: 0,
        border: `0.5px solid rgba(0,0,0,0.08)`,
      }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 500, color: tokens.text, letterSpacing: -0.1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{party.name}</div>
        <div style={{ fontSize: 11, color: tokens.textMuted, marginTop: 1 }}>
          {party.seats} seat{party.seats !== 1 ? 's' : ''}
          {' · '}
          {party.side === 'government' ? 'Government' : 'Opposition'}
        </div>
      </div>

      {/* Exclude MPs button — null for v1 */}
      {null}

      {/* Toggle switch */}
      <button
        onClick={onToggle}
        style={{
          all: 'unset', cursor: 'pointer',
          width: 44, height: 26, borderRadius: 13,
          background: active ? tokens.accent : tokens.surfaceAlt,
          border: `0.5px solid ${active ? tokens.accent : tokens.border}`,
          position: 'relative', flexShrink: 0,
          transition: 'background 0.2s',
        }}
        aria-label={`${active ? 'Remove' : 'Add'} ${party.name}`}
      >
        <span style={{
          position: 'absolute',
          top: 3, left: active ? 21 : 3,
          width: 20, height: 20, borderRadius: 10,
          background: active ? '#fff' : tokens.textSubtle,
          transition: 'left 0.2s',
          display: 'block',
        }}/>
      </button>
    </div>
  );
}

// ─── CalculatorScreen ───
function CalculatorScreen({ tokens }) {
  const [activeParties, setActiveParties] = React.useState(new Set());
  const [addedMPs, setAddedMPs] = React.useState([]);
  const [addSheetOpen, setAddSheetOpen] = React.useState(false);

  const partyById = React.useMemo(
    () => Object.fromEntries(PARTIES.map(p => [p.id, p])),
    []
  );

  // UUIDs of MPs already counted via an active party toggle
  const activePartyMPIds = React.useMemo(() => {
    const ids = new Set();
    MPS.forEach(mp => {
      if (activeParties.has(mp.party)) ids.add(mp.uuid);
    });
    return ids;
  }, [activeParties]);

  // Only count manually-added MPs that aren't already in an active party
  const effectiveAddedMPs = addedMPs.filter(mp => !activePartyMPIds.has(mp.uuid));

  const partySeatTotal = PARTIES.reduce(
    (sum, p) => sum + (activeParties.has(p.id) ? (p.seats || 0) : 0), 0
  );
  const total = partySeatTotal + effectiveAddedMPs.length;
  const barPct = Math.min(100, (total / 101) * 100);

  const excludeIds = [
    ...Array.from(activePartyMPIds),
    ...addedMPs.map(m => m.uuid),
  ];

  const toggleParty = (id) => {
    setActiveParties(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddMP = (mp) => {
    setAddedMPs(prev => prev.find(m => m.uuid === mp.uuid) ? prev : [...prev, mp]);
  };

  const removeAddedMP = (uuid) => {
    setAddedMPs(prev => prev.filter(m => m.uuid !== uuid));
  };

  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: 108, bottom: 0,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* ── Seat counter card ── */}
      <div style={{
        margin: '0 16px 12px',
        background: tokens.surface,
        border: `0.5px solid ${tokens.border}`,
        borderRadius: 16,
        padding: '16px 18px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
          <span style={{ fontSize: 36, fontWeight: 700, color: tokens.text, letterSpacing: -1 }}>
            {total}
          </span>
          <span style={{ fontSize: 14, color: tokens.textMuted }}>/ 101 seats</span>
        </div>

        {/* Progress bar */}
        <div style={{
          height: 6, borderRadius: 3,
          background: tokens.surfaceAlt,
          marginBottom: 14, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${barPct}%`,
            borderRadius: 3,
            background: total >= 51 ? tokens.good : tokens.accent,
            transition: 'width 0.25s ease',
          }}/>
        </div>

        {/* Milestone badges */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {MILESTONES.map(m => (
            <MilestoneBadge
              key={m.seats}
              tokens={tokens}
              label={m.label}
              note={m.note}
              reached={total >= m.seats}
            />
          ))}
        </div>
      </div>

      {/* ── Scrollable list ── */}
      <div style={{ overflowY: 'auto', flex: 1, paddingBottom: 100 }}>

        {/* Party toggle list */}
        <div style={{
          margin: '0 16px 8px',
          background: tokens.surface,
          border: `0.5px solid ${tokens.border}`,
          borderRadius: 14,
          overflow: 'hidden',
        }}>
          {PARTIES.map((party, i) => (
            <AdjustRow
              key={party.id}
              tokens={tokens}
              party={party}
              active={activeParties.has(party.id)}
              onToggle={() => toggleParty(party.id)}
              isFirst={i === 0}
            />
          ))}
        </div>

        {/* Individually added MPs */}
        {effectiveAddedMPs.length > 0 ? (
          <div style={{
            margin: '0 16px 8px',
            background: tokens.surface,
            border: `0.5px solid ${tokens.border}`,
            borderRadius: 14,
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '10px 16px 8px',
              fontSize: 11, fontWeight: 600, color: tokens.textMuted,
              letterSpacing: 0.5, textTransform: 'uppercase',
            }}>
              Individual MPs ({effectiveAddedMPs.length})
            </div>
            {effectiveAddedMPs.map((mp) => {
              const party = partyById[mp.party];
              return (
                <div key={mp.uuid} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 16px',
                  borderTop: `0.5px solid ${tokens.border}`,
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 15,
                    background: tokens.surfaceAlt,
                    overflow: 'hidden', flexShrink: 0,
                    border: `0.5px solid ${tokens.border}`,
                  }}>
                    <img
                      src={mp.photoUrl}
                      alt={mp.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => e.target.style.display = 'none'}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 500, color: tokens.text, letterSpacing: -0.1,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{mp.name}</div>
                    {party ? (
                      <div style={{ fontSize: 11, color: tokens.textMuted, marginTop: 1 }}>
                        {party.name}
                      </div>
                    ) : null}
                  </div>
                  <button
                    onClick={() => removeAddedMP(mp.uuid)}
                    style={{
                      all: 'unset', cursor: 'pointer',
                      width: 26, height: 26, borderRadius: 13,
                      background: tokens.surfaceAlt,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, color: tokens.textMuted,
                    }}
                    aria-label={`Remove ${mp.name}`}
                  >×</button>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Add individual MPs button */}
        <div style={{ padding: '4px 16px 8px' }}>
          <button
            onClick={() => setAddSheetOpen(true)}
            style={{
              all: 'unset', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8,
              width: '100%', boxSizing: 'border-box',
              padding: '12px 16px',
              background: tokens.surface,
              border: `0.5px solid ${tokens.border}`,
              borderRadius: 12,
              fontSize: 14, fontWeight: 500, color: tokens.accentText,
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 400, lineHeight: 1 }}>+</span>
            Add individual MPs
          </button>
        </div>
      </div>

      {typeof AddMPsSheet !== 'undefined' ? (
        <AddMPsSheet
          tokens={tokens}
          open={addSheetOpen}
          onClose={() => setAddSheetOpen(false)}
          onAdd={handleAddMP}
          excludeIds={excludeIds}
        />
      ) : null}
    </div>
  );
}

Object.assign(window, { CalculatorScreen, AdjustRow, MilestoneBadge });
