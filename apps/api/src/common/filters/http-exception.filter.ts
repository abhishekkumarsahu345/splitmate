import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let statusCode: number;
    let error: string;
    let message: string[];

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const responseBody = exception.getResponse();

      if (typeof responseBody === 'string') {
        error = responseBody;
        message = [responseBody];
      } else if (typeof responseBody === 'object' && responseBody !== null) {
        const body = responseBody as Record<string, unknown>;
        error = (body['error'] as string) ?? exception.message;
        const rawMessage = body['message'];
        if (Array.isArray(rawMessage)) {
          message = rawMessage.map(String);
        } else if (typeof rawMessage === 'string') {
          message = [rawMessage];
        } else {
          message = [exception.message];
        }
      } else {
        error = exception.message;
        message = [exception.message];
      }

      // Mask internal server errors — don't leak details
      if (statusCode === HttpStatus.INTERNAL_SERVER_ERROR) {
        console.error(`[HttpExceptionFilter] 500 Error on ${req.method} ${req.url}:`, exception);
        error = 'Internal Server Error';
        message = ['An unexpected error occurred. Please try again later.'];
      }
    } else {
      // Non-HTTP exceptions (unexpected errors)
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      console.error(`[HttpExceptionFilter] Unhandled exception on ${req.method} ${req.url}:`, exception);
      error = 'Internal Server Error';
      message = ['An unexpected error occurred. Please try again later.'];
    }

    res.status(statusCode).json({ statusCode, error, message });
  }
}
