import assert from "node:assert/strict";
import test from "node:test";
import { projectTextDraft, updateProjectTextDraft } from "../../src/projectDrafts.ts";

test("project text drafts stay isolated when switching between projects", () => {
  let drafts: Record<string, string> = {};

  drafts = updateProjectTextDraft(drafts, "project-a", "先救选择题");
  drafts = updateProjectTextDraft(drafts, "project-b", "先排主观题");

  assert.equal(projectTextDraft(drafts, "project-a"), "先救选择题");
  assert.equal(projectTextDraft(drafts, "project-b"), "先排主观题");
});

test("blank project ids do not overwrite existing drafts", () => {
  const drafts = updateProjectTextDraft({ "project-a": "保持原样" }, "", "不该写进去");

  assert.deepEqual(drafts, { "project-a": "保持原样" });
  assert.equal(projectTextDraft(drafts, ""), "");
});
