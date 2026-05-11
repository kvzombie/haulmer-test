const CURRENCIES = ['USD', 'EUR', 'CLP', 'MXN', 'BRL', 'ARS'];

function validateCreatePayment(body) {
  const errors = [];

  if (!body.merchant_id || typeof body.merchant_id !== 'string') {
    errors.push('merchant_id is required');
  }

  const amount = Number(body.amount);
  if (!body.amount || isNaN(amount) || amount <= 0) {
    errors.push('amount must be a positive number');
  }

  if (!body.currency || !CURRENCIES.includes(body.currency)) {
    errors.push(`currency must be one of: ${CURRENCIES.join(', ')}`);
  }

  if (!body.card || typeof body.card !== 'object') {
    errors.push('card object is required');
  } else {
    const { card } = body;

    if (!card.card_number || !/^\d{13,19}$/.test(card.card_number)) {
      errors.push('card.card_number must be 13-19 digits');
    }

    if (!card.holder_name || typeof card.holder_name !== 'string') {
      errors.push('card.holder_name is required');
    }

    if (!card.expiry_month || !/^\d{2}$/.test(card.expiry_month)) {
      errors.push('card.expiry_month must be 2 digits (MM)');
    }

    if (!card.expiry_year || !/^\d{4}$/.test(card.expiry_year)) {
      errors.push('card.expiry_year must be 4 digits (YYYY)');
    }
  }

  return errors;
}

module.exports = { validateCreatePayment };
