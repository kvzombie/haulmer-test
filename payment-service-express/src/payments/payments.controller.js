const service = require('./payments.service');
const { validateCreatePayment } = require('./payments.validator');

function format(tx) {
  return {
    transaction_id:    tx.transaction_id,
    merchant_id:       tx.merchant_id,
    amount:            tx.amount,
    currency:          tx.currency,
    status:            tx.status,
    card:              tx.card,
    acquirer_response: tx.acquirer_response,
    failure_reason:    tx.failure_reason,
    status_history:    tx.status_history,
    correlation_id:    tx.correlation_id,
    created_at:        tx.createdAt,
    updated_at:        tx.updatedAt,
  };
}

async function createPayment(req, res, next) {
  try {
    const errors = validateCreatePayment(req.body);
    if (errors.length) {
      return res.status(400).json({ statusCode: 400, message: 'Validation failed', errors });
    }

    const dto = {
      ...req.body,
      idempotency_key: req.headers['x-idempotency-key'] || req.body.idempotency_key,
      correlation_id:  req.headers['x-correlation-id']  || req.body.correlation_id,
    };

    const tx = await service.createPayment(dto);
    res.status(201).json(format(tx));
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const tx = await service.findById(req.params.transaction_id);
    res.json(format(tx));
  } catch (err) {
    next(err);
  }
}

async function getMany(req, res, next) {
  try {
    const result = await service.findMany(req.query);
    res.json({ data: result.data.map(format), meta: result.meta });
  } catch (err) {
    next(err);
  }
}

module.exports = { createPayment, getById, getMany };
