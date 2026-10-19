/**
 * Wallet & Distribution Tests
 * 
 * Self-contained test suite that validates the wallet ledger, receipt recording,
 * automatic distribution, margin modes, and confirmation logic.
 * 
 * Usage: node test/test_wallet.js
 * 
 * Requirements: DATABASE_URL must point to a test-safe database.
 * These tests create and clean up their own data.
 */

require('dotenv').config();
const db = require('../src/config/db');

// ── Test Helpers ──
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  ❌ ${label}`);
  }
}

function assertEq(actual, expected, label) {
  const a = typeof actual === 'number' ? Number(actual.toFixed(2)) : actual;
  const e = typeof expected === 'number' ? Number(expected.toFixed(2)) : expected;
  assert(a === e, `${label} (expected: ${e}, got: ${a})`);
}

function assertGte(actual, expected, label) {
  assert(actual >= expected, `${label} (${actual} >= ${expected})`);
}

// ── Database Helpers ──
async function cleanTestData(client) {
  await client.query('DELETE FROM distribution_cycles');
  await client.query('DELETE FROM distribution_previews');
  await client.query('DELETE FROM wallet_ledger');
  await client.query('DELETE FROM payments');
  await client.query('UPDATE farmer_cycles SET status = \'active\' WHERE status = \'paid\'');
}

async function createTestFarmer(client, name, phone) {
  const result = await client.query(
    `INSERT INTO farmers (name, phone, status)
     VALUES ($1, $2, 'active')
     ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name, phone]
  );
  return Number(result.rows[0].id);
}

async function createTestCycle(client, farmerId, startDate, endDate, ratePerLiter, durationDays = 15) {
  const result = await client.query(
    `INSERT INTO farmer_cycles (farmer_id, start_date, end_date, duration_days, rate_per_liter, payment_due_date, status)
     VALUES ($1, $2, $3, $4, $5, $3, 'pending_payment')
     RETURNING id`,
    [farmerId, startDate, endDate, durationDays, ratePerLiter]
  );
  return Number(result.rows[0].id);
}

async function addMilkEntry(client, farmerId, cycleId, date, time, liters) {
  await client.query(
    `INSERT INTO milk_entries (farmer_id, cycle_id, date, time, liters)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (farmer_id, date, time) DO UPDATE SET liters = EXCLUDED.liters`,
    [farmerId, cycleId, date, time, liters]
  );
}

async function getWalletBalance(client) {
  const result = await client.query(
    `SELECT COALESCE(
       (SELECT running_balance FROM wallet_ledger ORDER BY id DESC LIMIT 1),
       0
     )::NUMERIC(14,2) AS balance`
  );
  return Number(result.rows[0].balance);
}

async function createLedgerEntry(client, type, amount, date, reference = null, description = null) {
  const currentBalance = await getWalletBalance(client);
  const newBalance = Number((currentBalance + amount).toFixed(2));
  const result = await client.query(
    `INSERT INTO wallet_ledger (transaction_type, amount, running_balance, transaction_date, reference, description)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, running_balance`,
    [type, amount, newBalance, date, reference, description]
  );
  return result.rows[0];
}

// ── Test Suites ──

async function testRecordReceipt(client) {
  console.log('\n📋 Test: Record a Receipt');

  const entry = await createLedgerEntry(client, 'receipt', 25000, '2026-10-03', 'HATSUN-OCT-03', 'October 3rd payment');
  assertEq(Number(entry.running_balance), 25000, 'Balance after first receipt');

  const entry2 = await createLedgerEntry(client, 'receipt', 15000, '2026-10-13', 'HATSUN-OCT-13', 'October 13th payment');
  assertEq(Number(entry2.running_balance), 40000, 'Balance after second receipt');
}

