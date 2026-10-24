import { useState, useEffect, useMemo } from 'react';
import { 
  Milk, 
  UserCheck, 
  CheckCircle2, 
  PlusCircle, 
  Calendar, 
  Clock, 
  Save, 
  BarChart3, 
  Phone, 
  ClipboardList, 
  RotateCcw, 
  Sun, 
  Moon,
  Pencil,
  Trash2,
  X,
  AlertTriangle
} from 'lucide-react';
import { getFarmers, addMilkEntry, getMilkByFarmer, updateMilkEntry, deleteMilkEntry } from '../api';
import { useToast } from '../context/ToastContext';
import { formatDate } from '../utils/date';

export default function MilkEntries() {
  const [farmers, setFarmers] = useState([]);
  const [selectedFarmerId, setSelectedFarmerId] = useState('');
  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Edit modal state
  const [editingEntry, setEditingEntry] = useState(null);
  const [editFormData, setEditFormData] = useState({
    farmerId: '',
    date: '',
    time: 'morning',
    liters: '',
  });
  const [updatingEntry, setUpdatingEntry] = useState(false);

  // Delete modal state
  const [entryToDelete, setEntryToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  // ── Edit Entry Handlers ──
  const openEditModal = (entry) => {
    if (!entry) return;
    const formattedDate = typeof entry.date === 'string'
      ? entry.date.split('T')[0]
      : new Date(entry.date).toISOString().split('T')[0];

    setEditingEntry(entry);
    setEditFormData({
      farmerId: String(entry.farmer_id),
      date: formattedDate,
      time: entry.time,
      liters: String(entry.liters),
    });
  };

  const closeEditModal = () => {
    setEditingEntry(null);
    setUpdatingEntry(false);
  };

  const handleUpdateSubmit = async (e) => {
    e.preventDefault();
    if (!editingEntry) return;

    if (!editFormData.liters || Number(editFormData.liters) <= 0) {
      showToast('Milk quantity must be greater than 0', 'error');
      return;
    }

    try {
      setUpdatingEntry(true);
      await updateMilkEntry(editingEntry.id, {
        farmerId: Number(editFormData.farmerId),
        date: editFormData.date,
        time: editFormData.time,
        liters: Number(editFormData.liters),
      });

      showToast('Milk entry updated successfully!');
      closeEditModal();
      fetchEntries(selectedFarmerId);
    } catch (err) {
      showToast(err.message || 'Failed to update milk entry', 'error');
    } finally {
      setUpdatingEntry(false);
    }
  };

  // ── Delete Entry Handlers ──
  const openDeleteModal = (entry) => {
    if (!entry) return;
    setEntryToDelete(entry);
  };

  const closeDeleteModal = () => {
    setEntryToDelete(null);
    setDeleting(false);
  };

  const handleConfirmDelete = async () => {
    if (!entryToDelete) return;

    try {
      setDeleting(true);
      await deleteMilkEntry(entryToDelete.id);
      showToast('Milk entry deleted successfully!');
      closeDeleteModal();
      fetchEntries(selectedFarmerId);
    } catch (err) {
      showToast(err.message || 'Failed to delete milk entry', 'error');
    } finally {
      setDeleting(false);
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
          morningEntry: null,
          evening: null,
          eveningEntry: null,
          cycleId: entry.cycle_id,
        });
      }
      const row = map.get(dateKey);
      const liters = Number(entry.liters || 0);
      if (entry.time === 'morning') {
        row.morning = (row.morning !== null ? row.morning : 0) + liters;
        row.morningEntry = entry;
      } else if (entry.time === 'evening') {
        row.evening = (row.evening !== null ? row.evening : 0) + liters;
        row.eveningEntry = entry;
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
          Record, correct, or review daily morning and evening milk collection for farmers
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

        <div style={{ flex: '1 1 300px', minWidth: '260px' }}>
          <select
            id="milk-farmer-select"
            className="form-select"
            style={{
              fontSize: 'var(--fs-lg)',
              fontWeight: 700,
              padding: '0.75rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              border: '2px solid var(--clr-primary)',
              background: '#f8fafc',
              color: 'var(--clr-text)',
              width: '100%',
              cursor: 'pointer'
            }}
            value={selectedFarmerId}
            onChange={(e) => setSelectedFarmerId(e.target.value)}
          >
            <option value="" disabled>-- Choose a Farmer --</option>
            {farmers.map((farmer) => (
              <option key={farmer.id} value={farmer.id}>
                {farmer.name} ({farmer.phone || 'No phone'}) - Rate: ₹{Number(farmer.rate_per_liter || 0).toFixed(2)}/L
              </option>
            ))}
          </select>
        </div>

        {selectedFarmer && (
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem',
              background: '#f0fdf4',
              padding: '0.6rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              border: '1.5px solid #86efac'
            }}
          >
            <CheckCircle2 size={20} strokeWidth={2.5} style={{ color: "#16a34a" }} />
            <div>
              <span style={{ fontSize: 'var(--fs-xs)', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>
                Active Profile
              </span>
              <div style={{ fontSize: 'var(--fs-md)', fontWeight: 800, color: '#14532d' }}>
                {selectedFarmer.name}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Main Layout: Record Milk Entry Form ── */}
      <div className="card" style={{ padding: '1.75rem', marginBottom: '2rem', borderRadius: 'var(--radius-xl)' }}>
        <div className="card-header" style={{ marginBottom: '1.5rem', borderBottom: '2px solid #f1f5f9', paddingBottom: '0.75rem' }}>
          <h3 className="card-title" style={{ fontSize: 'var(--fs-xl)', color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PlusCircle size={24} strokeWidth={2.5} style={{ color: "var(--clr-primary)" }} /> Record Milk Entry
          </h3>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--clr-text-secondary)', fontWeight: 500 }}>
            Enter morning or evening milk quantity for the selected date
          </span>
        </div>

        <div>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
              {/* Date Selection */}
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
                  <Calendar size={18} strokeWidth={2.5} style={{ color: "var(--clr-primary)" }} /> Entry Date:
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

      {/* ── Milk History Records Table (1 Row Per Date with Morning & Evening Columns + Edit/Delete) ── */}
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
                  const formattedDate = formatDate(row.rawDate || row.date);

                  return (
                    <tr key={row.date}>
                      <td style={{ padding: '1.1rem 1rem', fontSize: 'var(--fs-base)', fontWeight: 700 }}>
                        {formattedDate}
                      </td>

                      {/* Morning Session Cell with Quick Edit & Delete */}
                      <td style={{ padding: '1.1rem 1rem' }}>
                        {row.morning !== null && row.morningEntry ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
                                padding: '0.35rem 0.75rem', 
                                borderRadius: '8px' 
                              }}
                            >
                              <Sun size={15} strokeWidth={2.5} /> {Number(row.morning).toFixed(2)} L
                            </span>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <button
                                type="button"
                                title="Edit Morning Milk Entry"
                                onClick={() => openEditModal(row.morningEntry)}
                                style={{
                                  background: '#ffffff',
                                  border: '1.5px solid #bae6fd',
                                  borderRadius: '6px',
                                  padding: '4px 8px',
                                  cursor: 'pointer',
                                  color: '#0284c7',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <Pencil size={12} strokeWidth={2.5} /> Edit
                              </button>
                              <button
                                type="button"
                                title="Delete Morning Milk Entry"
                                onClick={() => openDeleteModal(row.morningEntry)}
                                style={{
                                  background: '#ffffff',
                                  border: '1.5px solid #fecaca',
                                  borderRadius: '6px',
                                  padding: '4px 8px',
                                  cursor: 'pointer',
                                  color: '#dc2626',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <Trash2 size={12} strokeWidth={2.5} /> Del
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-md)', fontWeight: 600 }}>—</span>
                        )}
                      </td>

                      {/* Evening Session Cell with Quick Edit & Delete */}
                      <td style={{ padding: '1.1rem 1rem' }}>
                        {row.evening !== null && row.eveningEntry ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
                                padding: '0.35rem 0.75rem', 
                                borderRadius: '8px' 
                              }}
                            >
                              <Moon size={15} strokeWidth={2.5} /> {Number(row.evening).toFixed(2)} L
                            </span>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <button
                                type="button"
                                title="Edit Evening Milk Entry"
                                onClick={() => openEditModal(row.eveningEntry)}
                                style={{
                                  background: '#ffffff',
                                  border: '1.5px solid #bae6fd',
                                  borderRadius: '6px',
                                  padding: '4px 8px',
                                  cursor: 'pointer',
                                  color: '#0284c7',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <Pencil size={12} strokeWidth={2.5} /> Edit
                              </button>
                              <button
                                type="button"
                                title="Delete Evening Milk Entry"
                                onClick={() => openDeleteModal(row.eveningEntry)}
                                style={{
                                  background: '#ffffff',
                                  border: '1.5px solid #fecaca',
                                  borderRadius: '6px',
                                  padding: '4px 8px',
                                  cursor: 'pointer',
                                  color: '#dc2626',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <Trash2 size={12} strokeWidth={2.5} /> Del
                              </button>
                            </div>
                          </div>
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

      {/* ── Edit Milk Entry Modal ── */}
      {editingEntry && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={closeEditModal}
        >
          <div 
            style={{
              background: '#ffffff',
              borderRadius: 'var(--radius-xl)',
              maxWidth: '520px',
              width: '100%',
              boxShadow: 'var(--shadow-xl)',
              border: '1px solid var(--clr-border)',
              overflow: 'hidden',
              animation: 'fadeIn 0.15s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              style={{ 
                padding: '1.25rem 1.5rem', 
                borderBottom: '1px solid #e2e8f0', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                background: '#f8fafc' 
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Pencil size={20} strokeWidth={2.5} style={{ color: 'var(--clr-primary)' }} />
                <h3 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 800, color: 'var(--clr-text)' }}>
                  Edit Milk Entry #{editingEntry.id}
                </h3>
              </div>
              <button 
                type="button"
                onClick={closeEditModal}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--clr-text-muted)',
                  padding: '4px',
                  borderRadius: '6px'
                }}
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit} style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Farmer Select */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label 
                    style={{ 
                      fontSize: 'var(--fs-sm)', 
                      fontWeight: 700, 
                      color: 'var(--clr-text)', 
                      marginBottom: '0.35rem', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.35rem' 
                    }}
                  >
                    <UserCheck size={16} strokeWidth={2.5} style={{ color: 'var(--clr-primary)' }} /> Farmer:
                  </label>
                  <select
                    className="form-select"
                    style={{
                      fontSize: 'var(--fs-base)',
                      fontWeight: 600,
                      padding: '0.7rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      border: '2px solid #cbd5e1',
                      width: '100%'
                    }}
                    value={editFormData.farmerId}
                    onChange={(e) => setEditFormData({ ...editFormData, farmerId: e.target.value })}
                    required
                  >
                    {farmers.map((farmer) => (
                      <option key={farmer.id} value={farmer.id}>
                        {farmer.name} ({farmer.phone || 'No phone'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Entry Date */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label 
                    style={{ 
                      fontSize: 'var(--fs-sm)', 
                      fontWeight: 700, 
                      color: 'var(--clr-text)', 
                      marginBottom: '0.35rem', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.35rem' 
                    }}
                  >
                    <Calendar size={16} strokeWidth={2.5} style={{ color: 'var(--clr-primary)' }} /> Entry Date:
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    style={{
                      fontSize: 'var(--fs-base)',
                      fontWeight: 600,
                      padding: '0.7rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      border: '2px solid #cbd5e1',
                      width: '100%'
                    }}
                    value={editFormData.date}
                    onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                    required
                  />
                </div>

                {/* Session / Shift */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label 
                    style={{ 
                      fontSize: 'var(--fs-sm)', 
                      fontWeight: 700, 
                      color: 'var(--clr-text)', 
                      marginBottom: '0.35rem', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.35rem' 
                    }}
                  >
                    <Clock size={16} strokeWidth={2.5} style={{ color: 'var(--clr-primary)' }} /> Shift / Session:
                  </label>
                  <select
                    className="form-select"
                    style={{
                      fontSize: 'var(--fs-base)',
                      fontWeight: 600,
                      padding: '0.7rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      border: '2px solid #cbd5e1',
                      width: '100%'
                    }}
                    value={editFormData.time}
                    onChange={(e) => setEditFormData({ ...editFormData, time: e.target.value })}
                    required
                  >
                    <option value="morning">Morning (AM)</option>
                    <option value="evening">Evening (PM)</option>
                  </select>
                </div>

                {/* Liters Input */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label 
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
                    <Milk size={16} strokeWidth={2.5} style={{ color: 'var(--clr-primary)' }} /> Milk Quantity (Liters):
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="form-input"
                      style={{
                        fontSize: '1.25rem',
                        fontWeight: 800,
                        padding: '0.75rem 3rem 0.75rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        border: '2px solid var(--clr-primary)',
                        background: '#f0f9ff',
                        color: '#0369a1',
                        width: '100%'
                      }}
                      value={editFormData.liters}
                      onChange={(e) => setEditFormData({ ...editFormData, liters: e.target.value })}
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
                        fontSize: '1rem',
                        pointerEvents: 'none'
                      }}
                    >
                      L
                    </span>
                  </div>
                </div>
              </div>

              <div 
                style={{ 
                  marginTop: '1.75rem', 
                  display: 'flex', 
                  justifyContent: 'flex-end', 
                  gap: '0.75rem' 
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={closeEditModal}
                  disabled={updatingEntry}
                  style={{ fontWeight: 600, padding: '0.65rem 1.25rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={updatingEntry}
                  style={{ 
                    fontWeight: 800, 
                    padding: '0.65rem 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {updatingEntry ? (
                    <>
                      <span className="spinner"></span> Updating...
                    </>
                  ) : (
                    <>
                      <Save size={16} strokeWidth={2.5} /> Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {entryToDelete && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={closeDeleteModal}
        >
          <div 
            style={{
              background: '#ffffff',
              borderRadius: 'var(--radius-xl)',
              maxWidth: '460px',
              width: '100%',
              boxShadow: 'var(--shadow-xl)',
              border: '1px solid #fee2e2',
              overflow: 'hidden',
              animation: 'fadeIn 0.15s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              style={{ 
                padding: '1.25rem 1.5rem', 
                borderBottom: '1px solid #fee2e2', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                background: '#fef2f2' 
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={22} strokeWidth={2.5} style={{ color: '#dc2626' }} />
                <h3 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 800, color: '#991b1b' }}>
                  Delete Milk Entry
                </h3>
              </div>
              <button 
                type="button"
                onClick={closeDeleteModal}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--clr-text-muted)',
                  padding: '4px',
                  borderRadius: '6px'
                }}
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            <div style={{ padding: '1.5rem' }}>
              <p style={{ margin: '0 0 1rem 0', fontSize: 'var(--fs-base)', color: 'var(--clr-text)' }}>
                Are you sure you want to delete this milk entry? Only this individual entry will be removed:
              </p>

              <div 
                style={{ 
                  background: '#f8fafc', 
                  border: '1.5px solid #e2e8f0', 
                  borderRadius: 'var(--radius-md)', 
                  padding: '1rem',
                  marginBottom: '1rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--clr-text-secondary)', fontWeight: 600 }}>Date:</span>
                  <strong style={{ fontSize: 'var(--fs-sm)', color: 'var(--clr-text)' }}>
                    {formatDate(entryToDelete.date)}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--clr-text-secondary)', fontWeight: 600 }}>Shift:</span>
                  <strong style={{ fontSize: 'var(--fs-sm)', textTransform: 'capitalize', color: 'var(--clr-text)' }}>
                    {entryToDelete.time}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--clr-text-secondary)', fontWeight: 600 }}>Quantity:</span>
                  <strong style={{ fontSize: 'var(--fs-base)', color: '#dc2626', fontWeight: 800 }}>
                    {Number(entryToDelete.liters).toFixed(2)} Litres
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--clr-text-secondary)', fontWeight: 600 }}>Cycle ID:</span>
                  <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--clr-text-muted)' }}>
                    #{entryToDelete.cycle_id}
                  </span>
                </div>
              </div>

              <div 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'flex-end', 
                  gap: '0.75rem',
                  marginTop: '1.5rem'
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={closeDeleteModal}
                  disabled={deleting}
                  style={{ fontWeight: 600, padding: '0.65rem 1.25rem' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  style={{ 
                    background: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 800, 
                    padding: '0.65rem 1.5rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {deleting ? (
                    <>
                      <span className="spinner"></span> Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} strokeWidth={2.5} /> Delete Entry
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
