const express = require('express');
const paymentController = require('../controllers/paymentController');
const { paymentRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
router.use(paymentRateLimiter);

router.post('/pay', paymentController.payCycle);
router.get('/preview/:cycleId', paymentController.getPaymentPreview);
router.get('/:farmerId', paymentController.getPaymentsByFarmer);

module.exports = router;
