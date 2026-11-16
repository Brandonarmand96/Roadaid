import { BadRequestException } from '@nestjs/common';
import { WalletService } from '../src/wallet/wallet.service';

describe('WalletService', () => {
  const tx: any = {
    $queryRaw: jest.fn(),
    providerBankAccount: { findFirst: jest.fn() },
    ledgerEntry: { create: jest.fn() },
    payoutRequest: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
  const prisma: any = { $transaction: jest.fn((callback) => callback(tx)) };
  let service: WalletService;
  beforeEach(() => { jest.clearAllMocks(); service = new WalletService(prisma); });

  it('rejects a payout greater than the ledger-derived balance', async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ user_id: 'provider-1' }]).mockResolvedValueOnce([{ balance: 5000n }]);
    tx.payoutRequest.findFirst.mockResolvedValue(null);
    tx.providerBankAccount.findFirst.mockResolvedValue({ bankName: 'Test Bank', accountNumber: '0123456789', accountName: 'Provider' });
    await expect(service.requestPayout('provider-1', 5001n)).rejects.toThrow(BadRequestException);
    expect(tx.payoutRequest.create).not.toHaveBeenCalled();
  });

  it('marks an approved payout paid with an exact negative ledger entry', async () => {
    tx.$queryRaw.mockResolvedValue([{ provider_id: 'provider-1', amount_kobo: 5000n, status: 'APPROVED' }]);
    tx.payoutRequest.update.mockResolvedValue({ id: 'payout-1', status: 'PAID' });
    await service.markPaid('payout-1', 'admin-1', 'BANK-123');
    expect(tx.ledgerEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'PAYOUT', amountKobo: -5000n, providerId: 'provider-1' }) });
  });
});
