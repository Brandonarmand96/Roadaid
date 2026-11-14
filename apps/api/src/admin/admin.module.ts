import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { DispatchModule } from '../dispatch/dispatch.module';
import { RequestStateModule } from '../requests/request-state.module';

@Module({
  imports: [DispatchModule, RequestStateModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
