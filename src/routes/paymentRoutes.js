const express = require('express');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

router.post('/pay', paymentController.payCycle);
router.get('/:farmerId', paymentController.getPaymentsByFarmer);

module.exports = router;
