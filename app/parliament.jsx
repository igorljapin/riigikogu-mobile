// Chunk 3 — Parliament screen.
// Renders SeatBalance strip, PartyGrid (PartyCard), and a Board SectionLabel + list.
// Seat counts are derived live from PARTIES + MPS in app/data.js.

const MAJORITY = 51;

function partySeatCounts() {
  const counts = {};
  PARTIES.forEach(p => { counts[p.id] = 0; });
  MPS.forEach(m => {
    if (counts[m.party] === undefined) counts[m.party] = 0;
    counts[m.party] += 1;
  });
  return counts;
}

function SectionLabel({ tokens, children, hint }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      padding: '0 20px', marginBottom: 10,
    }}>
      <span style={{
        fontSize: 11, fontWeight: 600, letterSpacing: 0.6,
        textTransform: 'uppercase', color: tokens.textMuted,
      }}>{children}</span>
      {hint ? (
        <span style={{ fontSize: 11, color: tokens.textSubtle, letterSpacing: 0.2 }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

// ─── SeatBalance strip ───
// Stacked horizontal bar: government (left) vs opposition (right) with a 51-seat threshold tick.
function SeatBalance({ tokens, parties, counts }) {
  const total = parties.reduce((sum, p) => sum + (counts[p.id] || 0), 0) || 101;
  const govSeats = parties
    .filter(p => p.side === 'government')
    .reduce((sum, p) => sum + (counts[p.id] || 0), 0);
  const oppSeats = total - govSeats;
  const govPct = (govSeats / total) * 100;
  const tickPct = (MAJORITY / total) * 100;

  // Build segments left-to-right: government parties first, then opposition.
  const ordered = [
    ...parties.filter(p => p.side === 'government'),
    ...parties.filter(p => p.side === 'opposition'),
  ];

  return (
    <div style={{ padding: '0 20px', marginBottom: 22 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 13, color: tokens.text, fontWeight: 600, letterSpacing: -0.1 }}>
          Government <span style={{ color: tokens.textMuted, fontWeight: 500 }}>{govSeats}</span>
        </span>
        <span style={{ fontSize: 11, color: tokens.textSubtle, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          {MAJORITY} for majority
        </span>
        <span style={{ fontSize: 13, color: tokens.text, fontWeight: 600, letterSpacing: -0.1 }}>
          <span style={{ color: tokens.textMuted, fontWeight: 500 }}>{oppSeats}</span> Opposition
        </span>
      </div>

      <div style={{
        position: 'relative',
        height: 12, borderRadius: 6, overflow: 'hidden',
        background: tokens.surfaceAlt,
        border: `0.5px solid ${tokens.border}`,
        display: 'flex',
      }}>
        {ordered.map(p => {
          const seats = counts[p.id] || 0;
          if (!seats) return null;
          const w = (seats / total) * 100;
          return (
            <div key={p.id} title={`${p.name}: ${seats}`} style={{
              width: `${w}%`,
              background: p.color,
            }}/>
          );
        })}
        {/* Government / opposition divider sits where govPct ends */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `calc(${govPct}% - 0.5px)`,
          width: 1, background: 'rgba(0,0,0,0.18)',
          pointerEvents: 'none',
        }}/>
        {/* 51-seat majority tick */}
        <div style={{
          position: 'absolute', top: -3, bottom: -3,
          left: `calc(${tickPct}% - 1px)`,
          width: 2, background: tokens.text,
          borderRadius: 1,
          pointerEvents: 'none',
        }}/>
      </div>

      <div style={{
        position: 'relative', height: 14, marginTop: 2,
        fontSize: 10, color: tokens.textSubtle, letterSpacing: 0.2,
      }}>
        <span style={{
          position: 'absolute',
          left: `calc(${tickPct}% - 8px)`,
          top: 0,
          fontWeight: 600, color: tokens.textMuted,
        }}>{MAJORITY}</span>
      </div>
    </div>
  );
}

// ─── Party card ───
function PartyCard({ tokens, party, seats, onTap }) {
  const isLight = party.textColor === '#1a1a1a';
  return (
    <div onClick={onTap} style={{
      position: 'relative',
      borderRadius: 14,
      background: tokens.surface,
      border: `0.5px solid ${tokens.border}`,
      padding: '12px 13px 13px',
      display: 'flex', flexDirection: 'column', gap: 8,
      minHeight: 96,
      cursor: onTap ? 'pointer' : 'default',
    }}>
      <div style={{
        position: 'absolute', left: 0, top: 12, bottom: 12,
        width: 3, borderRadius: 2,
        background: party.color,
      }}/>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 13, fontWeight: 600, color: tokens.text, letterSpacing: -0.1,
        }}>{party.name}</span>
        <span style={{
          fontSize: 9.5, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
          color: party.side === 'government' ? tokens.accentText : tokens.textMuted,
          background: party.side === 'government' ? tokens.accentSoft : 'transparent',
          padding: party.side === 'government' ? '2px 6px' : 0,
          borderRadius: 4,
        }}>{party.side === 'government' ? 'Gov' : 'Opp'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{
          fontSize: 28, fontWeight: 600, lineHeight: 1, color: tokens.text,
          letterSpacing: -0.6,
          fontFamily: 'ui-serif, "New York", Georgia, serif',
        }}>{seats}</span>
        <span style={{ fontSize: 11, color: tokens.textMuted }}>seats</span>
      </div>
      <div style={{
        height: 4, borderRadius: 2,
        background: tokens.surfaceAlt, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${Math.min(100, (seats / MAJORITY) * 100)}%`,
          background: party.color,
          borderRadius: 2,
        }}/>
      </div>
    </div>
  );
}

// ─── Party grid ───
function PartyGrid({ tokens, parties, counts, onPartyTap }) {
  const sorted = [...parties].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
  return (
    <div style={{
      padding: '0 20px',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10,
    }}>
      {sorted.map(p => (
        <PartyCard
          key={p.id}
          tokens={tokens}
          party={p}
          seats={counts[p.id] || 0}
          onTap={onPartyTap ? () => onPartyTap(p) : undefined}
        />
      ))}
    </div>
  );
}

// ─── Board list ───
function BoardList({ tokens, parties, board }) {
  const partyById = Object.fromEntries(parties.map(p => [p.id, p]));
  return (
    <div style={{ padding: '0 20px' }}>
      <div style={{
        background: tokens.surface,
        border: `0.5px solid ${tokens.border}`,
        borderRadius: 14,
        overflow: 'hidden',
      }}>
        {board.map((b, i) => {
          const p = partyById[b.party];
          return (
            <div key={b.role} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px',
              borderTop: i === 0 ? 'none' : `0.5px solid ${tokens.border}`,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: 4,
                background: p ? p.color : tokens.textSubtle,
                flexShrink: 0,
              }}/>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: tokens.text, letterSpacing: -0.1 }}>
                  {b.name}
                </span>
                <span style={{ fontSize: 11, color: tokens.textMuted, marginTop: 2 }}>
                  {b.role}
                </span>
              </div>
              <span style={{
                fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase',
                color: tokens.textMuted,
              }}>{p ? p.name : '—'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Parliament screen ───
function ParliamentScreen({ tokens }) {
  const counts = React.useMemo(partySeatCounts, []);
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const [openParty, setOpenParty] = React.useState(null);

  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: 108, bottom: 0,
      overflowY: 'auto',
      paddingTop: 6, paddingBottom: 110,
    }}>
      <SectionLabel tokens={tokens} hint={`${total} seats`}>Seat balance</SectionLabel>
      <SeatBalance tokens={tokens} parties={PARTIES} counts={counts}/>

      <SectionLabel tokens={tokens}>Parties</SectionLabel>
      <PartyGrid tokens={tokens} parties={PARTIES} counts={counts} onPartyTap={setOpenParty}/>

      <div style={{ height: 22 }}/>

      <SectionLabel tokens={tokens}>Board of the Riigikogu</SectionLabel>
      <BoardList tokens={tokens} parties={PARTIES} board={BOARD}/>

      {typeof PartyMPsSheet !== 'undefined' ? (
        <PartyMPsSheet
          tokens={tokens}
          open={!!openParty}
          party={openParty}
          onClose={() => setOpenParty(null)}
        />
      ) : null}
    </div>
  );
}

Object.assign(window, {
  ParliamentScreen, SeatBalance, PartyGrid, PartyCard, SectionLabel, BoardList,
});