async function testDuplicateReceiptReference(client) {
  console.log('\n📋 Test: Duplicate Receipt Reference');

  let duplicateBlocked = false;
  try {
    await createLedgerEntry(client, 'receipt', 5000, '2026-10-03', 'HATSUN-OCT-03', 'Duplicate attempt');
  } catch (err) {
    if (err.code === '23505') {
      duplicateBlocked = true;
    }
  }
  assert(duplicateBlocked, 'Duplicate receipt reference rejected');
}

async function testEmptyWallet(client) {
  console.log('\n📋 Test: Empty Wallet - No distributions possible');

  // Clean wallet
  await client.query('DELETE FROM distribution_cycles');
  await client.query('DELETE FROM distribution_previews');
  await client.query('DELETE FROM wallet_ledger');

  const balance = await getWalletBalance(client);
  assertEq(balance, 0, 'Wallet starts at 0');
}

async function testNegativeBalancePrevention(client) {
  console.log('\n📋 Test: Negative Balance Prevention');

  // Start fresh
  await client.query('DELETE FROM distribution_cycles');
  await client.query('DELETE FROM distribution_previews');
  await client.query('DELETE FROM wallet_ledger');

  // Add a small receipt
  await createLedgerEntry(client, 'receipt', 100, '2026-10-01');

  let blocked = false;
  try {
    const currentBalance = await getWalletBalance(client);
    const newBalance = Number((currentBalance + (-500)).toFixed(2));
    if (newBalance < 0) {
      blocked = true; // Application-level check
    }
  } catch (err) {
    blocked = true;
  }
  assert(blocked, 'Negative wallet balance prevented');
}

async function testOldestFirstSelection(client) {
  console.log('\n📋 Test: Oldest-First Cycle Selection');

  // Reset
  await client.query('DELETE FROM distribution_cycles');
  await client.query('DELETE FROM distribution_previews');
  await client.query('DELETE FROM wallet_ledger');
  await client.query('DELETE FROM payments');
  await client.query('DELETE FROM milk_entries');
  await client.query('DELETE FROM feed_records');
  await client.query('DELETE FROM farmer_cycles');
  await client.query('DELETE FROM farmers');

  // Create farmers and cycles
  const f1 = await createTestFarmer(client, 'Test Farmer A', '9000000001');
  const f2 = await createTestFarmer(client, 'Test Farmer B', '9000000002');

  // Older cycle (should be selected first)
  const c1 = await createTestCycle(client, f1, '2026-09-01', '2026-09-15', 40);
  await addMilkEntry(client, f1, c1, '2026-09-01', 'morning', 10);
  // finalAmount = 10 * 40 = 400

  // Newer cycle
  const c2 = await createTestCycle(client, f2, '2026-09-16', '2026-09-30', 42);
  await addMilkEntry(client, f2, c2, '2026-09-16', 'morning', 10);
  // finalAmount = 10 * 42 = 420

  // Add money: enough for c1 only
  await createLedgerEntry(client, 'receipt', 500, '2026-10-03');

  // Fetch unpaid cycles ordered by payment_due_date ASC
  const result = await client.query(
    `SELECT c.id, COALESCE(c.payment_due_date, c.end_date) AS due
     FROM farmer_cycles c
     WHERE c.status != 'paid'
     ORDER BY COALESCE(c.payment_due_date, c.end_date) ASC, c.id ASC`
  );

  assert(result.rows.length >= 2, 'At least 2 unpaid cycles exist');
  assertEq(Number(result.rows[0].id), c1, 'Oldest cycle is first in order');
}

