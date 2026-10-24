const db = require('../config/db');

/**
 * Get the current wallet balance derived from the last ledger entry's running_balance.
 * Returns 0 if no ledger entries exist.
 */
async function getWalletBalance(client = db) {
  const result = await client.query(
    `SELECT COALESCE(
       (SELECT running_balance FROM wallet_ledger ORDER BY id DESC LIMIT 1),
       0
     )::NUMERIC(14,2) AS balance`
  );
  return Number(result.rows[0].balance);
}

/**
 * Lock the wallet for transactional operations by selecting the latest ledger entry FOR UPDATE.
 * Returns the current balance.
 */
async function getWalletBalanceForUpdate(client) {
  // Lock all recent ledger rows to prevent concurrent inserts
  const result = await client.query(
    `SELECT COALESCE(
       (SELECT running_balance FROM wallet_ledger ORDER BY id DESC LIMIT 1 FOR UPDATE),
       0
     )::NUMERIC(14,2) AS balance`
  );
  return Number(result.rows[0].balance);
}

/**
 * Create a wallet ledger entry and maintain the running balance.
 * @param {Object} params
 * @param {string} params.transactionType - 'receipt', 'farmer_payment', or 'adjustment'
 * @param {number} params.amount - positive for credit, negative for debit
 * @param {string} params.transactionDate - ISO date string
 * @param {string} [params.reference] - external reference number
 * @param {string} [params.description] - human-readable description
 * @param {number} [params.relatedDistributionId]
 * @param {number} [params.relatedPaymentId]
 * @param {string} [params.idempotencyKey]
 * @param {Object} client - pg client (must be within a transaction)
 */
async function createLedgerEntry(
  { transactionType, amount, transactionDate, reference, description, relatedDistributionId, relatedPaymentId, idempotencyKey },
  client
) {
  // Get current balance inside the lock
  const currentBalance = await getWalletBalanceForUpdate(client);
  const newBalance = Number((currentBalance + amount).toFixed(2));

  if (newBalance < 0) {
    throw Object.assign(new Error('Insufficient wallet balance. Transaction would result in negative balance.'), { statusCode: 400 });
  }

  const result = await client.query(
    `INSERT INTO wallet_ledger 
       (transaction_type, amount, running_balance, transaction_date, reference, description, related_distribution_id, related_payment_id, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, transaction_type, amount, running_balance, transaction_date, reference, description, related_distribution_id, related_payment_id, idempotency_key, created_at`,
    [transactionType, amount, newBalance, transactionDate, reference || null, description || null, relatedDistributionId || null, relatedPaymentId || null, idempotencyKey || null]
  );

  return result.rows[0];
}

/**
 * Check if a receipt with the given reference already exists.
 */
async function findReceiptByReference(reference, client = db) {
  if (!reference || reference.trim() === '') return null;
  const result = await client.query(
    `SELECT id, amount, transaction_date, reference, created_at
     FROM wallet_ledger
     WHERE transaction_type = 'receipt' AND reference = $1
     LIMIT 1`,
    [reference.trim()]
  );
  return result.rows[0] || null;
}

/**
 * Get all wallet transactions, newest first.
 */
async function getAllTransactions(client = db) {
  const result = await client.query(
    `SELECT id, transaction_type, amount, running_balance, transaction_date, reference, description, 
            related_distribution_id, related_payment_id, idempotency_key, created_at
     FROM wallet_ledger
     ORDER BY id DESC`
  );
  return result.rows;
}

/**
 * Get wallet summary totals.
 */
async function getWalletSummary(client = db) {
  const result = await client.query(
    `SELECT
       COALESCE((SELECT running_balance FROM wallet_ledger ORDER BY id DESC LIMIT 1), 0)::NUMERIC(14,2) AS current_balance,
       COALESCE(SUM(CASE WHEN transaction_type = 'receipt' THEN amount ELSE 0 END), 0)::NUMERIC(14,2) AS total_received,
       COALESCE(SUM(CASE WHEN transaction_type = 'farmer_payment' THEN ABS(amount) ELSE 0 END), 0)::NUMERIC(14,2) AS total_paid_to_farmers,
       COALESCE(SUM(CASE WHEN transaction_type = 'adjustment' THEN amount ELSE 0 END), 0)::NUMERIC(14,2) AS total_adjustments
     FROM wallet_ledger`
  );

  return {
    currentBalance: Number(result.rows[0].current_balance),
    totalReceived: Number(result.rows[0].total_received),
    totalPaidToFarmers: Number(result.rows[0].total_paid_to_farmers),
    totalAdjustments: Number(result.rows[0].total_adjustments),
  };
}

/**
 * Get the latest receipt (for dashboard display).
 */
async function getLatestReceipt(client = db) {
  const result = await client.query(
    `SELECT id, amount, transaction_date, reference, created_at
     FROM wallet_ledger
     WHERE transaction_type = 'receipt'
     ORDER BY id DESC
     LIMIT 1`
  );
  return result.rows[0] || null;
}

/**
 * Get total amount allocated (reserved) in pending distribution previews.
 */
async function getReservedAmount(client = db) {
  const result = await client.query(
    `SELECT COALESCE(SUM(proposed_total), 0)::NUMERIC(14,2) AS reserved
     FROM distribution_previews
     WHERE status = 'pending'
       AND expires_at > NOW()`
  );
  return Number(result.rows[0].reserved);
}

async function findTransactionById(id, client = db) {
  const result = await client.query(
    `SELECT id, transaction_type, amount, running_balance, transaction_date, reference, description, 
            related_distribution_id, related_payment_id, idempotency_key, created_at
     FROM wallet_ledger
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

async function recalculateRunningBalances(client = db) {
  await client.query(`
    WITH calculated AS (
      SELECT id, SUM(amount) OVER (ORDER BY id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS new_running
      FROM wallet_ledger
    )
    UPDATE wallet_ledger wl
    SET running_balance = c.new_running
    FROM calculated c
    WHERE wl.id = c.id;
  `);
}

async function deleteLedgerEntry(id, client = db) {
  const result = await client.query(
    `DELETE FROM wallet_ledger
     WHERE id = $1
     RETURNING id, transaction_type, amount, running_balance, transaction_date, reference, description`,
    [id]
  );
  if (result.rows.length > 0) {
    await recalculateRunningBalances(client);
  }
  return result.rows[0] || null;
}

module.exports = {
  getWalletBalance,
  getWalletBalanceForUpdate,
  createLedgerEntry,
  findReceiptByReference,
  findTransactionById,
  getAllTransactions,
  getWalletSummary,
  getLatestReceipt,
  getReservedAmount,
  recalculateRunningBalances,
  deleteLedgerEntry,
};
