import type { AiAuthPayload } from "./api";
import type { ApiConfig, InviteState } from "./types";

function hasVerifiedInvite(state: InviteState) {
  return Boolean(state.inviteCode.trim() && state.validatedAt);
}

export function resolveEffectiveInviteState(current: InviteState, stored: InviteState): InviteState {
  if (current.aiMode === "custom") return current;
  if (hasVerifiedInvite(stored)) return stored;
  return current;
}

export function buildAiAuthPayload(inviteState: InviteState, apiConfig: ApiConfig): AiAuthPayload {
  return inviteState.aiMode === "invite"
    ? { inviteCode: inviteState.inviteCode.trim() }
    : { api_config: apiConfig };
}