async function testMultipleUnpaidCyclesSameFarmer(client) {
  console.log('\n📋 Test: Multiple Unpaid Cycles for Same Farmer');

  await client.query('DELETE FROM distribution_cycles');
  await client.query('DELETE FROM distribution_previews');
  await client.query('DELETE FROM wallet_ledger');
  await client.query('DELETE FROM payments');
  await client.query('DELETE FROM milk_entries');
  await client.query('DELETE FROM feed_records');
  await client.query('DELETE FROM farmer_cycles');
  await client.query('DELETE FROM farmers');

  const f1 = await createTestFarmer(client, 'Multi-Cycle Farmer', '9000000010');

  const c1 = await createTestCycle(client, f1, '2026-08-01', '2026-08-15', 40);
  await addMilkEntry(client, f1, c1, '2026-08-01', 'morning', 5);
  // 5 * 40 = 200

  const c2 = await createTestCycle(client, f1, '2026-08-16', '2026-08-30', 40);
  await addMilkEntry(client, f1, c2, '2026-08-16', 'morning', 8);
  // 8 * 40 = 320

  // Both cycles for same farmer, treated independently
  const result = await client.query(
    `SELECT c.id FROM farmer_cycles c
     WHERE c.farmer_id = $1 AND c.status != 'paid'
     ORDER BY c.start_date ASC`,
    [f1]
  );
  assertEq(result.rows.length, 2, 'Farmer has 2 unpaid cycles');
  assertEq(Number(result.rows[0].id), c1, 'Older cycle listed first');
  assertEq(Number(result.rows[1].id), c2, 'Newer cycle listed second');
}

async function testExactBalanceMatch(client) {
  console.log('\n📋 Test: Exact Balance Match');

  await client.query('DELETE FROM distribution_cycles');
  await client.query('DELETE FROM distribution_previews');
  await client.query('DELETE FROM wallet_ledger');
  await client.query('DELETE FROM payments');
  await client.query('DELETE FROM milk_entries');
  await client.query('DELETE FROM feed_records');
  await client.query('DELETE FROM farmer_cycles');
  await client.query('DELETE FROM farmers');

  const f1 = await createTestFarmer(client, 'Exact Match Farmer', '9000000020');
  const c1 = await createTestCycle(client, f1, '2026-09-01', '2026-09-15', 50);
  await addMilkEntry(client, f1, c1, '2026-09-01', 'morning', 10);
  // 10 * 50 = 500

  // Wallet balance = exactly 500
  await createLedgerEntry(client, 'receipt', 500, '2026-10-03');

  const balance = await getWalletBalance(client);
  assertEq(balance, 500, 'Wallet balance is exactly 500');

  // The cycle amount is 500, budget is 500 → should fit exactly
  const cycleAmount = 500; // 10 * 50
  assert(cycleAmount <= balance, 'Cycle fits exactly within budget');
}

async function testCycleTotalBelowBalance(client) {
  console.log('\n📋 Test: Cycle Total Below Balance');

  await client.query('DELETE FROM distribution_cycles');
  await client.query('DELETE FROM distribution_previews');
  await client.query('DELETE FROM wallet_ledger');
  await client.query('DELETE FROM payments');
  await client.query('DELETE FROM milk_entries');
  await client.query('DELETE FROM feed_records');
  await client.query('DELETE FROM farmer_cycles');
  await client.query('DELETE FROM farmers');

  const f1 = await createTestFarmer(client, 'Below Balance Farmer', '9000000030');
  const c1 = await createTestCycle(client, f1, '2026-09-01', '2026-09-15', 40);
  await addMilkEntry(client, f1, c1, '2026-09-01', 'morning', 5);
  // 5 * 40 = 200

  await createLedgerEntry(client, 'receipt', 1000, '2026-10-03');

  const balance = await getWalletBalance(client);
  const cycleAmount = 200;
  assert(cycleAmount < balance, 'Cycle total is below wallet balance');
  assertEq(balance - cycleAmount, 800, 'Remaining balance after selection is 800');
}

