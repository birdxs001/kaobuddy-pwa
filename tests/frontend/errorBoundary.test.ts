import assert from "node:assert/strict";
import test from "node:test";
import { createId } from "../../src/storage.ts";

test("createId generates prefixed UUIDs", () => {
  const id = createId("module");
  assert.match(id, /^module_[a-f0-9-]{36}$/);
});

test("createId generates unique IDs", () => {
  const ids = new Set(Array.from({ length: 20 }, () => createId("x")));
  assert.equal(ids.size, 20);
});

test("createId handles empty prefix", () => {
  const id = createId("");
  assert.match(id, /^_[a-f0-9-]{36}$/);
});
