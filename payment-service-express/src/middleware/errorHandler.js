const logger = require('../common/logger');

module.exports = function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  logger.error(err.message, { status, path: req.path, stack: err.stack });
  res.status(status).json({
    statusCode: status,
    message: err.message || 'Internal server error',
    timestamp: new Date().toISOString(),
  });
};
