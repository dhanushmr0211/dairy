/**
 * Automated Test Suite for:
 * 1. Cycle Date Handling (fixed 15-day, fixed 30-day, calendar-month with leap years & inclusive boundaries)
 * 2. Permanently Locking Completed Payments (HTTP 409 Conflict on all edits/deletions of paid cycles, milk, feed, payments)
 * 3. Unpaid Cycle Editing & Concurrency Checks
 * 
 * Usage: node test/test_cycle_dates_and_locks.js
 */

require('dotenv').config();
const http = require('http');
const app = require('../src/app');
const db = require('../src/config/db');
const { resolveCycleDates, isLeapYear, getDaysInMonth } = require('../src/utils/cycleDates');

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

// Generate unique phone numbers for test farmers to prevent collisions
function uniquePhone() {
  return '9' + Math.floor(100000000 + Math.random() * 900000000);
}

async function runAllTests() {
  console.log('\n============================================================');
  console.log('🧪 Starting Cycle Dates & Permanent Paid Lock Test Suite');
  console.log('============================================================\n');

  // Start server on random available port
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  const client = await db.getClient();
  await client.query("SET SESSION app.bypass_paid_locks = 'off'");

  try {
    // -------------------------------------------------------------
    // Test 1: Unit & Boundary Date Logic
    // -------------------------------------------------------------
    console.log('📋 Test Group 1: Cycle Date Calculation Boundaries');
    {
      // October Calendar Month (Oct 1 to Oct 31, 31 days)
      const octCalendar = resolveCycleDates({ startDate: '2026-10-01', cycleType: 'calendar_month' });
      assertEq(octCalendar.startDate, '2026-10-01', 'October calendar month starts on Oct 1');
      assertEq(octCalendar.endDate, '2026-10-31', 'October calendar month ends on Oct 31 (inclusive)');
      assertEq(octCalendar.durationDays, 31, 'October calendar month has exactly 31 duration days');

      // October Fixed 30-Day Cycle (Oct 1 to Oct 30, exactly 30 calendar dates)
      const octFixed30 = resolveCycleDates({ startDate: '2026-10-01', durationDays: 30 });
      assertEq(octFixed30.startDate, '2026-10-01', 'October fixed 30-day starts on Oct 1');
      assertEq(octFixed30.endDate, '2026-10-30', 'October fixed 30-day covers exactly 30 calendar dates (Oct 1-30)');
      assertEq(octFixed30.durationDays, 30, 'October fixed 30-day duration is 30');

      // Fixed 15-Day Cycle (Oct 1 to Oct 15, exactly 15 calendar dates)
      const octFixed15 = resolveCycleDates({ startDate: '2026-10-01', durationDays: 15 });
      assertEq(octFixed15.startDate, '2026-10-01', 'Fixed 15-day starts on Oct 1');
      assertEq(octFixed15.endDate, '2026-10-15', 'Fixed 15-day covers exactly 15 calendar dates (Oct 1-15)');
      assertEq(octFixed15.durationDays, 15, 'Fixed 15-day duration is 15');

      // February Leap Year 2024 (Feb 1 to Feb 29, 29 days)
      assert(isLeapYear(2024), '2024 is a leap year');
      assertEq(getDaysInMonth(2024, 2), 29, 'February 2024 has 29 days');
      const feb2024 = resolveCycleDates({ startDate: '2024-02-01', cycleType: 'calendar_month' });
      assertEq(feb2024.startDate, '2024-02-01', 'Feb 2024 leap year starts on Feb 1');
      assertEq(feb2024.endDate, '2024-02-29', 'Feb 2024 leap year ends on Feb 29');
      assertEq(feb2024.durationDays, 29, 'Feb 2024 leap year duration is 29');

      // February Non-Leap Year 2025 (Feb 1 to Feb 28, 28 days)
      assert(!isLeapYear(2025), '2025 is not a leap year');
      assertEq(getDaysInMonth(2025, 2), 28, 'February 2025 has 28 days');
      const feb2025 = resolveCycleDates({ startDate: '2025-02-01', cycleType: 'calendar_month' });
      assertEq(feb2025.startDate, '2025-02-01', 'Feb 2025 non-leap starts on Feb 1');
      assertEq(feb2025.endDate, '2025-02-28', 'Feb 2025 non-leap ends on Feb 28');
      assertEq(feb2025.durationDays, 28, 'Feb 2025 non-leap duration is 28');

      // Month transitions for 30-day fixed across January-February
      const janToFeb = resolveCycleDates({ startDate: '2026-01-15', durationDays: 30 });
      assertEq(janToFeb.startDate, '2026-01-15', 'Transition cycle starts on 2026-01-15');
      assertEq(janToFeb.endDate, '2026-02-13', 'Transition cycle covers 30 dates to 2026-02-13');
      assertEq(janToFeb.durationDays, 30, 'Transition duration is 30 days');
    }

    // -------------------------------------------------------------
    // Test 2: API Creation of Cycles & Overlap Prevention
    // -------------------------------------------------------------
    console.log('\n📋 Test Group 2: API Cycle Creation & Overlap Prevention');
    let farmer1;
    let cycleOctMonth;
    {
      // Create Farmer 1
      const fRes = await request('/farmers', {
        method: 'POST',
        body: { name: 'Ramesh Test', phone: uniquePhone() },
      });
      assertEq(fRes.status, 201, 'Farmer 1 created successfully');
      farmer1 = fRes.body;

      // Create Calendar Month cycle for October (2026-10-01 to 2026-10-31)
      const cRes = await request('/cycles/start', {
        method: 'POST',
        body: {
          farmerId: farmer1.id,
          startDate: '2026-10-01',
          cycleType: 'calendar_month',
          ratePerLiter: 35.50,
        },
      });
      assertEq(cRes.status, 201, 'Calendar month cycle created');
      assertEq(cRes.body.duration_days, 31, 'Created cycle duration is 31 days');
      assert(cRes.body.end_date.startsWith('2026-10-31'), 'Created cycle ends on Oct 31');
      cycleOctMonth = cRes.body;

      // Attempt to create an overlapping cycle on Oct 15 -> should return 409 Conflict
      const overlapRes = await request('/cycles/start', {
        method: 'POST',
        body: {
          farmerId: farmer1.id,
          startDate: '2026-10-15',
          durationDays: 15,
          ratePerLiter: 36.00,
        },
      });
      assertEq(overlapRes.status, 409, 'Overlapping cycle creation blocked with HTTP 409');
      assert(overlapRes.body.message.includes('overlap'), 'Overlap error message returned');

      // Attempt to create overlapping cycle on Oct 31 (boundary overlap) -> should return 409 Conflict
      const boundaryOverlapRes = await request('/cycles/start', {
        method: 'POST',
        body: {
          farmerId: farmer1.id,
          startDate: '2026-10-31',
          durationDays: 15,
          ratePerLiter: 36.00,
        },
      });
      assertEq(boundaryOverlapRes.status, 409, 'Boundary date Oct 31 overlap blocked with HTTP 409');

      // Cycle immediately following (starting Nov 1) -> should succeed without overlap
      const nextCycleRes = await request('/cycles/start', {
        method: 'POST',
        body: {
          farmerId: farmer1.id,
          startDate: '2026-11-01',
          durationDays: 30,
          ratePerLiter: 36.00,
        },
      });
      assertEq(nextCycleRes.status, 201, 'Non-overlapping subsequent cycle created successfully');
      assert(nextCycleRes.body.end_date.startsWith('2026-11-30'), 'Nov 1 fixed 30-day cycle ends on Nov 30');
    }

    // -------------------------------------------------------------
    // Test 3: Milk & Feed Entries on Boundary Dates & Calculations
    // -------------------------------------------------------------
    console.log('\n📋 Test Group 3: Boundary Milk & Feed Entries Assignment & Payment Calculation');
    let milkOct01;
    let milkOct31;
    let feedOct31;
    {
      // Milk entry on start boundary: 2026-10-01 morning
      const m1Res = await request('/milk', {
        method: 'POST',
        body: {
          farmerId: farmer1.id,
          date: '2026-10-01',
          time: 'morning',
          liters: 10,
        },
      });
      assertEq(m1Res.status, 201, 'Milk entry on start boundary (Oct 1) created');
      assertEq(m1Res.body.cycle_id, cycleOctMonth.id, 'Milk entry assigned to October cycle');
      milkOct01 = m1Res.body;

      // Milk entry on end boundary: 2026-10-31 evening
      const m2Res = await request('/milk', {
        method: 'POST',
        body: {
          farmerId: farmer1.id,
          date: '2026-10-31',
          time: 'evening',
          liters: 20,
        },
      });
      assertEq(m2Res.status, 201, 'Milk entry on end boundary (Oct 31) created');
      assertEq(m2Res.body.cycle_id, cycleOctMonth.id, 'Milk entry on Oct 31 assigned to October cycle');
      milkOct31 = m2Res.body;

      // Feed record on Oct 31
      const feedRes = await request('/feed', {
        method: 'POST',
        body: {
          farmerId: farmer1.id,
          date: '2026-10-31',
          item: 'Cattle Feed 50kg',
          quantity: 1,
          amount: 250.00,
        },
      });
      assertEq(feedRes.status, 201, 'Feed record on Oct 31 created');
      feedOct31 = feedRes.body;

      // Verify payment preview includes both Oct 1 and Oct 31 milk + feed deduction
      // Total Liters = 10 + 20 = 30 L
      // Gross = 30 * 35.50 = 1065.00
      // Feed = 250.00
      // Final = 1065 - 250 = 815.00
      const previewRes = await request(`/payments/preview/${cycleOctMonth.id}`);
      assertEq(previewRes.status, 200, 'Payment preview fetched');
      assertEq(previewRes.body.total_liters, 30, 'Total liters is exactly 30 (includes 31st)');
      assertEq(previewRes.body.gross_amount, 1065.00, 'Gross amount is 1065.00');
      assertEq(previewRes.body.feed_deduction, 250.00, 'Feed deduction on Oct 31 is 250.00');
      assertEq(previewRes.body.final_amount, 815.00, 'Final amount is 815.00');
    }

    // -------------------------------------------------------------
    // Test 4: Unpaid Cycle Modifications (Allowed)
    // -------------------------------------------------------------
    console.log('\n📋 Test Group 4: Unpaid Cycle Edits & Deletes (Allowed)');
    {
      // Edit milk entry while unpaid -> allowed
      const editMilkRes = await request(`/milk/${milkOct01.id}`, {
        method: 'PUT',
        body: { liters: 15 },
      });
      assertEq(editMilkRes.status, 200, 'Editing milk entry on unpaid cycle succeeds');
      assertEq(Number(editMilkRes.body.liters), 15, 'Milk liters updated to 15');

      // Edit feed record while unpaid -> allowed
      const editFeedRes = await request(`/feed/${feedOct31.id}`, {
        method: 'PUT',
        body: { amount: 300.00 },
      });
      assertEq(editFeedRes.status, 200, 'Editing feed record on unpaid cycle succeeds');
      assertEq(Number(editFeedRes.body.amount), 300.00, 'Feed amount updated to 300');

      // Revert liters back to 10 and feed back to 250
      await request(`/milk/${milkOct01.id}`, { method: 'PUT', body: { liters: 10 } });
      await request(`/feed/${feedOct31.id}`, { method: 'PUT', body: { amount: 250.00 } });
    }

    // -------------------------------------------------------------
    // Test 5: Permanent Lock on Completed Payments (Enforced with HTTP 409)
    // -------------------------------------------------------------
    console.log('\n📋 Test Group 5: Permanently Locking Completed Payments');
    let paymentRecord;
    {
      // Pay the October cycle
      const payRes = await request('/payments/pay', {
        method: 'POST',
        body: {
          cycleId: cycleOctMonth.id,
          paidDate: '2026-11-01',
        },
      });
      assertEq(payRes.status, 201, 'October cycle payment completed');
      assertEq(Number(payRes.body.final_amount), 815.00, 'Paid amount is 815.00');
      paymentRecord = payRes.body;

      // 1. Block adding milk entries to the paid cycle
      const addMilkToPaid = await request('/milk', {
        method: 'POST',
        body: {
          farmerId: farmer1.id,
          date: '2026-10-15',
          time: 'morning',
          liters: 12,
        },
      });
      assertEq(addMilkToPaid.status, 409, 'Adding milk entry to paid cycle returns HTTP 409 Conflict');

      // 2. Block editing existing milk entry of the paid cycle
      const editPaidMilk = await request(`/milk/${milkOct01.id}`, {
        method: 'PUT',
        body: { liters: 25 },
      });
      assertEq(editPaidMilk.status, 409, 'Editing milk entry of paid cycle returns HTTP 409 Conflict');

      // 3. Block deleting existing milk entry of the paid cycle
      const deletePaidMilk = await request(`/milk/${milkOct31.id}`, {
        method: 'DELETE',
      });
      assertEq(deletePaidMilk.status, 409, 'Deleting milk entry of paid cycle returns HTTP 409 Conflict');

      // 4. Block adding feed records for dates within the paid cycle
      const addFeedToPaid = await request('/feed', {
        method: 'POST',
        body: {
          farmerId: farmer1.id,
          date: '2026-10-20',
          item: 'Mineral Mix',
          quantity: 2,
          amount: 500,
        },
      });
      assertEq(addFeedToPaid.status, 409, 'Adding feed record for date in paid cycle returns HTTP 409 Conflict');

      // 5. Block editing existing feed record of the paid cycle
      const editPaidFeed = await request(`/feed/${feedOct31.id}`, {
        method: 'PUT',
        body: { amount: 400.00 },
      });
      assertEq(editPaidFeed.status, 409, 'Editing feed record in paid cycle returns HTTP 409 Conflict');

      // 6. Block deleting existing feed record of the paid cycle
      const deletePaidFeed = await request(`/feed/${feedOct31.id}`, {
        method: 'DELETE',
      });
      assertEq(deletePaidFeed.status, 409, 'Deleting feed record in paid cycle returns HTTP 409 Conflict');

      // 7. Block editing cycle rate, dates, or details of the paid cycle
      const editPaidCycle = await request(`/cycles/${cycleOctMonth.id}`, {
        method: 'PUT',
        body: { ratePerLiter: 40.00 },
      });
      assertEq(editPaidCycle.status, 409, 'Modifying details of paid cycle returns HTTP 409 Conflict');

      // 8. Block reopening / resetting paid cycle back to active
      const reopenPaidCycle = await request(`/cycles/${cycleOctMonth.id}`, {
        method: 'PUT',
        body: { status: 'active' },
      });
      assertEq(reopenPaidCycle.status, 409, 'Reopening paid cycle returns HTTP 409 Conflict');

      // 9. Block deleting the paid cycle
      const deletePaidCycle = await request(`/cycles/${cycleOctMonth.id}`, {
        method: 'DELETE',
      });
      assertEq(deletePaidCycle.status, 409, 'Deleting paid cycle returns HTTP 409 Conflict');

      // 10. Block editing or deleting the payment record
      const editPayment = await request(`/payments/${paymentRecord.id}`, {
        method: 'PUT',
        body: { finalAmount: 900.00 },
      });
      assertEq(editPayment.status, 409, 'Editing payment record returns HTTP 409 Conflict');

      const deletePayment = await request(`/payments/${paymentRecord.id}`, {
        method: 'DELETE',
      });
      assertEq(deletePayment.status, 409, 'Deleting payment record returns HTTP 409 Conflict');

      // 11. Database direct trigger test (verifying trigger blocks direct SQL modifications on paid cycles)
      try {
        await client.query('UPDATE farmer_cycles SET rate_per_liter = 99 WHERE id = $1', [cycleOctMonth.id]);
        assert(false, 'Direct SQL update on paid cycle should fail via trigger');
      } catch (err) {
        assert(err.message.includes('paid payment cycle'), 'Database trigger blocked direct SQL rate modification on paid cycle');
      }

      try {
        await client.query('DELETE FROM payments WHERE id = $1', [paymentRecord.id]);
        assert(false, 'Direct SQL delete on payments should fail via trigger');
      } catch (err) {
        assert(err.message.includes('cannot be deleted'), 'Database trigger blocked direct SQL delete on payment record');
      }
    }

    // -------------------------------------------------------------
    // Test 6: Concurrency / Double Payment Prevention
    // -------------------------------------------------------------
    console.log('\n📋 Test Group 6: Concurrency & Double Payment Prevention');
    {
      // Create Farmer 2 with an active cycle
      const f2Res = await request('/farmers', {
        method: 'POST',
        body: { name: 'Suresh Concurrency', phone: uniquePhone() },
      });
      const farmer2 = f2Res.body;

      const c2Res = await request('/cycles/start', {
        method: 'POST',
        body: {
          farmerId: farmer2.id,
          startDate: '2026-10-01',
          durationDays: 30,
          ratePerLiter: 34.00,
        },
      });
      const cycle2 = c2Res.body;

      // Add milk entry
      await request('/milk', {
        method: 'POST',
        body: { farmerId: farmer2.id, date: '2026-10-05', time: 'morning', liters: 50 },
      });

      // Simulate simultaneous payment calls on cycle2
      const [res1, res2] = await Promise.all([
        request('/payments/pay', { method: 'POST', body: { cycleId: cycle2.id, paidDate: '2026-11-01' } }),
        request('/payments/pay', { method: 'POST', body: { cycleId: cycle2.id, paidDate: '2026-11-01' } }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      assertEq(statuses[0], 201, 'One concurrent pay request succeeds (HTTP 201)');
      assertEq(statuses[1], 409, 'Other concurrent pay request fails safely (HTTP 409 Conflict)');
    }

  } catch (err) {
    console.error('Test Suite encountered unhandled error:', err);
    failed++;
    failures.push(`Unhandled error: ${err.message}`);
  } finally {
    client.release();
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

runAllTests();
