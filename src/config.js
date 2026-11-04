require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT) || 3000,
  portalUrl: (process.env.PORTAL_URL || 'https://urja-ops.flockenergy.tech').replace(/\/+$/, ''),
  portalUser: process.env.PORTAL_USER,
  portalPass: process.env.PORTAL_PASS,
  timezoneOffset: process.env.PORTAL_TZ_OFFSET || '+05:30',
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS) || 15000
};
