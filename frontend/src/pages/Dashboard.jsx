import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getDashboard } from '../api';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getDashboard();
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard Overview</h2>
        <p>Real-time dairy collection and settlement analytics</p>
      </div>

      {loading ? (
        <div className="loading-center">
          <div className="spinner spinner-lg"></div>
        </div>
      ) : error ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--clr-danger)', marginBottom: '1rem' }}>{error}</p>
          <button className="btn btn-outline" onClick={loadDashboard}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card primary">
              <div className="stat-label">Total Farmers</div>
              <div className="stat-value">{data?.total_farmers ?? 0}</div>
              <div className="stat-icon">👨‍🌾</div>
            </div>

            <div className="stat-card success">
              <div className="stat-label">Milk Collected Today</div>
              <div className="stat-value">
                {Number(data?.total_milk_today || 0).toFixed(2)} <span style={{ fontSize: '1rem', fontWeight: 500 }}>L</span>
              </div>
              <div className="stat-icon">🥛</div>
            </div>

            <div className="stat-card accent">
              <div className="stat-label">Active Cycles</div>
              <div className="stat-value">{data?.active_cycles_count ?? 0}</div>
              <div className="stat-icon">🔄</div>
            </div>

            <div className="stat-card warning">
              <div className="stat-label">Pending Payout Amount</div>
              <div className="stat-value">
                ₹{Number(data?.total_expected_payout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="stat-icon">💰</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--sp-6)' }}>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">⚡ Quick Actions</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <Link to="/milk" className="btn btn-primary" style={{ justifyContent: 'flex-start' }}>
                  <span>🥛</span> Record Daily Milk Entry
                </Link>
                <Link to="/feed" className="btn btn-outline" style={{ justifyContent: 'flex-start' }}>
                  <span>🌾</span> Add Cattle Feed Sale
                </Link>
                <Link to="/payments" className="btn btn-success" style={{ justifyContent: 'flex-start' }}>
                  <span>💳</span> Settle / Pay Active Cycle
                </Link>
                <Link to="/farmers" className="btn btn-outline" style={{ justifyContent: 'flex-start' }}>
                  <span>➕</span> Register New Farmer
                </Link>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="card-title">📋 Summary Breakdown</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--clr-border)' }}>
                  <span style={{ color: 'var(--clr-text-muted)' }}>Registered Farmers</span>
                  <strong>{data?.total_farmers ?? 0}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--clr-border)' }}>
                  <span style={{ color: 'var(--clr-text-muted)' }}>Unpaid Active Cycles</span>
                  <span className="badge badge-warning">{data?.unpaid_cycles ?? 0} cycles</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--clr-border)' }}>
                  <span style={{ color: 'var(--clr-text-muted)' }}>Backend API Status</span>
                  <span className="badge badge-active">Connected to Render</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
