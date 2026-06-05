import type { InviteState } from "./types";

export const defaultInviteState: InviteState = {
  inviteCode: "",
  remaining: 0,
  remainingBudgetCny: 0,
  validatedAt: "",
  aiMode: "custom"
};

function cleanInviteCode(code: unknown) {
  return typeof code === "string" ? code.trim() : "";
}

function cleanNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function normalizeInviteState(raw?: Partial<InviteState> | null): InviteState {
  if (!raw) return defaultInviteState;
  const inviteCode = cleanInviteCode(raw.inviteCode);
  const validatedAt = typeof raw.validatedAt === "string" ? raw.validatedAt : "";
  const storedMode = raw.aiMode === "invite" || raw.aiMode === "custom" ? raw.aiMode : undefined;
  const aiMode = storedMode || (inviteCode || validatedAt ? "invite" : defaultInviteState.aiMode);
  return {
    inviteCode,
    remaining: cleanNumber(raw.remaining),
    remainingBudgetCny: cleanNumber(raw.remainingBudgetCny),
    validatedAt,
    aiMode
  };
}

export function updateInviteCodeDraft(current: InviteState, inviteCode: string): InviteState {
  const normalizedCurrent = current.inviteCode.trim().toUpperCase();
  const normalizedNext = inviteCode.trim().toUpperCase();
  if (normalizedCurrent === normalizedNext) {
    return { ...current, inviteCode, aiMode: "invite" };
  }
  return {
    ...current,
    inviteCode,
    remaining: 0,
    remainingBudgetCny: 0,
    validatedAt: "",
    aiMode: "invite"
  };
}

export function applyInviteVerification(
  current: InviteState,
  code: string,
  result: { valid: boolean; remaining: number; remainingBudgetCny: number },
  verifiedAt: string
): InviteState {
  return {
    ...current,
    inviteCode: code.trim().toUpperCase(),
    remaining: result.remaining,
    remainingBudgetCny: result.remainingBudgetCny,
    validatedAt: result.valid ? verifiedAt : "",
    aiMode: "invite"
  };
}

export function isInviteReady(state: InviteState) {
  return Boolean(state.inviteCode.trim() && state.validatedAt);
}
