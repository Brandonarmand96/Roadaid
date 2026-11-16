import {
  Controller,
  BadRequestException,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProvidersService } from './providers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ServiceType,
  DocumentType,
  ProviderAvailability,
  providerAvailabilitySchema,
  ProviderAvailabilityDto,
  locationUpdateSchema,
  LocationUpdateDto,
} from '@roadaid/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

@Controller('provider')
@UseGuards(JwtAuthGuard)
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get('profile')
  async getProfile(@CurrentUser('id') userId: string) {
    return this.providersService.getProfile(userId);
  }

  @Put('profile')
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      businessName?: string;
      address?: string;
      vehicleMake?: string;
      vehicleModel?: string;
      vehiclePlate?: string;
      equipmentNotes?: string;
    },
  ) {
    return this.providersService.updateProfile(userId, body);
  }

  @Get('services')
  async getServices(@CurrentUser('id') userId: string) {
    return this.providersService.getServices(userId);
  }

  @Post('services')
  @HttpCode(HttpStatus.CREATED)
  async applyService(
    @CurrentUser('id') userId: string,
    @Body() body: { serviceType: ServiceType; details?: any },
  ) {
    return this.providersService.applyService(userId, body.serviceType, body.details);
  }

  @Get('documents')
  async getDocuments(@CurrentUser('id') userId: string) {
    return this.providersService.getDocuments(userId);
  }

  @Post('documents')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.mimetype)) {
        callback(new BadRequestException({
          code: 'INVALID_FILE_TYPE',
          message: 'Only JPEG, PNG, WEBP, and PDF documents are allowed',
        }), false);
        return;
      }
      callback(null, true);
    },
  }))
  @HttpCode(HttpStatus.CREATED)
  async uploadDocument(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('docType') docType: DocumentType,
    @Body('serviceType') serviceType?: ServiceType,
  ) {
    return this.providersService.uploadDocument(userId, file, docType, serviceType);
  }

  @Delete('documents/:id')
  @HttpCode(HttpStatus.OK)
  async deleteDocument(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
  ) {
    return this.providersService.deleteDocument(userId, documentId);
  }

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  async submitApplication(@CurrentUser('id') userId: string) {
    return this.providersService.submitApplication(userId);
  }

  @Post('availability')
  @HttpCode(HttpStatus.OK)
  async setAvailability(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(providerAvailabilitySchema)) dto: ProviderAvailabilityDto,
  ) {
    return this.providersService.setAvailability(userId, dto.state as ProviderAvailability);
  }

  @Post('location')
  @HttpCode(HttpStatus.OK)
  async updateLocation(
    @CurrentUser('id') providerId: string,
    @Body(new ZodValidationPipe(locationUpdateSchema)) dto: LocationUpdateDto,
  ) {
    return this.providersService.updateLocation(providerId, dto);
  }

  @Post('location/batch')
  @HttpCode(HttpStatus.OK)
  async updateLocationBatch(@CurrentUser('id') providerId: string, @Body() body: { points: LocationUpdateDto[] }) {
    return this.providersService.updateLocationBatch(providerId, body.points);
  }
}
