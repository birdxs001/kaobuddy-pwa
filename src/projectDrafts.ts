export function projectTextDraft(drafts: Record<string, string>, projectId: string | undefined): string {
  if (!projectId) return "";
  return drafts[projectId] || "";
}

export function updateProjectTextDraft(
  drafts: Record<string, string>,
  projectId: string | undefined,
  value: string
): Record<string, string> {
  if (!projectId) return drafts;
  return { ...drafts, [projectId]: value };
}
