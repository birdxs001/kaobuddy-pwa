import assert from "node:assert/strict";
import test from "node:test";
import {
  applyInviteVerification,
  normalizeInviteState,
  updateInviteCodeDraft
} from "../../src/inviteState.ts";

const restoredInviteCode = "TEST_ONLY_INVITE_OK";

test("restores verified invite state from older storage without aiMode", () => {
  const state = normalizeInviteState({
    inviteCode: restoredInviteCode,
    remaining: 3,
    remainingBudgetCny: 1.2,
    validatedAt: "2026-06-04T10:00:00.000Z"
  });

  assert.equal(state.aiMode, "invite");
  assert.equal(state.inviteCode, restoredInviteCode);
  assert.equal(state.validatedAt, "2026-06-04T10:00:00.000Z");
});

test("keeps invite drafts in invite mode and clears stale validation when code changes", () => {
  const state = updateInviteCodeDraft(
    normalizeInviteState({
      inviteCode: "OLD-CODE",
      remaining: 2,
      remainingBudgetCny: 0.8,
      validatedAt: "2026-06-04T10:00:00.000Z",
      aiMode: "invite"
    }),
    "NEW-CODE"
  );

  assert.equal(state.aiMode, "invite");
  assert.equal(state.inviteCode, "NEW-CODE");
  assert.equal(state.validatedAt, "");
  assert.equal(state.remaining, 0);
  assert.equal(state.remainingBudgetCny, 0);
});

test("only marks invite as validated when verification result is valid", () => {
  const failed = applyInviteVerification(
    normalizeInviteState({ inviteCode: "BAD", aiMode: "invite" }),
    "BAD",
    { valid: false, remaining: 0, remainingBudgetCny: 0 },
    "2026-06-04T10:00:00.000Z"
  );
  const passed = applyInviteVerification(
    normalizeInviteState({ inviteCode: "OK", aiMode: "invite" }),
    "OK",
    { valid: true, remaining: 5, remainingBudgetCny: 2.5 },
    "2026-06-04T10:00:00.000Z"
  );

  assert.equal(failed.validatedAt, "");
  assert.equal(passed.validatedAt, "2026-06-04T10:00:00.000Z");
});
