import { useState, useEffect } from 'react';
import { getFarmers, addMilkEntry, getMilkByFarmer } from '../api';
import { useToast } from '../context/ToastContext';

export default function MilkEntries() {
  const [farmers, setFarmers] = useState([]);
  const [selectedFarmerId, setSelectedFarmerId] = useState('');
  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];
  const [formData, setFormData] = useState({
    date: todayStr,
    time: 'morning',
    liters: '',
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

  const fetchEntries = async (farmerId) => {
    if (!farmerId) return;
    try {
      setLoadingEntries(true);
      const data = await getMilkByFarmer(farmerId);
      setEntries(data);
    } catch (err) {
      showToast(err.message || 'Failed to fetch milk entries', 'error');
    } finally {
      setLoadingEntries(false);
    }
  };

  useEffect(() => {
    if (selectedFarmerId) {
      fetchEntries(selectedFarmerId);
    }
  }, [selectedFarmerId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFarmerId) {
      showToast('Please select a farmer first', 'error');
      return;
    }
    if (!formData.liters || Number(formData.liters) <= 0) {
      showToast('Liters must be greater than 0', 'error');
      return;
    }

    try {
      setSubmitting(true);
      await addMilkEntry({
        farmerId: Number(selectedFarmerId),
        date: formData.date,
        time: formData.time,
        liters: Number(formData.liters),
      });
      showToast('Milk entry saved successfully!');
      setFormData({ ...formData, liters: '' });
      fetchEntries(selectedFarmerId);
    } catch (err) {
      showToast(err.message || 'Failed to record milk entry', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedFarmer = farmers.find((f) => String(f.id) === String(selectedFarmerId));

  return (
    <div>
      <div className="page-header">
        <h2>Daily Milk Entries</h2>
        <p>Record morning and evening milk collections directly against the active billing cycle</p>
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
            <h3 className="card-title">🥛 Add Milk Record</h3>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Collection Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Shift (Time)</label>
                <select
                  className="form-select"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                >
                  <option value="morning">🌅 Morning</option>
                  <option value="evening">🌆 Evening</option>
                </select>
              </div>

              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Quantity in Liters</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="e.g. 12.50"
                  className="form-input"
                  value={formData.liters}
                  onChange={(e) => setFormData({ ...formData, liters: e.target.value })}
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
              {submitting ? <span className="spinner"></span> : 'Submit Milk Entry'}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">💡 Collection Summary</h3>
          </div>
          <p style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-sm)', marginBottom: '1rem' }}>
            Entries automatically link to {selectedFarmer?.name || 'the farmer'}&apos;s current active cycle. Rates are computed upon cycle settlement.
          </p>
          <div className="summary-item" style={{ marginTop: 'auto' }}>
            <div className="label">Total Recorded in Cycle History</div>
            <div className="value positive">
              {entries.reduce((acc, curr) => acc + Number(curr.liters || 0), 0).toFixed(2)} L
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            Milk History for {selectedFarmer?.name || 'Selected Farmer'} ({entries.length} records)
          </h3>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => fetchEntries(selectedFarmerId)}
            disabled={loadingEntries}
          >
            Refresh
          </button>
        </div>

        {loadingEntries ? (
          <div className="loading-center">
            <div className="spinner"></div>
          </div>
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <div className="icon">🥛</div>
            <p>No milk entries recorded for this farmer yet.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Entry ID</th>
                  <th>Date</th>
                  <th>Shift</th>
                  <th>Liters</th>
                  <th>Cycle Ref</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td><strong>#{entry.id}</strong></td>
                    <td>{new Date(entry.date).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge badge-${entry.time}`}>
                        {entry.time === 'morning' ? '🌅 Morning' : '🌆 Evening'}
                      </span>
                    </td>
                    <td><strong>{Number(entry.liters).toFixed(2)} L</strong></td>
                    <td>Cycle #{entry.cycle_id}</td>
                    <td style={{ color: 'var(--clr-text-dim)' }}>
                      {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
