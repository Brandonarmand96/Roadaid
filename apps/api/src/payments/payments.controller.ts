import { Body, Controller, Get, Headers, Param, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@roadaid/shared';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER, Role.PROVIDER)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}
  @Post('initialize') initialize(@CurrentUser('id') customerId: string, @Body('requestId') requestId: string) { return this.payments.initialize(customerId, requestId); }
  @Get(':reference/status') status(@CurrentUser('id') customerId: string, @Param('reference') reference: string) { return this.payments.status(customerId, reference); }
}

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly payments: PaymentsService) {}
  @Post('paystack') paystack(@Req() request: RawBodyRequest<Request>, @Headers('x-paystack-signature') signature?: string) {
    return this.payments.handlePaystack(request.rawBody || Buffer.from(JSON.stringify(request.body)), signature);
  }
}
