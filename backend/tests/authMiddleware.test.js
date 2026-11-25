import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY ||= "test-service-role-key";

const { supabase } = await import("../config/supabase.js");
const { optionalAuthMiddleware } = await import("../middleware/authMiddleware.js");

test("optional auth continues anonymously when no bearer token is supplied", async (t) => {
  const getUser = t.mock.method(supabase.auth, "getUser");
  const next = t.mock.fn();

  await optionalAuthMiddleware({ headers: {} }, {}, next);

  assert.equal(getUser.mock.callCount(), 0);
  assert.equal(next.mock.callCount(), 1);
  assert.equal(next.mock.calls[0].arguments.length, 0);
});

test("optional auth ignores malformed authorization headers", async (t) => {
  const getUser = t.mock.method(supabase.auth, "getUser");
  const next = t.mock.fn();

  await optionalAuthMiddleware(
    { headers: { authorization: "Basic not-a-bearer" } },
    {},
    next,
  );

  assert.equal(getUser.mock.callCount(), 0);
  assert.equal(next.mock.callCount(), 1);
  assert.equal(next.mock.calls[0].arguments.length, 0);
});

test("optional auth attaches a valid user", async (t) => {
  const user = { id: "user-123" };
  t.mock.method(supabase.auth, "getUser", async () => ({
    data: { user },
    error: null,
  }));
  const req = { headers: { authorization: "Bearer valid-token" } };
  const next = t.mock.fn();

  await optionalAuthMiddleware(req, {}, next);

  assert.equal(req.user, user);
  assert.equal(next.mock.callCount(), 1);
  assert.equal(next.mock.calls[0].arguments.length, 0);
});

test("optional auth treats an expired bearer token as an anonymous request", async (t) => {
  t.mock.method(supabase.auth, "getUser", async () => ({
    data: { user: null },
    error: Object.assign(new Error("JWT expired"), { status: 401 }),
  }));
  const req = { headers: { authorization: "Bearer expired-token" } };
  const next = t.mock.fn();

  await optionalAuthMiddleware(req, {}, next);

  assert.equal(req.user, undefined);
  assert.equal(next.mock.callCount(), 1);
  assert.equal(next.mock.calls[0].arguments.length, 0);
});

test("optional auth forwards unexpected Supabase errors", async (t) => {
  const serviceError = Object.assign(new Error("Supabase unavailable"), { status: 503 });
  t.mock.method(supabase.auth, "getUser", async () => ({
    data: { user: null },
    error: serviceError,
  }));
  const next = t.mock.fn();

  await optionalAuthMiddleware(
    { headers: { authorization: "Bearer valid-token" } },
    {},
    next,
  );

  assert.equal(next.mock.callCount(), 1);
  assert.equal(next.mock.calls[0].arguments[0], serviceError);
});
