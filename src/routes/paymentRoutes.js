const express = require('express');
const paymentController = require('../controllers/paymentController');
const { paymentRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
router.use(paymentRateLimiter);

// Preview & aggregations
router.get('/upcoming', paymentController.getUpcomingPayments);
router.get('/summary', paymentController.getPaymentSummary);
router.get('/preview/:cycleId', paymentController.getPaymentPreview);

// Multi-farmer operations
router.post('/selected', paymentController.getSelectedPaymentsPreview);
router.post('/pay-selected', paymentController.paySelectedCycles);

// Single cycle pay
router.post('/pay', paymentController.payCycle);

// Farmer history (must be after named subpaths)
router.get('/:farmerId', paymentController.getPaymentsByFarmer);

module.exports = router;
