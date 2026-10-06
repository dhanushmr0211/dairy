const express = require('express');
const farmerController = require('../controllers/farmerController');

const router = express.Router();

router.post('/', farmerController.createFarmer);
router.get('/', farmerController.getFarmers);
router.get('/:id/summary', farmerController.getFarmerSummary);
router.patch('/:id/status', farmerController.updateFarmerStatus);

module.exports = router;
