const path = require('path');
const express = require('express');
const metersRoutes = require('./routes/meters');
const transformersRoutes = require('./routes/transformers');
const requestLogger = require('./middleware/requestLogger');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

function createApp(portal) {
  const app = express();
  app.locals.portal = portal;

  app.use(requestLogger);

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/openapi.json', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'openapi.json'));
  });

  app.use('/api/meters', metersRoutes);
  app.use('/api/transformers', transformersRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
