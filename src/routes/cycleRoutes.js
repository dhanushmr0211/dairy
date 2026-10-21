const express = require('express');
const cycleController = require('../controllers/cycleController');

const router = express.Router();

router.post('/start', cycleController.startCycle);
router.get('/active/:farmerId', cycleController.getActiveCycle);
router.get('/farmer/:farmerId', cycleController.getCyclesByFarmer);
router.put('/:id', cycleController.updateCycle);
router.patch('/:id', cycleController.updateCycle);
router.post('/:id/split', cycleController.splitCycle);
router.post('/:id/extend', cycleController.extendCycle);
router.post('/:id/merge', cycleController.mergeCycle);
router.delete('/:id', cycleController.deleteCycle);

module.exports = router;

