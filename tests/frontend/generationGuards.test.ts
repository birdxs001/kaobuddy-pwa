import assert from "node:assert/strict";
import test from "node:test";
import { getGenerationGuard } from "../../src/generationGuards.ts";

test("mock exam asks for materials before checking AI config", () => {
  assert.deepEqual(
    getGenerationGuard({ mode: "mock-exam", materialCount: 0 }),
    {
      status: "先导入资料，再生成模拟考。现在不会按空资料乱编试卷。",
      nextTab: "materials"
    }
  );
});

test("plan still keeps its empty-materials guidance", () => {
  assert.deepEqual(
    getGenerationGuard({ mode: "plan", materialCount: 0 }),
    {
      status: "先导入资料，再生成知识点模块。现在不会按空资料乱编计划。",
      nextTab: "materials"
    }
  );
});

test("other generation modes can continue without the global material guard", () => {
  assert.equal(getGenerationGuard({ mode: "teach", materialCount: 0 }), null);
  assert.equal(getGenerationGuard({ mode: "practice", materialCount: 0 }), null);
  assert.equal(getGenerationGuard({ mode: "mock-exam", materialCount: 1 }), null);
});
