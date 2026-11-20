import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@roadaid/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SupportService } from './support.service';

@Controller('support/cases')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER, Role.PROVIDER)
export class SupportController {
  constructor(private readonly support: SupportService) {}
  @Get() list(@CurrentUser('id') userId: string) { return this.support.list(userId); }
  @Post() create(@CurrentUser('id') userId: string, @Body() body: { subject?: string; message?: string; requestId?: string }) { return this.support.create(userId, body); }
}
