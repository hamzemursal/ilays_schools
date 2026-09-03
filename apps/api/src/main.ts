import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { requestContextMiddleware } from "./audit/request-context";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Render sits behind a reverse proxy — without this, req.ip and
  // X-Forwarded-For can't be trusted to reflect the real client, which the
  // audit log's IP capture (see audit/request-context.ts) depends on.
  app.set("trust proxy", 1);
  app.use(requestContextMiddleware);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix("api/v1");

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}/api/v1`);
}

bootstrap();
