import { useState, useEffect } from 'react';
import {
  getFarmers,
  getCyclesByFarmer,
  startCycle,
  getPaymentPreview,
  payCycle,
  paySelectedCycles,
  getPaymentsByFarmer,
  getUpcomingPayments,
} from '../api';
import { useToast } from '../context/ToastContext';

export default function Payments() {
  const [farmers, setFarmers] = useState([]);
  const [selectedFarmerId, setSelectedFarmerId] = useState('');
  const [cycles, setCycles] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);

  // Tab view: 'farmer' or 'queue'
  const [viewTab, setViewTab] = useState('farmer');
  const [queueData, setQueueData] = useState(null);
  const [loadingQueue, setLoadingQueue] = useState(false);

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

  // Multi-cycle selection
  const [selectedCycleIds, setSelectedCycleIds] = useState([]);
  const [batchModalOpen, setBatchModalOpen] = useState(false);

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
    setSelectedCycleIds([]);
    try {
      // 1. Load all cycles for farmer (active, pending, paid)
      const res = await getCyclesByFarmer(farmerId);
      setCycles(res.cycles || []);

      // Suggest next start date based on latest cycle
      if (res.cycles && res.cycles.length > 0) {
        const latestCycle = res.cycles[0]; // sorted start_date DESC
        const nextDate = new Date(latestCycle.endDate);
        nextDate.setDate(nextDate.getDate() + 1);
        const isoNext = nextDate.toISOString().split('T')[0];
        setCycleForm((prev) => ({
          ...prev,
          startDate: isoNext,
          ratePerLiter: String(latestCycle.ratePerLiter || 42.0),
        }));
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

  const loadQueue = async () => {
    setLoadingQueue(true);
    try {
      const data = await getUpcomingPayments();
      setQueueData(data);
    } catch (err) {
      showToast(err.message || 'Failed to load payment queue', 'error');
    } finally {
      setLoadingQueue(false);
    }
  };

  useEffect(() => {
    if (viewTab === 'farmer' && selectedFarmerId) {
      loadFarmerData(selectedFarmerId);
    } else if (viewTab === 'queue') {
      loadQueue();
    }
  }, [selectedFarmerId, viewTab]);

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
      showToast(`Cycle #${res.id} (${res.startDate} to ${res.endDate}) created successfully!`);
      loadFarmerData(selectedFarmerId);
    } catch (err) {
      showToast(err.message || 'Failed to create cycle', 'error');
    } finally {
      setStartingCycle(false);
    }
  };

  const handleOpenPreview = async (cycleId) => {
    try {
      setPreviewLoading(true);
      const res = await getPaymentPreview(cycleId);
      setPreview(res);
      setSettleModalOpen(true);
    } catch (err) {
      showToast(err.message || 'Failed to fetch payment preview', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePaySingleCycle = async () => {
    if (!preview || !preview.cycle) return;
    try {
      setPaying(true);
      const res = await payCycle({
        cycleId: preview.cycle.id,
        paidDate: todayStr,
      });
      showToast(`Cycle #${preview.cycle.id} marked as PAID! Total Paid: ₹${res.final_amount}`);
      setSettleModalOpen(false);
      setPreview(null);
      if (viewTab === 'farmer') {
        loadFarmerData(selectedFarmerId);
      } else {
        loadQueue();
      }
    } catch (err) {
      showToast(err.message || 'Payment processing failed', 'error');
    } finally {
      setPaying(false);
    }
  };

  // Toggle selection for batch pay
  const toggleSelectCycle = (cycleId) => {
    setSelectedCycleIds((prev) =>
      prev.includes(cycleId) ? prev.filter((id) => id !== cycleId) : [...prev, cycleId]
    );
  };

  const handlePayBatch = async () => {
    if (selectedCycleIds.length === 0) return;
    try {
      setPaying(true);
      const res = await paySelectedCycles({
        cycleIds: selectedCycleIds,
        paidDate: todayStr,
      });
      showToast(`Successfully settled ${res.farmerCount} cycle(s)! Total: ₹${res.totalAmount}`);
      setBatchModalOpen(false);
      setSelectedCycleIds([]);
      if (viewTab === 'farmer') {
        loadFarmerData(selectedFarmerId);
      } else {
        loadQueue();
      }
    } catch (err) {
      showToast(err.message || 'Batch payment settlement failed', 'error');
    } finally {
      setPaying(false);
    }
  };

  const selectedFarmer = farmers.find((f) => String(f.id) === String(selectedFarmerId));
  const unpaidCycles = cycles.filter((c) => !c.isPaid);

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>Billing Cycles & Settlements</h2>
          <p>Create consecutive 15/30-day billing periods and settle single or multiple cycles</p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={`btn ${viewTab === 'farmer' ? 'btn-primary' : 'btn-outline'} btn-sm`}
            onClick={() => setViewTab('farmer')}
          >
            👨‍🌾 By Farmer
          </button>
          <button
            className={`btn ${viewTab === 'queue' ? 'btn-primary' : 'btn-outline'} btn-sm`}
            onClick={() => setViewTab('queue')}
          >
            📋 All Unpaid Queue
          </button>
        </div>
      </div>

      {viewTab === 'farmer' ? (
        <>
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
            {/* Start New Cycle Form */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">🚀 Start / Schedule Billing Cycle</h3>
              </div>
              <p style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-xs)', marginBottom: '1rem' }}>
                You can create next consecutive cycles (e.g. Oct 16–30 after Oct 1–15) even if previous cycles are unsettled. Overlapping dates are prevented.
              </p>
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
                  disabled={startingCycle || !selectedFarmerId}
                >
                  {startingCycle ? <span className="spinner"></span> : 'Create Billing Cycle'}
                </button>
              </form>
            </div>

            {/* Quick Summary of Unsettled Cycles for this farmer */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">💳 Pending Settlements ({unpaidCycles.length})</h3>
                {selectedCycleIds.length > 0 && (
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => setBatchModalOpen(true)}
                  >
                    Pay Selected ({selectedCycleIds.length})
                  </button>
                )}
              </div>
              {unpaidCycles.length === 0 ? (
                <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                  <p>All past cycles are settled for {selectedFarmer?.name}.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {unpaidCycles.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        padding: '0.75rem 1rem',
                        background: 'var(--clr-surface-alt)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--clr-border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <input
                          type="checkbox"
                          checked={selectedCycleIds.includes(c.id)}
                          onChange={() => toggleSelectCycle(c.id)}
                          style={{ width: 18, height: 18, cursor: 'pointer' }}
                        />
                        <div>
                          <strong>Cycle #{c.id}</strong> ({c.startDate} → {c.endDate})
                          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-dim)' }}>
                            {Number(c.totalLiters || 0).toFixed(2)}L @ ₹{c.ratePerLiter}/L | Due: {c.paymentDueDate}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <strong style={{ color: 'var(--clr-success)', display: 'block' }}>
                          ₹{Number(c.finalAmount || 0).toFixed(2)}
                        </strong>
                        <button
                          className="btn btn-outline btn-sm"
                          style={{ marginTop: '0.25rem', padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                          onClick={() => handleOpenPreview(c.id)}
                        >
                          Settle Now
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* All Cycles Table for Farmer */}
          <div className="card" style={{ marginBottom: 'var(--sp-8)' }}>
            <div className="card-header">
              <h3 className="card-title">
                All Billing Cycles for {selectedFarmer?.name} ({cycles.length})
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
            ) : cycles.length === 0 ? (
              <div className="empty-state">
                <div className="icon">🔄</div>
                <p>No cycles created for this farmer yet. Create one above.</p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>Select</th>
                      <th>Cycle ID</th>
                      <th>Period</th>
                      <th>Rate</th>
                      <th>Milk Collected</th>
                      <th>Gross Amount</th>
                      <th>Feed Deduct</th>
                      <th>Payable Amount</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cycles.map((c) => (
                      <tr key={c.id}>
                        <td>
                          {!c.isPaid && (
                            <input
                              type="checkbox"
                              checked={selectedCycleIds.includes(c.id)}
                              onChange={() => toggleSelectCycle(c.id)}
                              style={{ width: 16, height: 16, cursor: 'pointer' }}
                            />
                          )}
                        </td>
                        <td><strong>#{c.id}</strong></td>
                        <td>
                          <div>{c.startDate} → {c.endDate}</div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--clr-text-dim)' }}>
                            {c.durationDays} Days (Due: {c.paymentDueDate})
                          </span>
                        </td>
                        <td>₹{Number(c.ratePerLiter).toFixed(2)}/L</td>
                        <td><strong>{Number(c.totalLiters || 0).toFixed(2)} L</strong></td>
                        <td>₹{Number(c.grossAmount || 0).toFixed(2)}</td>
                        <td style={{ color: c.feedDeduction > 0 ? 'var(--clr-danger)' : 'var(--clr-text-dim)' }}>
                          {c.feedDeduction > 0 ? `-₹${Number(c.feedDeduction).toFixed(2)}` : '₹0.00'}
                        </td>
                        <td>
                          <strong style={{ color: c.isPaid ? 'var(--clr-primary)' : 'var(--clr-success)', fontSize: '1rem' }}>
                            ₹{Number(c.finalAmount || 0).toFixed(2)}
                          </strong>
                        </td>
                        <td>
                          {c.isPaid ? (
                            <span className="badge badge-paid">✓ PAID</span>
                          ) : (
                            <span className="badge badge-active">PENDING</span>
                          )}
                        </td>
                        <td>
                          {!c.isPaid ? (
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => handleOpenPreview(c.id)}
                            >
                              💳 Settle
                            </button>
                          ) : (
                            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-dim)' }}>Settled</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Global Queue View */
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">📋 Unpaid Billing Cycles Queue Across All Farmers</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {selectedCycleIds.length > 0 && (
                <button
                  className="btn btn-success btn-sm"
                  onClick={() => setBatchModalOpen(true)}
                >
                  Pay Selected ({selectedCycleIds.length})
                </button>
              )}
              <button className="btn btn-outline btn-sm" onClick={loadQueue} disabled={loadingQueue}>
                Refresh Queue
              </button>
            </div>
          </div>

          {loadingQueue ? (
            <div className="loading-center">
              <div className="spinner"></div>
            </div>
          ) : (
            <div>
              {/* Overdue Section */}
              {queueData?.overdue?.length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                  <h4 style={{ color: 'var(--clr-danger)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🚨 Overdue Cycles ({queueData.overdue.length})
                  </h4>
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Select</th>
                          <th>Farmer</th>
                          <th>Cycle ID</th>
                          <th>Period</th>
                          <th>Milk (L)</th>
                          <th>Due Date</th>
                          <th>Overdue Days</th>
                          <th>Payable Amount</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {queueData.overdue.map((item) => (
                          <tr key={item.cycleId}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedCycleIds.includes(item.cycleId)}
                                onChange={() => toggleSelectCycle(item.cycleId)}
                              />
                            </td>
                            <td><strong>{item.farmerName}</strong></td>
                            <td>#{item.cycleId}</td>
                            <td>{new Date(item.startDate).toLocaleDateString()} → {new Date(item.endDate).toLocaleDateString()}</td>
                            <td>{Number(item.totalLiters).toFixed(2)}L</td>
                            <td>{new Date(item.paymentDueDate).toLocaleDateString()}</td>
                            <td>
                              <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.2)', color: 'var(--clr-danger)' }}>
                                {Math.abs(item.daysRemaining)} Days Overdue
                              </span>
                            </td>
                            <td><strong style={{ color: 'var(--clr-danger)' }}>₹{Number(item.finalAmount).toFixed(2)}</strong></td>
                            <td>
                              <button className="btn btn-primary btn-sm" onClick={() => handleOpenPreview(item.cycleId)}>
                                Settle
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Due Today & Upcoming Section */}
              {([...(queueData?.due_today || []), ...(queueData?.upcoming || [])]).length > 0 && (
                <div>
                  <h4 style={{ color: 'var(--clr-primary)', marginBottom: '0.75rem' }}>
                    📅 Active & Upcoming Due Cycles ({([...(queueData?.due_today || []), ...(queueData?.upcoming || [])]).length})
                  </h4>
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Select</th>
                          <th>Farmer</th>
                          <th>Cycle ID</th>
                          <th>Period</th>
                          <th>Milk (L)</th>
                          <th>Due Date</th>
                          <th>Days Left</th>
                          <th>Payable Amount</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...(queueData?.due_today || []), ...(queueData?.upcoming || [])].map((item) => (
                          <tr key={item.cycleId}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedCycleIds.includes(item.cycleId)}
                                onChange={() => toggleSelectCycle(item.cycleId)}
                              />
                            </td>
                            <td><strong>{item.farmerName}</strong></td>
                            <td>#{item.cycleId}</td>
                            <td>{new Date(item.startDate).toLocaleDateString()} → {new Date(item.endDate).toLocaleDateString()}</td>
                            <td>{Number(item.totalLiters).toFixed(2)}L</td>
                            <td>{new Date(item.paymentDueDate).toLocaleDateString()}</td>
                            <td>
                              {item.daysRemaining === 0 ? (
                                <span className="badge badge-warning">Due Today</span>
                              ) : (
                                <span className="badge badge-active">{item.daysRemaining} days left</span>
                              )}
                            </td>
                            <td><strong style={{ color: 'var(--clr-success)' }}>₹{Number(item.finalAmount).toFixed(2)}</strong></td>
                            <td>
                              <button className="btn btn-primary btn-sm" onClick={() => handleOpenPreview(item.cycleId)}>
                                Settle
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Single Settle Modal */}
      {settleModalOpen && preview && (
        <div className="modal-overlay" onClick={() => setSettleModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>💳 Settle Billing Cycle #{preview.cycle?.id}</h3>
            <p style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-sm)', marginBottom: '1.5rem' }}>
              Farmer: <strong>{preview.farmer?.name}</strong> | Rate: ₹{preview.rate}/L
            </p>

            <div className="summary-row" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              <div className="summary-item">
                <div className="label">Total Milk</div>
                <div className="value">{Number(preview.total_liters || 0).toFixed(2)} L</div>
              </div>
              <div className="summary-item">
                <div className="label">Gross Amount</div>
                <div className="value">₹{Number(preview.gross_amount || 0).toFixed(2)}</div>
              </div>
              <div className="summary-item">
                <div className="label">Feed Deductions</div>
                <div className="value" style={{ color: 'var(--clr-danger)' }}>-₹{Number(preview.feed_deduction || 0).toFixed(2)}</div>
              </div>
              <div className="summary-item">
                <div className="label">Final Payout</div>
                <div className="value positive">₹{Number(preview.final_amount || 0).toFixed(2)}</div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setSettleModalOpen(false)} disabled={paying}>
                Cancel
              </button>
              <button className="btn btn-success" onClick={handlePaySingleCycle} disabled={paying}>
                {paying ? <span className="spinner"></span> : 'Confirm & Mark Paid'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Settle Modal */}
      {batchModalOpen && (
        <div className="modal-overlay" onClick={() => setBatchModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>💳 Batch Settle {selectedCycleIds.length} Selected Cycles</h3>
            <p style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-sm)', marginBottom: '1.5rem' }}>
              Settle all selected cycles atomically.
            </p>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setBatchModalOpen(false)} disabled={paying}>
                Cancel
              </button>
              <button className="btn btn-success" onClick={handlePayBatch} disabled={paying}>
                {paying ? <span className="spinner"></span> : `Pay All Selected (${selectedCycleIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
