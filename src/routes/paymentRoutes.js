const express = require('express');
const paymentController = require('../controllers/paymentController');
const { paymentRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/pay', paymentRateLimiter, paymentController.payCycle);
router.get('/:farmerId', paymentController.getPaymentsByFarmer);

module.exports = router;
