import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';
import { StorageModule } from './storage/storage.module';
import { ProvidersModule } from './providers/providers.module';
import { AuditModule } from './audit/audit.module';
import { AdminModule } from './admin/admin.module';
import { PricingModule } from './pricing/pricing.module';
import { RequestsModule } from './requests/requests.module';
import { PaymentsModule } from './payments/payments.module';
import { WalletModule } from './wallet/wallet.module';
import { MapsModule } from './maps/maps.module';
import { SupportModule } from './support/support.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    RealtimeModule,
    AuthModule,
    CustomersModule,
    StorageModule,
    ProvidersModule,
    AuditModule,
    AdminModule,
    PricingModule,
    RequestsModule,
    PaymentsModule,
    WalletModule,
    MapsModule,
    SupportModule,
  ],
})
export class AppModule {}
