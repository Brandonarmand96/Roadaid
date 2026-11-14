import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminRoles } from '../common/decorators/admin-roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import {
  Role,
  AdminRole,
  OnboardingStatus,
  ApprovalStatus,
  ServiceType,
  pricingRuleSchema,
  PricingRuleDto,
} from '@roadaid/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, AdminRolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly auditService: AuditService,
  ) {}

  @Get('pricing')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  getPricing() { return this.adminService.getPricingRules(); }

  @Post('pricing/:serviceType')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  updatePricing(@Param('serviceType') serviceType: ServiceType, @Body(new ZodValidationPipe(pricingRuleSchema)) dto: PricingRuleDto, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    return this.adminService.updatePricingRule(serviceType, dto, admin.id, admin.adminRole || 'ADMIN', req.ip);
  }

  @Get('requests')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  getRequests(@Query('status') status?: string, @Query('serviceType') serviceType?: ServiceType) { return this.adminService.getRequests(status, serviceType); }

  @Get('requests/:id')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  getRequest(@Param('id') id: string) { return this.adminService.getRequestDetail(id); }

  @Get('providers')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  async getProviders(
    @Query('status') status?: OnboardingStatus,
    @Query('service') service?: ServiceType,
    @Query('q') q?: string,
  ) {
    return this.adminService.getProviders({ status, service, q });
  }

  @Get('providers/:id')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  async getProviderDetail(@Param('id') providerId: string) {
    return this.adminService.getProviderDetail(providerId);
  }

  @Post('providers/:id/approve')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  @HttpCode(HttpStatus.OK)
  async approveProvider(
    @Param('id') providerId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: any,
  ) {
    return this.adminService.setProviderStatus(
      providerId,
      OnboardingStatus.APPROVED,
      undefined,
      admin.id,
      admin.adminRole || 'ADMIN',
      req.ip,
    );
  }

  @Post('providers/:id/reject')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  @HttpCode(HttpStatus.OK)
  async rejectProvider(
    @Param('id') providerId: string,
    @Body('reason') reason: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: any,
  ) {
    return this.adminService.setProviderStatus(
      providerId,
      OnboardingStatus.REJECTED,
      reason,
      admin.id,
      admin.adminRole || 'ADMIN',
      req.ip,
    );
  }

  @Post('providers/:id/suspend')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  @HttpCode(HttpStatus.OK)
  async suspendProvider(
    @Param('id') providerId: string,
    @Body('reason') reason: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: any,
  ) {
    return this.adminService.setProviderStatus(
      providerId,
      OnboardingStatus.SUSPENDED,
      reason,
      admin.id,
      admin.adminRole || 'ADMIN',
      req.ip,
    );
  }

  @Post('providers/:id/reinstate')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  @HttpCode(HttpStatus.OK)
  async reinstateProvider(
    @Param('id') providerId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: any,
  ) {
    return this.adminService.setProviderStatus(
      providerId,
      OnboardingStatus.APPROVED,
      undefined,
      admin.id,
      admin.adminRole || 'ADMIN',
      req.ip,
    );
  }

  @Post('providers/:id/services/:serviceType/approve')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  @HttpCode(HttpStatus.OK)
  async approveService(
    @Param('id') providerId: string,
    @Param('serviceType') serviceType: ServiceType,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: any,
  ) {
    return this.adminService.setProviderServiceStatus(
      providerId,
      serviceType,
      ApprovalStatus.APPROVED,
      undefined,
      admin.id,
      admin.adminRole || 'ADMIN',
      req.ip,
    );
  }

  @Post('providers/:id/services/:serviceType/reject')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  @HttpCode(HttpStatus.OK)
  async rejectService(
    @Param('id') providerId: string,
    @Param('serviceType') serviceType: ServiceType,
    @Body('reason') reason: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: any,
  ) {
    return this.adminService.setProviderServiceStatus(
      providerId,
      serviceType,
      ApprovalStatus.REJECTED,
      reason,
      admin.id,
      admin.adminRole || 'ADMIN',
      req.ip,
    );
  }

  @Post('providers/:id/services/:serviceType/suspend')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  @HttpCode(HttpStatus.OK)
  async suspendService(
    @Param('id') providerId: string,
    @Param('serviceType') serviceType: ServiceType,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: any,
  ) {
    return this.adminService.setProviderServiceStatus(
      providerId,
      serviceType,
      ApprovalStatus.SUSPENDED,
      undefined,
      admin.id,
      admin.adminRole || 'ADMIN',
      req.ip,
    );
  }

  @Post('documents/:id/accept')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  @HttpCode(HttpStatus.OK)
  async acceptDocument(
    @Param('id') documentId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: any,
  ) {
    return this.adminService.setDocumentStatus(
      documentId,
      ApprovalStatus.APPROVED,
      undefined,
      admin.id,
      admin.adminRole || 'ADMIN',
      req.ip,
    );
  }

  @Post('documents/:id/reject')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  @HttpCode(HttpStatus.OK)
  async rejectDocument(
    @Param('id') documentId: string,
    @Body('note') note: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: any,
  ) {
    return this.adminService.setDocumentStatus(
      documentId,
      ApprovalStatus.REJECTED,
      note,
      admin.id,
      admin.adminRole || 'ADMIN',
      req.ip,
    );
  }

  @Get('customers')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  async getCustomers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getCustomers(page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 50);
  }

  @Get('customers/:id')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  async getCustomerDetail(@Param('id') customerId: string) {
    return this.adminService.getCustomerDetail(customerId);
  }

  @Get('audit-logs')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS, AdminRole.FINANCE)
  async getAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.getLogs(page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 50);
  }
}
