const assert = require('assert');

// Test financial metrics calculations
function getDaysDiff(targetDateStr, baseDateStr) {
  const target = new Date(targetDateStr).setHours(0, 0, 0, 0);
  const base = new Date(baseDateStr).setHours(0, 0, 0, 0);
  const diffTime = target - base;
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

function computeFinancialMetrics(unpaidCycles, selectedIdsSet = new Set(), todayStr) {
  let curOverdueAmount = 0;
  let curPendingAmount = 0;
  let curOverdueCount = 0;
  let curPendingCount = 0;

  let selOverdueAmount = 0;
  let selPendingAmount = 0;
  let selOverdueCount = 0;
  let selPendingCount = 0;

  for (const c of unpaidCycles) {
    const dueDateStr = c.paymentDueDate;
    const daysRemaining = getDaysDiff(dueDateStr, todayStr);
    const isOverdue = daysRemaining < 0;

    if (isOverdue) {
      curOverdueAmount += c.finalAmount;
      curOverdueCount += 1;
    } else {
      curPendingAmount += c.finalAmount;
      curPendingCount += 1;
    }

    if (selectedIdsSet.has(c.cycleId)) {
      if (isOverdue) {
        selOverdueAmount += c.finalAmount;
        selOverdueCount += 1;
      } else {
        selPendingAmount += c.finalAmount;
        selPendingCount += 1;
      }
    }
  }

  const curTotalOutstanding = Number((curOverdueAmount + curPendingAmount).toFixed(2));
  const selTotalAmount = Number((selOverdueAmount + selPendingAmount).toFixed(2));

  const afterOverdueAmount = Number(Math.max(0, curOverdueAmount - selOverdueAmount).toFixed(2));
  const afterPendingAmount = Number(Math.max(0, curPendingAmount - selPendingAmount).toFixed(2));
  const afterTotalOutstanding = Number((afterOverdueAmount + afterPendingAmount).toFixed(2));

  const afterOverdueCount = Math.max(0, curOverdueCount - selOverdueCount);
  const afterPendingCount = Math.max(0, curPendingCount - selPendingCount);

  return {
    current: {
      overdueAmount: Number(curOverdueAmount.toFixed(2)),
      pendingAmount: Number(curPendingAmount.toFixed(2)),
      totalOutstanding: curTotalOutstanding,
      overdueCycleCount: curOverdueCount,
      pendingCycleCount: curPendingCount,
    },
    selectedTotals: {
      amount: selTotalAmount,
    },
    afterPayment: {
      overdueAmount: afterOverdueAmount,
      pendingAmount: afterPendingAmount,
      totalOutstanding: afterTotalOutstanding,
      overdueCycleCount: afterOverdueCount,
      pendingCycleCount: afterPendingCount,
    },
  };
}

console.log('--- Running Payment Calculator System Tests ---');

const todayStr = '2026-10-15';

// Mock DB cycles
const mockUnpaidCycles = [
  // Overdue cycles (due before 2026-10-15)
  { cycleId: 1, farmerId: 1, farmerName: 'Ramesh', paymentDueDate: '2026-10-10', finalAmount: 6800.00 },
  { cycleId: 2, farmerId: 2, farmerName: 'Suresh', paymentDueDate: '2026-10-12', finalAmount: 5200.00 },
  { cycleId: 3, farmerId: 1, farmerName: 'Ramesh', paymentDueDate: '2026-10-14', finalAmount: 7000.00 }, // Same farmer 2nd cycle (overdue)
  
  // Pending / upcoming / due today cycles (due on or after 2026-10-15)
  { cycleId: 4, farmerId: 3, farmerName: 'Ravi', paymentDueDate: '2026-10-15', finalAmount: 8500.00 },   // Due today
  { cycleId: 5, farmerId: 4, farmerName: 'Mahesh', paymentDueDate: '2026-10-25', finalAmount: 12000.00 }, // Upcoming
  { cycleId: 6, farmerId: 1, farmerName: 'Ramesh', paymentDueDate: '2026-10-30', finalAmount: 4500.00 },  // Same farmer 3rd cycle (upcoming)
];

// Test 1: No cycles selected
{
  const res = computeFinancialMetrics(mockUnpaidCycles, new Set([]), todayStr);
  assert.strictEqual(res.current.overdueAmount, 19000.00); // 6800 + 5200 + 7000
  assert.strictEqual(res.current.pendingAmount, 25000.00); // 8500 + 12000 + 4500
  assert.strictEqual(res.current.totalOutstanding, 44000.00);
  assert.strictEqual(res.current.overdueCycleCount, 3);
  assert.strictEqual(res.current.pendingCycleCount, 3);

  assert.strictEqual(res.selectedTotals.amount, 0);
  assert.strictEqual(res.afterPayment.overdueAmount, 19000.00);
  assert.strictEqual(res.afterPayment.pendingAmount, 25000.00);
  assert.strictEqual(res.afterPayment.totalOutstanding, 44000.00);
  assert.strictEqual(res.afterPayment.overdueCycleCount, 3);
  assert.strictEqual(res.afterPayment.pendingCycleCount, 3);
  console.log('✓ Test 1 Passed: No cycles selected');
}

// Test 2: One cycle selected (Overdue)
{
  const res = computeFinancialMetrics(mockUnpaidCycles, new Set([1]), todayStr);
  assert.strictEqual(res.selectedTotals.amount, 6800.00);
  assert.strictEqual(res.afterPayment.overdueAmount, 12200.00); // 19000 - 6800
  assert.strictEqual(res.afterPayment.pendingAmount, 25000.00);
  assert.strictEqual(res.afterPayment.totalOutstanding, 37200.00);
  assert.strictEqual(res.afterPayment.overdueCycleCount, 2);
  assert.strictEqual(res.afterPayment.pendingCycleCount, 3);
  console.log('✓ Test 2 Passed: One overdue cycle selected');
}

// Test 3: Multiple cycles selected (Overdue + Due today)
{
  const res = computeFinancialMetrics(mockUnpaidCycles, new Set([1, 4]), todayStr);
  assert.strictEqual(res.selectedTotals.amount, 15300.00); // 6800 + 8500
  assert.strictEqual(res.afterPayment.overdueAmount, 12200.00);
  assert.strictEqual(res.afterPayment.pendingAmount, 16500.00); // 25000 - 8500
  assert.strictEqual(res.afterPayment.totalOutstanding, 28700.00);
  assert.strictEqual(res.afterPayment.overdueCycleCount, 2);
  assert.strictEqual(res.afterPayment.pendingCycleCount, 2);
  console.log('✓ Test 3 Passed: Multiple cycles selected');
}

// Test 4: Two cycles belonging to the SAME farmer selected (Cycle 1 & Cycle 3)
{
  const selectedFarmerIds = new Set();
  const selectedCycles = [1, 3].map(id => {
    const c = mockUnpaidCycles.find(x => x.cycleId === id);
    selectedFarmerIds.add(c.farmerId);
    return c;
  });
  const res = computeFinancialMetrics(mockUnpaidCycles, new Set([1, 3]), todayStr);
  assert.strictEqual(selectedFarmerIds.size, 1); // 1 unique farmer
  assert.strictEqual(selectedCycles.length, 2); // 2 cycles
  assert.strictEqual(res.selectedTotals.amount, 13800.00); // 6800 + 7000
  assert.strictEqual(res.afterPayment.overdueAmount, 5200.00); // 19000 - 13800
  assert.strictEqual(res.afterPayment.overdueCycleCount, 1);
  console.log('✓ Test 4 Passed: Two cycles of same farmer selected');
}

// Test 5: Upcoming cycle selected (Cycle 5)
{
  const res = computeFinancialMetrics(mockUnpaidCycles, new Set([5]), todayStr);
  assert.strictEqual(res.selectedTotals.amount, 12000.00);
  assert.strictEqual(res.afterPayment.overdueAmount, 19000.00);
  assert.strictEqual(res.afterPayment.pendingAmount, 13000.00); // 25000 - 12000
  assert.strictEqual(res.afterPayment.totalOutstanding, 32000.00);
  console.log('✓ Test 5 Passed: Upcoming cycle selected');
}

// Test 6: Selecting ALL overdue cycles (1, 2, 3)
{
  const res = computeFinancialMetrics(mockUnpaidCycles, new Set([1, 2, 3]), todayStr);
  assert.strictEqual(res.selectedTotals.amount, 19000.00);
  assert.strictEqual(res.afterPayment.overdueAmount, 0.00);
  assert.strictEqual(res.afterPayment.overdueCycleCount, 0);
  assert.strictEqual(res.afterPayment.pendingAmount, 25000.00);
  assert.strictEqual(res.afterPayment.totalOutstanding, 25000.00);
  console.log('✓ Test 6 Passed: Selecting all overdue cycles clears overdue completely');
}

// Test 7: Selecting ALL pending cycles (4, 5, 6)
{
  const res = computeFinancialMetrics(mockUnpaidCycles, new Set([4, 5, 6]), todayStr);
  assert.strictEqual(res.selectedTotals.amount, 25000.00);
  assert.strictEqual(res.afterPayment.pendingAmount, 0.00);
  assert.strictEqual(res.afterPayment.pendingCycleCount, 0);
  assert.strictEqual(res.afterPayment.overdueAmount, 19000.00);
  assert.strictEqual(res.afterPayment.totalOutstanding, 19000.00);
  console.log('✓ Test 7 Passed: Selecting all pending cycles');
}

// Test 8: Selecting ALL cycles (1 through 6)
{
  const res = computeFinancialMetrics(mockUnpaidCycles, new Set([1, 2, 3, 4, 5, 6]), todayStr);
  assert.strictEqual(res.selectedTotals.amount, 44000.00);
  assert.strictEqual(res.afterPayment.overdueAmount, 0.00);
  assert.strictEqual(res.afterPayment.pendingAmount, 0.00);
  assert.strictEqual(res.afterPayment.totalOutstanding, 0.00);
  assert.strictEqual(res.afterPayment.overdueCycleCount, 0);
  assert.strictEqual(res.afterPayment.pendingCycleCount, 0);
  console.log('✓ Test 8 Passed: Selecting all cycles clears all dues');
}

console.log('All 8 automated verification test suites passed with 100% precision!');
