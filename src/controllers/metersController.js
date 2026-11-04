const meterService = require('../services/meterService');
const consumptionService = require('../services/consumptionService');

async function list(req, res) {
  const result = await meterService.listMeters(req.app.locals.portal, {
    search: req.search,
    page: req.page
  });
  res.json(result);
}

async function get(req, res) {
  const meter = await meterService.getMeter(req.app.locals.portal, req.meterId);
  res.json(meter);
}

async function consumption(req, res) {
  const result = await consumptionService.getConsumption(req.app.locals.portal, req.meterId, req.range);
  res.json(result);
}

module.exports = { list, get, consumption };
