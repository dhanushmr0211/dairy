const express = require('express');
const feedController = require('../controllers/feedController');

const router = express.Router();

router.post('/', feedController.addFeedRecord);
router.get('/:farmerId', feedController.getFeedByFarmer);

module.exports = router;
