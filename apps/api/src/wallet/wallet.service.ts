import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { LedgerEntryType, PayoutStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class WalletService implements OnModuleInit, OnModuleDestroy {
  private reminderTimer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService, @Optional() private readonly notifications?: NotificationsService) {}
  static commissionLimitKobo() {
    const raw = process.env.CASH_COMMISSION_LIMIT_KOBO ?? '5000000';
    return /^\d+$/.test(raw) ? BigInt(raw) : 5_000_000n;
  }
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.reminderTimer = setInterval(() => void this.sendCommissionReminders(), 6 * 60 * 60 * 1000);
    void this.sendCommissionReminders();
  }
  onModuleDestroy() { if (this.reminderTimer) clearInterval(this.reminderTimer); }
  async commissionPolicy(providerId: string, db: any = this.prisma) {
    const [row] = await db.$queryRaw<Array<{ due: bigint }>>`
      SELECT GREATEST(0, -COALESCE(SUM(amount_kobo), 0))::bigint AS due FROM ledger_entries
      WHERE provider_id=${providerId}::uuid AND (type='PLATFORM_COMMISSION' OR (type='ADJUSTMENT' AND description LIKE 'Cash commission settlement%'))`;
    const dueKobo = row?.due ?? 0n;
    const limitKobo = WalletService.commissionLimitKobo();
    return { dueKobo, limitKobo, remainingKobo: dueKobo >= limitKobo ? 0n : limitKobo - dueKobo, blocked: dueKobo >= limitKobo };
  }
  async balance(providerId: string, db: any = this.prisma) {
    const [row] = await db.$queryRaw<Array<{ balance: bigint }>>`SELECT COALESCE(SUM(amount_kobo), 0)::bigint AS balance FROM ledger_entries WHERE provider_id=${providerId}::uuid AND type IN ('PROVIDER_EARNING','PLATFORM_COMMISSION','PAYOUT','ADJUSTMENT')`;
    return row?.balance || 0n;
  }
  async wallet(providerId: string) {
    const [balanceKobo, entries, commissionRows, cashCommissions] = await Promise.all([
      this.balance(providerId),
      this.prisma.ledgerEntry.findMany({ where: { providerId, type: { in: [LedgerEntryType.PROVIDER_EARNING, LedgerEntryType.PLATFORM_COMMISSION, LedgerEntryType.PAYOUT, LedgerEntryType.ADJUSTMENT] } }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.$queryRaw<Array<{ amount: bigint }>>`
        SELECT COALESCE(SUM(amount_kobo), 0)::bigint AS amount
        FROM ledger_entries
        WHERE provider_id=${providerId}::uuid
          AND (type='PLATFORM_COMMISSION' OR (type='ADJUSTMENT' AND description LIKE 'Cash commission settlement%'))`,
      this.prisma.$queryRaw<Array<{ requestId: string; code: string; amountKobo: bigint }>>`
        SELECT le.request_id AS "requestId", sr.code, -SUM(le.amount_kobo)::bigint AS "amountKobo"
        FROM ledger_entries le
        JOIN service_requests sr ON sr.id=le.request_id
        WHERE le.provider_id=${providerId}::uuid
          AND (le.type='PLATFORM_COMMISSION' OR (le.type='ADJUSTMENT' AND le.description LIKE 'Cash commission settlement%'))
        GROUP BY le.request_id, sr.code
        HAVING SUM(le.amount_kobo) < 0
        ORDER BY MIN(le.created_at) ASC`,
    ]);
    const cashCommissionNet = commissionRows[0]?.amount ?? 0n;
    const policy = await this.commissionPolicy(providerId);
    return { balanceKobo, cashCommissionDueKobo: cashCommissionNet < 0n ? -cashCommissionNet : 0n, cashCommissionLimitKobo: policy.limitKobo, cashCommissionRemainingKobo: policy.remainingKobo, commissionBlocked: policy.blocked, cashCommissions, entries };
  }
  private async sendCommissionReminders() {
    if (!this.notifications) return;
    const limit = WalletService.commissionLimitKobo();
    const providers = await this.prisma.$queryRaw<Array<{ providerId: string; dueKobo: bigint }>>`
      SELECT provider_id AS "providerId", GREATEST(0, -SUM(amount_kobo))::bigint AS "dueKobo"
      FROM ledger_entries WHERE provider_id IS NOT NULL AND (type='PLATFORM_COMMISSION' OR (type='ADJUSTMENT' AND description LIKE 'Cash commission settlement%'))
      GROUP BY provider_id HAVING SUM(amount_kobo) < 0`;
    for (const provider of providers) {
      const recent = await this.prisma.notification.count({ where: { userId: provider.providerId, data: { path: ['type'], equals: 'COMMISSION_REPAYMENT_DUE' }, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
      if (recent) continue;
      await this.notifications.send(provider.providerId, { title: provider.dueKobo >= limit ? 'Commission repayment required' : 'Cash commission reminder', body: provider.dueKobo >= limit ? 'You have reached your cash commission limit. Repay commission to go online again.' : 'You have unpaid cash commission. Open Account & earnings to review and repay it.', data: { type: 'COMMISSION_REPAYMENT_DUE', dueKobo: provider.dueKobo.toString(), limitKobo: limit.toString() }, priority: 'high' });
    }
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
