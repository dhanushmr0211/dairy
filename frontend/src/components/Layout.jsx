import { useState } from 'react';
import { NavLink } from 'react-router-dom';

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleMobile = () => setMobileOpen(!mobileOpen);
  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="app-layout">
      <button 
        className="mobile-menu-btn" 
        onClick={toggleMobile} 
        aria-label="Toggle menu"
      >
        ☰
      </button>

      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <h1>🥛 DairyPro</h1>
          <span>Management Portal</span>
        </div>

        <nav className="sidebar-nav">
          <NavLink 
            to="/" 
            end 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={closeMobile}
          >
            <span className="icon">📊</span>
            Dashboard
          </NavLink>

          <NavLink 
            to="/farmers" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={closeMobile}
          >
            <span className="icon">👨‍🌾</span>
            Farmers
          </NavLink>

          <NavLink 
            to="/milk" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={closeMobile}
          >
            <span className="icon">🥛</span>
            Milk Entries
          </NavLink>

          <NavLink 
            to="/feed" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={closeMobile}
          >
            <span className="icon">🌾</span>
            Feed Records
          </NavLink>

          <NavLink 
            to="/payments" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={closeMobile}
          >
            <span className="icon">💳</span>
            Cycles & Payments
          </NavLink>
        </nav>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
