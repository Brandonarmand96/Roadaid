import { Module } from '@nestjs/common';
import { PaymentsController, WebhooksController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaystackGateway } from './paystack.gateway';
import { PAYMENT_GATEWAY_SERVICE } from './payment-gateway.interface';

@Module({ controllers: [PaymentsController, WebhooksController], providers: [PaymentsService, PaystackGateway, { provide: PAYMENT_GATEWAY_SERVICE, useExisting: PaystackGateway }], exports: [PaymentsService] })
export class PaymentsModule {}
