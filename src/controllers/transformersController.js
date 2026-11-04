const transformerService = require('../services/transformerService');

async function list(req, res) {
  const result = await transformerService.listTransformers(req.app.locals.portal, { page: req.page });
  res.json(result);
}

module.exports = { list };
