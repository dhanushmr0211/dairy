const express = require('express');
const walletController = require('../controllers/walletController');
const { paymentRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
router.use(paymentRateLimiter);

// ── Wallet Balance & Summary ──
router.get('/', walletController.getWalletBalance);
router.get('/summary', walletController.getWalletSummary);
router.get('/transactions', walletController.getTransactions);

// ── Receipts ──
router.post('/receipts', walletController.recordReceipt);
router.get('/receipts', walletController.getReceipts);

// ── Automatic Distribution ──
router.post('/distribute/preview', walletController.distributePreview);
router.post('/distribute/confirm', walletController.distributeConfirm);

// ── Distribution History ──
router.get('/distributions', walletController.getDistributions);
router.get('/distributions/:id', walletController.getDistributionDetail);

module.exports = router;
