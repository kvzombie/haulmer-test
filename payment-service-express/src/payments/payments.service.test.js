jest.mock('./payments.repository');
jest.mock('../acquirer/acquirer.service');

const repository = require('./payments.repository');
const acquirer   = require('../acquirer/acquirer.service');
const service    = require('./payments.service');

const validDto = {
  merchant_id: 'merchant-001',
  amount: 100,
  currency: 'USD',
  card: {
    card_number:  '4111111111111111',
    holder_name:  'John Doe',
    expiry_month: '12',
    expiry_year:  '2030',
  },
};

function makeTx(overrides = {}) {
  return {
    transaction_id: 'tx-001',
    merchant_id:    'merchant-001',
    amount:         100,
    currency:       'USD',
    status:         'PENDING',
    card:           { last_four: '1111', brand: 'VISA', holder_name: 'John Doe', expiry_month: '12', expiry_year: '2030' },
    status_history: [],
    save:           jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('createPayment', () => {
  it('returns existing transaction when idempotency key matches', async () => {
    const existing = makeTx({ status: 'APPROVED' });
    repository.findByIdempotencyKey.mockResolvedValue(existing);

    const result = await service.createPayment({ ...validDto, idempotency_key: 'idem-123' });

    expect(result).toEqual(existing);
    expect(repository.create).not.toHaveBeenCalled();
    expect(acquirer.authorize).not.toHaveBeenCalled();
  });

  it('throws 400 when amount exceeds maximum', async () => {
    repository.findByIdempotencyKey.mockResolvedValue(null);
    await expect(service.createPayment({ ...validDto, amount: 9999999 }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when amount is below minimum', async () => {
    repository.findByIdempotencyKey.mockResolvedValue(null);
    await expect(service.createPayment({ ...validDto, amount: 0 }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('creates DECLINED transaction when card is expired', async () => {
    repository.findByIdempotencyKey.mockResolvedValue(null);
    const declined = makeTx({ status: 'DECLINED' });
    repository.create.mockResolvedValue(declined);

    const result = await service.createPayment({
      ...validDto,
      card: { ...validDto.card, expiry_year: '2000' },
    });

    expect(result.status).toBe('DECLINED');
    expect(acquirer.authorize).not.toHaveBeenCalled();
  });

  it('creates APPROVED transaction when acquirer approves', async () => {
    repository.findByIdempotencyKey.mockResolvedValue(null);
    repository.create.mockResolvedValue(makeTx());
    repository.findByTransactionId.mockResolvedValue(makeTx({ status: 'APPROVED' }));
    acquirer.authorize.mockResolvedValue({
      approved: true,
      authorization_code: 'AUTH1',
      response_code: '00',
      response_message: 'Approved',
      acquirer_transaction_id: 'ACQ-1',
    });

    const result = await service.createPayment(validDto);
    expect(result.status).toBe('APPROVED');
    expect(repository.save).toHaveBeenCalled();
  });

  it('creates DECLINED transaction when acquirer declines', async () => {
    repository.findByIdempotencyKey.mockResolvedValue(null);
    repository.create.mockResolvedValue(makeTx());
    repository.findByTransactionId.mockResolvedValue(makeTx({ status: 'DECLINED' }));
    acquirer.authorize.mockResolvedValue({
      approved: false,
      response_code: '05',
      response_message: 'Do not honor',
      acquirer_transaction_id: 'ACQ-2',
    });

    const result = await service.createPayment(validDto);
    expect(result.status).toBe('DECLINED');
  });

  it('marks transaction as FAILED when acquirer throws', async () => {
    repository.findByIdempotencyKey.mockResolvedValue(null);
    repository.create.mockResolvedValue(makeTx());
    repository.findByTransactionId.mockResolvedValue(makeTx({ status: 'FAILED' }));
    acquirer.authorize.mockRejectedValue(new Error('Network timeout'));

    const result = await service.createPayment(validDto);
    expect(result.status).toBe('FAILED');
  });
});

describe('findById', () => {
  it('returns transaction when found', async () => {
    const tx = makeTx();
    repository.findByTransactionId.mockResolvedValue(tx);
    const result = await service.findById('tx-001');
    expect(result).toEqual(tx);
  });

  it('throws 404 when not found', async () => {
    repository.findByTransactionId.mockResolvedValue(null);
    await expect(service.findById('nonexistent')).rejects.toMatchObject({ status: 404 });
  });
});

describe('findMany', () => {
  it('returns paginated results', async () => {
    const txs = [makeTx(), makeTx({ transaction_id: 'tx-002' })];
    repository.findMany.mockResolvedValue({ data: txs, total: 2 });

    const result = await service.findMany({ merchant_id: 'merchant-001', page: 1, limit: 20 });
    expect(result.data).toHaveLength(2);
    expect(result.meta.total).toBe(2);
    expect(result.meta.pages).toBe(1);
  });
});
