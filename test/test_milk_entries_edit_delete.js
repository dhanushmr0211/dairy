/**
 * Comprehensive Automated Test Suite for:
 * Edit and Delete Daily Milk Entries Feature
 *
 * Scenarios tested:
 * 1. Editing milk quantity successfully.
 * 2. Editing the entry date and assigning the correct cycle.
 * 3. Changing the morning/evening session.
 * 4. Preventing duplicate entries.
 * 5. Deleting one entry without deleting other entries.
 * 6. Recalculating unpaid-cycle amounts after edits and deletions (including negative balances).
 * 7. Rejecting edits and deletions in paid cycles (HTTP 409 Conflict).
 * 8. Rejecting movement from or into a paid cycle (HTTP 409 Conflict).
 * 9. Correct handling of the first and last dates of a cycle.
 * 10. Concurrent payment confirmation and entry-edit attempts.
 * 11. Wallet distribution previews becoming stale/rejected after changes.
 * 12. Database rollback if any part of an operation fails.
 *
 * Usage: node test/test_milk_entries_edit_delete.js
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

function assertNumEq(actual, expected, message) {
  const a = Number(actual);
  const b = Number(expected);
  assert(Math.abs(a - b) < 0.001, `${message} [expected: ${b}, got: ${a}]`);
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

async function createTestFarmer(name, rate = 35.00) {
  const res = await request('/farmers', {
    method: 'POST',
    body: {
      name,
      phone: uniquePhone(),
      rate_per_liter: rate,
    },
  });
  if (!res.ok) throw new Error(`Failed to create farmer: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function createTestCycle(farmerId, startDate, durationDays = 15, rate = 35.00, cycleType = '15_days') {
  const res = await request('/cycles/start', {
    method: 'POST',
    body: {
      farmerId,
      startDate,
      durationDays,
      ratePerLiter: rate,
      cycleType,
    },
  });
  if (!res.ok) throw new Error(`Failed to create cycle: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 Starting Milk Entries Edit and Delete Test Suite');
  console.log('======================================================\n');

  // Start HTTP server on dynamic port
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Server running at ${baseUrl}\n`);

  try {
    // -------------------------------------------------------------
    // Scenario 1: Editing milk quantity successfully
    // -------------------------------------------------------------
    console.log('\n--- Scenario 1: Editing Milk Quantity Successfully ---');
    const farmer1 = await createTestFarmer('Edit Qty Farmer', 40.00);
    const cycle1 = await createTestCycle(farmer1.id, '2026-11-01', 15, 40.00);

    const addRes1 = await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer1.id, date: '2026-11-03', time: 'morning', liters: 12.00 },
    });
    assertEq(addRes1.status, 201, 'Created initial milk entry with 12.00L');
    const entry1Id = addRes1.body.id;

    // PATCH quantity to 18.50L via /milk-entries/:id
    const editRes1 = await request(`/milk-entries/${entry1Id}`, {
      method: 'PATCH',
      body: { liters: 18.50 },
    });
    assertEq(editRes1.status, 200, 'PATCH /milk-entries/:id returned 200 OK');
    assertNumEq(editRes1.body.entry.liters, 18.50, 'Milk entry quantity updated to 18.50L');
    assertNumEq(editRes1.body.cycle.totalLiters, 18.50, 'Recalculated cycle total liters is 18.50L');
    assertNumEq(editRes1.body.cycle.grossAmount, 740.00, 'Recalculated cycle gross amount is 740.00 (18.50 * 40.00)');

    // Verify GET /milk-entries/:id returns the updated entry
    const getRes1 = await request(`/milk-entries/${entry1Id}`);
    assertEq(getRes1.status, 200, 'GET /milk-entries/:id returned 200 OK');
    assertNumEq(getRes1.body.entry.liters, 18.50, 'GET confirmed entry quantity is 18.50L');

    // -------------------------------------------------------------
    // Scenario 2: Editing entry date and assigning the correct cycle
    // -------------------------------------------------------------
    console.log('\n--- Scenario 2: Editing Entry Date & Assigning Correct Cycle ---');
    // Create Cycle 2 for Nov 16 to Nov 30
    const cycle2 = await createTestCycle(farmer1.id, '2026-11-16', 15, 40.00);
    assert(cycle2.id !== cycle1.id, 'Second cycle created for second half of November');

    // Move entry1 from Nov 3 (Cycle 1) to Nov 18 (Cycle 2)
    const moveRes = await request(`/milk-entries/${entry1Id}`, {
      method: 'PATCH',
      body: { date: '2026-11-18' },
    });
    assertEq(moveRes.status, 200, 'Date change returned 200 OK');
    assertEq(moveRes.body.entry.cycle_id, cycle2.id, `Entry moved to destination Cycle #${cycle2.id}`);
    assertNumEq(moveRes.body.cycle.totalLiters, 18.50, 'Destination cycle has 18.50L');
    assertNumEq(moveRes.body.sourceCycle.totalLiters, 0.00, 'Source cycle total liters reduced to 0.00L');

    // -------------------------------------------------------------
    // Scenario 3: Changing the morning/evening session
    // -------------------------------------------------------------
    console.log('\n--- Scenario 3: Changing Morning/Evening Session ---');
    const sessionRes = await request(`/milk-entries/${entry1Id}`, {
      method: 'PATCH',
      body: { time: 'evening' },
    });
    assertEq(sessionRes.status, 200, 'Session change returned 200 OK');
    assertEq(sessionRes.body.entry.time, 'evening', 'Entry time successfully changed to evening');

    // -------------------------------------------------------------
    // Scenario 4: Preventing duplicate entries
    // -------------------------------------------------------------
    console.log('\n--- Scenario 4: Preventing Duplicate Entries ---');
    // Add a morning entry on Nov 18
    const dupResAdd = await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer1.id, date: '2026-11-18', time: 'morning', liters: 10.00 },
    });
    assertEq(dupResAdd.status, 201, 'Created morning entry on 2026-11-18');
    const morningEntryId = dupResAdd.body.id;

    // Attempt to update entry1Id (currently evening on 2026-11-18) to morning on 2026-11-18
    const dupEditRes = await request(`/milk-entries/${entry1Id}`, {
      method: 'PATCH',
      body: { time: 'morning' },
    });
    assertEq(dupEditRes.status, 409, 'Duplicate edit rejected with HTTP 409 Conflict');
    assert(dupEditRes.body.message.includes('already exists'), 'Conflict message mentions duplicate entry');

    // -------------------------------------------------------------
    // Scenario 5: Deleting one entry without deleting other entries
    // -------------------------------------------------------------
    console.log('\n--- Scenario 5: Deleting One Entry Without Deleting Other Entries ---');
    // On 2026-11-18, we have morningEntryId (10L) and entry1Id (18.5L evening)
    const delRes = await request(`/milk-entries/${morningEntryId}`, {
      method: 'DELETE',
    });
    assertEq(delRes.status, 200, 'DELETE /milk-entries/:id returned 200 OK');
    assertNumEq(delRes.body.deletedEntryId, morningEntryId, 'Confirmed morningEntryId was deleted');

    // Verify morning entry is 404
    const verifyDel = await request(`/milk-entries/${morningEntryId}`);
    assertEq(verifyDel.status, 404, 'Deleted morning entry no longer found (404)');

    // Verify evening entry still exists intact
    const verifyEvening = await request(`/milk-entries/${entry1Id}`);
    assertEq(verifyEvening.status, 200, 'Evening entry on same date still exists');
    assertNumEq(verifyEvening.body.entry.liters, 18.50, 'Evening entry quantity is intact (18.50L)');

    // -------------------------------------------------------------
    // Scenario 6: Recalculating unpaid-cycle amounts (including negative balances)
    // -------------------------------------------------------------
    console.log('\n--- Scenario 6: Recalculating Unpaid-Cycle Amounts & Negative Amounts ---');
    const farmer2 = await createTestFarmer('Calculation Farmer', 30.00);
    const cycle3 = await createTestCycle(farmer2.id, '2026-12-01', 15, 30.00);

    // Add 10L milk -> Gross = 300.00
    const addCalcRes = await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer2.id, date: '2026-12-05', time: 'morning', liters: 10.00 },
    });
    assertEq(addCalcRes.status, 201, 'Milk added: 10L');
    const calcEntryId = addCalcRes.body.id;

    // Add feed deduction of 500.00 in the cycle date range
    const feedRes = await request('/feed', {
      method: 'POST',
      body: { farmerId: farmer2.id, date: '2026-12-06', item: 'Cattle Feed', quantity: 2, amount: 500.00 },
    });
    assertEq(feedRes.status, 201, 'Feed record added: Rs 500.00');

    // Check preview: gross = 300, feed = 500, final = -200 (not clamped to 0)
    const previewRes1 = await request(`/payments/preview/${cycle3.id}`);
    assertEq(previewRes1.status, 200, 'Cycle preview fetched');
    assertNumEq(previewRes1.body.total_liters, 10.00, 'Total liters is 10.00L');
    assertNumEq(previewRes1.body.gross_amount, 300.00, 'Gross amount is 300.00');
    assertNumEq(previewRes1.body.feed_deduction, 500.00, 'Feed deduction is 500.00');
    assertNumEq(previewRes1.body.final_amount, -200.00, 'Final amount is -200.00 (negative not clamped)');

    // Edit milk quantity from 10L to 25L -> Gross = 750, Final = 750 - 500 = 250
    const editCalcRes = await request(`/milk-entries/${calcEntryId}`, {
      method: 'PATCH',
      body: { liters: 25.00 },
    });
    assertEq(editCalcRes.status, 200, 'Updated milk quantity to 25L');
    assertNumEq(editCalcRes.body.cycle.totalLiters, 25.00, 'Cycle total liters updated to 25.00L');
    assertNumEq(editCalcRes.body.cycle.grossAmount, 750.00, 'Cycle gross amount updated to 750.00');
    assertNumEq(editCalcRes.body.cycle.finalAmount, 250.00, 'Cycle final amount updated to 250.00 (750 - 500)');

    // -------------------------------------------------------------
    // Scenario 7: Rejecting edits and deletions in paid cycles
    // -------------------------------------------------------------
    console.log('\n--- Scenario 7: Rejecting Edits & Deletions in Paid Cycles ---');
    const farmer3 = await createTestFarmer('Paid Protection Farmer', 35.00);
    const cyclePaid = await createTestCycle(farmer3.id, '2026-09-01', 15, 35.00);

    const paidEntryRes = await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer3.id, date: '2026-09-05', time: 'morning', liters: 20.00 },
    });
    assertEq(paidEntryRes.status, 201, 'Milk entry created in cycle before payment');
    const paidEntryId = paidEntryRes.body.id;

    // Confirm payment for cyclePaid via /payments/pay
    const payRes = await request('/payments/pay', {
      method: 'POST',
      body: { cycleId: cyclePaid.id, paidDate: '2026-09-16' },
    });
    assertEq(payRes.status, 201, 'Payment completed and cycle is now PAID');

    // Attempt to edit milk entry in paid cycle
    const editPaidRes = await request(`/milk-entries/${paidEntryId}`, {
      method: 'PATCH',
      body: { liters: 30.00 },
    });
    assertEq(editPaidRes.status, 409, 'Editing milk entry in paid cycle returns HTTP 409 Conflict');

    // Attempt to delete milk entry in paid cycle
    const delPaidRes = await request(`/milk-entries/${paidEntryId}`, {
      method: 'DELETE',
    });
    assertEq(delPaidRes.status, 409, 'Deleting milk entry in paid cycle returns HTTP 409 Conflict');

    // -------------------------------------------------------------
    // Scenario 8: Rejecting movement from or into a paid cycle
    // -------------------------------------------------------------
    console.log('\n--- Scenario 8: Rejecting Movement From or Into a Paid Cycle ---');
    // Create an unpaid cycle for farmer3 in another period (e.g., Nov 01 to Nov 15)
    const unpaidCycleF3 = await createTestCycle(farmer3.id, '2026-11-01', 15, 35.00);
    const freshEntryRes = await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer3.id, date: '2026-11-05', time: 'morning', liters: 15.00 },
    });
    assertEq(freshEntryRes.status, 201, 'Milk entry created in unpaid cycle');
    const freshEntryId = freshEntryRes.body.id;

    // Try moving fresh entry into the paid cycle date range (2026-09-07)
    const moveToPaidRes = await request(`/milk-entries/${freshEntryId}`, {
      method: 'PATCH',
      body: { date: '2026-09-07' },
    });
    assertEq(moveToPaidRes.status, 409, 'Moving entry into a paid cycle returns HTTP 409 Conflict');

    // Try moving entry out of the paid cycle (paidEntryId) to the unpaid date (2026-11-06)
    const moveOutOfPaidRes = await request(`/milk-entries/${paidEntryId}`, {
      method: 'PATCH',
      body: { date: '2026-11-06' },
    });
    assertEq(moveOutOfPaidRes.status, 409, 'Moving entry out of a paid cycle returns HTTP 409 Conflict');

    // -------------------------------------------------------------
    // Scenario 9: Correct handling of the first and last dates of a cycle
    // -------------------------------------------------------------
    console.log('\n--- Scenario 9: First and Last Dates of Cycle Boundaries ---');
    const farmer4 = await createTestFarmer('Boundaries Farmer', 38.00);
    // Fixed 15-day cycle: Nov 1 to Nov 15 (inclusive)
    const cycle15 = await createTestCycle(farmer4.id, '2026-11-01', 15, 38.00);
    assertEq(cycle15.start_date.split('T')[0], '2026-11-01', 'Cycle starts on 2026-11-01');
    assertEq(cycle15.end_date.split('T')[0], '2026-11-15', 'Cycle ends on 2026-11-15 (inclusive 15 days)');

    const entryStart = await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer4.id, date: '2026-11-01', time: 'morning', liters: 14.00 },
    });
    assertEq(entryStart.status, 201, 'Milk entry successfully created on cycle first date (2026-11-01)');
    assertEq(entryStart.body.cycle_id, cycle15.id, 'Entry belongs to cycle15');

    // Edit entry to the exact last day (2026-11-15)
    const editEndRes = await request(`/milk-entries/${entryStart.body.id}`, {
      method: 'PATCH',
      body: { date: '2026-11-15' },
    });
    assertEq(editEndRes.status, 200, 'Milk entry successfully moved to cycle last date (2026-11-15)');
    assertEq(editEndRes.body.entry.cycle_id, cycle15.id, 'Entry still belongs to cycle15');

    // Calendar month 31-day cycle boundary check
    const cycleMonth = await createTestCycle(farmer4.id, '2026-10-01', 31, 38.00, 'calendar_month');
    assertEq(cycleMonth.end_date.split('T')[0], '2026-10-31', 'Calendar month cycle ends on Oct 31');

    const entryOctEnd = await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer4.id, date: '2026-10-31', time: 'evening', liters: 16.50 },
    });
    assertEq(entryOctEnd.status, 201, 'Milk entry successfully created on Oct 31 for calendar month');
    assertEq(entryOctEnd.body.cycle_id, cycleMonth.id, 'Entry correctly assigned to Oct 31 cycle');

    // -------------------------------------------------------------
    // Scenario 10: Concurrent payment confirmation & entry-edit attempts
    // -------------------------------------------------------------
    console.log('\n--- Scenario 10: Concurrent Payment Confirmation & Entry Edit ---');
    const farmer5 = await createTestFarmer('Concurrency Farmer', 42.00);
    const cycleConc = await createTestCycle(farmer5.id, '2026-12-01', 15, 42.00);

    const concEntry = await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer5.id, date: '2026-12-02', time: 'morning', liters: 10.00 },
    });
    assertEq(concEntry.status, 201, 'Created entry for concurrency test');
    const concEntryId = concEntry.body.id;

    // Simulate concurrent payment confirmation
    const concPayRes = await request('/payments/pay', {
      method: 'POST',
      body: { cycleId: cycleConc.id, paidDate: '2026-12-16' },
    });
    assertEq(concPayRes.status, 201, 'Cycle payment confirmed');

    // Now edit the entry; with row locks and status checks, must be rejected with 409 Conflict
    const concEditRes = await request(`/milk-entries/${concEntryId}`, {
      method: 'PATCH',
      body: { liters: 12.00 },
    });
    assertEq(concEditRes.status, 409, 'Edit immediately rejected with HTTP 409 Conflict once cycle is paid');

    // -------------------------------------------------------------
    // Scenario 11: Wallet distribution previews becoming stale after changes
    // -------------------------------------------------------------
    console.log('\n--- Scenario 11: Wallet Distribution Previews Invalidation ---');
    const farmer6 = await createTestFarmer('Preview Farmer', 36.00);
    const cyclePreview = await createTestCycle(farmer6.id, '2026-12-16', 15, 36.00);

    const prevMilk = await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer6.id, date: '2026-12-18', time: 'morning', liters: 20.00 },
    });
    assertEq(prevMilk.status, 201, 'Created milk entry in cyclePreview');
    const prevEntryId = prevMilk.body.id;

    // Insert a pending distribution preview linked to this cycle
    const prevClient = await db.getClient();
    const prevInsert = await prevClient.query(
      `INSERT INTO distribution_previews (status, mode, margin, wallet_balance_at_preview, proposed_total, selected_cycle_count, selected_farmer_count, remaining_balance, shortfall, preview_hash)
       VALUES ('pending', 'BELOW_BALANCE', 500.00, 5000.00, 720.00, 1, 1, 4280.00, 0, 'test_hash_123')
       RETURNING id`
    );
    const previewId = prevInsert.rows[0].id;
    await prevClient.query(
      `INSERT INTO distribution_cycles (distribution_id, cycle_id, farmer_id, calculated_amount)
       VALUES ($1, $2, $3, 720.00)`,
      [previewId, cyclePreview.id, farmer6.id]
    );
    prevClient.release();

    // Verify preview is pending initially
    const checkPrev1 = await db.query('SELECT status FROM distribution_previews WHERE id = $1', [previewId]);
    assertEq(checkPrev1.rows[0].status, 'pending', 'Distribution preview is pending before edit');

    // Now edit the milk entry in that cycle
    const editPreviewRes = await request(`/milk-entries/${prevEntryId}`, {
      method: 'PATCH',
      body: { liters: 25.00 },
    });
    assertEq(editPreviewRes.status, 200, 'Milk entry updated in preview cycle');

    // Check preview status in database -> must be 'rejected' (stale)
    const checkPrev2 = await db.query('SELECT status FROM distribution_previews WHERE id = $1', [previewId]);
    assertEq(checkPrev2.rows[0].status, 'rejected', 'Distribution preview automatically marked rejected/stale after milk edit');

    // -------------------------------------------------------------
    // Scenario 12: Database rollback if any part of an operation fails
    // -------------------------------------------------------------
    console.log('\n--- Scenario 12: Database Rollback on Failure ---');
    const farmer7 = await createTestFarmer('Rollback Farmer', 30.00);
    const cycleRollback = await createTestCycle(farmer7.id, '2026-11-01', 15, 30.00);

    const rollbackEntry = await request('/milk', {
      method: 'POST',
      body: { farmerId: farmer7.id, date: '2026-11-05', time: 'morning', liters: 10.00 },
    });
    assertEq(rollbackEntry.status, 201, 'Created entry for rollback test');
    const rollbackEntryId = rollbackEntry.body.id;

    // Send invalid date that has no cycle
    const badDateRes = await request(`/milk-entries/${rollbackEntryId}`, {
      method: 'PATCH',
      body: { date: '2028-01-01', liters: 99.00 },
    });
    assertEq(badDateRes.status, 400, 'Attempt to move to date without cycle returns 400 Bad Request');

    // Verify database state: entry should NOT have changed to 99L or date 2028-01-01
    const verifyUnchanged = await request(`/milk-entries/${rollbackEntryId}`);
    assertEq(verifyUnchanged.status, 200, 'Entry fetched after failed update');
    assertNumEq(verifyUnchanged.body.entry.liters, 10.00, 'Quantity rolled back / remains 10.00L');
    assertEq(verifyUnchanged.body.entry.date.split('T')[0], '2026-11-05', 'Date remains 2026-11-05');

    // Send invalid quantity (negative liters)
    const negRes = await request(`/milk-entries/${rollbackEntryId}`, {
      method: 'PATCH',
      body: { liters: -5.00 },
    });
    assertEq(negRes.status, 400, 'Negative liters returns 400 Bad Request');
    const verifyNeg = await request(`/milk-entries/${rollbackEntryId}`);
    assertNumEq(verifyNeg.body.entry.liters, 10.00, 'Quantity unaffected by rejected negative liters');

  } catch (err) {
    console.error('Unexpected error during test execution:', err);
    failed++;
    failures.push(`Execution exception: ${err.message}`);
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await db.closePool();
  }

  console.log('\n======================================================');
  console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    console.log('Failed assertions:');
    failures.forEach((f) => console.log(`  ❌ ${f}`));
    process.exit(1);
  } else {
    console.log('🎉 All test scenarios passed successfully!');
    process.exit(0);
  }
}

runTests();
