import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { DispatchModule } from '../dispatch/dispatch.module';
import { RequestStateModule } from './request-state.module';
import { PublicRequestsController } from './public-requests.controller';
@Module({ imports: [PricingModule, DispatchModule, RequestStateModule], controllers: [RequestsController, PublicRequestsController], providers: [RequestsService], exports: [RequestsService, RequestStateModule] })
export class RequestsModule {}
