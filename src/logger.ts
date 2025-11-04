import pino from "pino";

const isDevelopment = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(isDevelopment
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            translateTime: "SYS:standard",
            colorize: true,
          },
        },
      }
    : {}),
});

export type Logger = typeof logger;
