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
export function getFarmers() {
  return request('/farmers');
}

export function createFarmer(body) {
  return request('/farmers', { method: 'POST', body: JSON.stringify(body) });
}

export function getFarmerSummary(farmerId) {
  return request(`/farmers/${farmerId}/summary`);
}

// ── Cycles ──
export function startCycle(body) {
  return request('/cycles/start', { method: 'POST', body: JSON.stringify(body) });
}

export function getActiveCycle(farmerId) {
  return request(`/cycles/active/${farmerId}`);
}

// ── Milk ──
export function addMilkEntry(body) {
  return request('/milk', { method: 'POST', body: JSON.stringify(body) });
}

export function getMilkByFarmer(farmerId) {
  return request(`/milk/${farmerId}`);
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

export function payCycle(body) {
  return request('/payments/pay', { method: 'POST', body: JSON.stringify(body) });
}

export function getPaymentsByFarmer(farmerId) {
  return request(`/payments/${farmerId}`);
}