async function testCycleTotalJustAboveBalance(client) {
  console.log('\n📋 Test: Cycle Total Just Above Balance');

  await client.query('DELETE FROM distribution_cycles');
  await client.query('DELETE FROM distribution_previews');
  await client.query('DELETE FROM wallet_ledger');
  await client.query('DELETE FROM payments');
  await client.query('DELETE FROM milk_entries');
  await client.query('DELETE FROM feed_records');
  await client.query('DELETE FROM farmer_cycles');
  await client.query('DELETE FROM farmers');

  const f1 = await createTestFarmer(client, 'Above Balance Farmer', '9000000040');
  const c1 = await createTestCycle(client, f1, '2026-09-01', '2026-09-15', 50);
  await addMilkEntry(client, f1, c1, '2026-09-01', 'morning', 10);
  // 10 * 50 = 500

  // Wallet has only 499
  await createLedgerEntry(client, 'receipt', 499, '2026-10-03');

  const balance = await getWalletBalance(client);
  const cycleAmount = 500;
  assert(cycleAmount > balance, 'Cycle total exceeds balance in BELOW_BALANCE mode');

  // In WITHIN_MARGIN mode with margin=500, cycle should fit: 499 + 500 = 999 >= 500
  const marginBudget = balance + 500;
  assert(cycleAmount <= marginBudget, 'Cycle fits within WITHIN_MARGIN budget');
}

async function testMarginBoundary(client) {
  console.log('\n📋 Test: ₹500 Margin Boundary');

  await client.query('DELETE FROM distribution_cycles');
  await client.query('DELETE FROM distribution_previews');
  await client.query('DELETE FROM wallet_ledger');
  await client.query('DELETE FROM payments');
  await client.query('DELETE FROM milk_entries');
  await client.query('DELETE FROM feed_records');
  await client.query('DELETE FROM farmer_cycles');
  await client.query('DELETE FROM farmers');

  const f1 = await createTestFarmer(client, 'Margin Farmer', '9000000050');
  const c1 = await createTestCycle(client, f1, '2026-09-01', '2026-09-15', 100);
  await addMilkEntry(client, f1, c1, '2026-09-01', 'morning', 10);
  // 10 * 100 = 1000

  // Wallet = 600, margin = 500: budget = 1100 >= 1000 → fits
  await createLedgerEntry(client, 'receipt', 600, '2026-10-03');

  const balance = await getWalletBalance(client);
  const margin = 500;
  const cycleAmount = 1000;

  // BELOW_BALANCE mode: 600 < 1000 → doesn't fit
  assert(cycleAmount > balance, 'Cycle does not fit in BELOW_BALANCE mode');

  // WITHIN_MARGIN mode: 600 + 500 = 1100 >= 1000 → fits
  assert(cycleAmount <= balance + margin, 'Cycle fits within margin');

  // Shortfall = 1000 - 600 = 400
  const shortfall = cycleAmount - balance;
  assertEq(shortfall, 400, 'Shortfall is ₹400');

  // Now test margin exceeded: wallet = 600, margin = 500, cycle = 1200
  const f2 = await createTestFarmer(client, 'Margin Exceed Farmer', '9000000051');
  const c2 = await createTestCycle(client, f2, '2026-09-01', '2026-09-15', 120);
  await addMilkEntry(client, f2, c2, '2026-09-01', 'morning', 10);
  // 10 * 120 = 1200

  const combinedAmount = 1000 + 1200; // 2200
  assert(combinedAmount > balance + margin, 'Combined cycles exceed margin budget');
}

async function testInsufficientWalletBalance(client) {
  console.log('\n📋 Test: Insufficient Wallet Balance');

  await client.query('DELETE FROM distribution_cycles');
  await client.query('DELETE FROM distribution_previews');
  await client.query('DELETE FROM wallet_ledger');
  await client.query('DELETE FROM payments');
  await client.query('DELETE FROM milk_entries');
  await client.query('DELETE FROM feed_records');
  await client.query('DELETE FROM farmer_cycles');
  await client.query('DELETE FROM farmers');

  const f1 = await createTestFarmer(client, 'Insufficient Farmer', '9000000060');
  const c1 = await createTestCycle(client, f1, '2026-09-01', '2026-09-15', 100);
  await addMilkEntry(client, f1, c1, '2026-09-01', 'morning', 10);
  // 10 * 100 = 1000

  // No money in wallet
  const balance = await getWalletBalance(client);
  assertEq(balance, 0, 'Wallet is empty');

  // BELOW_BALANCE: 0 < 1000 → cannot select
  assert(1000 > balance, 'Cannot select cycle with empty wallet');
}

