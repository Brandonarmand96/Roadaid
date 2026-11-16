import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DispatchService } from './dispatch.service';
import { RequestStatus } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@roadaid/shared';

@Controller('provider/offers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PROVIDER)
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}
  @Get() pending(@CurrentUser('id') providerId: string) { return this.dispatch.pendingOffers(providerId); }
  @Post(':id/accept') accept(@CurrentUser('id') providerId: string, @Param('id') id: string) { return this.dispatch.respond(providerId, id, true); }
  @Post(':id/decline') decline(@CurrentUser('id') providerId: string, @Param('id') id: string, @Body('reason') reason?: string) { return this.dispatch.respond(providerId, id, false, reason); }
}

@Controller('provider/jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PROVIDER)
export class ProviderJobsController {
  constructor(private readonly dispatch: DispatchService) {}
  @Get('current') currentJob(@CurrentUser('id') providerId: string) { return this.dispatch.currentJob(providerId); }
  @Post(':id/status') updateStatus(@CurrentUser('id') providerId: string, @Param('id') id: string, @Body('status') status: RequestStatus) { return this.dispatch.updateJobStatus(providerId, id, status); }
  @Post(':id/cancel') cancel(@CurrentUser('id') providerId: string, @Param('id') id: string, @Body('reason') reason?: string) { return this.dispatch.cancelAcceptedJob(providerId, id, reason || 'Provider unable to continue'); }
}
