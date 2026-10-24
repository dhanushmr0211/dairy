const express = require('express');
const milkController = require('../controllers/milkController');

const router = express.Router();

router.post('/', milkController.addMilkEntry);
router.get('/entry/:id', milkController.getMilkEntryById);
router.get('/farmer/:farmerId', milkController.getMilkByFarmer);
router.get('/:id', (req, res, next) => {
  if (req.baseUrl === '/milk-entries') {
    return milkController.getMilkEntryById(req, res, next);
  }
  return milkController.getMilkByFarmer(req, res, next);
});
router.put('/:id', milkController.updateMilkEntry);
router.patch('/:id', milkController.updateMilkEntry);
router.delete('/:id', milkController.deleteMilkEntry);

module.exports = router;
