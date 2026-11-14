import { Module } from '@nestjs/common';
import { DispatchController, ProviderJobsController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { RequestStateModule } from '../requests/request-state.module';
import { NotificationsModule } from '../notifications/notifications.module';
@Module({ imports: [RequestStateModule, NotificationsModule], controllers: [DispatchController, ProviderJobsController], providers: [DispatchService], exports: [DispatchService] })
export class DispatchModule {}
