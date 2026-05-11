const logger = require('../common/logger');

module.exports = function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    logger.info(`${req.method} ${req.path}`, {
      status: res.statusCode,
      ms: Date.now() - start,
      correlationId: req.headers['x-correlation-id'],
    });
  });
  next();
};
