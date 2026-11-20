import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { quoteRequestSchema, QuoteRequestDto, Role } from '@roadaid/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PricingService } from './pricing.service';

@Controller('pricing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER, Role.PROVIDER)
export class PricingController {
  constructor(private readonly pricing: PricingService) {}
  @Post('quote') quote(@Body(new ZodValidationPipe(quoteRequestSchema)) dto: QuoteRequestDto) { return this.pricing.quote(dto); }
}
