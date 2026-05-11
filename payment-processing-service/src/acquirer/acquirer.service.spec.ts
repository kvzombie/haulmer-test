/// <reference types="jest" />
import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AcquirerService } from './acquirer.service';
import { AppLogger } from '../common/logger/logger.service';

const mockRequest = {
  transaction_id: 'tx-001',
  merchant_id: 'merchant-001',
  amount: 100,
  currency: 'USD',
  card: {
    number: '4111111111111111',
    holder_name: 'John Doe',
    expiry_month: '12',
    expiry_year: '2030',
    cvv: '123',
  },
};

describe('AcquirerService', () => {
  let service: AcquirerService;
  let httpService: jest.Mocked<HttpService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AcquirerService,
        {
          provide: HttpService,
          useValue: { post: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'acquirer.baseUrl': 'http://localhost:3001',
                'acquirer.timeoutMs': 5000,
                'acquirer.maxRetries': 3,
              };
              return config[key];
            }),
          },
        },
        {
          provide: AppLogger,
          useValue: {
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            logWithTransaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AcquirerService>(AcquirerService);
    httpService = module.get(HttpService);
  });

  it('should return approved response from acquirer', async () => {
    httpService.post.mockReturnValue(
      of({
        data: {
          approved: true,
          authorization_code: 'ABC123',
          response_code: '00',
          response_message: 'Approved',
          acquirer_transaction_id: 'ACQ-001',
        },
      } as any),
    );

    const result = await service.authorize(mockRequest);

    expect(result.approved).toBe(true);
    expect(result.authorization_code).toBe('ABC123');
  });

  it('should fall back to mock response when acquirer is unreachable', async () => {
    const networkError = new Error('ECONNREFUSED');
    (networkError as any).code = 'ECONNABORTED';
    httpService.post.mockReturnValue(throwError(() => networkError));

    // Card starting with 4111 → always approved in mock
    const result = await service.authorize(mockRequest);

    expect(result).toBeDefined();
    expect(result.approved).toBe(true);
  });

  it('should return declined mock response for 4000 prefix cards', async () => {
    const networkError = new Error('ECONNREFUSED');
    (networkError as any).code = 'ECONNABORTED';
    httpService.post.mockReturnValue(throwError(() => networkError));

    const result = await service.authorize({
      ...mockRequest,
      card: { ...mockRequest.card, number: '4000000000000002' },
    });

    expect(result.approved).toBe(false);
    expect(result.response_code).toBe('05');
  });
});
