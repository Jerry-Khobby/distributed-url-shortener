import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule,DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));

    const config = new DocumentBuilder()
    .setTitle('Distributed URL Shortner System')
    .setDescription('A scalable URL shortener using Supabase (Postgres + Auth) and NestJS, with support for custom aliases, link expiration, and analytics.')
    .setVersion('1.0')
    .addBearerAuth() // Optional: if you use JWT authentication
    .addTag('URLs') // Optional: to group related endpoints
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
