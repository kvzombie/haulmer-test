import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsRepository } from './payments.repository';
import { AcquirerService } from '../acquirer/acquirer.service';
import { AppLogger } from '../common/logger/logger.service';
import { TransactionStatus } from './schemas/transaction.schema';
import { CreatePaymentDto } from './dto/create-payment.dto';

const mockTransaction = (overrides = {}) => ({
  transaction_id: 'test-uuid-1234',
  merchant_id: 'merchant-001',
  amount: 100,
  currency: 'USD',
  status: TransactionStatus.PENDING,
  card: { last_four: '1111', brand: 'VISA', holder_name: 'John Doe', expiry_month: '12', expiry_year: '2030' },
  status_history: [],
  acquirer_retry_count: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const validDto: CreatePaymentDto = {
  merchant_id: 'merchant-001',
  amount: 100,
  currency: 'USD' as any,
  card: {
    card_number: '4111111111111111', // Luhn-valid VISA test card
    holder_name: 'John Doe',
    expiry_month: '12',
    expiry_year: '2030',
    cvv: '123',
  },
};

describe('PaymentsService', () => {
  let service: PaymentsService;
  let repository: jest.Mocked<PaymentsRepository>;
  let acquirerService: jest.Mocked<AcquirerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: PaymentsRepository,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            findByIdempotencyKey: jest.fn(),
            findMany: jest.fn(),
            updateStatus: jest.fn(),
            incrementRetryCount: jest.fn(),
          },
        },
        {
          provide: AcquirerService,
          useValue: { authorize: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'businessRules.maxTransactionAmount': 1000000,
                'businessRules.minTransactionAmount': 1,
              };
              return config[key];
            }),
          },
        },
        {
          provide: AppLogger,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            logWithTransaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    repository = module.get(PaymentsRepository);
    acquirerService = module.get(AcquirerService);
  });

  describe('createPayment', () => {
    it('should create a new APPROVED transaction when acquirer approves', async () => {
      const pending = mockTransaction();
      const approved = mockTransaction({ status: TransactionStatus.APPROVED });

      repository.findByIdempotencyKey.mockResolvedValue(null);
      repository.create.mockResolvedValue(pending as any);
      repository.updateStatus
        .mockResolvedValueOnce(mockTransaction({ status: TransactionStatus.PROCESSING }) as any)
        .mockResolvedValueOnce(approved as any);
      acquirerService.authorize.mockResolvedValue({
        approved: true,
        authorization_code: 'AUTH123',
        response_code: '00',
        response_message: 'Approved',
        acquirer_transaction_id: 'ACQ-001',
      });

      const result = await service.createPayment(validDto);

      expect(result.status).toBe(TransactionStatus.APPROVED);
      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(acquirerService.authorize).toHaveBeenCalledTimes(1);
    });

    it('should create a DECLINED transaction when acquirer declines', async () => {
      const pending = mockTransaction();
      const declined = mockTransaction({ status: TransactionStatus.DECLINED });

      repository.findByIdempotencyKey.mockResolvedValue(null);
      repository.create.mockResolvedValue(pending as any);
      repository.updateStatus
        .mockResolvedValueOnce(mockTransaction({ status: TransactionStatus.PROCESSING }) as any)
        .mockResolvedValueOnce(declined as any);
      acquirerService.authorize.mockResolvedValue({
        approved: false,
        response_code: '05',
        response_message: 'Do not honor',
        acquirer_transaction_id: 'ACQ-002',
      });

      const result = await service.createPayment(validDto);

      expect(result.status).toBe(TransactionStatus.DECLINED);
    });

    it('should return existing transaction when idempotency key matches', async () => {
      const existingTransaction = mockTransaction({ status: TransactionStatus.APPROVED });
      const dto = { ...validDto, idempotency_key: 'idem-key-123' };

      repository.findByIdempotencyKey.mockResolvedValue(existingTransaction as any);

      const result = await service.createPayment(dto);

      expect(result).toEqual(existingTransaction);
      expect(repository.create).not.toHaveBeenCalled();
      expect(acquirerService.authorize).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when amount exceeds maximum', async () => {
      const dto = { ...validDto, amount: 9999999 };
      repository.findByIdempotencyKey.mockResolvedValue(null);

      await expect(service.createPayment(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when amount is below minimum', async () => {
      const dto = { ...validDto, amount: 0 };
      repository.findByIdempotencyKey.mockResolvedValue(null);

      await expect(service.createPayment(dto)).rejects.toThrow(BadRequestException);
    });

    it('should decline transaction with expired card', async () => {
      const dto = { ...validDto, card: { ...validDto.card, expiry_year: '2000' } };
      const pending = mockTransaction();
      const declined = mockTransaction({ status: TransactionStatus.DECLINED, failure_reason: 'Card is expired' });

      repository.findByIdempotencyKey.mockResolvedValue(null);
      repository.create.mockResolvedValue(pending as any);
      repository.updateStatus.mockResolvedValue(declined as any);
      repository.findById.mockResolvedValue(declined as any);

      const result = await service.createPayment(dto);

      expect(result.status).toBe(TransactionStatus.DECLINED);
      expect(acquirerService.authorize).not.toHaveBeenCalled();
    });

    it('should mark transaction as FAILED when acquirer throws', async () => {
      const pending = mockTransaction();
      const failed = mockTransaction({ status: TransactionStatus.FAILED });

      repository.findByIdempotencyKey.mockResolvedValue(null);
      repository.create.mockResolvedValue(pending as any);
      repository.updateStatus
        .mockResolvedValueOnce(mockTransaction({ status: TransactionStatus.PROCESSING }) as any)
        .mockResolvedValueOnce(failed as any);
      acquirerService.authorize.mockRejectedValue(new Error('Network timeout'));

      const result = await service.createPayment(validDto);

      expect(result.status).toBe(TransactionStatus.FAILED);
    });
  });

  describe('findById', () => {
    it('should return a transaction by ID', async () => {
      const transaction = mockTransaction();
      repository.findById.mockResolvedValue(transaction as any);

      const result = await service.findById('test-uuid-1234');

      expect(result).toEqual(transaction);
      expect(repository.findById).toHaveBeenCalledWith('test-uuid-1234');
    });

    it('should throw NotFoundException when transaction not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('nonexistent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findMany', () => {
    it('should return paginated results with filters', async () => {
      const transactions = [mockTransaction(), mockTransaction({ transaction_id: 'test-2' })];
      repository.findMany.mockResolvedValue({ data: transactions as any, total: 2 });

      const result = await service.findMany({ merchant_id: 'merchant-001', page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });
  });

  describe('Luhn algorithm', () => {
    it('should validate Luhn-correct card numbers', async () => {
      // These cards pass Luhn check
      const validCards = ['4111111111111111', '5500005555555559', '378282246310005'];
      const invalidCards = ['1234567890123456', '4111111111111112'];

      // Access private method via any cast for testing
      validCards.forEach((card) => {
        expect((service as any).luhnCheck(card)).toBe(true);
      });

      invalidCards.forEach((card) => {
        expect((service as any).luhnCheck(card)).toBe(false);
      });
    });
  });
});
