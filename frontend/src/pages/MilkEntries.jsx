import { useState, useEffect, useMemo } from 'react';
import { Milk, UserCheck, CheckCircle2, PlusCircle, Calendar, Clock, Save, BarChart3, Phone, ClipboardList, RotateCcw, Sun, Moon } from 'lucide-react';
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

  // Group entries by date: 1 row per day with Morning and Evening columns
  const dailyEntries = useMemo(() => {
    const map = new Map();
    for (const entry of entries) {
      const dateKey = typeof entry.date === 'string'
        ? entry.date.split('T')[0]
        : new Date(entry.date).toISOString().split('T')[0];

      if (!map.has(dateKey)) {
        map.set(dateKey, {
          date: dateKey,
          rawDate: entry.date,
          morning: null,
          morningEntryId: null,
          evening: null,
          eveningEntryId: null,
          cycleId: entry.cycle_id,
        });
      }
      const row = map.get(dateKey);
      const liters = Number(entry.liters || 0);
      if (entry.time === 'morning') {
        row.morning = (row.morning !== null ? row.morning : 0) + liters;
        row.morningEntryId = entry.id;
      } else if (entry.time === 'evening') {
        row.evening = (row.evening !== null ? row.evening : 0) + liters;
        row.eveningEntryId = entry.id;
      }
      if (entry.cycle_id) {
        row.cycleId = entry.cycle_id;
      }
    }

    return Array.from(map.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [entries]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* ── Page Header ── */}
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: 'var(--fs-2xl)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <Milk size={28} strokeWidth={2.5} style={{ color: "var(--clr-primary)" }} /> Daily Milk Entry
        </h2>
        <p style={{ fontSize: 'var(--fs-base)', color: 'var(--clr-text-secondary)', margin: 0 }}>
          Record daily morning or evening milk collection for farmers
        </p>
      </div>

      {/* ── Farmer Selection Bar (Large, Clear, High-Contrast) ── */}
      <div 
        style={{ 
          background: '#ffffff', 
          border: '2px solid #bae6fd', 
          borderRadius: 'var(--radius-lg)', 
          padding: '1.25rem 1.5rem', 
          marginBottom: '1.75rem',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: '1.25rem',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <UserCheck size={26} strokeWidth={2.5} style={{ color: "var(--clr-primary)" }} />
          <label 
            htmlFor="milk-farmer-select" 
            style={{ 
              fontWeight: 800, 
              fontSize: 'var(--fs-md)', 
              color: 'var(--clr-text)', 
              margin: 0,
              cursor: 'pointer'
            }}
          >
            Select Farmer:
          </label>
        </div>

        <select
          id="milk-farmer-select"
          className="form-select"
          style={{ 
            flex: '1 1 300px', 
            fontSize: 'var(--fs-md)', 
            padding: '0.75rem 1rem', 
            fontWeight: 600,
            borderRadius: 'var(--radius-md)',
            border: '2px solid #94a3b8',
            color: '#0f172a',
            backgroundColor: '#ffffff'
          }}
          value={selectedFarmerId}
          onChange={(e) => setSelectedFarmerId(e.target.value)}
        >
          {farmers.length === 0 && <option value="">No farmers found</option>}
          {farmers.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} — Phone: {f.phone}
            </option>
          ))}
        </select>

        {selectedFarmer && (
          <span 
            style={{ 
              background: '#e0f2fe', 
              color: '#0369a1', 
              padding: '0.45rem 1rem', 
              borderRadius: '9999px', 
              fontWeight: 700, 
              fontSize: 'var(--fs-sm)',
              border: '1px solid #7dd3fc'
            }}
          >
            <CheckCircle2 size={16} strokeWidth={2.5} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} /> Selected: {selectedFarmer.name}
          </span>
        )}
      </div>

      {/* ── Main Milk Entry Form Card ── */}
      <div style={{ marginBottom: '2rem' }}>
        <div 
          className="card"
          style={{
            padding: '1.75rem',
            border: '2px solid var(--clr-primary)',
            boxShadow: 'var(--shadow-md)',
            borderRadius: 'var(--radius-xl)'
          }}
        >
          <div className="card-header" style={{ marginBottom: '1.5rem', borderBottom: '2px solid #f1f5f9', paddingBottom: '1rem' }}>
            <h3 className="card-title" style={{ fontSize: 'var(--fs-xl)', color: 'var(--clr-primary-dim)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <PlusCircle size={22} strokeWidth={2.5} /> Enter Milk Details
            </h3>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Collection Date */}
              <div className="form-group">
                <label 
                  htmlFor="milk-date-input" 
                  style={{ 
                    fontSize: 'var(--fs-sm)', 
                    fontWeight: 700, 
                    color: '#1e293b', 
                    marginBottom: '0.35rem', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.35rem' 
                  }}
                >
                  <Calendar size={18} strokeWidth={2.5} style={{ color: "var(--clr-primary)" }} /> Date of Collection:
                </label>
                <input
                  id="milk-date-input"
                  type="date"
                  className="form-input"
                  style={{
                    fontSize: 'var(--fs-md)',
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    border: '2px solid #cbd5e1',
                    fontWeight: 600
                  }}
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>

              {/* Shift Selection */}
              <div className="form-group">
                <label 
                  htmlFor="milk-shift-select" 
                  style={{ 
                    fontSize: 'var(--fs-sm)', 
                    fontWeight: 700, 
                    color: '#1e293b', 
                    marginBottom: '0.35rem', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.35rem' 
                  }}
                >
                  <Clock size={18} strokeWidth={2.5} style={{ color: "var(--clr-primary)" }} /> Time / Shift:
                </label>
                <select
                  id="milk-shift-select"
                  className="form-select"
                  style={{
                    fontSize: 'var(--fs-md)',
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    border: '2px solid #cbd5e1',
                    fontWeight: 600
                  }}
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                >
                  <option value="morning">Morning (AM) Collection</option>
                  <option value="evening">Evening (PM) Collection</option>
                </select>
              </div>

              {/* Quantity in Liters */}
              <div className="form-group">
                <label 
                  htmlFor="milk-liters-input" 
                  style={{ 
                    fontSize: 'var(--fs-md)', 
                    fontWeight: 800, 
                    color: 'var(--clr-primary-dim)', 
                    marginBottom: '0.35rem', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.35rem' 
                  }}
                >
                  <Milk size={18} strokeWidth={2.5} style={{ color: "var(--clr-primary)" }} /> Milk Quantity (Liters):
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="milk-liters-input"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Enter liters (e.g. 15.00)"
                    className="form-input"
                    style={{
                      fontSize: '1.35rem',
                      fontWeight: 800,
                      padding: '0.85rem 3.5rem 0.85rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      border: '2px solid var(--clr-primary)',
                      background: '#f0f9ff',
                      color: '#0369a1',
                      width: '100%'
                    }}
                    value={formData.liters}
                    onChange={(e) => setFormData({ ...formData, liters: e.target.value })}
                    required
                  />
                  <span 
                    style={{ 
                      position: 'absolute', 
                      right: '1rem', 
                      top: '50%', 
                      transform: 'translateY(-50%)', 
                      fontWeight: 800, 
                      color: 'var(--clr-primary)', 
                      fontSize: '1.1rem',
                      pointerEvents: 'none'
                    }}
                  >
                    L
                  </span>
                </div>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)', marginTop: '0.2rem' }}>
                  Type exact milk measurement in litres and click Save below
                </span>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ 
                width: '100%', 
                marginTop: '1.75rem', 
                padding: '0.95rem 1.5rem', 
                fontSize: 'var(--fs-lg)', 
                fontWeight: 800,
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
              disabled={submitting || !selectedFarmerId}
            >
              {submitting ? (
                <>
                  <span className="spinner"></span> Saving...
                </>
              ) : (
                <>
                  <Save size={20} strokeWidth={2.5} style={{ display: "inline", verticalAlign: "middle", marginRight: "6px" }} /> Save Milk Record
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* ── Milk History Records Table (1 Row Per Date with Morning & Evening Columns) ── */}
      <div className="card" style={{ padding: '1.75rem', borderRadius: 'var(--radius-xl)' }}>
        <div className="card-header" style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 className="card-title" style={{ fontSize: 'var(--fs-lg)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ClipboardList size={22} strokeWidth={2.5} style={{ color: "var(--clr-primary)" }} /> Milk History: {selectedFarmer?.name || "Farmer"}
            </h3>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)' }}>
              Showing {dailyEntries.length} collection day{dailyEntries.length === 1 ? '' : 's'} ({entries.length} total shift entries)
            </span>
          </div>

          <button
            className="btn btn-outline btn-sm"
            style={{ padding: '0.5rem 1rem', fontSize: 'var(--fs-sm)', fontWeight: 600 }}
            onClick={() => fetchEntries(selectedFarmerId)}
            disabled={loadingEntries}
          >
            <RotateCcw size={16} strokeWidth={2.5} style={{ display: "inline", verticalAlign: "middle", marginRight: "6px" }} /> Refresh Records
          </button>
        </div>

        {loadingEntries ? (
          <div className="loading-center" style={{ padding: '3rem 0' }}>
            <div className="spinner spinner-lg"></div>
          </div>
        ) : dailyEntries.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem 1rem' }}>
            <div className="icon" style={{ display: "flex", justifyContent: "center", marginBottom: "0.5rem" }}>
              <Milk size={48} strokeWidth={2.5} style={{ opacity: 0.3 }} />
            </div>
            <p style={{ fontSize: 'var(--fs-md)', marginTop: '0.5rem' }}>
              No milk entries recorded for {selectedFarmer?.name || 'this farmer'} yet.
            </p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ padding: '1rem', fontSize: 'var(--fs-sm)' }}>Date</th>
                  <th style={{ padding: '1rem', fontSize: 'var(--fs-sm)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Sun size={16} strokeWidth={2.5} style={{ color: '#d97706' }} /> Morning (AM)
                    </span>
                  </th>
                  <th style={{ padding: '1rem', fontSize: 'var(--fs-sm)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Moon size={16} strokeWidth={2.5} style={{ color: '#4f46e5' }} /> Evening (PM)
                    </span>
                  </th>
                  <th style={{ padding: '1rem', fontSize: 'var(--fs-sm)' }}>Daily Total</th>
                  <th style={{ padding: '1rem', fontSize: 'var(--fs-sm)' }}>Billing Cycle</th>
                </tr>
              </thead>
              <tbody>
                {dailyEntries.map((row) => {
                  const dayTotal = (row.morning || 0) + (row.evening || 0);
                  const dateObj = new Date(row.rawDate || row.date);
                  const formattedDate = dateObj.toLocaleDateString(undefined, { 
                    weekday: 'short',
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                  });

                  return (
                    <tr key={row.date}>
                      <td style={{ padding: '1.1rem 1rem', fontSize: 'var(--fs-base)', fontWeight: 700 }}>
                        {formattedDate}
                      </td>
                      <td style={{ padding: '1.1rem 1rem' }}>
                        {row.morning !== null ? (
                          <span 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '6px', 
                              fontSize: 'var(--fs-base)', 
                              fontWeight: 700, 
                              color: '#92400e', 
                              background: '#fef3c7', 
                              border: '1px solid #fde68a', 
                              padding: '0.3rem 0.75rem', 
                              borderRadius: '8px' 
                            }}
                          >
                            <Sun size={15} strokeWidth={2.5} /> {Number(row.morning).toFixed(2)} L
                          </span>
                        ) : (
                          <span style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-md)', fontWeight: 600 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '1.1rem 1rem' }}>
                        {row.evening !== null ? (
                          <span 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '6px', 
                              fontSize: 'var(--fs-base)', 
                              fontWeight: 700, 
                              color: '#3730a3', 
                              background: '#e0e7ff', 
                              border: '1px solid #c7d2fe', 
                              padding: '0.3rem 0.75rem', 
                              borderRadius: '8px' 
                            }}
                          >
                            <Moon size={15} strokeWidth={2.5} /> {Number(row.evening).toFixed(2)} L
                          </span>
                        ) : (
                          <span style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-md)', fontWeight: 600 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '1.1rem 1rem' }}>
                        <strong style={{ color: 'var(--clr-primary-dim)', fontSize: '1.25rem', fontWeight: 800 }}>
                          {dayTotal.toFixed(2)} L
                        </strong>
                      </td>
                      <td style={{ padding: '1.1rem 1rem', fontSize: 'var(--fs-sm)', color: 'var(--clr-text-secondary)', fontWeight: 600 }}>
                        Cycle #{row.cycleId}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Collection Summary (Placed After Milk History Table) ── */}
      <div 
        className="card"
        style={{
          marginTop: '2rem',
          padding: '1.75rem',
          borderRadius: 'var(--radius-xl)',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          border: '1px solid var(--clr-border)',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div className="card-header" style={{ marginBottom: '1.25rem', borderBottom: '2px solid #f1f5f9', paddingBottom: '0.75rem' }}>
          <h3 className="card-title" style={{ fontSize: 'var(--fs-lg)', color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <BarChart3 size={20} strokeWidth={2.5} style={{ color: "var(--clr-primary)" }} /> Collection Summary
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', alignItems: 'center' }}>
          <div style={{ padding: '1.25rem', background: '#ffffff', borderRadius: 'var(--radius-md)', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Selected Farmer
            </div>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--clr-text)', marginTop: '0.25rem' }}>
              {selectedFarmer?.name || 'None selected'}
            </div>
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--clr-text-secondary)', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Phone size={14} strokeWidth={2.5} /> {selectedFarmer?.phone || "—"}
            </div>
            <p style={{ color: 'var(--clr-text-secondary)', fontSize: 'var(--fs-xs)', lineHeight: 1.5, marginTop: '0.75rem', marginBottom: 0 }}>
              Milk entered here is automatically assigned to {selectedFarmer?.name || 'this farmer'}&apos;s current active billing cycle.
            </p>
          </div>

          <div 
            style={{ 
              padding: '1.5rem', 
              background: '#ecfdf5', 
              border: '2px solid #a7f3d0', 
              borderRadius: 'var(--radius-lg)',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>
              Total Milk Recorded for this Farmer
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#059669', marginTop: '0.25rem' }}>
              {entries.reduce((acc, curr) => acc + Number(curr.liters || 0), 0).toFixed(2)}{' '}
              <span style={{ fontSize: '1.25rem' }}>L</span>
            </div>
            <div style={{ fontSize: 'var(--fs-xs)', color: '#065f46', marginTop: '0.25rem' }}>
              Across {entries.length} recorded collection entries ({dailyEntries.length} active collection days)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
