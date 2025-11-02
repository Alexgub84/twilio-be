import { buildApp } from "./app.js";
import { env } from "./env.js";

async function start() {
  try {
    const app = await buildApp();

    await app.listen({
      port: env.PORT,
      host: "0.0.0.0",
    });

    app.log.info(`Server is running on http://0.0.0.0:${env.PORT}`);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test") {
  start();
}
