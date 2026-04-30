// Tokens & shared chrome — light + dark + accent variants
// Chunk 1 — design tokens, top bar, tab bar.
// Theme and accent are hardcoded for now (tweaks panel removed).

const TOKENS = (theme, accentName) => {
  const accents = {
    purple: { c: 'oklch(0.45 0.17 295)',  cSoft: 'oklch(0.96 0.04 295)',  cText: 'oklch(0.42 0.18 295)' },
    blue:   { c: 'oklch(0.50 0.15 245)',  cSoft: 'oklch(0.96 0.04 245)',  cText: 'oklch(0.45 0.16 245)' },
    teal:   { c: 'oklch(0.55 0.13 195)',  cSoft: 'oklch(0.96 0.04 195)',  cText: 'oklch(0.45 0.14 195)' },
    mono:   { c: '#1a1a1a',                cSoft: '#f0f0ee',                cText: '#1a1a1a' },
  };
  const a = accents[accentName] || accents.purple;
  if (theme === 'dark') {
    return {
      bg: '#0E0E10',
      surface: '#18181B',
      surfaceAlt: '#1E1E22',
      border: 'rgba(255,255,255,0.07)',
      borderStrong: 'rgba(255,255,255,0.12)',
      text: '#F4F4F5',
      textMuted: 'rgba(244,244,245,0.62)',
      textSubtle: 'rgba(244,244,245,0.42)',
      accent: a.c,
      accentSoft: 'rgba(255,255,255,0.06)',
      accentText: a.cText.replace('0.42', '0.78').replace('0.45', '0.78'),
      tabBar: 'rgba(20,20,22,0.72)',
      tabBarBorder: 'rgba(255,255,255,0.08)',
      good: 'oklch(0.65 0.16 145)',
      bad:  'oklch(0.65 0.18 25)',
    };
  }
  return {
    bg: '#FAFAF7',
    surface: '#FFFFFF',
    surfaceAlt: '#F4F4F1',
    border: 'rgba(17,17,17,0.07)',
    borderStrong: 'rgba(17,17,17,0.12)',
    text: '#111114',
    textMuted: 'rgba(17,17,20,0.58)',
    textSubtle: 'rgba(17,17,20,0.36)',
    accent: a.c,
    accentSoft: a.cSoft,
    accentText: a.cText,
    tabBar: 'rgba(250,250,247,0.78)',
    tabBarBorder: 'rgba(17,17,17,0.08)',
    good: 'oklch(0.55 0.16 145)',
    bad:  'oklch(0.58 0.20 25)',
  };
};

// ─── Compact top bar (replaces the bulky XV Riigikogu block) ───
function TopBar({ tokens, subtitle }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 20px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: tokens.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 13, letterSpacing: 0.5,
          fontFamily: 'ui-serif, "New York", Georgia, serif',
        }}>XV</div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: tokens.text, letterSpacing: -0.2 }}>
            Riigikogu
          </span>
          <span style={{ fontSize: 11.5, color: tokens.textMuted, letterSpacing: 0.1 }}>
            {subtitle}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab bar (bottom) ───
