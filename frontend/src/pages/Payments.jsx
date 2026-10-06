import { useState, useEffect } from 'react';
import {
  getFarmers,
  getActiveCycle,
  startCycle,
  getPaymentPreview,
  payCycle,
  getPaymentsByFarmer,
} from '../api';
import { useToast } from '../context/ToastContext';

export default function Payments() {
  const [farmers, setFarmers] = useState([]);
  const [selectedFarmerId, setSelectedFarmerId] = useState('');
  const [activeCycle, setActiveCycle] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);

  // Start cycle form
  const todayStr = new Date().toISOString().split('T')[0];
  const [cycleForm, setCycleForm] = useState({
    startDate: todayStr,
    durationDays: 15,
    ratePerLiter: '42.00',
  });
  const [startingCycle, setStartingCycle] = useState(false);

  // Settlement Preview
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [settleModalOpen, setSettleModalOpen] = useState(false);

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

  const loadFarmerData = async (farmerId) => {
    if (!farmerId) return;
    setLoading(true);
    try {
      // 1. Load active cycle
      try {
        const cycle = await getActiveCycle(farmerId);
        setActiveCycle(cycle);
      } catch {
        setActiveCycle(null);
      }

      // 2. Load payment history
      const history = await getPaymentsByFarmer(farmerId);
      setPayments(history);
    } catch (err) {
      showToast(err.message || 'Error loading cycle/payment data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedFarmerId) {
      loadFarmerData(selectedFarmerId);
    }
  }, [selectedFarmerId]);

  const handleStartCycle = async (e) => {
    e.preventDefault();
    if (!selectedFarmerId) return;

    try {
      setStartingCycle(true);
      const res = await startCycle({
        farmerId: Number(selectedFarmerId),
        startDate: cycleForm.startDate,
        durationDays: Number(cycleForm.durationDays),
        ratePerLiter: Number(cycleForm.ratePerLiter),
      });
      showToast(`Cycle #${res.id} started successfully!`);
      loadFarmerData(selectedFarmerId);
    } catch (err) {
      showToast(err.message || 'Failed to start cycle', 'error');
    } finally {
      setStartingCycle(false);
    }
  };

  const handleOpenPreview = async () => {
    if (!activeCycle) return;
    try {
      setPreviewLoading(true);
      const res = await getPaymentPreview(activeCycle.id);
      setPreview(res);
      setSettleModalOpen(true);
    } catch (err) {
      showToast(err.message || 'Failed to fetch payment preview', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePayCycle = async () => {
    if (!activeCycle) return;
    try {
      setPaying(true);
      const res = await payCycle({
        cycleId: activeCycle.id,
        paidDate: todayStr,
      });
      showToast(`Cycle #${activeCycle.id} settled! Final Payout: ₹${res.final_amount}`);
      setSettleModalOpen(false);
      setPreview(null);
      loadFarmerData(selectedFarmerId);
    } catch (err) {
      showToast(err.message || 'Payment processing failed', 'error');
    } finally {
      setPaying(false);
    }
  };

  const selectedFarmer = farmers.find((f) => String(f.id) === String(selectedFarmerId));

  return (
    <div>
      <div className="page-header">
        <h2>Billing Cycles & Settlements</h2>
        <p>Manage 15/30-day milk collection periods and execute calculated cycle payouts</p>
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
        {/* Active Cycle Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">🔄 Active Cycle Status</h3>
            {activeCycle ? (
              <span className="badge badge-active">ACTIVE</span>
            ) : (
              <span className="badge badge-paid">NO ACTIVE CYCLE</span>
            )}
          </div>

          {activeCycle ? (
            <div>
              <div className="summary-row" style={{ marginBottom: '1.25rem' }}>
                <div className="summary-item">
                  <div className="label">Start Date</div>
                  <div className="value" style={{ fontSize: '1rem' }}>
                    {new Date(activeCycle.start_date).toLocaleDateString()}
                  </div>
                </div>
                <div className="summary-item">
                  <div className="label">End Date</div>
                  <div className="value" style={{ fontSize: '1rem' }}>
                    {new Date(activeCycle.end_date).toLocaleDateString()}
                  </div>
                </div>
                <div className="summary-item">
                  <div className="label">Rate / Liter</div>
                  <div className="value positive" style={{ fontSize: '1.25rem' }}>
                    ₹{Number(activeCycle.rate_per_liter).toFixed(2)}
                  </div>
                </div>
              </div>

              <button
                className="btn btn-success"
                style={{ width: '100%' }}
                onClick={handleOpenPreview}
                disabled={previewLoading}
              >
                {previewLoading ? <span className="spinner"></span> : '💳 Preview & Settle Payment'}
              </button>
            </div>
          ) : (
            <p style={{ color: 'var(--clr-text-dim)', fontSize: 'var(--fs-sm)' }}>
              No active billing cycle found for {selectedFarmer?.name}. Start a new 15 or 30-day cycle below.
            </p>
          )}
        </div>

        {/* Start New Cycle Form */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">🚀 Start New Billing Cycle</h3>
          </div>
          <form onSubmit={handleStartCycle}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Start Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={cycleForm.startDate}
                  onChange={(e) => setCycleForm({ ...cycleForm, startDate: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Duration</label>
                <select
                  className="form-select"
                  value={cycleForm.durationDays}
                  onChange={(e) => setCycleForm({ ...cycleForm, durationDays: e.target.value })}
                >
                  <option value={15}>15 Days Period</option>
                  <option value={30}>30 Days Period</option>
                </select>
              </div>

              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Rate per Liter (₹)</label>
                <input
                  type="number"
                  step="0.10"
                  min="1"
                  className="form-input"
                  placeholder="e.g. 42.50"
                  value={cycleForm.ratePerLiter}
                  onChange={(e) => setCycleForm({ ...cycleForm, ratePerLiter: e.target.value })}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '1.25rem' }}
              disabled={startingCycle || activeCycle !== null || !selectedFarmerId}
            >
              {startingCycle ? (
                <span className="spinner"></span>
              ) : activeCycle ? (
                'Current Cycle Must Be Settled First'
              ) : (
                'Initialize Cycle'
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Payment History Card */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            Settlement History for {selectedFarmer?.name || 'Selected Farmer'} ({payments.length})
          </h3>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => loadFarmerData(selectedFarmerId)}
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="loading-center">
            <div className="spinner"></div>
          </div>
        ) : payments.length === 0 ? (
          <div className="empty-state">
            <div className="icon">💳</div>
            <p>No past payment settlements recorded for this farmer.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Receipt #</th>
                  <th>Cycle ID</th>
                  <th>Total Liters</th>
                  <th>Gross Amount</th>
                  <th>Feed Deduction</th>
                  <th>Final Net Paid</th>
                  <th>Paid Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td><strong>#PAY-{p.id}</strong></td>
                    <td>Cycle #{p.cycle_id}</td>
                    <td>{Number(p.total_liters).toFixed(2)} L</td>
                    <td>₹{Number(p.total_amount).toFixed(2)}</td>
                    <td style={{ color: 'var(--clr-danger)' }}>-₹{Number(p.feed_deduction).toFixed(2)}</td>
                    <td style={{ color: 'var(--clr-success)', fontWeight: 700, fontSize: '1rem' }}>
                      ₹{Number(p.final_amount).toFixed(2)}
                    </td>
                    <td>{new Date(p.paid_date).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Settle Modal */}
      {settleModalOpen && preview && (
        <div className="modal-overlay" onClick={() => setSettleModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>💳 Settle Billing Cycle #{preview.cycle_id}</h3>
            <p style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-sm)', marginBottom: '1.5rem' }}>
              Confirm payment calculation for <strong>{selectedFarmer?.name}</strong>.
            </p>

            <div className="summary-row" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              <div className="summary-item">
                <div className="label">Total Milk</div>
                <div className="value">{Number(preview.total_liters).toFixed(2)} L</div>
              </div>
              <div className="summary-item">
                <div className="label">Gross Amount</div>
                <div className="value">₹{Number(preview.total_amount).toFixed(2)}</div>
              </div>
              <div className="summary-item">
                <div className="label">Feed Deductions</div>
                <div className="value" style={{ color: 'var(--clr-danger)' }}>-₹{Number(preview.feed_deduction).toFixed(2)}</div>
              </div>
              <div className="summary-item">
                <div className="label">Final Payout</div>
                <div className="value positive">₹{Number(preview.final_amount).toFixed(2)}</div>
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="btn btn-outline"
                onClick={() => setSettleModalOpen(false)}
                disabled={paying}
              >
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={handlePayCycle}
                disabled={paying}
              >
                {paying ? <span className="spinner"></span> : 'Confirm & Mark Paid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
