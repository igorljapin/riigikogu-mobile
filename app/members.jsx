// Chunk 5 — Members list screen.
function MembersScreen({ tokens }) {
  const [query, setQuery] = React.useState('');
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MPS;
    return MPS.filter(mp =>
      mp.name.toLowerCase().includes(q) ||
      (mp.faction || '').toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: 108, bottom: 0,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '8px 16px' }}>
        <input
          type="search"
          placeholder="Search MPs…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '8px 12px', borderRadius: 10,
            border: `1px solid ${tokens.border}`,
            background: tokens.surface, color: tokens.text,
            fontSize: 14, outline: 'none',
          }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
        {filtered.map(mp => {
          const party = PARTIES.find(p => p.id === mp.faction);
          return (
            <div key={mp.uuid} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 16px',
              borderBottom: `0.5px solid ${tokens.border}`,
            }}>
              <img
                src={mp.photoUrl || ''}
                alt=""
                width={36} height={36}
                style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
                  background: tokens.surfaceAlt }}
                onError={e => { e.target.style.display = 'none'; }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: tokens.text,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {mp.name}
                </div>
                {party && (
                  <div style={{ fontSize: 11.5, color: tokens.textMuted, marginTop: 1 }}>
                    {party.name}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { MembersScreen });
