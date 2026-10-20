const express = require('express');
const cycleController = require('../controllers/cycleController');

const router = express.Router();

router.post('/start', cycleController.startCycle);
router.get('/active/:farmerId', cycleController.getActiveCycle);
router.get('/farmer/:farmerId', cycleController.getCyclesByFarmer);
router.put('/:id', cycleController.updateCycle);
router.delete('/:id', cycleController.deleteCycle);

module.exports = router;
