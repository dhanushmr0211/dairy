const express = require('express');
const cycleController = require('../controllers/cycleController');

const router = express.Router();

router.post('/start', cycleController.startCycle);
router.get('/active/:farmerId', cycleController.getActiveCycle);
router.get('/farmer/:farmerId', cycleController.getCyclesByFarmer);

module.exports = router;
