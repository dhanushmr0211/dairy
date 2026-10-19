const db = require('../config/db');
const crypto = require('crypto');

/**
 * Create a distribution preview record.
 */
async function createPreview(
  { mode, margin, walletBalance, proposedTotal, selectedCycleCount, selectedFarmerCount, remainingBalance, shortfall, nextUnselectedReason, previewHash, idempotencyKey },
  client = db
) {
  const result = await client.query(
    `INSERT INTO distribution_previews
       (status, mode, margin, wallet_balance_at_preview, proposed_total, selected_cycle_count, selected_farmer_count, remaining_balance, shortfall, next_unselected_reason, preview_hash, idempotency_key)
     VALUES ('pending', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, status, mode, margin, wallet_balance_at_preview, proposed_total, selected_cycle_count, selected_farmer_count, remaining_balance, shortfall, next_unselected_reason, preview_hash, idempotency_key, confirmed_at, created_at, expires_at`,
    [mode, margin, walletBalance, proposedTotal, selectedCycleCount, selectedFarmerCount, remainingBalance, shortfall, nextUnselectedReason || null, previewHash, idempotencyKey || null]
  );

  return result.rows[0];
}

/**
 * Add selected cycles to a distribution preview.
 */
async function addDistributionCycles(distributionId, cycles, client = db) {
  if (!cycles || cycles.length === 0) return [];

  const values = [];
  const params = [];
  let paramIdx = 1;

  for (const cycle of cycles) {
    values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
    params.push(distributionId, cycle.cycleId, cycle.farmerId, cycle.calculatedAmount);
  }

  const result = await client.query(
    `INSERT INTO distribution_cycles (distribution_id, cycle_id, farmer_id, calculated_amount)
     VALUES ${values.join(', ')}
     RETURNING id, distribution_id, cycle_id, farmer_id, calculated_amount, payment_id, created_at`,
    params
  );

  return result.rows;
}

/**
 * Find a distribution preview by ID.
 */
async function findPreviewById(previewId, client = db) {
  const result = await client.query(
    `SELECT id, status, mode, margin, wallet_balance_at_preview, proposed_total, selected_cycle_count, selected_farmer_count, remaining_balance, shortfall, next_unselected_reason, preview_hash, idempotency_key, confirmed_at, created_at, expires_at
     FROM distribution_previews
     WHERE id = $1
     LIMIT 1`,
    [previewId]
  );
  return result.rows[0] || null;
}

/**
 * Find and lock a distribution preview by ID for update.
 */
async function findPreviewByIdForUpdate(previewId, client) {
  const result = await client.query(
    `SELECT id, status, mode, margin, wallet_balance_at_preview, proposed_total, selected_cycle_count, selected_farmer_count, remaining_balance, shortfall, next_unselected_reason, preview_hash, idempotency_key, confirmed_at, created_at, expires_at
     FROM distribution_previews
     WHERE id = $1
     FOR UPDATE`,
    [previewId]
  );
  return result.rows[0] || null;
}

/**
 * Get the selected cycles for a distribution preview.
 */
async function getDistributionCycles(distributionId, client = db) {
  const result = await client.query(
    `SELECT dc.id, dc.distribution_id, dc.cycle_id, dc.farmer_id, dc.calculated_amount, dc.payment_id,
            f.name AS farmer_name, f.phone AS farmer_phone,
            c.start_date, c.end_date, c.duration_days, c.rate_per_liter, 
            COALESCE(c.payment_due_date, c.end_date) AS payment_due_date, c.status AS cycle_status
     FROM distribution_cycles dc
     INNER JOIN farmers f ON f.id = dc.farmer_id
     INNER JOIN farmer_cycles c ON c.id = dc.cycle_id
     WHERE dc.distribution_id = $1
     ORDER BY c.start_date ASC, c.id ASC`,
    [distributionId]
  );
  return result.rows;
}

/**
 * Mark a preview as confirmed.
 */
async function confirmPreview(previewId, client) {
  const result = await client.query(
    `UPDATE distribution_previews
     SET status = 'confirmed', confirmed_at = NOW()
     WHERE id = $1
     RETURNING id, status, confirmed_at`,
    [previewId]
  );
  return result.rows[0] || null;
}

/**
 * Update a distribution cycle with the payment ID after confirmation.
 */
async function updateDistributionCyclePayment(distributionId, cycleId, paymentId, client) {
  await client.query(
    `UPDATE distribution_cycles
     SET payment_id = $1
     WHERE distribution_id = $2 AND cycle_id = $3`,
    [paymentId, distributionId, cycleId]
  );
}

/**
 * Expire stale pending previews.
 */
async function expireOldPreviews(client = db) {
  await client.query(
    `UPDATE distribution_previews
     SET status = 'expired'
     WHERE status = 'pending' AND expires_at <= NOW()`
  );
}

/**
 * List all distribution previews (newest first).
 */
async function listPreviews(client = db) {
  const result = await client.query(
    `SELECT id, status, mode, margin, wallet_balance_at_preview, proposed_total, selected_cycle_count, selected_farmer_count, remaining_balance, shortfall, next_unselected_reason, preview_hash, confirmed_at, created_at, expires_at
     FROM distribution_previews
     ORDER BY created_at DESC`
  );
  return result.rows;
}

/**
 * List confirmed distributions with their total paid amounts.
 */
async function listConfirmedDistributions(client = db) {
  const result = await client.query(
    `SELECT dp.id, dp.status, dp.mode, dp.margin, dp.wallet_balance_at_preview, dp.proposed_total, 
            dp.selected_cycle_count, dp.selected_farmer_count, dp.remaining_balance, dp.shortfall,
            dp.confirmed_at, dp.created_at,
            COALESCE(SUM(dc.calculated_amount), 0)::NUMERIC(14,2) AS total_distributed
     FROM distribution_previews dp
     LEFT JOIN distribution_cycles dc ON dc.distribution_id = dp.id
     WHERE dp.status = 'confirmed'
     GROUP BY dp.id
     ORDER BY dp.confirmed_at DESC`
  );
  return result.rows;
}

/**
 * Check if a pending preview already exists for the given idempotency key.
 */
async function findPreviewByIdempotencyKey(key, client = db) {
  if (!key) return null;
  const result = await client.query(
    `SELECT id, status, preview_hash, created_at, expires_at
     FROM distribution_previews
     WHERE idempotency_key = $1
     LIMIT 1`,
    [key]
  );
  return result.rows[0] || null;
}

/**
 * Generate a deterministic hash of the distribution selection for verification.
 */
function generatePreviewHash(walletBalance, selectedCycles, mode, margin) {
  const payload = JSON.stringify({
    walletBalance,
    mode,
    margin,
    cycles: selectedCycles.map(c => ({ id: c.cycleId, amount: c.calculatedAmount })).sort((a, b) => a.id - b.id),
  });
  return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 16);
}

module.exports = {
  createPreview,
  addDistributionCycles,
  findPreviewById,
  findPreviewByIdForUpdate,
  getDistributionCycles,
  confirmPreview,
  updateDistributionCyclePayment,
  expireOldPreviews,
  listPreviews,
  listConfirmedDistributions,
  findPreviewByIdempotencyKey,
  generatePreviewHash,
};
