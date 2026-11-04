const express = require('express');
const controller = require('../controllers/metersController');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/', validate.page, validate.search, asyncHandler(controller.list));
router.get('/:id', validate.meterId, asyncHandler(controller.get));
router.get('/:id/consumption', validate.meterId, validate.dateRange, asyncHandler(controller.consumption));

module.exports = router;
