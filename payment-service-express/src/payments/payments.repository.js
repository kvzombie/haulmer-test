const Transaction = require('./transaction.model');

async function findByIdempotencyKey(key) {
  return Transaction.findOne({ idempotency_key: key });
}

async function findByTransactionId(transactionId) {
  return Transaction.findOne({ transaction_id: transactionId });
}

async function create(data) {
  return Transaction.create(data);
}

async function save(tx) {
  return tx.save();
}

async function findMany(filter, { page, limit }) {
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Transaction.countDocuments(filter),
  ]);
  return { data, total };
}

module.exports = { findByIdempotencyKey, findByTransactionId, create, save, findMany };