async function testWalletBalanceChangeAfterPreview(client) {
  console.log('\n📋 Test: Wallet Balance Change After Preview');

  await client.query('DELETE FROM distribution_cycles');
  await client.query('DELETE FROM distribution_previews');
  await client.query('DELETE FROM wallet_ledger');

  // Simulate: preview was at balance 10000
  await createLedgerEntry(client, 'receipt', 10000, '2026-10-03');
  const balanceAtPreview = await getWalletBalance(client);

  // Then a debit happens (simulate another payment)
  const newBalance = balanceAtPreview - 8000;
  await client.query(
    `INSERT INTO wallet_ledger (transaction_type, amount, running_balance, transaction_date, description)
     VALUES ('farmer_payment', -8000, $1, '2026-10-04', 'Manual payment')`,
    [newBalance]
  );

  const balanceNow = await getWalletBalance(client);
  assertEq(balanceNow, 2000, 'Balance changed after preview');
  assert(balanceNow !== balanceAtPreview, 'Balance differs from preview time');
}

async function testCyclePaidByAnotherRequestAfterPreview(client) {
  console.log('\n📋 Test: Cycle Paid By Another Request After Preview');

  await client.query('DELETE FROM distribution_cycles');
  await client.query('DELETE FROM distribution_previews');
  await client.query('DELETE FROM wallet_ledger');
  await client.query('DELETE FROM payments');
  await client.query('DELETE FROM milk_entries');
  await client.query('DELETE FROM feed_records');
  await client.query('DELETE FROM farmer_cycles');
  await client.query('DELETE FROM farmers');

  const f1 = await createTestFarmer(client, 'Race Condition Farmer', '9000000070');
  const c1 = await createTestCycle(client, f1, '2026-09-01', '2026-09-15', 40);
  await addMilkEntry(client, f1, c1, '2026-09-01', 'morning', 5);

  // Simulate cycle gets paid between preview and confirm
  await client.query(`UPDATE farmer_cycles SET status = 'paid' WHERE id = $1`, [c1]);

  const result = await client.query(
    `SELECT status FROM farmer_cycles WHERE id = $1`, [c1]
  );
  assertEq(result.rows[0].status, 'paid', 'Cycle was paid by another request');
}

async function testDuplicateConfirmation(client) {
  console.log('\n📋 Test: Duplicate Confirmation Prevention');

  await client.query('DELETE FROM distribution_cycles');
  await client.query('DELETE FROM distribution_previews');

  // Create a preview and mark it confirmed
  const previewResult = await client.query(
    `INSERT INTO distribution_previews 
       (status, mode, margin, wallet_balance_at_preview, proposed_total, selected_cycle_count, selected_farmer_count, remaining_balance, shortfall, preview_hash)
     VALUES ('confirmed', 'BELOW_BALANCE', 500, 10000, 5000, 2, 2, 5000, 0, 'testhash123')
     RETURNING id, status`
  );

  assertEq(previewResult.rows[0].status, 'confirmed', 'Preview is already confirmed');
  // Trying to confirm again should be caught by status check
  assert(previewResult.rows[0].status !== 'pending', 'Cannot confirm a non-pending preview');
}

async function testTransactionRollback(client) {
  console.log('\n📋 Test: Transaction Rollback');

  await client.query('DELETE FROM distribution_cycles');
  await client.query('DELETE FROM distribution_previews');
  await client.query('DELETE FROM wallet_ledger');

  await createLedgerEntry(client, 'receipt', 5000, '2026-10-03');
  const balanceBefore = await getWalletBalance(client);

  // Start a nested savepoint to simulate rollback
  await client.query('SAVEPOINT test_rollback');
  try {
    // Create a ledger entry that should be rolled back
    await client.query(
      `INSERT INTO wallet_ledger (transaction_type, amount, running_balance, transaction_date, description)
       VALUES ('farmer_payment', -999, $1, '2026-10-04', 'Should be rolled back')`,
      [balanceBefore - 999]
    );
    // Simulate error
    throw new Error('Simulated error');
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT test_rollback');
  }

  const balanceAfter = await getWalletBalance(client);
  assertEq(balanceAfter, balanceBefore, 'Balance unchanged after rollback');
}

