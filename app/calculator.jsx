// Chunk 6 — Coalition calculator screen.
function CalculatorScreen({ tokens }) {
  const [selected, setSelected] = React.useState(() => new Set());

  const toggle = id => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const totalSeats = React.useMemo(() => {
    const counts = partySeatCounts ? partySeatCounts() : {};
    return [...selected].reduce((sum, id) => sum + (counts[id] || 0), 0);
  }, [selected]);

  const majority = 51;
  const pct = Math.min(100, Math.round((totalSeats / 101) * 100));
  const hasMajority = totalSeats >= majority;
  const counts = React.useMemo(() => partySeatCounts ? partySeatCounts() : {}, []);

  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: 108, bottom: 0,
      overflowY: 'auto', paddingBottom: 90,
    }}>
      <div style={{
        margin: '16px 16px 8px',
        padding: '14px 16px',
        borderRadius: 14,
        background: hasMajority ? 'oklch(0.96 0.06 145)' : tokens.surface,
        border: `1px solid ${hasMajority ? 'oklch(0.75 0.16 145)' : tokens.border}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 13, color: tokens.textMuted }}>Seats selected</span>
          <span style={{
            fontSize: 22, fontWeight: 700,
            color: hasMajority ? 'oklch(0.42 0.16 145)' : tokens.text,
          }}>
            {totalSeats} <span style={{ fontSize: 13, fontWeight: 400 }}>/ 101</span>
          </span>
        </div>
        <div style={{
          marginTop: 8, height: 6, borderRadius: 3,
          background: tokens.border, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: 3,
            width: `${pct}%`,
            background: hasMajority ? 'oklch(0.55 0.16 145)' : tokens.accent,
            transition: 'width 0.25s ease',
          }}/>
        </div>
        <div style={{ marginTop: 5, fontSize: 11.5, color: tokens.textMuted }}>
          {hasMajority
            ? `Majority reached (+${totalSeats - majority} seats over threshold)`
            : `${majority - totalSeats} more seat${majority - totalSeats === 1 ? '' : 's'} needed for majority`}
        </div>
      </div>

      {PARTIES.map(party => {
        const seats = counts[party.id] || 0;
        const on = selected.has(party.id);
        return (
          <button key={party.id} onClick={() => toggle(party.id)} style={{
            all: 'unset', cursor: 'pointer', display: 'flex',
            alignItems: 'center', gap: 12,
            width: '100%', boxSizing: 'border-box',
            padding: '11px 16px',
            borderBottom: `0.5px solid ${tokens.border}`,
            background: on ? tokens.accentSoft : 'transparent',
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: 3, flexShrink: 0,
              background: party.color || tokens.accent,
            }}/>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: tokens.text }}>{party.name}</div>
              <div style={{ fontSize: 11.5, color: tokens.textMuted, marginTop: 1 }}>
                {seats} seat{seats !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              border: `2px solid ${on ? tokens.accent : tokens.borderStrong}`,
              background: on ? tokens.accent : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {on && <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

Object.assign(window, { CalculatorScreen });
