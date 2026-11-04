const { HttpError } = require('../utils/errors');
const { parseBoundary } = require('../utils/dates');
const config = require('../config');

function bad(message) {
  return new HttpError(400, 'bad_request', message);
}

function page(req, res, next) {
  if (req.query.page === undefined) {
    req.page = 1;
    return next();
  }

  const value = Number(req.query.page);
  if (!Number.isInteger(value) || value < 1) {
    return next(bad('page must be a whole number, 1 or higher'));
  }

  req.page = value;
  next();
}

function search(req, res, next) {
  const q = req.query.q;
  if (q === undefined) {
    req.search = '';
    return next();
  }

  if (typeof q !== 'string' || q.length > 100) {
    return next(bad('q must be a text value of at most 100 characters'));
  }

  req.search = q.trim();
  next();
}

function meterId(req, res, next) {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(req.params.id)) {
    return next(bad('meter id may only contain letters, digits, dashes and underscores'));
  }

  req.meterId = req.params.id;
  next();
}

function dateRange(req, res, next) {
  const range = { from: null, to: null };

  for (const key of ['from', 'to']) {
    const raw = req.query[key];
    if (raw === undefined) continue;

    if (typeof raw !== 'string') return next(bad(`${key} must be a date or date-time`));

    const time = parseBoundary(raw, config.timezoneOffset, key === 'to');
    if (Number.isNaN(time)) return next(bad(`${key} is not a valid date or date-time`));
    range[key] = time;
  }

  if (range.from !== null && range.to !== null && range.from > range.to) {
    return next(bad('from must not be later than to'));
  }

  req.range = range;
  next();
}

module.exports = { page, search, meterId, dateRange };
