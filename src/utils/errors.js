class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

class SessionExpiredError extends Error {
  constructor() {
    super('Portal session expired');
    this.name = 'SessionExpiredError';
  }
}

module.exports = { HttpError, SessionExpiredError };
