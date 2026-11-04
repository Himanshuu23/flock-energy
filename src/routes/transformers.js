const express = require('express');
const controller = require('../controllers/transformersController');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/', validate.page, asyncHandler(controller.list));

module.exports = router;
