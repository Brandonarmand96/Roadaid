import {
  Controller,
  BadRequestException,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
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
  dispatchSettingsSchema,
  DispatchSettingsDto,
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

  @Get('dispatch-settings')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  getDispatchSettings() { return this.adminService.getDispatchSettings(); }

  @Get('commission-settings')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  getCommissionSettings() { return this.adminService.getCommissionSettings(); }

  @Post('commission-settings/:serviceType')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  updateCommissionSettings(@Param('serviceType') serviceType: ServiceType, @Body('commissionBps') commissionBps: number, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    return this.adminService.updateCommissionSettings(serviceType, commissionBps, admin.id, admin.adminRole || 'ADMIN', req.ip);
  }

  @Post('dispatch-settings/:serviceType')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  updateDispatchSettings(@Param('serviceType') serviceType: ServiceType, @Body(new ZodValidationPipe(dispatchSettingsSchema)) dto: DispatchSettingsDto, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    return this.adminService.updateDispatchSettings(serviceType, dto, admin.id, admin.adminRole || 'ADMIN', req.ip);
  }

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

  @Post('requests/:id/redispatch')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  redispatchRequest(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser) { return this.adminService.redispatchRequest(id, admin.id); }

  @Get('requests/:id/eligible-providers')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  eligibleProviders(@Param('id') id: string) { return this.adminService.eligibleProviders(id); }

  @Post('requests/:id/assign')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  assignRequest(@Param('id') id: string, @Body('providerId') providerId: string, @CurrentUser() admin: AuthenticatedUser) { return this.adminService.manualAssign(id, providerId, admin.id); }

  @Post('requests/:id/cancel')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  cancelRequest(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() admin: AuthenticatedUser) { return this.adminService.cancelRequest(id, reason || 'Cancelled by Operations', admin.id); }

  @Post('requests/:id/mark-paid')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  markPaid(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) { return this.adminService.markRequestPaid(id, reason, admin.id, admin.adminRole || 'ADMIN', req.ip); }

  @Post('requests/:id/refund')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  refund(@Param('id') id: string, @Body() body: { reason: string; refundReference?: string }, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) { return this.adminService.refundRequest(id, body.reason, body.refundReference, admin.id, admin.adminRole || 'ADMIN', req.ip); }

  @Get('dashboard')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS, AdminRole.FINANCE)
  dashboard() { return this.adminService.dashboard(); }

  @Get('support-cases')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  supportCases(@Query('status') status?: string) { return this.adminService.getSupportCases(status); }

  @Get('notifications')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  notifications() { return this.adminService.getNotificationHistory(); }

  @Post('support-cases/:id/status')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  updateSupportCase(@Param('id') id: string, @Body('status') status: string, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    return this.adminService.updateSupportCase(id, status, admin.id, admin.adminRole || 'ADMIN', req.ip);
  }

  @Get('live')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS)
  live() { return this.adminService.liveSnapshot(); }

  @Get('payments')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  payments() { return this.adminService.getPayments(); }

  @Get('payouts')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  payouts() { return this.adminService.getPayouts(); }

  @Post('payouts/:id/approve')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  approvePayout(@Param('id') id: string, @Body('note') note: string | undefined, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) { return this.adminService.decidePayout(id, true, note, admin.id, admin.adminRole || 'ADMIN', req.ip); }

  @Post('payouts/:id/reject')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  rejectPayout(@Param('id') id: string, @Body('note') note: string | undefined, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) { return this.adminService.decidePayout(id, false, note, admin.id, admin.adminRole || 'ADMIN', req.ip); }

  @Post('payouts/:id/mark-paid')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  markPayoutPaid(@Param('id') id: string, @Body('reference') reference: string, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) { return this.adminService.markPayoutPaid(id, reference, admin.id, admin.adminRole || 'ADMIN', req.ip); }

  @Get('reports/:kind')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  async report(@Param('kind') kind: 'requests' | 'revenue' | 'providers' | 'payouts', @Query('from') from: string | undefined, @Query('to') to: string | undefined, @Query('format') format: string | undefined, @Res({ passthrough: true }) response: Response) {
    if (!['requests', 'revenue', 'providers', 'payouts'].includes(kind)) throw new BadRequestException({ code: 'INVALID_REPORT', message: 'Unknown report type' });
    const fromDate = from ? new Date(from) : undefined; const toDate = to ? new Date(to) : undefined;
    if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime())) || (fromDate && toDate && fromDate > toDate)) throw new BadRequestException({ code: 'INVALID_REPORT_RANGE', message: 'Report dates are invalid or out of order' });
    const rows = await this.adminService.report(kind, fromDate, toDate) as unknown as Record<string, unknown>[];
    if (format !== 'csv') return rows;
    response.type('text/csv'); response.setHeader('Content-Disposition', `attachment; filename="roadaid-${kind}.csv"`);
    if (!rows.length) return '';
    const columns = Object.keys(rows[0]);
    const cell = (value: unknown) => `"${String(typeof value === 'bigint' ? value.toString() : value instanceof Date ? value.toISOString() : value ?? '').replaceAll('"', '""')}"`;
    return [columns.map(cell).join(','), ...rows.map((row) => columns.map((column) => cell(row[column])).join(','))].join('\n');
  }

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
