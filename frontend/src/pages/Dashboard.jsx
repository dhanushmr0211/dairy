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

  const cycles = data?.farmer_cycles_summary || [];

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>Dashboard Overview</h2>
          <p>Real-time dairy collection, cycle progress, and pending/overdue settlement analytics</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={loadDashboard}>
          🔄 Refresh Live Data
        </button>
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
          {/* Top KPI Metric Cards */}
          <div className="stats-grid">
            <div className="stat-card primary">
              <div className="stat-label">Total Active Farmers</div>
              <div className="stat-value">{data?.active_farmer_count ?? data?.total_farmers ?? 0}</div>
              <div className="stat-icon">👨‍🌾</div>
            </div>

            <div className="stat-card success">
              <div className="stat-label">Today&apos;s Milk Collected</div>
              <div className="stat-value">
                {Number(data?.today_total_milk || data?.total_milk_today || 0).toFixed(2)}{' '}
                <span style={{ fontSize: '1rem', fontWeight: 500 }}>L</span>
              </div>
              <div style={{ marginTop: '0.4rem', fontSize: 'var(--fs-xs)', color: 'var(--clr-text-dim)', display: 'flex', gap: '0.5rem' }}>
                <span>🌅 Morn: {Number(data?.today_morning_milk || 0).toFixed(1)}L</span>
                <span>🌆 Eve: {Number(data?.today_evening_milk || 0).toFixed(1)}L</span>
              </div>
              <div className="stat-icon">🥛</div>
            </div>

            <div className="stat-card warning" style={Number(data?.overdue_amount || 0) > 0 ? { borderColor: 'var(--clr-danger)' } : {}}>
              <div className="stat-label" style={{ color: Number(data?.overdue_amount || 0) > 0 ? 'var(--clr-danger)' : undefined }}>
                ⚠️ Overdue Amount
              </div>
              <div className="stat-value" style={{ color: Number(data?.overdue_amount || 0) > 0 ? 'var(--clr-danger)' : undefined }}>
                ₹{Number(data?.overdue_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ marginTop: '0.4rem', fontSize: 'var(--fs-xs)', color: 'var(--clr-text-dim)' }}>
                {data?.overdue_farmers ?? 0} cycle{(data?.overdue_farmers ?? 0) === 1 ? '' : 's'} past due date
              </div>
              <div className="stat-icon">⏳</div>
            </div>

            <div className="stat-card accent">
              <div className="stat-label">Total Pending Payout</div>
              <div className="stat-value">
                ₹{Number(data?.total_pending_payment_amount || data?.total_expected_payout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ marginTop: '0.4rem', fontSize: 'var(--fs-xs)', color: 'var(--clr-text-dim)' }}>
                Across {data?.active_cycles_count ?? 0} active/unpaid cycle{(data?.active_cycles_count ?? 0) === 1 ? '' : 's'}
              </div>
              <div className="stat-icon">💰</div>
            </div>
          </div>

          {/* Overdue Alert Banner if any overdue payouts exist */}
          {Number(data?.overdue_amount || 0) > 0 && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--sp-4) var(--sp-6)',
                marginBottom: 'var(--sp-8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
              }}
            >
              <div>
                <strong style={{ color: 'var(--clr-danger)', fontSize: 'var(--fs-md)' }}>
                  🚨 Overdue Cycle Payments Alert
                </strong>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--clr-text-muted)', marginTop: '0.2rem' }}>
                  There are <strong>{data?.overdue_farmers} farmer cycle(s)</strong> whose billing period ended with an unpaid balance of{' '}
                  <strong style={{ color: 'var(--clr-danger)' }}>
                    ₹{Number(data?.overdue_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                  .
                </p>
              </div>
              <Link to="/payments" className="btn btn-danger btn-sm">
                💳 Settle Overdue Cycles
              </Link>
            </div>
          )}

          {/* Farmer Cycles Summary Table */}
          <div className="card" style={{ marginBottom: 'var(--sp-8)' }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">📋 Farmers Billing Cycles & Payout Progress</h3>
                <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-dim)', marginTop: '0.25rem' }}>
                  Live breakdown of total milk collected, deductions, and balance amount remaining to pay per farmer
                </p>
              </div>
              <Link to="/payments" className="btn btn-outline btn-sm">
                Go to Settlement →
              </Link>
            </div>

            {cycles.length === 0 ? (
              <div className="empty-state">
                <div className="icon">🔄</div>
                <p>No active or pending payment cycles found.</p>
                <Link to="/payments" className="btn btn-primary btn-sm" style={{ marginTop: '1rem' }}>
                  Start a New Cycle
                </Link>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Farmer</th>
                      <th>Cycle Dates</th>
                      <th>Rate</th>
                      <th>Total Milk</th>
                      <th>Gross Amount</th>
                      <th>Feed Deduct</th>
                      <th>Net Amount to Pay</th>
                      <th>Due Date / Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cycles.map((item) => (
                      <tr key={item.cycleId}>
                        <td>
                          <strong>{item.farmerName}</strong>
                          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-dim)' }}>
                            📞 {item.farmerPhone}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600 }}>
                            {new Date(item.startDate).toLocaleDateString()} → {new Date(item.endDate).toLocaleDateString()}
                          </div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--clr-text-dim)' }}>
                            {item.durationDays || 15} Days Cycle (ID #{item.cycleId})
                          </span>
                        </td>
                        <td>
                          <strong>₹{Number(item.ratePerLiter).toFixed(2)}</strong>
                          <span style={{ fontSize: '0.7rem', color: 'var(--clr-text-dim)' }}>/L</span>
                        </td>
                        <td>
                          <strong style={{ color: 'var(--clr-primary)' }}>
                            {Number(item.totalLiters || 0).toFixed(2)} L
                          </strong>
                        </td>
                        <td>₹{Number(item.grossAmount || 0).toFixed(2)}</td>
                        <td style={{ color: item.feedDeduction > 0 ? 'var(--clr-danger)' : 'var(--clr-text-dim)' }}>
                          {item.feedDeduction > 0 ? `-₹${Number(item.feedDeduction).toFixed(2)}` : '₹0.00'}
                        </td>
                        <td>
                          <strong style={{ color: 'var(--clr-success)', fontSize: '1rem' }}>
                            ₹{Number(item.finalAmount || 0).toFixed(2)}
                          </strong>
                        </td>
                        <td>
                          {item.isOverdue ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              <span
                                className="badge"
                                style={{ background: 'rgba(239, 68, 68, 0.2)', color: 'var(--clr-danger)', fontWeight: 700 }}
                              >
                                ⚠️ {item.overdueDays} Days Overdue
                              </span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--clr-text-dim)' }}>
                                Due: {new Date(item.paymentDueDate).toLocaleDateString()}
                              </span>
                            </div>
                          ) : item.isDueToday ? (
                            <span className="badge badge-warning" style={{ fontWeight: 700 }}>
                              🔔 Due Today
                            </span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              <span className="badge badge-active">
                                Active ({item.daysRemaining} days left)
                              </span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--clr-text-dim)' }}>
                                Due: {new Date(item.paymentDueDate).toLocaleDateString()}
                              </span>
                            </div>
                          )}
                        </td>
                        <td>
                          <Link to="/payments" className="btn btn-primary btn-sm">
                            Pay / Settle
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick Actions and Metric Summary */}
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
                  <span>💳</span> Settle / Pay Active Cycles
                </Link>
                <Link to="/farmers" className="btn btn-outline" style={{ justifyContent: 'flex-start' }}>
                  <span>➕</span> Register New Farmer
                </Link>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="card-title">📊 Settlements Breakdown</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--clr-border)' }}>
                  <span style={{ color: 'var(--clr-text-muted)' }}>Registered Farmers</span>
                  <strong>{data?.total_farmers ?? data?.active_farmer_count ?? 0}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--clr-border)' }}>
                  <span style={{ color: 'var(--clr-text-muted)' }}>Due Today Payments</span>
                  <strong style={{ color: 'var(--clr-warning)' }}>
                    {data?.farmers_due_today ?? 0} (₹{Number(data?.amount_due_today || 0).toFixed(2)})
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--clr-border)' }}>
                  <span style={{ color: 'var(--clr-text-muted)' }}>Overdue Payments</span>
                  <strong style={{ color: 'var(--clr-danger)' }}>
                    {data?.overdue_farmers ?? 0} (₹{Number(data?.overdue_amount || 0).toFixed(2)})
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--clr-border)' }}>
                  <span style={{ color: 'var(--clr-text-muted)' }}>Upcoming Scheduled Payouts</span>
                  <strong style={{ color: 'var(--clr-primary)' }}>
                    {data?.upcoming_payment_count ?? 0} (₹{Number(data?.upcoming_payment_amount || 0).toFixed(2)})
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
