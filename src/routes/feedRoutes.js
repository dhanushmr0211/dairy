const express = require('express');
const feedController = require('../controllers/feedController');

const router = express.Router();

router.post('/', feedController.addFeedRecord);
router.get('/:farmerId', feedController.getFeedByFarmer);
router.put('/:id', feedController.updateFeedRecord);
router.delete('/:id', feedController.deleteFeedRecord);

module.exports = router;
