const mongoose = require('mongoose');

const STATUSES = ['PENDING', 'PROCESSING', 'APPROVED', 'DECLINED', 'FAILED'];
const CURRENCIES = ['USD', 'EUR', 'CLP', 'MXN', 'BRL', 'ARS'];

const StatusTransitionSchema = new mongoose.Schema({
  from: { type: String, enum: [...STATUSES, null], default: null },
  to:   { type: String, enum: STATUSES, required: true },
  timestamp: { type: Date, default: Date.now },
  reason: String,
}, { _id: false });

const TransactionSchema = new mongoose.Schema({
  transaction_id:  { type: String, required: true, unique: true, index: true },
  merchant_id:     { type: String, required: true, index: true },
  amount:          { type: Number, required: true },
  currency:        { type: String, required: true, enum: CURRENCIES },
  status:          { type: String, required: true, enum: STATUSES, default: 'PENDING', index: true },
  card: {
    last_four:    { type: String, required: true },
    brand:        { type: String, required: true },
    holder_name:  { type: String, required: true },
    expiry_month: { type: String, required: true },
    expiry_year:  { type: String, required: true },
  },
  acquirer_response: {
    authorization_code:      String,
    response_code:           String,
    response_message:        String,
    acquirer_transaction_id: String,
    processed_at:            Date,
  },
  status_history:       { type: [StatusTransitionSchema], default: [] },
  failure_reason:       String,
  idempotency_key:      { type: String, index: true, sparse: true },
  correlation_id:       String,
  acquirer_retry_count: { type: Number, default: 0 },
}, { timestamps: true, versionKey: false });

TransactionSchema.index({ merchant_id: 1, status: 1 });
TransactionSchema.index({ idempotency_key: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Transaction', TransactionSchema);
