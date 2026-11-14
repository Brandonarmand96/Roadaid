import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole, Role } from '@roadaid/shared';
import { ADMIN_ROLES_KEY } from '../decorators/admin-roles.decorator';

@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredAdminRoles = this.reflector.getAllAndOverride<AdminRole[]>(ADMIN_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredAdminRoles || requiredAdminRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user || user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'ADMIN_ACCESS_REQUIRED',
        message: 'Endpoint is restricted to administrators',
      });
    }

    // SUPER_ADMIN has access to everything
    if (user.adminRole === AdminRole.SUPER_ADMIN) {
      return true;
    }

    const hasAdminRole = requiredAdminRoles.includes(user.adminRole as AdminRole);
    if (!hasAdminRole) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ADMIN_PERMISSIONS',
        message: `Requires admin role [${requiredAdminRoles.join(', ')}]. Current role: ${user.adminRole}`,
      });
    }

    return true;
  }
}
