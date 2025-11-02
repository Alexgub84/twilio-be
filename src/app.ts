import fastify from "fastify";
import formbody from "@fastify/formbody";
import { registerRoutes } from "./routes/index.js";

export async function buildApp() {
  const app = fastify({
    logger: process.env.NODE_ENV !== "test",
  });

  await app.register(formbody);
  await app.register(registerRoutes);

  return app;
}
