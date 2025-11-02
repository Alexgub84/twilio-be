import { test } from "tap";
import { buildApp } from "./app.js";

test("GET / returns ok", async (t) => {
  const app = await buildApp();
  t.teardown(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/",
  });

  t.equal(response.statusCode, 200);
  t.same(response.json(), { ok: true });
});

test("POST /whatsapp validates request body", async (t) => {
  const app = await buildApp();
  t.teardown(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/whatsapp",
    payload: {},
  });

  t.equal(response.statusCode, 400);
  const body = response.json();
  t.ok(body.error);
  t.equal(body.error, "Invalid request body");
});
