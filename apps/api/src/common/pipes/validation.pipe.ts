import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';

export const AppValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: (errors) => {
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    return new UnprocessableEntityException(messages);
  },
});
