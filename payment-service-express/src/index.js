const express = require('express');
const mongoose = require('mongoose');
const config = require('./config');
const logger = require('./common/logger');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const paymentsRouter = require('./payments/payments.routes');

const app = express();

app.use(express.json());
app.use(requestLogger);

app.use('/api/v1/payments', paymentsRouter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

async function start() {
  await mongoose.connect(config.mongoUri);
  logger.info('Connected to MongoDB', { uri: config.mongoUri });

  app.listen(config.port, () => {
    logger.info(`Payment service running on port ${config.port}`);
  });
}

start().catch((err) => {
  logger.error('Failed to start', { error: err.message });
  process.exit(1);
});

module.exports = app; // for tests
