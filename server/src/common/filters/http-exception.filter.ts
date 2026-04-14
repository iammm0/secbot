import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { mapExceptionToClientBody } from '../errors/map-exception-to-client';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = mapExceptionToClientBody(exception);

    if (!(exception instanceof HttpException)) {
      const logText =
        exception instanceof Error
          ? `${exception.message}\n${exception.stack ?? ''}`
          : String(exception);
      this.logger.error(`${request.method} ${request.url} — ${logText}`);
    } else if (body.statusCode >= 500) {
      this.logger.warn(`HttpException ${body.statusCode} ${request.method} ${request.url}`);
    }

    response.status(body.statusCode).json({
      success: false,
      statusCode: body.statusCode,
      code: body.code,
      message: body.message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
