import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerVehicleDto, UpdateProfileDto } from '@roadaid/shared';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        email: true,
        fullName: true,
        role: true,
        adminRole: true,
        avatarUrl: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User profile not found',
      });
    }

    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: dto.fullName,
        email: dto.email,
      },
      select: {
        id: true,
        phone: true,
        email: true,
        fullName: true,
        role: true,
        avatarUrl: true,
      },
    });
  }

  async getVehicles(customerId: string) {
    return this.prisma.customerVehicle.findMany({
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async addVehicle(customerId: string, dto: CustomerVehicleDto) {
    if (dto.isDefault) {
      await this.prisma.customerVehicle.updateMany({
        where: { customerId },
        data: { isDefault: false },
      });
    }

    return this.prisma.customerVehicle.create({
      data: {
        customerId,
        make: dto.make,
        model: dto.model,
        color: dto.color,
        plateNumber: dto.plateNumber,
        vehicleType: dto.vehicleType,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  async updateVehicle(customerId: string, vehicleId: string, dto: Partial<CustomerVehicleDto>) {
    // IDOR Protection: verify ownership
    const vehicle = await this.prisma.customerVehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException({
        code: 'VEHICLE_NOT_FOUND',
        message: 'Vehicle not found',
      });
    }

    if (vehicle.customerId !== customerId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE',
        message: 'You do not have permission to modify this vehicle',
      });
    }

    if (dto.isDefault) {
      await this.prisma.customerVehicle.updateMany({
        where: { customerId },
        data: { isDefault: false },
      });
    }

    return this.prisma.customerVehicle.update({
      where: { id: vehicleId },
      data: {
        ...(dto.make ? { make: dto.make } : {}),
        ...(dto.model ? { model: dto.model } : {}),
        ...(dto.color ? { color: dto.color } : {}),
        ...(dto.plateNumber ? { plateNumber: dto.plateNumber } : {}),
        ...(dto.vehicleType ? { vehicleType: dto.vehicleType } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      },
    });
  }

  async deleteVehicle(customerId: string, vehicleId: string) {
    // IDOR Protection: verify ownership
    const vehicle = await this.prisma.customerVehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException({
        code: 'VEHICLE_NOT_FOUND',
        message: 'Vehicle not found',
      });
    }

    if (vehicle.customerId !== customerId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE',
        message: 'You do not have permission to delete this vehicle',
      });
    }

    await this.prisma.customerVehicle.delete({
      where: { id: vehicleId },
    });

    return { success: true };
  }
}
