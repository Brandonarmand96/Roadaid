import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WalletService } from './wallet.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@roadaid/shared';
@Controller('provider') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.PROVIDER)
export class WalletController {
  constructor(private readonly service: WalletService) {}
  @Get('wallet') wallet(@CurrentUser('id') id: string) { return this.service.wallet(id); }
  @Get('earnings') earnings(@CurrentUser('id') id: string) { return this.service.earnings(id); }
  @Put('bank-account') bank(@CurrentUser('id') id: string, @Body() body: { bankName: string; accountNumber: string; accountName: string }) { return this.service.setBankAccount(id, body); }
  @Post('payouts') payout(@CurrentUser('id') id: string, @Body('amountKobo') amount: string | number) { return this.service.requestPayout(id, BigInt(amount)); }
  @Get('payouts') payouts(@CurrentUser('id') id: string) { return this.service.payouts(id); }
}
