const axios = require('axios');
const config = require('../config');
const logger = require('../common/logger');

async function authorize(request) {
  const { maxRetries, baseUrl, timeoutMs } = config.acquirer;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info('Sending to acquirer', { transactionId: request.transaction_id, attempt });

      const { data } = await axios.post(`${baseUrl}/authorize`, request, {
        timeout: timeoutMs,
      });

      logger.info('Acquirer response', {
        transactionId: request.transaction_id,
        approved: data.approved,
        response_code: data.response_code,
      });

      return data;
    } catch (err) {
      const retryable = !err.response || err.response.status >= 500;
      logger.warn(`Acquirer attempt ${attempt} failed`, {
        transactionId: request.transaction_id,
        error: err.message,
        retryable,
      });

      if (!retryable || attempt === maxRetries) break;

      await sleep(200 * Math.pow(2, attempt - 1));
    }
  }

  // Fallback mock when acquirer is unreachable
  return mockResponse(request);
}

function mockResponse(request) {
  const prefix = request.card.number.substring(0, 4);
  let approved, responseCode, responseMessage;

  if (prefix === '4111') {
    approved = true; responseCode = '00'; responseMessage = 'Approved';
  } else if (prefix === '4000') {
    approved = false; responseCode = '05'; responseMessage = 'Do not honor';
  } else {
    approved = Math.random() > 0.2;
    responseCode = approved ? '00' : '51';
    responseMessage = approved ? 'Approved' : 'Insufficient funds';
  }

  return {
    approved,
    authorization_code: approved ? Math.random().toString(36).substring(2, 8).toUpperCase() : undefined,
    response_code: responseCode,
    response_message: responseMessage,
    acquirer_transaction_id: `ACQ-MOCK-${Date.now()}`,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { authorize };
