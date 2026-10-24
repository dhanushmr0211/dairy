const API_BASE = import.meta.env.VITE_API_URL || 'https://dairy-6g3d.onrender.com';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };

  const res = await fetch(url, config);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || `Request failed with status ${res.status}`);
  }

  return data;
}

// ── Dashboard ──
export function getDashboard() {
  return request('/dashboard');
}

// ── Farmers ──
export function getFarmers(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return request(`/farmers${query}`);
}

export function createFarmer(body) {
  return request('/farmers', { method: 'POST', body: JSON.stringify(body) });
}

export function getFarmerSummary(farmerId) {
  return request(`/farmers/${farmerId}/summary`);
}

export function updateFarmerStatus(farmerId, status) {
  return request(`/farmers/${farmerId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// ── Cycles ──
export function startCycle(body) {
  return request('/cycles/start', { method: 'POST', body: JSON.stringify(body) });
}

export function getActiveCycle(farmerId) {
  return request(`/cycles/active/${farmerId}`);
}

export function getCyclesByFarmer(farmerId) {
  return request(`/cycles/farmer/${farmerId}`);
}

export function updateCycle(cycleId, body) {
  return request(`/cycles/${cycleId}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function splitCycle(cycleId, body = {}) {
  return request(`/cycles/${cycleId}/split`, { method: 'POST', body: JSON.stringify(body) });
}

export function extendCycle(cycleId, body = {}) {
  return request(`/cycles/${cycleId}/extend`, { method: 'POST', body: JSON.stringify(body) });
}

export function mergeCycle(cycleId, body = {}) {
  return request(`/cycles/${cycleId}/merge`, { method: 'POST', body: JSON.stringify(body) });
}

export function deleteCycle(cycleId) {
  return request(`/cycles/${cycleId}`, { method: 'DELETE' });
}

// ── Milk ──
export function addMilkEntry(body) {
  return request('/milk', { method: 'POST', body: JSON.stringify(body) });
}

export function getMilkByFarmer(farmerId) {
  return request(`/milk/${farmerId}`);
}

export function updateMilkEntry(entryId, body) {
  return request(`/milk-entries/${entryId}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteMilkEntry(entryId) {
  return request(`/milk-entries/${entryId}`, { method: 'DELETE' });
}

// ── Feed ──
export function addFeedRecord(body) {
  return request('/feed', { method: 'POST', body: JSON.stringify(body) });
}

export function getFeedByFarmer(farmerId) {
  return request(`/feed/${farmerId}`);
}

// ── Payments ──
export function getPaymentPreview(cycleId) {
  return request(`/payments/preview/${cycleId}`);
}

export function getUpcomingPayments(days) {
  const query = days ? `?days=${days}` : '';
  return request(`/payments/upcoming${query}`);
}

export function getPaymentSummary() {
  return request('/payments/summary');
}

export function getSelectedPaymentsPreview(body) {
  return request('/payments/selected', { method: 'POST', body: JSON.stringify(body) });
}

export function paySelectedCycles(body) {
  return request('/payments/pay-selected', { method: 'POST', body: JSON.stringify(body) });
}

export function payCycle(body) {
  return request('/payments/pay', { method: 'POST', body: JSON.stringify(body) });
}

export function getPaymentsByFarmer(farmerId) {
  return request(`/payments/${farmerId}`);
}

// ── Wallet & Automated Distribution ──
export function getWalletBalance() {
  return request('/wallet/balance');
}

export function updateWalletBalance(body) {
  return request('/wallet/balance', { method: 'PUT', body: JSON.stringify(body) });
}

export function getWalletSummary() {
  return request('/wallet/summary');
}

export function getWalletTransactions(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/wallet/transactions${query ? `?${query}` : ''}`);
}

export function deleteWalletTransaction(id) {
  return request(`/wallet/transactions/${id}`, { method: 'DELETE' });
}

export function recordWalletReceipt(body) {
  return request('/wallet/receipt', { method: 'POST', body: JSON.stringify(body) });
}

export function getDistributionPreview(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/wallet/distribution/preview${query ? `?${query}` : ''}`);
}

export function confirmDistribution(body) {
  return request('/wallet/distribution/confirm', { method: 'POST', body: JSON.stringify(body) });
}

export function getDistributionHistory(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/wallet/distribution/history${query ? `?${query}` : ''}`);
}

export function deleteDistributionRecord(id) {
  return request(`/wallet/distributions/${id}`, { method: 'DELETE' });
}

export function clearDistributionRecords(filter = 'all') {
  return request(`/wallet/distributions?filter=${filter}`, { method: 'DELETE' });
}

export function getSettledPayments() {
  return request('/payments/settlements');
}

export function deleteSettledPayment(id) {
  return request(`/payments/${id}`, { method: 'DELETE' });
}

