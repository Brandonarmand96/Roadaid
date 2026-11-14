import { Controller, Get, Query, Res, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { LocalStorageService } from './local-storage.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('storage')
export class StorageController {
  constructor(private readonly localStorageService: LocalStorageService) {}

  @Public()
  @Get('file')
  async serveFile(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      throw new UnauthorizedException({
        code: 'MISSING_TOKEN',
        message: 'Signed URL token is required',
      });
    }

    const file = await this.localStorageService.verifyToken(token);
    if (!file) {
      throw new UnauthorizedException({
        code: 'INVALID_OR_EXPIRED_URL',
        message: 'Signed URL has expired or signature is invalid',
      });
    }

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(file.filePath);
  }
}
