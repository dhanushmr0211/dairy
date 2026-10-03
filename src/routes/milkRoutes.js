const express = require('express');
const milkController = require('../controllers/milkController');

const router = express.Router();

router.post('/', milkController.addMilkEntry);
router.get('/:farmerId', milkController.getMilkByFarmer);

module.exports = router;
