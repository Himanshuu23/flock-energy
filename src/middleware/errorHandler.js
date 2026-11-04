const { HttpError } = require('../utils/errors');

module.exports = function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }

  console.error(err);
  res.status(500).json({ error: 'internal_error', message: 'Something went wrong on our side' });
};
