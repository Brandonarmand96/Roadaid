import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LedgerEntryType, PayoutStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}
  async balance(providerId: string, db: any = this.prisma) {
    const [row] = await db.$queryRaw<Array<{ balance: bigint }>>`SELECT COALESCE(SUM(amount_kobo), 0)::bigint AS balance FROM ledger_entries WHERE provider_id=${providerId}::uuid AND type IN ('PROVIDER_EARNING','PAYOUT','ADJUSTMENT')`;
    return row?.balance || 0n;
  }
  async wallet(providerId: string) {
    const [balanceKobo, entries] = await Promise.all([this.balance(providerId), this.prisma.ledgerEntry.findMany({ where: { providerId, type: { in: [LedgerEntryType.PROVIDER_EARNING, LedgerEntryType.PAYOUT, LedgerEntryType.ADJUSTMENT] } }, orderBy: { createdAt: 'desc' }, take: 100 })]);
    return { balanceKobo, entries };
  }
  async earnings(providerId: string) {
    const entries = await this.prisma.ledgerEntry.findMany({ where: { providerId, type: LedgerEntryType.PROVIDER_EARNING }, orderBy: { createdAt: 'desc' }, take: 100 });
    return { totalKobo: entries.reduce((sum, entry) => sum + entry.amountKobo, 0n), entries };
  }
  async setBankAccount(providerId: string, data: { bankName: string; accountNumber: string; accountName: string }) {
    if (!/^\d{10}$/.test(data.accountNumber)) throw new BadRequestException({ code: 'INVALID_ACCOUNT_NUMBER', message: 'Account number must contain exactly 10 digits' });
    await this.prisma.providerProfile.findUniqueOrThrow({ where: { userId: providerId } });
    const existing = await this.prisma.providerBankAccount.findFirst({ where: { providerId } });
    return existing ? this.prisma.providerBankAccount.update({ where: { id: existing.id }, data }) : this.prisma.providerBankAccount.create({ data: { providerId, ...data } });
  }
  async requestPayout(providerId: string, amountKobo: bigint) {
    if (amountKobo <= 0n) throw new BadRequestException({ code: 'INVALID_PAYOUT_AMOUNT', message: 'Payout amount must be positive' });
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT user_id FROM provider_profiles WHERE user_id=${providerId}::uuid FOR UPDATE`;
      if (await tx.payoutRequest.findFirst({ where: { providerId, status: PayoutStatus.REQUESTED } })) throw new ConflictException({ code: 'PAYOUT_ALREADY_REQUESTED', message: 'A payout request is already awaiting review' });
      const account = await tx.providerBankAccount.findFirst({ where: { providerId }, orderBy: { updatedAt: 'desc' } });
      if (!account) throw new BadRequestException({ code: 'BANK_ACCOUNT_REQUIRED', message: 'Add a bank account before requesting a payout' });
      if (amountKobo > await this.balance(providerId, tx)) throw new BadRequestException({ code: 'INSUFFICIENT_WALLET_BALANCE', message: 'Payout exceeds the available wallet balance' });
      return tx.payoutRequest.create({ data: { providerId, amountKobo, bankName: account.bankName, accountNumber: account.accountNumber, accountName: account.accountName } });
    });
  }
  payouts(providerId: string) { return this.prisma.payoutRequest.findMany({ where: { providerId }, orderBy: { requestedAt: 'desc' } }); }
  async markPaid(id: string, adminId: string, reference: string) {
    if (!reference.trim()) throw new BadRequestException({ code: 'PAYOUT_REFERENCE_REQUIRED', message: 'Bank transfer reference is required' });
    return this.prisma.$transaction(async (tx) => {
      const [payout] = await tx.$queryRaw<Array<{ provider_id: string; amount_kobo: bigint; status: PayoutStatus }>>`SELECT provider_id, amount_kobo, status FROM payout_requests WHERE id=${id}::uuid FOR UPDATE`;
      if (!payout) throw new NotFoundException({ code: 'PAYOUT_NOT_FOUND', message: 'Payout request not found' });
      if (payout.status !== PayoutStatus.APPROVED) throw new BadRequestException({ code: 'PAYOUT_NOT_APPROVED', message: 'Only an approved payout can be marked paid' });
      await tx.ledgerEntry.create({ data: { type: LedgerEntryType.PAYOUT, providerId: payout.provider_id, amountKobo: -payout.amount_kobo, description: `Payout ${reference}`, createdBy: adminId } });
      return tx.payoutRequest.update({ where: { id }, data: { status: PayoutStatus.PAID, paidReference: reference, reviewedBy: adminId, reviewedAt: new Date() } });
    });
  }
}
