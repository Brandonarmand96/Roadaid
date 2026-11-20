import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  customerVehicleSchema,
  updateProfileSchema,
  CustomerVehicleDto,
  UpdateProfileDto,
  Role,
} from '@roadaid/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER, Role.PROVIDER)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async getProfile(@CurrentUser('id') userId: string) {
    return this.customersService.getProfile(userId);
  }

  @Patch()
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto,
  ) {
    return this.customersService.updateProfile(userId, dto);
  }

  @Get('vehicles')
  async getVehicles(@CurrentUser('id') customerId: string) {
    return this.customersService.getVehicles(customerId);
  }

  @Post('vehicles')
  @HttpCode(HttpStatus.CREATED)
  async addVehicle(
    @CurrentUser('id') customerId: string,
    @Body(new ZodValidationPipe(customerVehicleSchema)) dto: CustomerVehicleDto,
  ) {
    return this.customersService.addVehicle(customerId, dto);
  }

  @Patch('vehicles/:id')
  async updateVehicle(
    @CurrentUser('id') customerId: string,
    @Param('id') vehicleId: string,
    @Body() dto: Partial<CustomerVehicleDto>,
  ) {
    return this.customersService.updateVehicle(customerId, vehicleId, dto);
  }

  @Delete('vehicles/:id')
  @HttpCode(HttpStatus.OK)
  async deleteVehicle(
    @CurrentUser('id') customerId: string,
    @Param('id') vehicleId: string,
  ) {
    return this.customersService.deleteVehicle(customerId, vehicleId);
  }
}
