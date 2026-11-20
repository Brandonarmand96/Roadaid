import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}
  list(userId: string) { return this.prisma.supportCase.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }); }
  async create(userId: string, input: { subject?: string; message?: string; requestId?: string }) {
    const subject = input.subject?.trim();
    const message = input.message?.trim();
    if (!subject || subject.length > 160 || !message || message.length < 10 || message.length > 3000)
      throw new BadRequestException({ code: 'INVALID_SUPPORT_CASE', message: 'Enter a subject and a message between 10 and 3000 characters' });
    if (input.requestId) {
      const owned = await this.prisma.serviceRequest.count({ where: { id: input.requestId, OR: [{ customerId: userId }, { providerId: userId }] } });
      if (!owned) throw new BadRequestException({ code: 'REQUEST_NOT_OWNED', message: 'That request is not available for this support case' });
    }
    return this.prisma.supportCase.create({ data: { userId, requestId: input.requestId || null, subject, message } });
  }
}
