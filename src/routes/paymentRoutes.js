const express = require('express');
const paymentController = require('../controllers/paymentController');
const { paymentRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
router.use(paymentRateLimiter);

// ── Financial summaries & filtered queues ──
router.get('/pending', paymentController.getPendingPayments);
router.get('/financial-summary', paymentController.getFinancialSummary);
router.get('/upcoming', paymentController.getUpcomingPayments);
router.get('/summary', paymentController.getPaymentSummary);
router.get('/preview/:cycleId', paymentController.getPaymentPreview);

// ── Live calculator & multi-cycle operations ──
router.post('/selected', paymentController.getSelectedPaymentsPreview);
router.post('/pay-selected', paymentController.paySelectedCycles);

// ── Single cycle pay ──
router.post('/pay', paymentController.payCycle);

// ── Farmer payment history (must remain after named subpaths) ──
router.get('/:farmerId', paymentController.getPaymentsByFarmer);

module.exports = router;