function TabBar({ active, onChange, tokens }) {
  const tabs = [
    { id: 'parliament', label: 'Parliament', icon: (active) => {
      const c = active ? tokens.accent : tokens.textMuted;
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          {/* Toompea — tall round tower (Pikk Hermann) on LEFT, building with peaked roof on RIGHT */}
          {/* tower body */}
          <rect x="3" y="6.5" width="5" height="14.5" fill={c}/>
          {/* tower crenellations */}
          <path d="M3 6.5h1.1v-1.3h1V6.5h0.8v-1.3h1V6.5h1.1v-1.3h0v1.3" fill={c}/>
          <rect x="3" y="5.2" width="1.1" height="1.3" fill={c}/>
          <rect x="5.2" y="5.2" width="1" height="1.3" fill={c}/>
          <rect x="7.1" y="5.2" width="0.9" height="1.3" fill={c}/>
          {/* flag pole + flag */}
          <rect x="5.2" y="2" width="0.5" height="3.2" fill={c}/>
          <path d="M5.7 2h2.5v1.4h-2.5z" fill={c}/>
          {/* building peaked roof */}
          <path d="M10 13l4-3 4 3v0H10z" fill={c}/>
          <rect x="9.5" y="12.7" width="11" height="0.9" fill={c}/>
          {/* building body */}
          <rect x="10" y="13.6" width="11" height="7.4" fill={c}/>
          {/* door (negative space) */}
          <path d="M14.5 21v-3.2a1 1 0 0 1 2 0V21z" fill={active ? tokens.bg : tokens.surface}/>
          {/* ground line */}
          <rect x="1.5" y="21" width="21" height="1.1" rx="0.4" fill={c}/>
        </svg>
      );
    }},
    { id: 'members', label: 'Members', icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="8" cy="8" r="3.2" stroke={active ? tokens.accent : tokens.textMuted} strokeWidth="1.6"/>
        <circle cx="15" cy="9" r="2.4" stroke={active ? tokens.accent : tokens.textMuted} strokeWidth="1.6"/>
        <path d="M2.5 17c.6-2.5 2.9-4 5.5-4s4.9 1.5 5.5 4M14 13c2 0 4 1.2 4.5 3.5" stroke={active ? tokens.accent : tokens.textMuted} strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    )},
    { id: 'calculator', label: 'Calculator', icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="4.5" y="2.5" width="13" height="17" rx="2.5" stroke={active ? tokens.accent : tokens.textMuted} strokeWidth="1.6"/>
        <rect x="7" y="5" width="8" height="3" rx="0.8" stroke={active ? tokens.accent : tokens.textMuted} strokeWidth="1.4"/>
        <circle cx="8" cy="11.5" r="0.9" fill={active ? tokens.accent : tokens.textMuted}/>
        <circle cx="11" cy="11.5" r="0.9" fill={active ? tokens.accent : tokens.textMuted}/>
        <circle cx="14" cy="11.5" r="0.9" fill={active ? tokens.accent : tokens.textMuted}/>
        <circle cx="8" cy="15" r="0.9" fill={active ? tokens.accent : tokens.textMuted}/>
        <circle cx="11" cy="15" r="0.9" fill={active ? tokens.accent : tokens.textMuted}/>
        <circle cx="14" cy="15" r="0.9" fill={active ? tokens.accent : tokens.textMuted}/>
      </svg>
    )},
  ];
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      paddingBottom: 26, paddingTop: 8,
      background: tokens.tabBar,
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      borderTop: `0.5px solid ${tokens.tabBarBorder}`,
      zIndex: 30,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-around' }}>
        {tabs.map(t => {
          const isActive = active === t.id;
          return (
            <button key={t.id} onClick={() => onChange(t.id)} style={{
              all: 'unset', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '4px 16px', minWidth: 64,
            }}>
              {t.icon(isActive)}
              <span style={{
                fontSize: 10.5, fontWeight: 500,
                color: isActive ? tokens.accent : tokens.textMuted,
                letterSpacing: 0.1,
              }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { TOKENS, TopBar, TabBar });

// ─── Chunk 1 root: hardcoded light + mono, no screens yet ───
function ChromeApp() {
  const theme = 'light';
  const accent = 'mono';
  const tokens = TOKENS(theme, accent);
  const [tab, setTab] = React.useState('parliament');

  const subtitle = tab === 'parliament' ? 'Estonian Parliament · 101 MPs'
    : tab === 'members' ? '101 members · 7 parties'
    : 'Coalition calculator';

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: tokens.bg, color: tokens.text,
      paddingTop: 54,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      overflow: 'hidden',
    }}>
      <TopBar tokens={tokens} subtitle={subtitle}/>
      {tab === 'parliament' && typeof ParliamentScreen !== 'undefined'
        ? <ParliamentScreen tokens={tokens}/>
        : null}
      <TabBar tokens={tokens} active={tab} onChange={setTab}/>
    </div>
  );
}

(function mount() {
  const host = document.createElement('div');
  host.id = 'chrome-root';
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '9999';
  document.body.appendChild(host);
  ReactDOM.createRoot(host).render(<ChromeApp/>);
})();
