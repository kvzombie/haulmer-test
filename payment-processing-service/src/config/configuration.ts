export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/payment_service',
  },
  acquirer: {
    baseUrl: process.env.ACQUIRER_BASE_URL || 'http://localhost:3001',
    timeoutMs: parseInt(process.env.ACQUIRER_TIMEOUT_MS, 10) || 5000,
    maxRetries: parseInt(process.env.ACQUIRER_MAX_RETRIES, 10) || 3,
  },
  businessRules: {
    maxTransactionAmount: parseInt(process.env.MAX_TRANSACTION_AMOUNT, 10) || 1000000,
    minTransactionAmount: parseInt(process.env.MIN_TRANSACTION_AMOUNT, 10) || 1,
  },
  idempotency: {
    ttlSeconds: parseInt(process.env.IDEMPOTENCY_TTL_SECONDS, 10) || 86400,
  },
});