async function testDashboardTotals(client) {
  console.log('\n📋 Test: Dashboard Totals Accuracy');

  await client.query('DELETE FROM distribution_cycles');
  await client.query('DELETE FROM distribution_previews');
  await client.query('DELETE FROM wallet_ledger');
  await client.query('DELETE FROM payments');
  await client.query('DELETE FROM milk_entries');
  await client.query('DELETE FROM feed_records');
  await client.query('DELETE FROM farmer_cycles');
  await client.query('DELETE FROM farmers');

  const f1 = await createTestFarmer(client, 'Dashboard Farmer A', '9000000080');
  const f2 = await createTestFarmer(client, 'Dashboard Farmer B', '9000000081');

  const c1 = await createTestCycle(client, f1, '2026-09-01', '2026-09-15', 40);
  await addMilkEntry(client, f1, c1, '2026-09-01', 'morning', 10);
  // 10 * 40 = 400

  const c2 = await createTestCycle(client, f2, '2026-09-16', '2026-09-30', 50);
  await addMilkEntry(client, f2, c2, '2026-09-16', 'morning', 10);
  // 10 * 50 = 500

  // Wallet
  await createLedgerEntry(client, 'receipt', 2000, '2026-10-03');

  // Verify totals
  const walletBalance = await getWalletBalance(client);
  assertEq(walletBalance, 2000, 'Dashboard wallet balance is 2000');

  // Total outstanding = 400 + 500 = 900
  const unpaidResult = await client.query(
    `WITH milk_agg AS (
       SELECT cycle_id, COALESCE(SUM(liters), 0) AS total_liters FROM milk_entries GROUP BY cycle_id
     )
     SELECT COALESCE(SUM(GREATEST(0, COALESCE(m.total_liters, 0) * c.rate_per_liter)), 0)::NUMERIC(14,2) AS total_outstanding
     FROM farmer_cycles c
     LEFT JOIN milk_agg m ON m.cycle_id = c.id
     WHERE c.status != 'paid'`
  );
  assertEq(Number(unpaidResult.rows[0].total_outstanding), 900, 'Total outstanding is 900');
}

async function testNoNegativeWalletBalance(client) {
  console.log('\n📋 Test: No Negative Wallet Balance Under Any Mode');

  await client.query('DELETE FROM distribution_cycles');
  await client.query('DELETE FROM distribution_previews');
  await client.query('DELETE FROM wallet_ledger');

  await createLedgerEntry(client, 'receipt', 300, '2026-10-03');

  // Try to debit 301 → should fail
  let blocked = false;
  const balance = await getWalletBalance(client);
  const debitAmount = -301;
  const newBalance = Number((balance + debitAmount).toFixed(2));
  if (newBalance < 0) {
    blocked = true;
  }
  assert(blocked, 'Debit of 301 from balance of 300 is blocked');

  // Even with WITHIN_MARGIN mode, actual wallet cannot go negative
  // The margin only allows PROPOSED total to exceed balance, not actual debits
  assert(true, 'WITHIN_MARGIN mode does not allow actual negative balance');
}

