import assert from "node:assert/strict";
import { test } from "node:test";

import {
  InvitationValidationError,
  normalizeInvitationInput,
} from "../utils/invitationValidation.js";

const PROJECT_ID = "c246d34b-f66a-4f4f-8987-15f8b830839a";

test("project invitation normalizes email and ignores client-owned database fields", () => {
  const result = normalizeInvitationInput({
    emails: ["  Teammate@Example.com "],
    role: "editor",
    scope: "project",
    project_id: PROJECT_ID,
    personal_note: "  Welcome!  ",
    inviter_id: "attacker-controlled",
    status: "accepted",
    token_hash: "client-controlled",
    expires_at: "2099-01-01",
  }, "owner@example.com");

  assert.deepEqual(result, {
    emails: ["teammate@example.com"],
    role: "editor",
    scope: "project",
    project_id: PROJECT_ID,
    personal_note: "Welcome!",
  });
});

test("account invitations always have no project association", () => {
  const result = normalizeInvitationInput({
    emails: ["teammate@example.com"],
    role: "viewer",
    scope: "account",
  });

  assert.equal(result.project_id, null);
});

test("invalid role, scope, project reference, duplicate, self, and oversized batches fail", () => {
  const invalidInputs = [
    { emails: ["a@example.com"], role: "Owner ", scope: "account" },
    { emails: ["a@example.com"], role: "editor", scope: "workspace" },
    { emails: ["a@example.com"], role: "editor", scope: "project", project_id: "current" },
    { emails: ["a@example.com", "A@example.com"], role: "editor", scope: "account" },
    { emails: ["owner@example.com"], role: "editor", scope: "account" },
    {
      emails: Array.from({ length: 11 }, (_, index) => `person${index}@example.com`),
      role: "editor",
      scope: "account",
    },
  ];

  for (const input of invalidInputs) {
    assert.throws(
      () => normalizeInvitationInput(input, "owner@example.com"),
      InvitationValidationError,
    );
  }
});

test("invalid email and oversized or control-character notes fail validation", () => {
  for (const input of [
    { emails: ["not-an-email"], role: "viewer", scope: "account" },
    { emails: ["a@example.com"], role: "viewer", scope: "account", personal_note: "x".repeat(501) },
    { emails: ["a@example.com"], role: "viewer", scope: "account", personal_note: "hello\u0000world" },
  ]) {
    assert.throws(
      () => normalizeInvitationInput(input),
      InvitationValidationError,
    );
  }
});
