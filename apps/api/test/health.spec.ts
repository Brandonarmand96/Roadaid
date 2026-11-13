import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../src/health/health.controller';
import { PrismaService } from '../src/prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('returns ok for /health', () => {
    const result = controller.getHealth();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('RoadAid API');
    expect(result.timestamp).toBeDefined();
  });

  it('returns ready when database query succeeds', async () => {
    const result = await controller.getReady();
    expect(result.status).toBe('ready');
    expect(result.database).toBe('connected');
  });

  it('returns degraded when database query fails', async () => {
    jest.spyOn(prismaService, '$queryRaw').mockRejectedValueOnce(new Error('DB Conn Error'));
    const result = await controller.getReady();
    expect(result.status).toBe('degraded');
    expect(result.database).toBe('disconnected');
  });
});
