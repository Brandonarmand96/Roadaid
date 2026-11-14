import { Module } from '@nestjs/common';
import { RequestStateService } from './request-state.service';
@Module({ providers: [RequestStateService], exports: [RequestStateService] })
export class RequestStateModule {}
