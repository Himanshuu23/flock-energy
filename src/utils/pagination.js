const { toNumber } = require('./numbers');

function buildPagination(page, pageSize, total) {
  const size = toNumber(pageSize) || 20;
  const count = toNumber(total) || 0;
  return {
    page,
    pageSize: size,
    total: count,
    totalPages: Math.ceil(count / size)
  };
}

module.exports = { buildPagination };
