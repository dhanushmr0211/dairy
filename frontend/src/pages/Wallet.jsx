import { useState, useEffect, useCallback } from 'react';
import { 
  getWalletSummary, 
  getWalletTransactions, 
  recordWalletReceipt, 
  getDistributionPreview, 
  confirmDistribution,
  getDistributionHistory
} from '../api';
import { useToast } from '../context/ToastContext';

export default function Wallet() {
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [distHistory, setDistHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter
  const [txTypeFilter, setTxTypeFilter] = useState('');
  const [activeTab, setActiveTab] = useState('ledger'); // 'ledger' or 'history'

  // Modals
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [distModalOpen, setDistModalOpen] = useState(false);

  // Transaction Form State
  const [txType, setTxType] = useState('receipt'); // 'receipt', 'adjustment', 'farmer_payment'
  const [adjustmentDirection, setAdjustmentDirection] = useState('credit'); // 'credit' or 'debit'
  const [receiptAmount, setReceiptAmount] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiptRef, setReceiptRef] = useState('');
  const [receiptDesc, setReceiptDesc] = useState('');
  const [submittingReceipt, setSubmittingReceipt] = useState(false);

  // Distribution Form & Preview
  const [distMode, setDistMode] = useState('BELOW_BALANCE'); // BELOW_BALANCE, WITHIN_MARGIN
  const [distPreview, setDistPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirmingDist, setConfirmingDist] = useState(false);

  const { showToast } = useToast();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [summaryRes, txRes, historyRes] = await Promise.all([
        getWalletSummary(),
        getWalletTransactions(txTypeFilter ? { type: txTypeFilter } : {}),
        getDistributionHistory()
      ]);

      setSummary(summaryRes);
      setTransactions(txRes.transactions || []);
      setDistHistory(historyRes.distributions || []);
    } catch (err) {
      setError(err.message || 'Failed to load wallet data');
    } finally {
      setLoading(false);
    }
  }, [txTypeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRecordTransaction = async (e) => {
    e.preventDefault();
    if (!receiptAmount || Number(receiptAmount) <= 0) {
      showToast('Please enter a valid positive amount', 'error');
      return;
    }

    try {
      setSubmittingReceipt(true);
      const res = await recordWalletReceipt({
        amount: Number(receiptAmount),
        transactionType: txType,
        adjustmentType: adjustmentDirection,
        receiptDate: receiptDate,
        receivedDate: receiptDate,
        reference: receiptRef.trim() || undefined,
        description: receiptDesc.trim() || undefined,
      });

      const updatedBal = res.newBalance ?? res.availableBalance ?? res.walletBalance ?? 0;
      showToast(`✓ Transaction recorded! New wallet balance: ₹${Number(updatedBal).toLocaleString('en-IN')}`);
      setReceiptModalOpen(false);
      setReceiptAmount('');
      setReceiptRef('');
      setReceiptDesc('');
      setTxType('receipt');
      setAdjustmentDirection('credit');
      loadData();
    } catch (err) {
      showToast(err.message || 'Failed to record transaction', 'error');
    } finally {
      setSubmittingReceipt(false);
    }
  };

  const handleOpenDistributionPreview = async (mode = distMode) => {
    try {
      setDistModalOpen(true);
      setLoadingPreview(true);
      const res = await getDistributionPreview({ mode });
      setDistPreview(res);
    } catch (err) {
      showToast(err.message || 'Failed to calculate distribution preview', 'error');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirmDistribution = async () => {
    if (!distPreview?.previewId) return;
    try {
      setConfirmingDist(true);
      const res = await confirmDistribution({
        previewId: distPreview.previewId,
        previewHash: distPreview.previewHash,
      });

      showToast(`✓ Automatic payment distribution complete! Settled ${res.selectedCycleCount} cycles across ${res.selectedFarmerCount} farmers. Disbursed: ₹${Number(res.totalDisbursed).toLocaleString('en-IN')}`);
      setDistModalOpen(false);
      setDistPreview(null);
      loadData();
    } catch (err) {
      showToast(err.message || 'Distribution confirmation failed', 'error');
    } finally {
      setConfirmingDist(false);
    }
  };

  // Safe formatting helpers
  const formatTxDate = (tx) => {
    const raw = tx.transactionDate || tx.transaction_date || tx.createdAt || tx.created_at;
    if (!raw) return '—';
    const d = new Date(raw);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
  };

  const formatTxTime = (tx) => {
    const raw = tx.createdAt || tx.created_at;
    if (!raw) return '';
    const d = new Date(raw);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Safe balance values
  const availableBal = Number(summary?.availableBalance ?? summary?.walletBalance ?? summary?.currentBalance ?? 0);
  const totalRec = Number(summary?.totalReceipts ?? summary?.totalReceived ?? 0);
  const totalDis = Number(summary?.totalDisbursed ?? summary?.totalPaidToFarmers ?? 0);
  const pendingDues = Number(summary?.pendingCyclesTotal ?? 0);

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>Dairy Company Wallet</h2>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={() => setReceiptModalOpen(true)}>
            <span>➕</span> Record Received Payment
          </button>
          <button 
            className="btn btn-success btn-sm" 
            onClick={() => handleOpenDistributionPreview('BELOW_BALANCE')}
            disabled={availableBal <= 0}
          >
            <span>⚡</span> Auto-Distribute
          </button>
          <button className="btn btn-outline btn-sm" onClick={loadData}>
            <span>🔄</span> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-center">
          <div className="spinner spinner-lg"></div>
        </div>
      ) : error ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--clr-danger)', marginBottom: '1rem' }}>{error}</p>
          <button className="btn btn-outline" onClick={loadData}>Retry</button>
        </div>
      ) : (
        <>
          {/* ═══ Top Summary Metric Cards ═══ */}
          <div className="stats-grid">
            <div className="stat-card success">
              <div className="stat-label">Available Wallet Balance</div>
              <div className="stat-value" style={{ color: availableBal > 0 ? 'var(--clr-success)' : undefined }}>
                ₹{availableBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ marginTop: '0.4rem', fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)' }}>
                {availableBal > 0 ? 'Funds available for distribution' : 'Wallet balance empty'}
              </div>
              <div className="stat-icon">🏦</div>
            </div>

            <div className="stat-card primary">
              <div className="stat-label">Total Receipts from Hatsun</div>
              <div className="stat-value">
                ₹{totalRec.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ marginTop: '0.4rem', fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)' }}>
                Lifetime confirmed deposits
              </div>
              <div className="stat-icon">📥</div>
            </div>

            <div className="stat-card accent">
              <div className="stat-label">Total Disbursed to Farmers</div>
              <div className="stat-value">
                ₹{totalDis.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ marginTop: '0.4rem', fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)' }}>
                Lifetime farmer cycle payouts
              </div>
              <div className="stat-icon">📤</div>
            </div>

            <div className="stat-card warning">
              <div className="stat-label">Pending Farmers Due</div>
              <div className="stat-value">
                ₹{pendingDues.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ marginTop: '0.4rem', fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)' }}>
                Across {summary?.pendingCyclesCount || 0} unpaid cycles
              </div>
              <div className="stat-icon">⏳</div>
            </div>
          </div>

          {/* ═══ Deposit Schedule Alert Banner ═══ */}
          <div 
            style={{ 
              background: '#ffffff', 
              border: '1px solid #bae6fd', 
              borderLeft: '5px solid var(--clr-primary)', 
              borderRadius: 'var(--radius-md)', 
              padding: '0.85rem 1.25rem', 
              marginBottom: 'var(--sp-6)', 
              boxShadow: 'var(--shadow-xs)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem'
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--clr-primary-dim)', fontSize: 'var(--fs-sm)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>📅</span> Hatsun Deposit Schedule: 3rd, 13th & 23rd of each month
            </div>
          </div>

          {/* ═══ Tabs: Ledger vs Distribution Audit ═══ */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: 'var(--sp-4)' }}>
            <button
              className={`btn btn-sm ${activeTab === 'ledger' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTab('ledger')}
            >
              📜 Wallet Transaction Ledger ({transactions.length})
            </button>
            <button
              className={`btn btn-sm ${activeTab === 'history' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTab('history')}
            >
              ⚡ Automatic Distribution History ({distHistory.length})
            </button>
          </div>

          {/* ═══ Tab 1: Ledger ═══ */}
          {activeTab === 'ledger' && (
            <div className="card">
              <div className="card-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h3 className="card-title">Detailed Ledger Journal</h3>
                  <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-dim)', marginTop: '0.25rem' }}>
                    Every receipt, payment, and adjustment with mathematical running balance verification
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <select
                    className="form-select"
                    style={{ padding: '0.35rem 0.65rem', fontSize: 'var(--fs-xs)' }}
                    value={txTypeFilter}
                    onChange={(e) => setTxTypeFilter(e.target.value)}
                  >
                    <option value="">All Transactions</option>
                    <option value="receipt">📥 Receipts Only (Credits)</option>
                    <option value="farmer_payment">📤 Farmer Payments (Debits)</option>
                    <option value="adjustment">⚖️ Adjustments</option>
                  </select>
                </div>
              </div>

              {transactions.length === 0 ? (
                <div className="empty-state">
                  <div className="icon">💳</div>
                  <p>No transactions recorded yet in the company wallet ledger.</p>
                  <button className="btn btn-primary btn-sm" onClick={() => setReceiptModalOpen(true)} style={{ marginTop: '0.75rem' }}>
                    Record First Deposit
                  </button>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Description / Reference</th>
                        <th style={{ textAlign: 'right' }}>Amount (₹)</th>
                        <th style={{ textAlign: 'right' }}>Running Balance (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx) => {
                        const typeVal = tx.transactionType || tx.transaction_type || '';
                        const isCredit = typeVal === 'receipt';
                        const isDebit = typeVal === 'farmer_payment';
                        const isAdjustment = typeVal === 'adjustment';

                        const numAmount = Number(tx.amount || 0);
                        const runningBal = Number(tx.runningBalance ?? tx.running_balance ?? 0);

                        return (
                          <tr key={tx.id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{formatTxDate(tx)}</div>
                              <span style={{ fontSize: '0.7rem', color: 'var(--clr-text-dim)' }}>
                                {formatTxTime(tx)}
                              </span>
                            </td>
                            <td>
                              {isCredit ? (
                                <span className="badge badge-active">📥 Receipt</span>
                              ) : isDebit ? (
                                <span className="badge badge-paid">📤 Farmer Payment</span>
                              ) : (
                                <span className="badge badge-morning">⚖️ Adjustment</span>
                              )}
                            </td>
                            <td>
                              <div style={{ fontWeight: 500 }}>
                                {tx.description || (isCredit ? 'Payment received from Hatsun' : isDebit ? 'Farmer Cycle Payout' : 'Ledger Adjustment')}
                              </div>
                              {tx.reference && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--clr-text-dim)' }}>
                                  Ref: <code>{tx.reference}</code>
                                </span>
                              )}
                            </td>
                            <td style={{ 
                              textAlign: 'right', 
                              fontWeight: 700, 
                              color: isCredit ? 'var(--clr-success)' : isDebit ? 'var(--clr-danger)' : (numAmount >= 0 ? 'var(--clr-success)' : 'var(--clr-danger)')
                            }}>
                              {isCredit ? '+' : isDebit ? '-' : (numAmount >= 0 ? '+' : '-')}₹{Math.abs(numAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>
                              ₹{runningBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ═══ Tab 2: Distribution History ═══ */}
          {activeTab === 'history' && (
            <div className="card">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Automated Distribution Run History</h3>
                  <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-dim)', marginTop: '0.25rem' }}>
                    Audit log of all proposed and confirmed automatic distribution executions
                  </p>
                </div>
              </div>

              {distHistory.length === 0 ? (
                <div className="empty-state">
                  <div className="icon">⚡</div>
                  <p>No automatic distributions have been executed yet.</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date & Time</th>
                        <th>Status</th>
                        <th>Mode</th>
                        <th>Cycles Paid</th>
                        <th>Farmers Benefited</th>
                        <th style={{ textAlign: 'right' }}>Total Disbursed (₹)</th>
                        <th style={{ textAlign: 'right' }}>Remaining Balance (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {distHistory.map((h) => (
                        <tr key={h.id}>
                          <td>
                            <strong>{new Date(h.created_at || h.createdAt || Date.now()).toLocaleDateString()}</strong>
                            <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-dim)' }}>
                              {new Date(h.created_at || h.createdAt || Date.now()).toLocaleTimeString()}
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${h.status === 'confirmed' ? 'badge-active' : 'badge-morning'}`}>
                              {(h.status || 'pending').toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)' }}>
                              {h.mode} {h.mode === 'WITHIN_MARGIN' && `(₹${h.margin || 500} margin)`}
                            </span>
                          </td>
                          <td><strong>{h.selected_cycle_count ?? h.selectedCycleCount ?? 0}</strong> cycles</td>
                          <td><strong>{h.selected_farmer_count ?? h.selectedFarmerCount ?? 0}</strong> farmers</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--clr-success)' }}>
                            ₹{Number(h.proposed_total ?? h.proposedTotal ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>
                            ₹{Number(h.remaining_balance ?? h.remainingBalance ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ═══ Record Transaction / Deposit Modal ═══ */}
      {receiptModalOpen && (
        <div className="modal-overlay" onClick={() => setReceiptModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>🏦 Record Payment / Transaction</h3>
            <p style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-sm)', marginBottom: '1.25rem' }}>
              Select the transaction type below to credit received funds from Hatsun or record adjustments.
            </p>

            <form onSubmit={handleRecordTransaction}>
              {/* Transaction Type Selector */}
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Transaction Type *</label>
                <select
                  className="form-select"
                  value={txType}
                  onChange={(e) => setTxType(e.target.value)}
                >
                  <option value="receipt">📥 Deposit from Hatsun (Payment Received - Credits Wallet)</option>
                  <option value="adjustment">⚖️ Balance Adjustment / Initial Deposit</option>
                  <option value="farmer_payment">📤 Direct Farmer Payout / Debit (Deducts from Wallet)</option>
                </select>
              </div>

              {/* Direction selector if Adjustment */}
              {txType === 'adjustment' && (
                <div className="form-group" style={{ marginBottom: '1rem', background: 'var(--clr-surface-alt)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--clr-border)' }}>
                  <label className="form-label">Adjustment Direction *</label>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>
                      <input 
                        type="radio" 
                        name="adjDir" 
                        value="credit" 
                        checked={adjustmentDirection === 'credit'} 
                        onChange={() => setAdjustmentDirection('credit')}
                      />
                      ➕ Add Funds to Wallet (Credit)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>
                      <input 
                        type="radio" 
                        name="adjDir" 
                        value="debit" 
                        checked={adjustmentDirection === 'debit'} 
                        onChange={() => setAdjustmentDirection('debit')}
                      />
                      ➖ Deduct Funds from Wallet (Debit)
                    </label>
                  </div>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="e.g. 50000"
                  className="form-input"
                  value={receiptAmount}
                  onChange={(e) => setReceiptAmount(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Transaction Date *</label>
                <input
                  type="date"
                  required
                  className="form-input"
                  value={receiptDate}
                  onChange={(e) => setReceiptDate(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Reference / Bank Transaction ID</label>
                <input
                  type="text"
                  placeholder="e.g. HATSUN-TXN-2026-10-19"
                  className="form-input"
                  value={receiptRef}
                  onChange={(e) => setReceiptRef(e.target.value)}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--clr-text-dim)' }}>
                  Must be unique for Hatsun receipts to prevent duplicate entries.
                </span>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">Description / Notes</label>
                <input
                  type="text"
                  placeholder={
                    txType === 'receipt'
                      ? 'e.g. Hatsun settlement for milk collection cycle'
                      : txType === 'adjustment'
                        ? 'e.g. Initial company balance or bank interest'
                        : 'e.g. Direct cash payout'
                  }
                  className="form-input"
                  value={receiptDesc}
                  onChange={(e) => setReceiptDesc(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setReceiptModalOpen(false)}
                  disabled={submittingReceipt}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingReceipt}
                >
                  {submittingReceipt ? <span className="spinner"></span> : txType === 'farmer_payment' || (txType === 'adjustment' && adjustmentDirection === 'debit') ? 'Deduct from Wallet' : 'Add to Wallet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Auto-Distribution Modal ═══ */}
      {distModalOpen && (
        <div className="modal-overlay" onClick={() => setDistModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <h3>⚡ Automatic Payment Distribution</h3>
            <p style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-sm)', marginBottom: '1rem' }}>
              Selects oldest unpaid cycles across all farmers matching the available company wallet balance.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <button
                className={`btn btn-sm ${distMode === 'BELOW_BALANCE' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => { setDistMode('BELOW_BALANCE'); handleOpenDistributionPreview('BELOW_BALANCE'); }}
                disabled={loadingPreview || confirmingDist}
              >
                Strict Budget (Below Balance)
              </button>
              <button
                className={`btn btn-sm ${distMode === 'WITHIN_MARGIN' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => { setDistMode('WITHIN_MARGIN'); handleOpenDistributionPreview('WITHIN_MARGIN'); }}
                disabled={loadingPreview || confirmingDist}
              >
                Allow ₹500 Margin
              </button>
            </div>

            {loadingPreview ? (
              <div className="loading-center" style={{ padding: '2rem' }}>
                <div className="spinner spinner-lg"></div>
              </div>
            ) : distPreview ? (
              <>
                <div className="summary-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.25rem' }}>
                  <div className="summary-item">
                    <div className="label">Wallet Balance</div>
                    <div className="value">₹{Number(distPreview.walletBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div className="summary-item">
                    <div className="label">Proposed Payout</div>
                    <div className="value positive">₹{Number(distPreview.proposedTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div className="summary-item">
                    <div className="label">Remaining Balance</div>
                    <div className="value">₹{Number(distPreview.remainingBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>

                {distPreview.shortfall > 0 && (
                  <div style={{ background: 'var(--clr-warning-light)', border: '1px solid var(--clr-warning-border)', borderRadius: 'var(--radius-sm)', padding: '0.65rem 0.85rem', marginBottom: '1rem', fontSize: 'var(--fs-xs)', color: 'var(--clr-warning-dim)' }}>
                    ⚠️ Shortfall of ₹{Number(distPreview.shortfall).toFixed(2)} covered by ₹500 tolerance margin.
                  </div>
                )}

                {distPreview.nextUnselectedReason && (
                  <div style={{ background: 'var(--clr-surface-alt)', border: '1px solid var(--clr-border)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem', marginBottom: '1rem', fontSize: '0.75rem', color: 'var(--clr-text-muted)' }}>
                    ℹ️ <strong>Selection Cutoff Reason:</strong> {distPreview.nextUnselectedReason}
                  </div>
                )}

                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--clr-border)', borderRadius: 'var(--radius-sm)', padding: '0.5rem', marginBottom: '1.25rem' }}>
                  {distPreview.selectedCycles?.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--clr-text-dim)', padding: '1rem' }}>
                      No unpaid cycles fit within the available wallet budget.
                    </p>
                  ) : (
                    distPreview.selectedCycles.map((c) => (
                      <div key={c.cycleId} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--clr-border-subtle)', fontSize: 'var(--fs-xs)' }}>
                        <div>
                          <strong>{c.farmerName}</strong>
                          <span style={{ color: 'var(--clr-text-dim)', marginLeft: '0.4rem' }}>
                            (Cycle #{c.cycleId}: {c.startDate} → {c.endDate})
                          </span>
                        </div>
                        <strong style={{ color: 'var(--clr-success)' }}>
                          ₹{Number(c.calculatedAmount).toFixed(2)}
                        </strong>
                      </div>
                    ))
                  )}
                </div>

                <div className="modal-actions">
                  <button
                    className="btn btn-outline"
                    onClick={() => setDistModalOpen(false)}
                    disabled={confirmingDist}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={handleConfirmDistribution}
                    disabled={confirmingDist || !distPreview.selectedCycles || distPreview.selectedCycles.length === 0}
                  >
                    {confirmingDist ? <span className="spinner"></span> : `Confirm & Disburse ₹${Number(distPreview.proposedTotal).toFixed(2)}`}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
