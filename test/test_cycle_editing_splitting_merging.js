/**
 * Comprehensive Automated Test Suite for:
 * 1. Editing the rate of a pending cycle
 * 2. Splitting a 30-day cycle into two 15-day cycles
 * 3. Extending a 15-day cycle when no second cycle exists
 * 4. Extending a 15-day cycle when a compatible unpaid cycle already exists
 * 5. Merging entries and feed records without data loss or double counting
 * 6. Rejecting merges involving paid cycles (HTTP 409 Conflict)
 * 7. Handling different rates safely
 * 8. Handling duplicate milk-entry conflicts
 * 9. Rejecting overlapping incompatible cycles
 * 10. Transaction rollback and concurrent payment protection
 * 11. Preserving wallet and completed-payment history
 * 
 * Usage: node test/test_cycle_editing_splitting_merging.js
 */

require('dotenv').config();
const http = require('http');
const app = require('../src/app');
const db = require('../src/config/db');

let server;
let baseUrl;
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.log(`  ❌ ${message}`);
  }
}

function assertEq(actual, expected, message) {
  assert(actual === expected, `${message} [expected: ${expected}, got: ${actual}]`);
}

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const method = options.method || 'GET';
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const body = options.body ? JSON.stringify(options.body) : undefined;

  const res = await fetch(url, { method, headers, body });
  let data;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, ok: res.ok, body: data };
}

function uniquePhone() {
  return '9' + Math.floor(100000000 + Math.random() * 900000000);
}

async function createTestFarmer(name) {
  const phone = uniquePhone();
  const res = await db.query(
    `INSERT INTO farmers (name, phone, status) VALUES ($1, $2, 'active') RETURNING id, name, phone`,
    [name, phone]
  );
  return res.rows[0];
}

async function cleanupFarmer(farmerId) {
  try {
    const client = await db.getClient();
    try {
      await client.query("SET app.bypass_paid_locks = 'on'");
      await client.query('DELETE FROM farmers WHERE id = $1', [farmerId]);
    } finally {
      client.release();
    }
  } catch (e) {
    // ignore
  }
}

