import { assert, assertEquals } from "std/assert";
import { createSessionToken, verifySessionToken } from "../src/auth/session.ts";
import { Role } from "../src/types/domain.ts";

const ensureEnv = () => {
  Deno.env.set(
    "DATABASE_URL",
    "postgresql://user:pass@localhost:5432/deno_hono_shop",
  );
  Deno.env.set("COOKIE_SECRET", "test-secret");
  Deno.env.set("APP_ENV", "test");
};

ensureEnv();

Deno.test("session tokens round-trip with version", async () => {
  const token = await createSessionToken("user-1", Role.ADMIN, 2, 60);
  const payload = await verifySessionToken(token);
  assert(payload);
  if (payload) {
    assertEquals(payload.sub, "user-1");
    assertEquals(payload.role, Role.ADMIN);
    assertEquals(payload.ver, 2);
  }
});

Deno.test("expired session tokens return null", async () => {
  const token = await createSessionToken("user-2", Role.CUSTOMER, 0, -1);
  const payload = await verifySessionToken(token);
  assertEquals(payload, null);
});
