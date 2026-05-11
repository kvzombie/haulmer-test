const { v4: uuidv4 } = require('uuid');
const repository = require('./payments.repository');
const acquirer = require('../acquirer/acquirer.service');
const config = require('../config');
const logger = require('../common/logger');

async function createPayment(dto) {
  // 1. Idempotency check
  if (dto.idempotency_key) {
    const existing = await repository.findByIdempotencyKey(dto.idempotency_key);
    if (existing) {
      logger.info('Duplicate request, returning existing transaction', {
        transactionId: existing.transaction_id,
        idempotency_key: dto.idempotency_key,
      });
      return existing;
    }
  }

  // 2. Business rules
  const { maxAmount, minAmount } = config.businessRules;
  if (dto.amount < minAmount) throw createError(400, `Amount must be at least ${minAmount}`);
  if (dto.amount > maxAmount) throw createError(400, `Amount exceeds maximum of ${maxAmount}`);

  const transactionId = uuidv4();
  logger.info('Creating transaction', { transactionId, merchant_id: dto.merchant_id, amount: dto.amount });

  // 3. Validate card expiry — decline without calling acquirer
  const cardError = validateCardExpiry(dto.card);
  if (cardError) {
    const tx = await repository.create({
      transaction_id: transactionId,
      merchant_id:    dto.merchant_id,
      amount:         dto.amount,
      currency:       dto.currency,
      status:         'DECLINED',
      card:           buildCardInfo(dto.card),
      failure_reason: cardError,
      idempotency_key: dto.idempotency_key,
      correlation_id:  dto.correlation_id,
      status_history: [
        { from: null,      to: 'PENDING',  reason: 'Transaction created' },
        { from: 'PENDING', to: 'DECLINED', reason: cardError },
      ],
    });
    logger.warn('Card declined', { transactionId, reason: cardError });
    return tx;
  }

  // 4. Persist as PENDING
  const tx = await repository.create({
    transaction_id: transactionId,
    merchant_id:    dto.merchant_id,
    amount:         dto.amount,
    currency:       dto.currency,
    status:         'PENDING',
    card:           buildCardInfo(dto.card),
    idempotency_key: dto.idempotency_key,
    correlation_id:  dto.correlation_id,
    status_history: [{ from: null, to: 'PENDING', reason: 'Transaction created' }],
  });

  // 5. Move to PROCESSING
  await transition(tx, 'PROCESSING', 'PENDING', 'Sending to acquirer');

  // 6. Call acquirer
  try {
    const response = await acquirer.authorize({
      transaction_id: transactionId,
      merchant_id:    dto.merchant_id,
      amount:         dto.amount,
      currency:       dto.currency,
      card: {
        number:       dto.card.card_number,
        holder_name:  dto.card.holder_name,
        expiry_month: dto.card.expiry_month,
        expiry_year:  dto.card.expiry_year,
      },
    });

    const finalStatus = response.approved ? 'APPROVED' : 'DECLINED';
    await transition(tx, finalStatus, 'PROCESSING', response.response_message, {
      acquirer_response: {
        authorization_code:      response.authorization_code,
        response_code:           response.response_code,
        response_message:        response.response_message,
        acquirer_transaction_id: response.acquirer_transaction_id,
        processed_at:            new Date(),
      },
    });

    logger.info(`Transaction ${finalStatus}`, { transactionId, response_code: response.response_code });
    return repository.findByTransactionId(transactionId);
  } catch (err) {
    await transition(tx, 'FAILED', 'PROCESSING', err.message, {
      failure_reason: `Acquirer error: ${err.message}`,
    });
    logger.error('Transaction failed', { transactionId, error: err.message });
    return repository.findByTransactionId(transactionId);
  }
}

async function findById(transactionId) {
  const tx = await repository.findByTransactionId(transactionId);
  if (!tx) throw createError(404, `Transaction ${transactionId} not found`);
  return tx;
}

async function findMany({ merchant_id, status, page = 1, limit = 20 }) {
  const filter = {};
  if (merchant_id) filter.merchant_id = merchant_id;
  if (status)      filter.status = status;

  const { data, total } = await repository.findMany(filter, { page: Number(page), limit: Number(limit) });
  return {
    data,
    meta: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function transition(tx, to, from, reason, extra = {}) {
  tx.status = to;
  tx.status_history.push({ from, to, reason, timestamp: new Date() });
  Object.assign(tx, extra);
  await repository.save(tx);
}

function buildCardInfo(card) {
  return {
    last_four:    card.card_number.slice(-4),
    brand:        detectBrand(card.card_number),
    holder_name:  card.holder_name,
    expiry_month: card.expiry_month,
    expiry_year:  card.expiry_year,
  };
}

function validateCardExpiry(card) {
  const month = parseInt(card.expiry_month, 10);
  const year  = parseInt(card.expiry_year, 10);
  if (month < 1 || month > 12) return 'Invalid expiry month';
  if (new Date(year, month, 0) < new Date()) return 'Card is expired';
  return null;
}

function detectBrand(num) {
  if (/^4/.test(num))                              return 'VISA';
  if (/^5[1-5]/.test(num) || /^2[2-7]/.test(num)) return 'MASTERCARD';
  if (/^3[47]/.test(num))                          return 'AMEX';
  return 'UNKNOWN';
}

function createError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { createPayment, findById, findMany };
