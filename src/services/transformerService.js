const { toNumber } = require('../utils/numbers');
const { buildPagination } = require('../utils/pagination');

function toTransformer(row) {
  return {
    code: row.code ? String(row.code).trim() : null,
    name: row.name ? String(row.name).trim() : null,
    feederCode: row.feederCode ? String(row.feederCode).trim() : null,
    capacityKva: toNumber(row.capacityKva)
  };
}

async function listTransformers(portal, { page }) {
  const body = await portal.getJson(`/portal/dts?page=${page}`);
  const rows = Array.isArray(body.data) ? body.data : [];

  return {
    data: rows.map(toTransformer),
    pagination: buildPagination(page, body.pageSize, body.total)
  };
}

module.exports = { listTransformers };
