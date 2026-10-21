import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
  getDashboard, 
  getSelectedPaymentsPreview, 
  paySelectedCycles,
  recordWalletReceipt,
  getDistributionPreview,
  confirmDistribution
} from '../api';
import { useToast } from '../context/ToastContext';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selection state for manual settlement
  const [selectedCycleIds, setSelectedCycleIds] = useState([]);
  const [calcResult, setCalcResult] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [paying, setPaying] = useState(false);

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, overdue, due_today, upcoming

  // Modals
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [autoDistModalOpen, setAutoDistModalOpen] = useState(false);

  // Receipt form state
  const [txType, setTxType] = useState('receipt'); // 'receipt', 'adjustment', 'farmer_payment'
  const [adjustmentDirection, setAdjustmentDirection] = useState('credit'); // 'credit' or 'debit'
  const [receiptAmount, setReceiptAmount] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiptRef, setReceiptRef] = useState('');
  const [receiptDesc, setReceiptDesc] = useState('');
  const [submittingReceipt, setSubmittingReceipt] = useState(false);

  // Auto-distribution state
  const [distPreview, setDistPreview] = useState(null);
  const [loadingDistPreview, setLoadingDistPreview] = useState(false);
  const [confirmingDist, setConfirmingDist] = useState(false);
  const [distMode, setDistMode] = useState('BELOW_BALANCE'); // BELOW_BALANCE, WITHIN_MARGIN

  const { showToast } = useToast();

  const loadDashboard = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const allCycles = data?.farmer_cycles_summary || [];

  // Filter cycles based on search and status
  const filteredCycles = useMemo(() => {
    return allCycles.filter((item) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = item.farmerName?.toLowerCase().includes(query);
        const matchesPhone = item.farmerPhone?.includes(query);
        const matchesId = String(item.cycleId).includes(query);
        if (!matchesName && !matchesPhone && !matchesId) return false;
      }

      if (statusFilter === 'overdue' && !item.isOverdue) return false;
      if (statusFilter === 'due_today' && !item.isDueToday) return false;
      if (statusFilter === 'upcoming' && (item.isOverdue || item.isDueToday)) return false;

      return true;
    });
  }, [allCycles, searchQuery, statusFilter]);

  // Live calculation for selected cycles
  useEffect(() => {
    if (selectedCycleIds.length === 0) {
      setCalcResult(null);
      return;
    }

    let isMounted = true;
    setCalculating(true);

    getSelectedPaymentsPreview({ cycleIds: selectedCycleIds })
      .then((res) => {
        if (isMounted) setCalcResult(res);
      })
      .catch((err) => {
        if (isMounted) showToast(err.message || 'Error calculating payment details', 'error');
      })
      .finally(() => {
        if (isMounted) setCalculating(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedCycleIds, showToast]);

  // Toggle single cycle
  const handleToggleCycle = (cycleId) => {
    setSelectedCycleIds((prev) =>
      prev.includes(cycleId) ? prev.filter((id) => id !== cycleId) : [...prev, cycleId]
    );
  };

  // Toggle all visible cycles
  const handleToggleAll = () => {
    const visibleIds = filteredCycles.map((c) => c.cycleId);
    const allSelected = visibleIds.every((id) => selectedCycleIds.includes(id));

    if (allSelected) {
      setSelectedCycleIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedCycleIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  // Select all cycles for a specific farmer
  const handleSelectFarmerAllCycles = (farmerId) => {
    const farmerCycles = allCycles.filter((c) => c.farmerId === farmerId);
    const farmerCycleIds = farmerCycles.map((c) => c.cycleId);
    const allFarmerSelected = farmerCycleIds.every((id) => selectedCycleIds.includes(id));

    if (allFarmerSelected) {
      setSelectedCycleIds((prev) => prev.filter((id) => !farmerCycleIds.includes(id)));
    } else {
      setSelectedCycleIds((prev) => Array.from(new Set([...prev, ...farmerCycleIds])));
    }
  };

  // Execute manual payment
  const handleExecutePayment = async () => {
    if (selectedCycleIds.length === 0) return;
    try {
      setPaying(true);
      const todayIso = new Date().toISOString().split('T')[0];
      const res = await paySelectedCycles({
        cycleIds: selectedCycleIds,
        paidDate: todayIso,
      });

      showToast(`✓ Successfully settled ${res.cycleCount} cycle(s) for ${res.farmerCount} farmer(s)! Total Paid: ₹${res.totalAmount}`);
      setSelectedCycleIds([]);
      setCalcResult(null);
      setConfirmModalOpen(false);
      loadDashboard();
    } catch (err) {
      showToast(err.message || 'Payment processing failed', 'error');
    } finally {
      setPaying(false);
    }
  };

  // Record received wallet deposit / transaction
  const handleRecordReceipt = async (e) => {
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
        receivedDate: receiptDate,
        receiptDate: receiptDate,
        reference: receiptRef.trim() || undefined,
        description: receiptDesc.trim() || undefined,
      });

      const updatedBal = res.newBalance ?? res.availableBalance ?? res.walletBalance ?? 0;
      showToast(`✓ Transaction recorded! New Wallet Balance: ₹${Number(updatedBal).toLocaleString('en-IN')}`);
      setReceiptModalOpen(false);
      setReceiptAmount('');
      setReceiptRef('');
      setReceiptDesc('');
      setTxType('receipt');
      setAdjustmentDirection('credit');
      loadDashboard();
    } catch (err) {
      showToast(err.message || 'Failed to record transaction', 'error');
    } finally {
      setSubmittingReceipt(false);
    }
  };

  // Open auto distribution preview
  const handleOpenAutoDistribution = async (mode = distMode) => {
    try {
      setAutoDistModalOpen(true);
      setLoadingDistPreview(true);
      const res = await getDistributionPreview({ mode });
      setDistPreview(res);
    } catch (err) {
      showToast(err.message || 'Failed to generate distribution preview', 'error');
    } finally {
      setLoadingDistPreview(false);
    }
  };

  // Confirm auto distribution
  const handleConfirmAutoDistribution = async () => {
    if (!distPreview?.previewId) return;
    try {
      setConfirmingDist(true);
      const res = await confirmDistribution({
        previewId: distPreview.previewId,
        previewHash: distPreview.previewHash,
      });

      showToast(`✓ Automatic distribution confirmed! Settled ${res.selectedCycleCount} cycle(s) across ${res.selectedFarmerCount} farmer(s). Total: ₹${Number(res.totalDisbursed).toLocaleString('en-IN')}`);
      setAutoDistModalOpen(false);
      setDistPreview(null);
      loadDashboard();
    } catch (err) {
      showToast(err.message || 'Distribution confirmation failed', 'error');
    } finally {
      setConfirmingDist(false);
    }
  };

  const isAllVisibleSelected =
    filteredCycles.length > 0 &&
    filteredCycles.every((c) => selectedCycleIds.includes(c.cycleId));

  const walletInfo = data?.wallet;
  const currentWalletBal = Number(walletInfo?.availableBalance ?? walletInfo?.balance ?? walletInfo?.currentBalance ?? 0);

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>Dairy Dashboard</h2>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-outline btn-sm" onClick={loadDashboard}>
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
          <button className="btn btn-outline" onClick={loadDashboard}>
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* ═══ Top KPI Metric Cards ═══ */}
          <div className="stats-grid">
            <div className="stat-card primary">
              <div className="stat-label">Active Farmers</div>
              <div className="stat-value">{data?.active_farmer_count ?? data?.total_farmers ?? 0}</div>
              <div className="stat-icon">👨‍🌾</div>
            </div>

            <div className="stat-card success">
              <div className="stat-label">Today&apos;s Milk Collected</div>
              <div className="stat-value">
                {Number(data?.today_total_milk || data?.total_milk_today || 0).toFixed(2)}{' '}
                <span style={{ fontSize: '1rem', fontWeight: 600 }}>L</span>
              </div>
              <div style={{ marginTop: '0.4rem', fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)', display: 'flex', gap: '0.75rem' }}>
                <span>🌅 Morn: <strong>{Number(data?.today_morning_milk || 0).toFixed(1)}L</strong></span>
                <span>🌆 Eve: <strong>{Number(data?.today_evening_milk || 0).toFixed(1)}L</strong></span>
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
              <div style={{ marginTop: '0.4rem', fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)' }}>
                {data?.overdue_farmers ?? 0} cycle{(data?.overdue_farmers ?? 0) === 1 ? '' : 's'} past due date
              </div>
              <div className="stat-icon">⏳</div>
            </div>

            <div className="stat-card accent">
              <div className="stat-label">Total Outstanding Dues</div>
              <div className="stat-value">
                ₹{Number(data?.total_pending_payment_amount || data?.total_expected_payout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ marginTop: '0.4rem', fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)' }}>
                Across {data?.active_cycles_count ?? 0} active/unpaid cycle{(data?.active_cycles_count ?? 0) === 1 ? '' : 's'}
              </div>
              <div className="stat-icon">💰</div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════
              DAIRY COMPANY WALLET & HATSUN DEPOSIT PANEL
              ═══════════════════════════════════════════════════ */}
          <div 
            className="card" 
            style={{ 
              marginBottom: 'var(--sp-8)', 
              border: '1px solid #bae6fd', 
              background: 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)',
              boxShadow: 'var(--shadow-md)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--clr-border)', paddingBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.4rem' }}>🏦</span>
                <h3 className="card-title" style={{ fontSize: 'var(--fs-lg)', color: 'var(--clr-primary-dim)', margin: 0 }}>
                  Dairy Company Wallet
                </h3>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button 
                  className="btn btn-primary btn-sm"
                  onClick={() => setReceiptModalOpen(true)}
                >
                  ➕ Record Received Payment
                </button>
                <button 
                  className="btn btn-success btn-sm"
                  onClick={() => handleOpenAutoDistribution('BELOW_BALANCE')}
                  disabled={currentWalletBal <= 0}
                >
                  ⚡ Auto-Distribute
                </button>
                <Link to="/wallet" className="btn btn-outline btn-sm">
                  Full Ledger →
                </Link>
              </div>
            </div>

            {/* Wallet Quick Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--sp-4)', marginTop: '1.25rem' }}>
              {/* Balance */}
              <div style={{ background: '#ffffff', border: '1px solid var(--clr-border)', borderRadius: 'var(--radius-md)', padding: '1rem', boxShadow: 'var(--shadow-xs)' }}>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Available Wallet Balance
                </div>
                <div style={{ fontSize: 'var(--fs-3xl)', fontWeight: 800, color: currentWalletBal > 0 ? 'var(--clr-success)' : 'var(--clr-text)', marginTop: '0.25rem' }}>
                  ₹{currentWalletBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-dim)', marginTop: '0.25rem' }}>
                  {currentWalletBal > 0 ? 'Ready to pay farmers' : 'Wallet empty'}
                </div>
              </div>

              {/* Next Deposit Alert */}
              <div style={{ background: '#ffffff', border: '1px solid var(--clr-border)', borderRadius: 'var(--radius-md)', padding: '1rem', boxShadow: 'var(--shadow-xs)' }}>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-primary)', fontWeight: 700, textTransform: 'uppercase' }}>
                  📅 Hatsun Deposit Schedule
                </div>
                <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--clr-text)', marginTop: '0.35rem' }}>
                  Expected: 3rd, 13th & 23rd
                </div>
              </div>

              {/* Distribution Proposal / Oldest Cycle */}
              <div style={{ background: '#ffffff', border: '1px solid var(--clr-border)', borderRadius: 'var(--radius-md)', padding: '1rem', boxShadow: 'var(--shadow-xs)' }}>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-accent)', fontWeight: 700, textTransform: 'uppercase' }}>
                  ⚡ Auto-Pay Status
                </div>
                {walletInfo?.distributionProposal?.hasProposal ? (
                  <>
                    <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--clr-accent-dim)', marginTop: '0.25rem' }}>
                      Can Pay ₹{Number(walletInfo.distributionProposal.proposedTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)', marginTop: '0.25rem' }}>
                      {walletInfo.distributionProposal.selectedCyclesCount} cycle(s) for {walletInfo.distributionProposal.selectedFarmersCount} farmer(s)
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--clr-text-muted)', marginTop: '0.35rem' }}>
                      {Number(walletInfo?.balance || 0) <= 0 ? 'Insufficient wallet balance' : 'Pending cycles fit within balance'}
                    </div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-dim)', marginTop: '0.25rem' }}>
                      Oldest Unpaid: <strong>{walletInfo?.oldestUnpaidCycleDate || 'None'}</strong>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════
              MANUAL REAL-TIME LIVE SETTLEMENT SIMULATOR
              ═══════════════════════════════════════════════════ */}
          {selectedCycleIds.length > 0 && (
            <div
              className="card"
              style={{
                marginBottom: 'var(--sp-8)',
                border: '2px solid var(--clr-primary)',
                background: '#ffffff',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <div className="card-header" style={{ borderBottom: '1px solid var(--clr-border)', paddingBottom: '1rem' }}>
                <div>
                  <h3 className="card-title" style={{ fontSize: 'var(--fs-lg)', color: 'var(--clr-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    ⚡ Real-Time Live Settlement Calculator
                    {calculating && <span className="spinner" style={{ width: 16, height: 16 }}></span>}
                  </h3>
                  <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)', marginTop: '0.25rem' }}>
                    Live simulation calculating exact payment amount and simulated balance after settling selected cycles
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setSelectedCycleIds([])}
                  >
                    ✕ Clear Selection
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={() => setConfirmModalOpen(true)}
                    disabled={calculating || paying}
                    style={{ fontWeight: 700, padding: '0.5rem 1.25rem', fontSize: 'var(--fs-sm)' }}
                  >
                    💳 Confirm & Pay ₹{Number(calcResult?.selected?.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </button>
                </div>
              </div>

              {/* Live Comparison Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--sp-4)', marginTop: '1.25rem' }}>
                {/* Selected Amount Card */}
                <div style={{ background: 'var(--clr-primary-light)', border: '1px solid #bae6fd', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-primary)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Selected to Pay Now
                  </div>
                  <div style={{ fontSize: 'var(--fs-3xl)', fontWeight: 800, color: 'var(--clr-primary-dim)', marginTop: '0.25rem' }}>
                    ₹{Number(calcResult?.selected?.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)', marginTop: '0.25rem' }}>
                    <strong>{calcResult?.selected?.cycleCount || selectedCycleIds.length}</strong> cycle(s) across <strong>{calcResult?.selected?.farmerCount || 1}</strong> farmer(s)
                  </div>
                </div>

                {/* Current Outstanding */}
                <div style={{ background: 'var(--clr-surface-alt)', border: '1px solid var(--clr-border)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Current Outstanding Balance
                  </div>
                  <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--clr-text)', marginTop: '0.25rem' }}>
                    ₹{Number(calcResult?.current?.totalOutstanding || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)', marginTop: '0.25rem', display: 'flex', gap: '1rem' }}>
                    <span style={{ color: 'var(--clr-danger)' }}>Overdue: ₹{Number(calcResult?.current?.overdueAmount || 0).toFixed(2)}</span>
                    <span style={{ color: 'var(--clr-warning)' }}>Pending: ₹{Number(calcResult?.current?.pendingAmount || 0).toFixed(2)}</span>
                  </div>
                </div>

                {/* Simulated After-Payment Balance */}
                <div style={{ background: 'var(--clr-success-light)', border: '1px solid var(--clr-success-border)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-success)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Balance After This Payment
                  </div>
                  <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--clr-success)', marginTop: '0.25rem' }}>
                    ₹{Number(calcResult?.afterPayment?.totalOutstanding || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)', marginTop: '0.25rem', display: 'flex', gap: '1rem' }}>
                    <span style={{ color: Number(calcResult?.afterPayment?.overdueAmount || 0) > 0 ? 'var(--clr-danger)' : 'var(--clr-success)' }}>
                      Remaining Overdue: ₹{Number(calcResult?.afterPayment?.overdueAmount || 0).toFixed(2)}
                    </span>
                    <span>Remaining Pending: ₹{Number(calcResult?.afterPayment?.pendingAmount || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Selected Cycles Itemized Detail */}
              {calcResult?.selectedCycles?.length > 0 && (
                <div style={{ marginTop: '1.25rem' }}>
                  <h4 style={{ fontSize: 'var(--fs-sm)', color: 'var(--clr-text-muted)', marginBottom: '0.5rem' }}>
                    Itemized Breakdown of Selected Cycles ({calcResult.selectedCycles.length}):
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
                    {calcResult.selectedCycles.map((c) => (
                      <div
                        key={c.cycleId}
                        style={{
                          background: 'var(--clr-surface-alt)',
                          border: '1px solid var(--clr-border)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '0.75rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <strong>{c.farmerName}</strong>
                            <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-dim)' }}>
                              Cycle #{c.cycleId} ({c.startDate} → {c.endDate})
                            </div>
                          </div>
                          <strong style={{ color: 'var(--clr-success)', fontSize: 'var(--fs-md)' }}>
                            ₹{Number(c.finalAmount).toFixed(2)}
                          </strong>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-muted)', marginTop: '0.4rem', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Milk: {Number(c.totalLiters).toFixed(2)}L @ ₹{c.ratePerLiter}/L = ₹{Number(c.grossAmount).toFixed(2)}</span>
                          <span style={{ color: c.feedDeduction > 0 ? 'var(--clr-danger)' : 'var(--clr-text-dim)' }}>
                            Feed: -₹{Number(c.feedDeduction).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════
              FARMERS BILLING CYCLES & PAYOUT PROGRESS TABLE
              ═══════════════════════════════════════════════════ */}
          <div className="card" style={{ marginBottom: 'var(--sp-8)' }}>
            <div className="card-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 className="card-title">📋 Farmers Billing Cycles & Payout Progress</h3>
                <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-dim)', marginTop: '0.25rem' }}>
                  Select one or more cycles to activate real-time calculation and execute instant settlements
                </p>
              </div>

              {/* Filters & Search Toolbar */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="🔍 Search farmer name / phone..."
                  className="form-input"
                  style={{ width: 220, padding: '0.4rem 0.65rem', fontSize: 'var(--fs-xs)' }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />

                <select
                  className="form-select"
                  style={{ padding: '0.4rem 0.65rem', fontSize: 'var(--fs-xs)' }}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All Statuses ({allCycles.length})</option>
                  <option value="overdue">🚨 Overdue Only ({data?.overdue_farmers || 0})</option>
                  <option value="due_today">🔔 Due Today ({data?.farmers_due_today || 0})</option>
                  <option value="upcoming">📅 Upcoming ({data?.upcoming_payment_count || 0})</option>
                </select>

                {selectedCycleIds.length > 0 && (
                  <span className="badge badge-active" style={{ fontSize: 'var(--fs-xs)' }}>
                    {selectedCycleIds.length} Selected
                  </span>
                )}
              </div>
            </div>

            {filteredCycles.length === 0 ? (
              <div className="empty-state">
                <div className="icon">🔄</div>
                <p>No billing cycles match your filter criteria.</p>
                {searchQuery && (
                  <button className="btn btn-outline btn-sm" onClick={() => { setSearchQuery(''); setStatusFilter('all'); }} style={{ marginTop: '0.5rem' }}>
                    Clear Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 44, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isAllVisibleSelected}
                          onChange={handleToggleAll}
                          title="Select / Deselect All Visible Cycles"
                          style={{ width: 18, height: 18, cursor: 'pointer' }}
                        />
                      </th>
                      <th>Farmer</th>
                      <th>Cycle Dates</th>
                      <th>Rate</th>
                      <th>Total Milk</th>
                      <th>Gross Amount</th>
                      <th>Feed Deduct</th>
                      <th>Net Amount to Pay</th>
                      <th>Due Date / Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCycles.map((item) => {
                      const isSelected = selectedCycleIds.includes(item.cycleId);
                      const farmerCyclesCount = allCycles.filter((c) => c.farmerId === item.farmerId).length;

                      return (
                        <tr
                          key={item.cycleId}
                          style={{
                            background: isSelected ? '#eff6ff' : undefined,
                            transition: 'background 0.2s',
                            cursor: 'pointer'
                          }}
                          onClick={(e) => {
                            // If clicking on row directly, toggle checkbox
                            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
                              handleToggleCycle(item.cycleId);
                            }
                          }}
                        >
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleCycle(item.cycleId)}
                              style={{ width: 18, height: 18, cursor: 'pointer' }}
                            />
                          </td>
                          <td>
                            <strong>{item.farmerName}</strong>
                            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-dim)' }}>
                              📞 {item.farmerPhone}
                            </div>
                            {farmerCyclesCount > 1 && (
                              <button
                                className="btn btn-outline btn-sm"
                                style={{ padding: '0.15rem 0.4rem', fontSize: '0.65rem', marginTop: '0.25rem' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectFarmerAllCycles(item.farmerId);
                                }}
                              >
                                Toggle All ({farmerCyclesCount})
                              </button>
                            )}
                          </td>
                          <td>
                            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600 }}>
                              {new Date(item.startDate).toLocaleDateString()} → {new Date(item.endDate).toLocaleDateString()}
                            </div>
                            <span style={{ fontSize: '0.7rem', color: 'var(--clr-text-dim)' }}>
                              {item.durationDays || 15} Days (Cycle #{item.cycleId})
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
                            <strong style={{ color: 'var(--clr-success)', fontSize: '0.95rem' }}>
                              ₹{Number(item.finalAmount || 0).toFixed(2)}
                            </strong>
                          </td>
                          <td>
                            {item.isOverdue ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                <span
                                  className="badge"
                                  style={{ background: 'var(--clr-danger-light)', color: 'var(--clr-danger)', border: '1px solid var(--clr-danger-border)', fontWeight: 700 }}
                                >
                                  ⚠️ {item.overdueDays} Days Overdue
                                </span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--clr-text-dim)' }}>
                                  Due: {new Date(item.paymentDueDate).toLocaleDateString()}
                                </span>
                              </div>
                            ) : item.isDueToday ? (
                              <span className="badge badge-morning" style={{ fontWeight: 700 }}>
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
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick Actions and Metric Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--sp-6)' }}>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">⚡ Quick Management Actions</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <Link to="/milk" className="btn btn-primary" style={{ justifyContent: 'flex-start' }}>
                  <span>🥛</span> Record Daily Milk Entry
                </Link>
                <Link to="/feed" className="btn btn-outline" style={{ justifyContent: 'flex-start' }}>
                  <span>🌾</span> Add Cattle Feed Sale
                </Link>
                <Link to="/payments" className="btn btn-success" style={{ justifyContent: 'flex-start' }}>
                  <span>💳</span> Start New Billing Cycles & Payments
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

      {/* ═══ Confirm Manual Payment Modal ═══ */}
      {confirmModalOpen && calcResult && (
        <div className="modal-overlay" onClick={() => setConfirmModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 550 }}>
            <h3>💳 Confirm Payment Settlement</h3>
            <p style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-sm)', marginBottom: '1.25rem' }}>
              You are about to execute payment for <strong>{calcResult.selected.cycleCount} cycle(s)</strong> across <strong>{calcResult.selected.farmerCount} farmer(s)</strong>.
            </p>

            <div className="summary-row" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: '1.25rem' }}>
              <div className="summary-item">
                <div className="label">Total Amount to Pay</div>
                <div className="value positive" style={{ fontSize: 'var(--fs-2xl)' }}>
                  ₹{Number(calcResult.selected.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div className="summary-item">
                <div className="label">Balance Remaining After</div>
                <div className="value" style={{ fontSize: 'var(--fs-xl)' }}>
                  ₹{Number(calcResult.afterPayment.totalOutstanding).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--clr-border)', borderRadius: 'var(--radius-sm)', padding: '0.5rem', marginBottom: '1.25rem' }}>
              {calcResult.selectedCycles.map((c) => (
                <div key={c.cycleId} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0.5rem', borderBottom: '1px solid var(--clr-border-subtle)', fontSize: 'var(--fs-xs)' }}>
                  <span><strong>{c.farmerName}</strong> (Cycle #{c.cycleId}: {c.startDate} → {c.endDate})</span>
                  <strong style={{ color: 'var(--clr-success)' }}>₹{Number(c.finalAmount).toFixed(2)}</strong>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button
                className="btn btn-outline"
                onClick={() => setConfirmModalOpen(false)}
                disabled={paying}
              >
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={handleExecutePayment}
                disabled={paying}
              >
                {paying ? <span className="spinner"></span> : `Confirm & Pay ₹${Number(calcResult.selected.amount).toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Record Received Payment Modal ═══ */}
      {receiptModalOpen && (
        <div className="modal-overlay" onClick={() => setReceiptModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>🏦 Record Received Company Deposit</h3>
            <p style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-sm)', marginBottom: '1.25rem' }}>
              Record funds received from Hatsun into the dairy company wallet. Expected payment dates are informational; only confirmed receipts are credited.
            </p>

            <form onSubmit={handleRecordReceipt}>
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
                        name="adjDirDash" 
                        value="credit" 
                        checked={adjustmentDirection === 'credit'} 
                        onChange={() => setAdjustmentDirection('credit')}
                      />
                      ➕ Add Funds (Credit)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>
                      <input 
                        type="radio" 
                        name="adjDirDash" 
                        value="debit" 
                        checked={adjustmentDirection === 'debit'} 
                        onChange={() => setAdjustmentDirection('debit')}
                      />
                      ➖ Deduct Funds (Debit)
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
                <label className="form-label">Actual Receipt Date *</label>
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
                  Must be unique. Duplicate reference IDs will be rejected.
                </span>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">Description / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Hatsun payment for Oct 3-13 collection period"
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
                  {submittingReceipt ? <span className="spinner"></span> : 'Credit Wallet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Auto-Distribution Preview & Confirm Modal ═══ */}
      {autoDistModalOpen && (
        <div className="modal-overlay" onClick={() => setAutoDistModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <h3>⚡ Automatic Payment Distribution</h3>
            <p style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-sm)', marginBottom: '1rem' }}>
              Automatically select oldest unpaid cycles within available company wallet balance.
            </p>

            {/* Margin Mode Selector */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <button
                className={`btn btn-sm ${distMode === 'BELOW_BALANCE' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => { setDistMode('BELOW_BALANCE'); handleOpenAutoDistribution('BELOW_BALANCE'); }}
                disabled={loadingDistPreview || confirmingDist}
              >
                Strict Budget (Below Balance)
              </button>
              <button
                className={`btn btn-sm ${distMode === 'WITHIN_MARGIN' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => { setDistMode('WITHIN_MARGIN'); handleOpenAutoDistribution('WITHIN_MARGIN'); }}
                disabled={loadingDistPreview || confirmingDist}
              >
                Allow ₹500 Margin
              </button>
            </div>

            {loadingDistPreview ? (
              <div className="loading-center" style={{ padding: '2rem' }}>
                <div className="spinner spinner-lg"></div>
              </div>
            ) : distPreview ? (
              <>
                <div className="summary-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.25rem' }}>
                  <div className="summary-item">
                    <div className="label">Wallet Balance</div>
                    <div className="value">₹{Number(distPreview.walletBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div className="summary-item">
                    <div className="label">Proposed Payout</div>
                    <div className="value positive">₹{Number(distPreview.proposedTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div className="summary-item">
                    <div className="label">Remaining Balance</div>
                    <div className="value">₹{Number(distPreview.remainingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>

                {distPreview.shortfall > 0 && (
                  <div style={{ background: 'var(--clr-warning-light)', border: '1px solid var(--clr-warning-border)', borderRadius: 'var(--radius-sm)', padding: '0.65rem 0.85rem', marginBottom: '1rem', fontSize: 'var(--fs-xs)', color: 'var(--clr-warning-dim)' }}>
                    ⚠️ Shortfall of ₹{Number(distPreview.shortfall).toFixed(2)} covered by ₹500 tolerance margin.
                  </div>
                )}

                {distPreview.nextUnselectedReason && (
                  <div style={{ background: 'var(--clr-surface-alt)', border: '1px solid var(--clr-border)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem', marginBottom: '1rem', fontSize: '0.75rem', color: 'var(--clr-text-muted)' }}>
                    ℹ️ <strong>Selection cutoff reason:</strong> {distPreview.nextUnselectedReason}
                  </div>
                )}

                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--clr-border)', borderRadius: 'var(--radius-sm)', padding: '0.5rem', marginBottom: '1.25rem' }}>
                  {distPreview.selectedCycles?.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--clr-text-dim)', padding: '1rem' }}>
                      No unpaid cycles can fit within available wallet balance.
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
                    onClick={() => setAutoDistModalOpen(false)}
                    disabled={confirmingDist}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={handleConfirmAutoDistribution}
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
