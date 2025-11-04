import pino from "pino";

const isDevelopment = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          translateTime: "SYS:standard",
          colorize: true,
        },
      }
    : undefined,
});

export type Logger = typeof logger;
