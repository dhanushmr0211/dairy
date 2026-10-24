const express = require('express');
const walletController = require('../controllers/walletController');
const { paymentRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
router.use(paymentRateLimiter);

// ── Wallet Balance & Summary ──
router.get('/', walletController.getWalletBalance);
router.get('/balance', walletController.getWalletBalance);
router.put('/balance', walletController.updateWalletBalance);
router.post('/balance', walletController.updateWalletBalance);
router.get('/summary', walletController.getWalletSummary);
router.get('/transactions', walletController.getTransactions);
router.delete('/transactions/:id', walletController.deleteTransaction);

// ── Receipts (both /receipt and /receipts supported) ──
router.post('/receipts', walletController.recordReceipt);
router.post('/receipt', walletController.recordReceipt);
router.get('/receipts', walletController.getReceipts);
router.get('/receipt', walletController.getReceipts);

// ── Automatic Distribution (both /distribute and /distribution supported; GET/POST preview) ──
router.all('/distribute/preview', walletController.distributePreview);
router.all('/distribution/preview', walletController.distributePreview);
router.post('/distribute/confirm', walletController.distributeConfirm);
router.post('/distribution/confirm', walletController.distributeConfirm);

// ── Distribution History & Deletions ──
router.get('/distributions', walletController.getDistributions);
router.get('/distribution/history', walletController.getDistributions);
router.get('/distributions/:id', walletController.getDistributionDetail);
router.delete('/distributions/:id', walletController.deleteDistribution);
router.delete('/distribution/:id', walletController.deleteDistribution);
router.delete('/distributions', walletController.clearDistributions);
router.delete('/distribution', walletController.clearDistributions);

module.exports = router;
