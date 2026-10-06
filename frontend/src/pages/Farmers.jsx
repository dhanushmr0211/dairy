import { useState, useEffect } from 'react';
import { getFarmers, createFarmer, getFarmerSummary } from '../api';
import { useToast } from '../context/ToastContext';

export default function Farmers() {
  const [farmers, setFarmers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '' });

  const [selectedSummary, setSelectedSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const { showToast } = useToast();

  const fetchFarmers = async () => {
    try {
      setLoading(true);
      const res = await getFarmers();
      setFarmers(res);
    } catch (err) {
      showToast(err.message || 'Failed to fetch farmers', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFarmers();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.phone.trim()) {
      showToast('Name and phone are required', 'error');
      return;
    }

    try {
      setCreating(true);
      const newFarmer = await createFarmer(formData);
      showToast(`Farmer ${newFarmer.name} registered successfully!`);
      setFormData({ name: '', phone: '' });
      fetchFarmers();
    } catch (err) {
      showToast(err.message || 'Failed to create farmer', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleViewSummary = async (id) => {
    try {
      setLoadingSummary(true);
      setSelectedSummary(null);
      const summary = await getFarmerSummary(id);
      setSelectedSummary(summary);
    } catch (err) {
      showToast(err.message || 'Failed to fetch farmer summary / active cycle', 'error');
    } finally {
      setLoadingSummary(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Farmer Management</h2>
        <p>Register farmers and view current cycle performance summaries</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--sp-6)', marginBottom: 'var(--sp-8)' }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">➕ Register New Farmer</h3>
          </div>
          <form onSubmit={handleCreate}>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Farmer Full Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Ramesh Kumar"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                className="form-input"
                placeholder="e.g. 9876543210"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={creating}>
              {creating ? <span className="spinner"></span> : 'Add Farmer'}
            </button>
          </form>
        </div>

        {selectedSummary && (
          <div className="card" style={{ borderColor: 'var(--clr-primary)' }}>
            <div className="card-header">
              <h3 className="card-title">📄 Active Summary: {selectedSummary.farmer?.name}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setSelectedSummary(null)}>Close</button>
            </div>
            <div className="summary-row">
              <div className="summary-item">
                <div className="label">Total Milk</div>
                <div className="value">{Number(selectedSummary.total_liters || 0).toFixed(2)} L</div>
              </div>
              <div className="summary-item">
                <div className="label">Gross Amount</div>
                <div className="value">₹{Number(selectedSummary.total_amount || 0).toFixed(2)}</div>
              </div>
              <div className="summary-item">
                <div className="label">Feed Deduction</div>
                <div className="value" style={{ color: 'var(--clr-danger)' }}>-₹{Number(selectedSummary.feed_deduction || 0).toFixed(2)}</div>
              </div>
              <div className="summary-item">
                <div className="label">Net Payout</div>
                <div className="value positive">₹{Number(selectedSummary.final_amount || 0).toFixed(2)}</div>
              </div>
            </div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-dim)' }}>
              Cycle Duration: {new Date(selectedSummary.active_cycle.start_date).toLocaleDateString()} to {new Date(selectedSummary.active_cycle.end_date).toLocaleDateString()} @ ₹{selectedSummary.active_cycle.rate_per_liter}/L
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Registered Farmers ({farmers.length})</h3>
          <button className="btn btn-outline btn-sm" onClick={fetchFarmers}>Refresh</button>
        </div>

        {loading ? (
          <div className="loading-center">
            <div className="spinner"></div>
          </div>
        ) : farmers.length === 0 ? (
          <div className="empty-state">
            <div className="icon">👨‍🌾</div>
            <p>No farmers registered yet. Add your first farmer above.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Registered Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {farmers.map((farmer) => (
                  <tr key={farmer.id}>
                    <td><strong>#{farmer.id}</strong></td>
                    <td>{farmer.name}</td>
                    <td>{farmer.phone}</td>
                    <td>{new Date(farmer.created_at || Date.now()).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => handleViewSummary(farmer.id)}
                        disabled={loadingSummary}
                      >
                        📊 View Summary
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
