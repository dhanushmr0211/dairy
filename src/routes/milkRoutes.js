const express = require('express');
const milkController = require('../controllers/milkController');

const router = express.Router();

router.post('/', milkController.addMilkEntry);
router.get('/:farmerId', milkController.getMilkByFarmer);
router.put('/:id', milkController.updateMilkEntry);
router.delete('/:id', milkController.deleteMilkEntry);

module.exports = router;
