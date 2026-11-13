import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        code = exception.name;
      } else if (typeof res === 'object' && res !== null) {
        const errorObj = res as Record<string, unknown>;
        message = (errorObj.message as string) || exception.message;
        code = (errorObj.code as string) || (errorObj.error as string) || exception.name;
        details = errorObj.details || (Array.isArray(errorObj.message) ? errorObj.message : undefined);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled error at ${request.method} ${request.url}: ${exception.message}`, exception.stack);
    }

    response.status(status).json({
      code,
      message,
      ...(details ? { details } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
