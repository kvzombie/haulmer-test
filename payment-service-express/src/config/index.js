require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/payment_service_2',
  acquirer: {
    baseUrl: process.env.ACQUIRER_BASE_URL || 'http://localhost:3001',
    timeoutMs: parseInt(process.env.ACQUIRER_TIMEOUT_MS) || 5000,
    maxRetries: parseInt(process.env.ACQUIRER_MAX_RETRIES) || 3,
  },
  businessRules: {
    maxAmount: parseInt(process.env.MAX_TRANSACTION_AMOUNT) || 1000000,
    minAmount: parseInt(process.env.MIN_TRANSACTION_AMOUNT) || 1,
  },
};
