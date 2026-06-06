import assert from "node:assert/strict";
import test from "node:test";
import { buildAiAuthPayload, resolveEffectiveInviteState } from "../../src/aiAuth.ts";
import { normalizeInviteState } from "../../src/inviteState.ts";
import type { ApiConfig } from "../../src/types.ts";

const apiConfig: ApiConfig = {
  provider_name: "DeepSeek",
  base_url: "https://api.deepseek.com",
  api_key: "sk-test",
  model: "deepseek-chat",
  temperature: 0.4,
  max_tokens: 1800
};

test("custom API mode is not overwritten by an older verified invite in storage", () => {
  const current = normalizeInviteState({ aiMode: "custom" });
  const stored = normalizeInviteState({
    aiMode: "invite",
    inviteCode: "KAO-OLD",
    remaining: 3,
    remainingBudgetCny: 1.2,
    validatedAt: "2026-06-04T10:00:00.000Z"
  });

  const resolved = resolveEffectiveInviteState(current, stored);

  assert.equal(resolved.aiMode, "custom");
  assert.deepEqual(buildAiAuthPayload(resolved, apiConfig), { api_config: apiConfig });
});

test("invite mode can still restore a verified invite from storage", () => {
  const current = normalizeInviteState({ aiMode: "invite", inviteCode: "KAO-OLD" });
  const stored = normalizeInviteState({
    aiMode: "invite",
    inviteCode: "KAO-OLD",
    remaining: 3,
    remainingBudgetCny: 1.2,
    validatedAt: "2026-06-04T10:00:00.000Z"
  });

  const resolved = resolveEffectiveInviteState(current, stored);

  assert.equal(resolved.aiMode, "invite");
  assert.deepEqual(buildAiAuthPayload(resolved, apiConfig), { inviteCode: "KAO-OLD" });
});
