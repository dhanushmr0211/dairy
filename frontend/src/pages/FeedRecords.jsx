import { useState, useEffect } from 'react';
import { getFarmers, addFeedRecord, getFeedByFarmer } from '../api';
import { useToast } from '../context/ToastContext';

export default function FeedRecords() {
  const [farmers, setFarmers] = useState([]);
  const [selectedFarmerId, setSelectedFarmerId] = useState('');
  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];
  const [formData, setFormData] = useState({
    date: todayStr,
    item: 'Cattle Feed Bag (50kg)',
    quantity: '1',
    amount: '',
  });

  const { showToast } = useToast();

  useEffect(() => {
    getFarmers()
      .then((data) => {
        setFarmers(data);
        if (data.length > 0) {
          setSelectedFarmerId(String(data[0].id));
        }
      })
      .catch((err) => showToast(err.message, 'error'));
  }, []);

  const fetchRecords = async (farmerId) => {
    if (!farmerId) return;
    try {
      setLoadingRecords(true);
      const data = await getFeedByFarmer(farmerId);
      setRecords(data);
    } catch (err) {
      showToast(err.message || 'Failed to fetch feed records', 'error');
    } finally {
      setLoadingRecords(false);
    }
  };

  useEffect(() => {
    if (selectedFarmerId) {
      fetchRecords(selectedFarmerId);
    }
  }, [selectedFarmerId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFarmerId) {
      showToast('Please select a farmer', 'error');
      return;
    }

    try {
      setSubmitting(true);
      await addFeedRecord({
        farmerId: Number(selectedFarmerId),
        date: formData.date,
        item: formData.item,
        quantity: Number(formData.quantity),
        amount: Number(formData.amount),
      });
      showToast('Feed record saved successfully!');
      setFormData({
        date: todayStr,
        item: 'Cattle Feed Bag (50kg)',
        quantity: '1',
        amount: '',
      });
      fetchRecords(selectedFarmerId);
    } catch (err) {
      showToast(err.message || 'Failed to record feed sale', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedFarmer = farmers.find((f) => String(f.id) === String(selectedFarmerId));
  const totalAmount = records.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

  return (
    <div>
      <div className="page-header">
        <h2>Feed & Supplies Records</h2>
        <p>Log feed, mineral supplements, and supplies issued to farmers for cycle deductions</p>
      </div>

      <div className="farmer-select-bar">
        <label className="form-label" style={{ marginBottom: 0 }}>Select Farmer:</label>
        <select
          className="form-select"
          value={selectedFarmerId}
          onChange={(e) => setSelectedFarmerId(e.target.value)}
        >
          {farmers.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} (Phone: {f.phone})
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--sp-6)', marginBottom: 'var(--sp-8)' }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">🌾 Issue Feed / Supply</h3>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Issue Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Item / Product Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Cattle Feed, Calcium..."
                  value={formData.item}
                  onChange={(e) => setFormData({ ...formData, item: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Quantity</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-input"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Total Cost (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 850.00"
                  className="form-input"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '1.25rem' }}
              disabled={submitting || !selectedFarmerId}
            >
              {submitting ? <span className="spinner"></span> : 'Add Feed Entry'}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">ℹ️ Deduction Overview</h3>
          </div>
          <p style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-sm)', marginBottom: '1.5rem' }}>
            Feed records dated within an active cycle are automatically deducted from the milk payout at settlement.
          </p>
          <div className="summary-item">
            <div className="label">Total Historical Feed Purchases</div>
            <div className="value" style={{ color: 'var(--clr-warning)' }}>
              ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            Feed History for {selectedFarmer?.name || 'Selected Farmer'} ({records.length} records)
          </h3>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => fetchRecords(selectedFarmerId)}
            disabled={loadingRecords}
          >
            Refresh
          </button>
        </div>

        {loadingRecords ? (
          <div className="loading-center">
            <div className="spinner"></div>
          </div>
        ) : records.length === 0 ? (
          <div className="empty-state">
            <div className="icon">🌾</div>
            <p>No feed records found for this farmer.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Record ID</th>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Quantity</th>
                  <th>Amount</th>
                  <th>Logged Date</th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec) => (
                  <tr key={rec.id}>
                    <td><strong>#{rec.id}</strong></td>
                    <td>{new Date(rec.date).toLocaleDateString()}</td>
                    <td><strong>{rec.item}</strong></td>
                    <td>{Number(rec.quantity).toFixed(2)}</td>
                    <td style={{ color: 'var(--clr-danger)', fontWeight: 600 }}>
                      ₹{Number(rec.amount).toFixed(2)}
                    </td>
                    <td style={{ color: 'var(--clr-text-dim)' }}>
                      {new Date(rec.created_at).toLocaleDateString()}
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