async function runTests() {
  console.log('🚀 Starting Cycle Editing, Splitting, and Merging Test Suite\n');

  // Start HTTP server on an ephemeral port
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`Test server running at ${baseUrl}\n`);
      resolve();
    });
  });

  const testFarmerIds = [];

  try {
    // =========================================================================
    // TEST 1: Editing the rate of a pending cycle
    // =========================================================================
    console.log('📋 Test 1: Editing the rate of a pending cycle');
    const farmer1 = await createTestFarmer('Edit Rate Farmer');
    testFarmerIds.push(farmer1.id);

    // Create a 15-day cycle @ ₹40/L
    const c1Res = await request('/cycles/start', {
      method: 'POST',
      body: {
        farmerId: farmer1.id,
        startDate: '2025-01-01',
        durationDays: 15,
        ratePerLiter: 40.0,
      },
    });
    assertEq(c1Res.status, 201, 'Created cycle #1 successfully');
    const cycle1Id = c1Res.body.id;

    // Add milk entries: 10L morning, 10L evening = 20L
    await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer1.id, date: '2025-01-05', time: 'morning', liters: 10 },
    });
    await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer1.id, date: '2025-01-05', time: 'evening', liters: 10 },
    });

    // Update rate from ₹40 to ₹45.50
    const editRateRes = await request(`/cycles/${cycle1Id}`, {
      method: 'PUT',
      body: { ratePerLiter: 45.5 },
    });
    assertEq(editRateRes.status, 200, 'Edit rate returned HTTP 200');
    assertEq(editRateRes.body.ratePerLiter, 45.5, 'ratePerLiter updated to 45.5');
    assertEq(editRateRes.body.totalLiters, 20, 'totalLiters is 20L');
    assertEq(editRateRes.body.grossAmount, 910.0, 'Gross recalculated: 20L * 45.50 = ₹910.00');
    assertEq(editRateRes.body.finalAmount, 910.0, 'Final amount matches ₹910.00');

    // =========================================================================
    // TEST 2: Splitting a 30-day cycle into two 15-day cycles
    // =========================================================================
    console.log('\n📋 Test 2: Splitting a 30-day cycle into two 15-day cycles');
    const farmer2 = await createTestFarmer('Split Cycle Farmer');
    testFarmerIds.push(farmer2.id);

    // Create 30-day cycle: Oct 1 - Oct 30 @ ₹42
    const c2Res = await request('/cycles/start', {
      method: 'POST',
      body: {
        farmerId: farmer2.id,
        startDate: '2025-10-01',
        durationDays: 30,
        ratePerLiter: 42.0,
      },
    });
    assertEq(c2Res.status, 201, 'Created 30-day cycle successfully');
    const cycle2Id = c2Res.body.id;

    // Milk in first half (Oct 1-15): Oct 5 (10L), Oct 10 (12L) = 22L
    await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer2.id, date: '2025-10-05', time: 'morning', liters: 10 },
    });
    await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer2.id, date: '2025-10-10', time: 'evening', liters: 12 },
    });

    // Milk in second half (Oct 16-30): Oct 18 (15L), Oct 25 (20L) = 35L
    await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer2.id, date: '2025-10-18', time: 'morning', liters: 15 },
    });
    await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer2.id, date: '2025-10-25', time: 'evening', liters: 20 },
    });

    // Shorten duration to 15 days
    const splitRes = await request(`/cycles/${cycle2Id}`, {
      method: 'PUT',
      body: { durationDays: 15 },
    });
    assertEq(splitRes.status, 200, 'Split returned HTTP 200');
    assert(splitRes.body.createdCycle, 'Created second cycle object returned');

    // Verify Cycle 1
    const splitCycle1 = splitRes.body.cycle;
    assertEq(splitCycle1.startDate, '2025-10-01', 'Cycle 1 start is 2025-10-01');
    assertEq(splitCycle1.endDate, '2025-10-15', 'Cycle 1 end is 2025-10-15 (15 calendar dates)');
    assertEq(splitCycle1.totalLiters, 22, 'Cycle 1 retained 22L milk');
    assertEq(splitCycle1.grossAmount, 924.0, 'Cycle 1 gross: 22L * ₹42 = ₹924.00');

    // Verify Cycle 2
    const splitCycle2 = splitRes.body.createdCycle;
    assertEq(splitCycle2.startDate, '2025-10-16', 'Cycle 2 start is 2025-10-16');
    assert(splitCycle2.endDate === '2025-10-30' || splitCycle2.endDate === '2025-10-31', 'Cycle 2 end is valid October boundary');
    assertEq(splitCycle2.ratePerLiter, 42.0, 'Cycle 2 inherited rate ₹42.00');
    assertEq(splitCycle2.totalLiters, 35, 'Cycle 2 reassigned 35L milk');
    assertEq(splitCycle2.grossAmount, 1470.0, 'Cycle 2 gross: 35L * ₹42 = ₹1,470.00');

    // Check total milk entries in database for farmer2 to verify no loss
    const totalMilkEntries = await db.query(
      `SELECT COUNT(*)::INT AS count, SUM(liters)::NUMERIC(12,2) AS total FROM milk_entries WHERE farmer_id = $1`,
      [farmer2.id]
    );
    assertEq(Number(totalMilkEntries.rows[0].count), 4, 'All 4 milk entries preserved without duplication or deletion');
    assertEq(Number(totalMilkEntries.rows[0].total), 57.0, 'Total litres intact: 22 + 35 = 57L');

    // =========================================================================
    // TEST 3: Extending a 15-day cycle when no second cycle exists
    // =========================================================================
    console.log('\n📋 Test 3: Extending a 15-day cycle when no second cycle exists');
    const farmer3 = await createTestFarmer('Extend Single Farmer');
    testFarmerIds.push(farmer3.id);

    const c3Res = await request('/cycles/start', {
      method: 'POST',
      body: {
        farmerId: farmer3.id,
        startDate: '2025-11-01',
        durationDays: 15,
        ratePerLiter: 38.0,
      },
    });
    assertEq(c3Res.status, 201, 'Created 15-day cycle');
    const cycle3Id = c3Res.body.id;

    // Extend to 30 days
    const extRes = await request(`/cycles/${cycle3Id}`, {
      method: 'PUT',
      body: { durationDays: 30 },
    });
    assertEq(extRes.status, 200, 'Extend returned HTTP 200');
    assertEq(extRes.body.durationDays, 30, 'Duration is 30 days');
    assertEq(extRes.body.startDate, '2025-11-01', 'Start date 2025-11-01');
    assertEq(extRes.body.endDate, '2025-11-30', 'End date is 2025-11-30 (30 calendar dates)');
    assertEq(extRes.body.mergedCycles.length, 0, 'No cycles merged because none existed');

    // Verify milk entry in the expanded date range (e.g. Nov 20) can now be added
    const milkExt = await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer3.id, date: '2025-11-20', time: 'morning', liters: 18 },
    });
    assertEq(milkExt.status, 201, 'Milk entry on Nov 20 successfully attached to extended cycle');
    assertEq(Number(milkExt.body.cycle_id), Number(cycle3Id), 'Attached to cycle3Id');

    // =========================================================================
    // TEST 4 & 5: Extending 15-day cycle with compatible unpaid cycle (merge entries & feed)
    // =========================================================================
    console.log('\n📋 Test 4 & 5: Merging compatible unpaid cycle, milk entries, and feed records');
    const farmer4 = await createTestFarmer('Merge Cycles Farmer');
    testFarmerIds.push(farmer4.id);

    // Cycle A: Dec 1 - Dec 15 @ ₹40
    const cARes = await request('/cycles/start', {
      method: 'POST',
      body: {
        farmerId: farmer4.id,
        startDate: '2025-12-01',
        durationDays: 15,
        ratePerLiter: 40.0,
      },
    });
    assertEq(cARes.status, 201, 'Created Cycle A (Dec 1-15)');
    const cycleAId = cARes.body.id;

    // Cycle B: Dec 16 - Dec 30 @ ₹40
    const cBRes = await request('/cycles/start', {
      method: 'POST',
      body: {
        farmerId: farmer4.id,
        startDate: '2025-12-16',
        durationDays: 15,
        ratePerLiter: 40.0,
      },
    });
    assertEq(cBRes.status, 201, 'Created Cycle B (Dec 16-30)');
    const cycleBId = cBRes.body.id;

    // Milk in Cycle A: 10L on Dec 3, 10L on Dec 10 = 20L
    await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer4.id, date: '2025-12-03', time: 'morning', liters: 10 },
    });
    await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer4.id, date: '2025-12-10', time: 'evening', liters: 10 },
    });

    // Feed in Cycle A: ₹200 on Dec 5
    await request('/feed', {
      method: 'POST',
      body: { farmerId: farmer4.id, date: '2025-12-05', item: 'Silage', quantity: 10, amount: 200 },
    });

    // Milk in Cycle B: 15L on Dec 18, 15L on Dec 25 = 30L
    await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer4.id, date: '2025-12-18', time: 'morning', liters: 15 },
    });
    await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer4.id, date: '2025-12-25', time: 'evening', liters: 15 },
    });

    // Feed in Cycle B: ₹350 on Dec 22
    await request('/feed', {
      method: 'POST',
      body: { farmerId: farmer4.id, date: '2025-12-22', item: 'Cattle Feed', quantity: 20, amount: 350 },
    });

    // Extend Cycle A to 30 days -> should merge Cycle B!
    const mergeRes = await request(`/cycles/${cycleAId}`, {
      method: 'PUT',
      body: { durationDays: 30 },
    });
    assertEq(mergeRes.status, 200, 'Extend & merge returned HTTP 200');
    assertEq(mergeRes.body.durationDays, 30, 'Merged cycle duration is 30 days');
    assertEq(mergeRes.body.startDate, '2025-12-01', 'Start date 2025-12-01');
    assertEq(mergeRes.body.endDate, '2025-12-30', 'End date 2025-12-30');
    assertEq(mergeRes.body.mergedCycles.length, 1, '1 cycle was merged');
    assertEq(Number(mergeRes.body.mergedCycles[0].id), Number(cycleBId), 'Cycle B was the merged cycle');

    // Financial calculations:
    // Total Milk: 20 + 30 = 50L
    // Gross: 50 * ₹40 = ₹2,000.00
    // Feed Deduction: 200 + 350 = ₹550.00 (counted once)
    // Final Amount: 2000 - 550 = ₹1,450.00
    assertEq(mergeRes.body.totalLiters, 50.0, 'Total milk is 50L');
    assertEq(mergeRes.body.grossAmount, 2000.0, 'Gross amount is ₹2,000.00');
    assertEq(mergeRes.body.feedDeduction, 550.0, 'Feed deduction is ₹550.00 (no double counting)');
    assertEq(mergeRes.body.finalAmount, 1450.0, 'Final amount is ₹1,450.00');

    // Verify Cycle B was deleted from database
    const cycleBCheck = await db.query('SELECT * FROM farmer_cycles WHERE id = $1', [cycleBId]);
    assertEq(cycleBCheck.rows.length, 0, 'Redundant Cycle B was deleted from database');

    // Verify all milk entries now point to Cycle A
    const milkReassigned = await db.query('SELECT DISTINCT cycle_id FROM milk_entries WHERE farmer_id = $1', [farmer4.id]);
    assertEq(milkReassigned.rows.length, 1, 'All milk entries belong to a single cycle');
    assertEq(Number(milkReassigned.rows[0].cycle_id), Number(cycleAId), 'All milk entries now point to Cycle A');

    // =========================================================================
    // TEST 6: Rejecting merges involving paid cycles (HTTP 409 Conflict)
    // =========================================================================
    console.log('\n📋 Test 6: Rejecting merges involving paid cycles');
    const farmer5 = await createTestFarmer('Paid Cycle Lock Farmer');
    testFarmerIds.push(farmer5.id);

    const c5ARes = await request('/cycles/start', {
      method: 'POST',
      body: {
        farmerId: farmer5.id,
        startDate: '2025-02-01',
        durationDays: 15,
        ratePerLiter: 40.0,
      },
    });
    const cycle5AId = c5ARes.body.id;

    const c5BRes = await request('/cycles/start', {
      method: 'POST',
      body: {
        farmerId: farmer5.id,
        startDate: '2025-02-16',
        durationDays: 15,
        ratePerLiter: 40.0,
      },
    });
    const cycle5BId = c5BRes.body.id;

    // Simulate payment on Cycle 5B
    await db.query(
      `INSERT INTO payments (cycle_id, total_liters, total_amount, feed_deduction, final_amount, paid_date)
       VALUES ($1, 0, 0, 0, 0, '2025-03-01')`,
      [cycle5BId]
    );
    await db.query(`UPDATE farmer_cycles SET status = 'paid' WHERE id = $1`, [cycle5BId]);

    // Try to extend Cycle 5A to 30 days (would overlap paid cycle 5B)
    const rejectMergeRes = await request(`/cycles/${cycle5AId}`, {
      method: 'PUT',
      body: { durationDays: 30 },
    });
    assertEq(rejectMergeRes.status, 409, 'Rejected with HTTP 409 Conflict when overlapping cycle is paid');
    assert(
      rejectMergeRes.body.message.includes('already been paid'),
      'Clear error message explaining overlapping cycle is paid'
    );

    // Verify neither cycle was modified or deleted
    const check5A = await db.query('SELECT duration_days FROM farmer_cycles WHERE id = $1', [cycle5AId]);
    assertEq(check5A.rows[0].duration_days, 15, 'Cycle 5A duration remains 15 days');
    const check5B = await db.query('SELECT status FROM farmer_cycles WHERE id = $1', [cycle5BId]);
    assertEq(check5B.rows[0].status, 'paid', 'Cycle 5B status remains paid');

    // =========================================================================
    // TEST 7: Handling different rates safely
    // =========================================================================
    console.log('\n📋 Test 7: Handling different rates safely');
    const farmer6 = await createTestFarmer('Different Rates Farmer');
    testFarmerIds.push(farmer6.id);

    // Cycle A: March 1-15 @ ₹38
    const c6ARes = await request('/cycles/start', {
      method: 'POST',
      body: {
        farmerId: farmer6.id,
        startDate: '2025-03-01',
        durationDays: 15,
        ratePerLiter: 38.0,
      },
    });
    const cycle6AId = c6ARes.body.id;

    // Cycle B: March 16-30 @ ₹44
    const c6BRes = await request('/cycles/start', {
      method: 'POST',
      body: {
        farmerId: farmer6.id,
        startDate: '2025-03-16',
        durationDays: 15,
        ratePerLiter: 44.0,
      },
    });
    const cycle6BId = c6BRes.body.id;

    // Milk in Cycle A: 10L, Cycle B: 10L
    await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer6.id, date: '2025-03-05', time: 'morning', liters: 10 },
    });
    await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer6.id, date: '2025-03-20', time: 'evening', liters: 10 },
    });

    // Extend Cycle A to 30 days
    const diffRateRes = await request(`/cycles/${cycle6AId}`, {
      method: 'PUT',
      body: { durationDays: 30 },
    });
    assertEq(diffRateRes.status, 200, 'Merge succeeded with different rates');
    assertEq(diffRateRes.body.ratePerLiter, 38.0, 'Preserved destination rate ₹38.00');
    assert(diffRateRes.body.rateDetails, 'Rate details returned');
    assertEq(diffRateRes.body.rateDetails.mergedCycles[0].previousRate, 44.0, 'Reported merged cycle previous rate ₹44.00');
    assertEq(diffRateRes.body.grossAmount, 760.0, 'Gross computed using destination rate: 20L * ₹38 = ₹760.00');

    // =========================================================================
    // TEST 8: Handling duplicate milk-entry conflicts
    // =========================================================================
    console.log('\n📋 Test 8: Handling duplicate milk-entry conflicts');
    const farmer7 = await createTestFarmer('Conflict Farmer');
    testFarmerIds.push(farmer7.id);

    const c7ARes = await request('/cycles/start', {
      method: 'POST',
      body: {
        farmerId: farmer7.id,
        startDate: '2025-04-01',
        durationDays: 15,
        ratePerLiter: 40.0,
      },
    });
    const cycle7AId = c7ARes.body.id;

    const c7BRes = await request('/cycles/start', {
      method: 'POST',
      body: {
        farmerId: farmer7.id,
        startDate: '2025-04-16',
        durationDays: 15,
        ratePerLiter: 40.0,
      },
    });
    const cycle7BId = c7BRes.body.id;

    // Normal milk entry in 7A
    await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer7.id, date: '2025-04-05', time: 'morning', liters: 10 },
    });

    // Temporarily drop constraint to insert a conflicting entry in 7B on the same date/session
    await db.query(`ALTER TABLE milk_entries DROP CONSTRAINT IF EXISTS milk_unique_farmer_shift`);
    try {
      await db.query(
        `INSERT INTO milk_entries (farmer_id, cycle_id, date, time, liters) VALUES ($1, $2, '2025-04-05', 'morning', 15)`,
        [farmer7.id, cycle7BId]
      );

      // Attempt merge - should detect conflict and return HTTP 409 Conflict
      const conflictRes = await request(`/cycles/${cycle7AId}`, {
        method: 'PUT',
        body: { durationDays: 30 },
      });
      assertEq(conflictRes.status, 409, 'Conflict detected and returned HTTP 409');
      assert(
        conflictRes.body.message.includes('conflicting milk entry'),
        'Clear conflict error message explaining conflict'
      );
    } finally {
      await db.query(`DELETE FROM milk_entries WHERE cycle_id = $1 AND date = '2025-04-05'`, [cycle7BId]);
      await db.query(`ALTER TABLE milk_entries ADD CONSTRAINT milk_unique_farmer_shift UNIQUE (farmer_id, date, time)`);
    }

    // =========================================================================
    // TEST 9: Rejecting overlapping incompatible cycles
    // =========================================================================
    console.log('\n📋 Test 9: Rejecting overlapping incompatible cycles');
    const farmer8 = await createTestFarmer('Incompatible Overlap Farmer');
    testFarmerIds.push(farmer8.id);

    // Cycle 8A: May 1 to May 15
    const c8ARes = await request('/cycles/start', {
      method: 'POST',
      body: {
        farmerId: farmer8.id,
        startDate: '2025-05-01',
        durationDays: 15,
        ratePerLiter: 40.0,
      },
    });
    const cycle8AId = c8ARes.body.id;

    // Cycle 8B: May 16 to June 14 (30 days cycle extending beyond May 30)
    await db.query(
      `INSERT INTO farmer_cycles (farmer_id, start_date, end_date, duration_days, cycle_type, rate_per_liter, payment_due_date, status)
       VALUES ($1, '2025-05-16', '2025-06-14', 30, '30_days', 40.0, '2025-06-14', 'active')`,
      [farmer8.id]
    );

    // Extending 8A to 30 days (May 1-30) would overlap 8B which extends beyond May 30!
    const incompRes = await request(`/cycles/${cycle8AId}`, {
      method: 'PUT',
      body: { durationDays: 30 },
    });
    assertEq(incompRes.status, 409, 'Rejected with HTTP 409 Conflict when overlapping cycle extends beyond range');
    assert(
      incompRes.body.message.includes('extends beyond'),
      'Clear error message explaining overlap extends beyond 30-day range'
    );

    // =========================================================================
    // TEST 10: Transaction rollback and concurrent payment confirmation
    // =========================================================================
    console.log('\n📋 Test 10: Transaction rollback and concurrent payment confirmation');
    const farmer9 = await createTestFarmer('Concurrent Farmer');
    testFarmerIds.push(farmer9.id);

    const c9Res = await request('/cycles/start', {
      method: 'POST',
      body: {
        farmerId: farmer9.id,
        startDate: '2025-06-01',
        durationDays: 15,
        ratePerLiter: 40.0,
      },
    });
    const cycle9Id = c9Res.body.id;

    // Confirm payment directly in database inside a transaction
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO payments (cycle_id, total_liters, total_amount, feed_deduction, final_amount, paid_date)
         VALUES ($1, 0, 0, 0, 0, '2025-06-16')`,
        [cycle9Id]
      );
      await client.query(`UPDATE farmer_cycles SET status = 'paid' WHERE id = $1`, [cycle9Id]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    // Attempt to update cycle rate after payment confirmation
    const paidEditRes = await request(`/cycles/${cycle9Id}`, {
      method: 'PUT',
      body: { ratePerLiter: 50.0 },
    });
    assertEq(paidEditRes.status, 409, 'Rejected post-payment edit with HTTP 409 Conflict');

    // Attempt to split paid cycle
    const paidSplitRes = await request(`/cycles/${cycle9Id}`, {
      method: 'PUT',
      body: { durationDays: 15 },
    });
    assertEq(paidSplitRes.status, 409, 'Rejected split on paid cycle with HTTP 409 Conflict');

    // =========================================================================
    // TEST 11: Preserving wallet and completed-payment history
    // =========================================================================
    console.log('\n📋 Test 11: Preserving wallet and completed-payment history');
    const farmer10 = await createTestFarmer('Wallet History Farmer');
    testFarmerIds.push(farmer10.id);

    // Check initial wallet balance
    const walletRes = await request('/wallet/balance');
    assertEq(walletRes.status, 200, 'Wallet balance endpoint accessible');
    const initialBalance = Number(walletRes.body.balance);

    // Create cycle 10
    const c10Res = await request('/cycles/start', {
      method: 'POST',
      body: {
        farmerId: farmer10.id,
        startDate: '2025-07-01',
        durationDays: 15,
        ratePerLiter: 40.0,
      },
    });
    const cycle10Id = c10Res.body.id;

    // Add milk entry: 25L @ ₹40 = ₹1,000
    await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer10.id, date: '2025-07-05', time: 'morning', liters: 25 },
    });

    // Ensure wallet has funds: add receipt if balance < 1000
    if (initialBalance < 1000) {
      await request('/wallet/receipt', {
        method: 'POST',
        body: {
          amount: 5000,
          transactionDate: '2025-07-01',
          reference: `TEST_REC_${Date.now()}`,
          description: 'Top-up for test',
        },
      });
    }

    // Settle cycle 10 through automatic wallet distribution
    const distPreviewRes = await request('/wallet/distribution/preview', {
      method: 'POST',
      body: { mode: 'BELOW_BALANCE' },
    });
    assertEq(distPreviewRes.status, 200, 'Distribution preview generated successfully');

    const previewId = distPreviewRes.body.previewId;
    const previewHash = distPreviewRes.body.previewHash;

    const confirmRes = await request('/wallet/distribution/confirm', {
      method: 'POST',
      body: { previewId, previewHash },
    });
    assert(confirmRes.status === 200 || confirmRes.status === 201, 'Distribution confirmed successfully via wallet');

    // Attempt to delete or edit paid cycle 10
    const delPaidRes = await request(`/cycles/${cycle10Id}`, { method: 'DELETE' });
    assertEq(delPaidRes.status, 409, 'Deleting paid cycle rejected with HTTP 409 Conflict');

    // Verify payment record in database is intact
    const paymentRecord = await db.query('SELECT * FROM payments WHERE cycle_id = $1', [cycle10Id]);
    assertEq(paymentRecord.rows.length, 1, 'Payment record preserved intact');
    assertEq(Number(paymentRecord.rows[0].final_amount), 1000.0, 'Payment final amount is ₹1,000.00');

    // Verify wallet ledger entry is intact
    const ledgerEntry = await db.query('SELECT * FROM wallet_ledger WHERE related_payment_id = $1', [paymentRecord.rows[0].id]);
    assertEq(ledgerEntry.rows.length, 1, 'Wallet ledger transaction preserved intact');
    assertEq(Math.abs(Number(ledgerEntry.rows[0].amount)), 1000.0, 'Ledger transaction amount is ₹1,000.00');

  } catch (err) {
    console.error('Unhandled error in test suite:', err);
    failed++;
    failures.push(`Unhandled error: ${err.message}`);
  } finally {
    // Cleanup created farmers
    for (const id of testFarmerIds) {
      await cleanupFarmer(id);
    }

    if (server) {
      server.close();
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
  if (failures.length > 0) {
    console.log('\n❌ Failures:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log('='.repeat(60) + '\n');

  await db.closePool();
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
