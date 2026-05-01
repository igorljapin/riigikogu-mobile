// Chunk 4 — Bottom sheet system.
// Sheet primitive + SheetHeader, plus three concrete sheets:
//   MPSheet         — single MP detail (photo, role, party, profile link)
//   PartyMPsSheet   — list of MPs in a party; tap an MP to open MPSheet
//   AddMPsSheet     — generic "pick MPs" list (used by Calculator later)
//
// Tapping a party card on the Parliament screen opens PartyMPsSheet.

// ─── Sheet primitive ───
// Bottom sheet with backdrop. Tap backdrop or close button to dismiss.
// Renders nothing when `open` is false.
function Sheet({ tokens, open, onClose, children, height = '82%' }) {
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    }}>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.42)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
      }}/>
      <div style={{
        position: 'relative',
        background: tokens.bg,
        color: tokens.text,
        borderTopLeftRadius: 18, borderTopRightRadius: 18,
        height, maxHeight: '92%',
        boxShadow: '0 -12px 40px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
          <div style={{
            width: 36, height: 4, borderRadius: 2,
            background: tokens.borderStrong,
          }}/>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Sheet header ───
function SheetHeader({ tokens, title, subtitle, onClose }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px 12px',
      borderBottom: `0.5px solid ${tokens.border}`,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0 }}>
        <span style={{
          fontSize: 16, fontWeight: 600, color: tokens.text, letterSpacing: -0.2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{title}</span>
        {subtitle ? (
          <span style={{ fontSize: 11.5, color: tokens.textMuted, marginTop: 2, letterSpacing: 0.1 }}>
            {subtitle}
          </span>
        ) : null}
      </div>
      <button onClick={onClose} style={{
        all: 'unset', cursor: 'pointer',
        width: 32, height: 32, borderRadius: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: tokens.surfaceAlt,
        color: tokens.textMuted,
        fontSize: 16, fontWeight: 500,
      }} aria-label="Close">×</button>
    </div>
  );
}

// ─── MP sheet ───
function MPSheet({ tokens, open, mp, onClose }) {
  if (!mp) return null;
  const partyById = Object.fromEntries(PARTIES.map(p => [p.id, p]));
  const party = partyById[mp.party];

  const boardEntry = BOARD.find(b => b.name === mp.name);
  const role = boardEntry ? boardEntry.role : 'Member of Parliament';

  return (
    <Sheet tokens={tokens} open={open} onClose={onClose} height="78%">
      <SheetHeader tokens={tokens} title={mp.name} subtitle={party ? party.name : ''} onClose={onClose}/>
      <div style={{ overflowY: 'auto', padding: '16px 20px 28px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18,
        }}>
          <div style={{
            width: 84, height: 84, borderRadius: 42,
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: 18, fontWeight: 600, color: tokens.text, letterSpacing: -0.2 }}>
              {mp.name}
            </span>
            <span style={{ fontSize: 12.5, color: tokens.textMuted }}>{role}</span>
            {party ? (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 11, color: tokens.textMuted, marginTop: 2,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: 4, background: party.color,
                }}/>
                {party.name} · {party.side === 'government' ? 'Government' : 'Opposition'}
              </span>
            ) : null}
          </div>
        </div>

        <div style={{
          background: tokens.surface,
          border: `0.5px solid ${tokens.border}`,
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px',
          }}>
            <span style={{ fontSize: 12, color: tokens.textMuted, letterSpacing: 0.2 }}>Faction</span>
            <span style={{ fontSize: 13, color: tokens.text, fontWeight: 500, textAlign: 'right', marginLeft: 12 }}>
              {mp.faction || '—'}
            </span>
          </div>
        </div>

        {mp.profileUrl ? (
          <div style={{ marginTop: 18 }}>
            <a
              href={mp.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: tokens.accent, fontSize: 13.5, fontWeight: 600,
                textDecoration: 'none', letterSpacing: -0.05,
              }}
            >View official profile →</a>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

// ─── Party MPs sheet ───
// Lists every MP in the given party. Tapping a row opens a nested MPSheet.
function PartyMPsSheet({ tokens, open, party, onClose }) {
  const [selectedMP, setSelectedMP] = React.useState(null);
  if (!party) return null;
  const members = MPS
    .filter(m => m.party === party.id)
    .slice()
    .sort((a, b) => a.last.localeCompare(b.last));

  return (
    <React.Fragment>
      <Sheet tokens={tokens} open={open} onClose={onClose}>
        <SheetHeader
          tokens={tokens}
          title={party.name}
          subtitle={`${members.length} member${members.length === 1 ? '' : 's'} · ${party.side === 'government' ? 'Government' : 'Opposition'}`}
          onClose={onClose}
        />
        <div style={{ overflowY: 'auto', padding: '8px 14px 28px' }}>
          {members.map((mp, i) => (
            <button
              key={mp.uuid || mp.name}
              onClick={() => setSelectedMP(mp)}
              style={{
                all: 'unset', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', boxSizing: 'border-box',
                padding: '10px 8px',
                borderTop: i === 0 ? 'none' : `0.5px solid ${tokens.border}`,
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 18,
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
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{
                  fontSize: 14, fontWeight: 500, color: tokens.text, letterSpacing: -0.1,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{mp.name}</span>
              </div>
              <span style={{ fontSize: 18, color: tokens.textSubtle, lineHeight: 1 }}>›</span>
            </button>
          ))}
        </div>
      </Sheet>

      <MPSheet
        tokens={tokens}
        open={!!selectedMP}
        mp={selectedMP}
        onClose={() => setSelectedMP(null)}
      />
    </React.Fragment>
  );
}

// ─── Add MPs sheet ───
// Generic "pick MPs" list used by the Calculator (later chunk). Renders all MPs
// with a + control to add them to a caller-managed selection.
function AddMPsSheet({ tokens, open, onClose, onAdd, excludeIds = [] }) {
  const [query, setQuery] = React.useState('');
  const partyById = Object.fromEntries(PARTIES.map(p => [p.id, p]));
  const excluded = new Set(excludeIds);

  const filtered = MPS
    .filter(m => !excluded.has(m.uuid))
    .filter(m => {
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return m.name.toLowerCase().includes(q);
    })
    .slice()
    .sort((a, b) => a.last.localeCompare(b.last));

  return (
    <Sheet tokens={tokens} open={open} onClose={onClose}>
      <SheetHeader
        tokens={tokens}
        title="Add MPs"
        subtitle={`${filtered.length} available`}
        onClose={onClose}
      />
      <div style={{ padding: '10px 14px 6px' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '10px 12px',
            border: `0.5px solid ${tokens.border}`,
            borderRadius: 10,
            background: tokens.surface,
            color: tokens.text,
            fontSize: 14,
            outline: 'none',
          }}
        />
      </div>
      <div style={{ overflowY: 'auto', padding: '6px 14px 28px', flex: 1 }}>
        {filtered.map((mp, i) => {
          const party = partyById[mp.party];
          return (
            <div
              key={mp.uuid || mp.name}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 8px',
                borderTop: i === 0 ? 'none' : `0.5px solid ${tokens.border}`,
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 18,
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
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{
                  fontSize: 14, fontWeight: 500, color: tokens.text, letterSpacing: -0.1,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{mp.name}</span>
                {party ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 11, color: tokens.textMuted, marginTop: 2,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: party.color }}/>
                    {party.name}
                  </span>
                ) : null}
              </div>
              <button
                onClick={() => onAdd && onAdd(mp)}
                style={{
                  all: 'unset', cursor: 'pointer',
                  width: 30, height: 30, borderRadius: 15,
                  background: tokens.accentSoft, color: tokens.accentText,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 500, lineHeight: 1,
                }}
                aria-label={`Add ${mp.name}`}
              >+</button>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

Object.assign(window, { Sheet, SheetHeader, MPSheet, PartyMPsSheet, AddMPsSheet });
