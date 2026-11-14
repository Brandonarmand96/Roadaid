import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface JwtPayload {
  userId: string;
  role: string;
  adminRole?: string | null;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid Authorization header',
      });
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_ACCESS_SECRET || 'development_jwt_access_secret_key_minimum_32_characters_long_for_security';

    try {
      const decoded = jwt.verify(token, secret) as JwtPayload;
      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          role: true,
          adminRole: true,
          phone: true,
          email: true,
          status: true,
        },
      });

      if (!user || user.status !== 'ACTIVE') {
        throw new UnauthorizedException({
          code: 'USER_INACTIVE_OR_NOT_FOUND',
          message: 'User account is inactive, suspended, or not found',
        });
      }

      request.user = {
        id: user.id,
        role: user.role,
        adminRole: user.adminRole,
        phone: user.phone,
        email: user.email,
      };

      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'JWT token verification failed or expired',
      });
    }
  }
}
