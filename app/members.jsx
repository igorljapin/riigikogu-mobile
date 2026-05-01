// Chunk 5 — Members screen.
// Full alphabetical MP list with search and side filter.
// Tapping a row opens MPSheet from app/sheets.jsx.

function Avatar({ tokens, mp, size }) {
  size = size || 40;
  const initials = (mp.first ? mp.first[0] : '') + (mp.last ? mp.last[0] : '');
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2,
      background: tokens.surfaceAlt,
      overflow: 'hidden', flexShrink: 0,
      border: `0.5px solid ${tokens.border}`,
      position: 'relative',
    }}>
      <img
        src={mp.photoUrl}
        alt={mp.name}
        style={{ objectFit: 'cover', width: '100%', height: '100%' }}
        onError={e => {
          e.target.style.display = 'none';
          e.target.nextSibling.style.display = 'flex';
        }}
      />
      <span style={{
        display: 'none',
        position: 'absolute', inset: 0,
        alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(size * 0.35), fontWeight: 600,
        color: tokens.textMuted,
      }}>{initials}</span>
    </div>
  );
}

function FilterChip({ tokens, label, active, onTap }) {
  return (
    <button onClick={onTap} style={{
      all: 'unset', cursor: 'pointer',
      padding: '5px 12px',
      borderRadius: 999,
      background: active ? tokens.accent : tokens.surface,
      color: active ? '#fff' : tokens.textMuted,
      border: `0.5px solid ${active ? tokens.accent : tokens.border}`,
      fontSize: 12, fontWeight: 500, letterSpacing: 0.1,
      flexShrink: 0,
      transition: 'background 0.15s, color 0.15s',
    }}>{label}</button>
  );
}

function MembersScreen({ tokens }) {
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const [selectedMP, setSelectedMP] = React.useState(null);

  const partyById = React.useMemo(
    () => Object.fromEntries(PARTIES.map(p => [p.id, p])),
    []
  );

  const filtered = React.useMemo(() => {
    let list = MPS.slice();

    if (filter === 'government') {
      list = list.filter(m => {
        const p = partyById[m.party];
        return p && p.side === 'government';
      });
    } else if (filter === 'opposition') {
      list = list.filter(m => {
        const p = partyById[m.party];
        return !p || p.side !== 'government';
      });
    }

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(q));
    }

    list.sort((a, b) => a.last.localeCompare(b.last));
    return list;
  }, [query, filter, partyById]);

  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: 108, bottom: 0,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Search bar */}
      <div style={{ padding: '6px 16px 4px', flexShrink: 0 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '10px 14px',
            border: `0.5px solid ${tokens.border}`,
            borderRadius: 12,
            background: tokens.surface,
            color: tokens.text,
            fontSize: 15,
            outline: 'none',
          }}
        />
      </div>

      {/* Filter chips */}
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto',
        padding: '6px 16px 8px',
        flexShrink: 0,
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}>
        <FilterChip tokens={tokens} label="All"
          active={filter === 'all'} onTap={() => setFilter('all')} />
        <FilterChip tokens={tokens} label="Government"
          active={filter === 'government'} onTap={() => setFilter('government')} />
        <FilterChip tokens={tokens} label="Opposition"
          active={filter === 'opposition'} onTap={() => setFilter('opposition')} />
      </div>

      {/* MP list */}
      <div style={{ overflowY: 'auto', flex: 1, paddingBottom: 100 }}>
        <div style={{
          margin: '0 16px',
          background: tokens.surface,
          border: `0.5px solid ${tokens.border}`,
          borderRadius: 14,
          overflow: 'hidden',
        }}>
          {filtered.length === 0 ? (
            <div style={{
              padding: '32px 20px',
              textAlign: 'center',
              color: tokens.textMuted,
              fontSize: 14,
            }}>No members found</div>
          ) : (
            filtered.map((mp, i) => {
              const party = partyById[mp.party];
              return (
                <button
                  key={mp.uuid || mp.name}
                  onClick={() => setSelectedMP(mp)}
                  style={{
                    all: 'unset', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', boxSizing: 'border-box',
                    padding: '10px 14px',
                    borderTop: i === 0 ? 'none' : `0.5px solid ${tokens.border}`,
                  }}
                >
                  <Avatar tokens={tokens} mp={mp} size={40} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{
                      fontSize: 14, fontWeight: 500, color: tokens.text, letterSpacing: -0.1,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{mp.name}</span>
                    {party ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: 11, color: tokens.textMuted, marginTop: 2,
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: 3,
                          background: party.color, flexShrink: 0,
                        }}/>
                        {party.name}
                      </span>
                    ) : null}
                  </div>
                  <span style={{ fontSize: 18, color: tokens.textSubtle, lineHeight: 1 }}>›</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {typeof MPSheet !== 'undefined' ? (
        <MPSheet
          tokens={tokens}
          open={!!selectedMP}
          mp={selectedMP}
          onClose={() => setSelectedMP(null)}
        />
      ) : null}
    </div>
  );
}

Object.assign(window, { MembersScreen, Avatar, FilterChip });
