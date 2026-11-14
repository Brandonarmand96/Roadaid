import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { RequestStateService } from './request-state.service';
@Module({ imports: [PricingModule], controllers: [RequestsController], providers: [RequestsService, RequestStateService], exports: [RequestsService, RequestStateService] })
export class RequestsModule {}
