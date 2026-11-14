import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { createServiceRequestSchema, CreateServiceRequestDto, Role } from '@roadaid/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequestsService } from './requests.service';

@Controller('requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}
  @Post() create(@CurrentUser('id') id: string, @Body(new ZodValidationPipe(createServiceRequestSchema)) dto: CreateServiceRequestDto) { return this.requests.create(id, dto); }
  @Get() list(@CurrentUser('id') id: string) { return this.requests.listOwned(id); }
  @Get(':id') detail(@CurrentUser('id') customerId: string, @Param('id') id: string) { return this.requests.getOwned(customerId, id); }
}
