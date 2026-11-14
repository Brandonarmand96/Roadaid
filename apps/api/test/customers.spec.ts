import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { CustomersService } from '../src/customers/customers.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { VehicleType } from '@roadaid/shared';

describe('CustomersService & IDOR Protection (Phase 1)', () => {
  let service: CustomersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      customerVehicle: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  describe('Vehicle Management & IDOR', () => {
    it('allows a customer to update their own vehicle', async () => {
      prisma.customerVehicle.findUnique.mockResolvedValue({
        id: 'veh-1',
        customerId: 'cust-1',
        make: 'Toyota',
        model: 'Corolla',
      });
      prisma.customerVehicle.update.mockResolvedValue({
        id: 'veh-1',
        customerId: 'cust-1',
        color: 'Black',
      });

      const res = await service.updateVehicle('cust-1', 'veh-1', { color: 'Black' });
      expect(res.color).toBe('Black');
    });

    it('PREVENTS IDOR: rejects when Customer A attempts to update Customer B vehicle', async () => {
      prisma.customerVehicle.findUnique.mockResolvedValue({
        id: 'veh-2',
        customerId: 'cust-2', // belongs to customer 2
        make: 'Honda',
      });

      // Customer 1 tries to update customer 2's vehicle
      await expect(
        service.updateVehicle('cust-1', 'veh-2', { color: 'Red' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('PREVENTS IDOR: rejects when Customer A attempts to delete Customer B vehicle', async () => {
      prisma.customerVehicle.findUnique.mockResolvedValue({
        id: 'veh-2',
        customerId: 'cust-2',
      });

      await expect(
        service.deleteVehicle('cust-1', 'veh-2'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
