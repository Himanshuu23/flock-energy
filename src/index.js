const config = require('./config');
const { createApp } = require('./app');
const { createPortalClient } = require('./client/portalClient');

if (!config.portalUser || !config.portalPass) {
  console.error('PORTAL_USER and PORTAL_PASS must be set. Copy .env.example to .env and fill them in.');
  process.exit(1);
}

const portal = createPortalClient({
  baseUrl: config.portalUrl,
  username: config.portalUser,
  password: config.portalPass,
  timeoutMs: config.requestTimeoutMs
});

const app = createApp(portal);

app.listen(config.port, () => {
  console.log(`server listening on http://localhost:${config.port}`);
});
