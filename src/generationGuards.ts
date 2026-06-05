export type GenerationMode = "plan" | "teach" | "practice" | "mock-exam";
export type GenerationGuard =
  | {
      status: string;
      nextTab: "materials";
    }
  | null;

const emptyMaterialMessages: Partial<Record<GenerationMode, string>> = {
  plan: "先导入资料，再生成知识点模块。现在不会按空资料乱编计划。",
  "mock-exam": "先导入资料，再生成模拟考。现在不会按空资料乱编试卷。"
};

export function getGenerationGuard({
  mode,
  materialCount
}: {
  mode: GenerationMode;
  materialCount: number;
}): GenerationGuard {
  const emptyMaterialMessage = emptyMaterialMessages[mode];
  if (materialCount === 0 && emptyMaterialMessage) {
    return {
      status: emptyMaterialMessage,
      nextTab: "materials"
    };
  }
  return null;
}