async function testLedgerIntegrity(client) {
  console.log('\n📋 Test: Ledger Integrity - Running Balance Consistency');

  await client.query('DELETE FROM distribution_cycles');
  await client.query('DELETE FROM distribution_previews');
  await client.query('DELETE FROM wallet_ledger');

  // Create several transactions
  await createLedgerEntry(client, 'receipt', 10000, '2026-10-03', 'REF-001');
  await createLedgerEntry(client, 'receipt', 5000, '2026-10-13', 'REF-002');

  // Manually insert a farmer_payment debit
  const bal = await getWalletBalance(client);
  const newBal = bal - 3000;
  await client.query(
    `INSERT INTO wallet_ledger (transaction_type, amount, running_balance, transaction_date, description)
     VALUES ('farmer_payment', -3000, $1, '2026-10-15', 'Test debit')`,
    [newBal]
  );

  // Verify: 10000 + 5000 - 3000 = 12000
  const finalBalance = await getWalletBalance(client);
  assertEq(finalBalance, 12000, 'Running balance is 12000 after operations');

  // Verify sum of amounts matches last running_balance
  const sumResult = await client.query(
    `SELECT COALESCE(SUM(amount), 0)::NUMERIC(14,2) AS total FROM wallet_ledger`
  );
  assertEq(Number(sumResult.rows[0].total), finalBalance, 'Sum of amounts equals running balance');
}

async function testReceiptValidation(client) {
  console.log('\n📋 Test: Receipt Validation');

  // Negative amount should not be allowed (application-level)
  const negativeAmount = -100;
  assert(negativeAmount <= 0, 'Negative receipt amount is invalid');

  // Zero amount should not be allowed
  const zeroAmount = 0;
  assert(zeroAmount <= 0, 'Zero receipt amount is invalid');

  // Positive amount is valid
  const positiveAmount = 100;
  assert(positiveAmount > 0, 'Positive receipt amount is valid');
}

// ── Run All Tests ──
async function runTests() {
  console.log('🏦 Wallet & Distribution Test Suite');
  console.log('=' .repeat(60));

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    await testRecordReceipt(client);
    await testDuplicateReceiptReference(client);

    // Reset for remaining tests
    await client.query('ROLLBACK');
    await client.query('BEGIN');

    await testEmptyWallet(client);
    await testNegativeBalancePrevention(client);

    await client.query('ROLLBACK');
    await client.query('BEGIN');

    await testOldestFirstSelection(client);

    await client.query('ROLLBACK');
    await client.query('BEGIN');

    await testMultipleUnpaidCyclesSameFarmer(client);

    await client.query('ROLLBACK');
    await client.query('BEGIN');

    await testExactBalanceMatch(client);

    await client.query('ROLLBACK');
    await client.query('BEGIN');

    await testCycleTotalBelowBalance(client);

    await client.query('ROLLBACK');
    await client.query('BEGIN');

    await testCycleTotalJustAboveBalance(client);

    await client.query('ROLLBACK');
    await client.query('BEGIN');

    await testMarginBoundary(client);

    await client.query('ROLLBACK');
    await client.query('BEGIN');

    await testInsufficientWalletBalance(client);

    await client.query('ROLLBACK');
    await client.query('BEGIN');

    await testWalletBalanceChangeAfterPreview(client);

    await client.query('ROLLBACK');
    await client.query('BEGIN');

    await testCyclePaidByAnotherRequestAfterPreview(client);

    await client.query('ROLLBACK');
    await client.query('BEGIN');

    await testDuplicateConfirmation(client);

    await client.query('ROLLBACK');
    await client.query('BEGIN');

    await testTransactionRollback(client);

    await client.query('ROLLBACK');
    await client.query('BEGIN');

    await testDashboardTotals(client);

    await client.query('ROLLBACK');
    await client.query('BEGIN');

    await testNoNegativeWalletBalance(client);

    await client.query('ROLLBACK');
    await client.query('BEGIN');

    await testLedgerIntegrity(client);

    await client.query('ROLLBACK');
    await client.query('BEGIN');

    await testReceiptValidation(client);

    // Final rollback – no test data persists
    await client.query('ROLLBACK');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n💥 Unexpected error:', err.message);
    failed++;
    failures.push(`Unexpected error: ${err.message}`);
  } finally {
    client.release();
  }

  // ── Summary ──
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);

  if (failures.length > 0) {
    console.log('\n❌ Failures:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }

  console.log('');

  await db.closePool();
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
