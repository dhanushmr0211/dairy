import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Menu,
  Milk,
  LayoutDashboard,
  Users,
  Wheat,
  CreditCard,
  Landmark,
  ZoomIn,
  ZoomOut,
  RotateCcw
} from 'lucide-react';

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [fontScale, setFontScale] = useState(() => {
    const saved = localStorage.getItem('dairy_font_scale');
    return saved ? parseFloat(saved) : 1;
  });

  const toggleMobile = () => setMobileOpen(!mobileOpen);
  const closeMobile = () => setMobileOpen(false);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', fontScale);
    localStorage.setItem('dairy_font_scale', fontScale);
  }, [fontScale]);

  const decreaseFont = () => {
    setFontScale((prev) => Math.max(0.85, parseFloat((prev - 0.1).toFixed(2))));
  };

  const resetFont = () => {
    setFontScale(1);
  };

  const increaseFont = () => {
    setFontScale((prev) => Math.min(1.4, parseFloat((prev + 0.1).toFixed(2))));
  };

  const fontLabel = fontScale === 1 ? '100%' : `${Math.round(fontScale * 100)}%`;

  return (
    <div className="app-layout">
      <button 
        className="mobile-menu-btn" 
        onClick={toggleMobile} 
        aria-label="Toggle menu"
      >
        <Menu size={22} strokeWidth={2.5} />
      </button>

      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Milk size={26} strokeWidth={2.5} color="var(--clr-primary)" />
            DairyPro
          </h1>
          <span>Management Portal</span>
        </div>

        <nav className="sidebar-nav">
          <NavLink 
            to="/" 
            end 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={closeMobile}
          >
            <LayoutDashboard size={20} strokeWidth={2.5} className="icon" />
            Dashboard
          </NavLink>

          <NavLink 
            to="/farmers" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={closeMobile}
          >
            <Users size={20} strokeWidth={2.5} className="icon" />
            Farmers
          </NavLink>

          <NavLink 
            to="/milk" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={closeMobile}
          >
            <Milk size={20} strokeWidth={2.5} className="icon" />
            Milk Entries
          </NavLink>

          <NavLink 
            to="/feed" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={closeMobile}
          >
            <Wheat size={20} strokeWidth={2.5} className="icon" />
            Feed Records
          </NavLink>

          <NavLink 
            to="/payments" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={closeMobile}
          >
            <CreditCard size={20} strokeWidth={2.5} className="icon" />
            Cycles & Payments
          </NavLink>

          <NavLink 
            to="/wallet" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={closeMobile}
          >
            <Landmark size={20} strokeWidth={2.5} className="icon" />
            Company Wallet
          </NavLink>
        </nav>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* ── Top Accessibility Bar ── */}
        <header 
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 90,
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(8px)',
            borderBottom: '1px solid var(--clr-border)',
            padding: '0.5rem 1.5rem',
            marginLeft: 'var(--sidebar-w)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap'
          }}
          className="top-header-bar"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: 'var(--fs-sm)', color: 'var(--clr-text-secondary)', fontWeight: 700 }}>
            <Milk size={20} strokeWidth={2.5} color="var(--clr-primary)" />
            <span>Dairy Management Portal</span>
          </div>

          {/* Font Size Controls */}
          <div 
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '0.4rem', 
              background: '#f1f5f9', 
              padding: '0.3rem 0.6rem', 
              borderRadius: '9999px',
              border: '1px solid #e2e8f0'
            }}
          >
            <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--clr-text-secondary)', marginRight: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <ZoomIn size={15} strokeWidth={2.5} />
              Text Size:
            </span>
            <button
              type="button"
              onClick={decreaseFont}
              title="Decrease Font Size (A-)"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: 'var(--clr-text)',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '0.85rem',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--shadow-xs)'
              }}
            >
              A-
            </button>
            <button
              type="button"
              onClick={resetFont}
              title="Reset Font Size to 100%"
              style={{
                padding: '0.2rem 0.65rem',
                height: 32,
                borderRadius: '9999px',
                border: '1px solid #cbd5e1',
                background: fontScale === 1 ? 'var(--clr-primary)' : '#ffffff',
                color: fontScale === 1 ? '#ffffff' : 'var(--clr-text)',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '0.8rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                boxShadow: 'var(--shadow-xs)'
              }}
            >
              <RotateCcw size={12} strokeWidth={2.5} />
              {fontLabel}
            </button>
            <button
              type="button"
              onClick={increaseFont}
              title="Increase Font Size (A+)"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: 'var(--clr-text)',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '0.95rem',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--shadow-xs)'
              }}
            >
              A+
            </button>
          </div>
        </header>

        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
