import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '@roadaid/shared';

export const ADMIN_ROLES_KEY = 'admin_roles';
export const AdminRoles = (...adminRoles: AdminRole[]) => SetMetadata(ADMIN_ROLES_KEY, adminRoles);
