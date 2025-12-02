import { startServer } from "./server.js";
import { logger } from "./logger.js";

if (process.env.NODE_ENV !== "test") {
  startServer().catch((error) => {
    logger.error({ error }, "server.start.failed");
    process.exit(1);
  });
}
