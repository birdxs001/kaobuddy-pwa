import assert from "node:assert/strict";
import test from "node:test";
import { extractMistakesFromGrading, parseMockQuestions, parseRequestedMockDuration } from "../../src/utils.ts";

test("parseMockQuestions splits visible questions from hidden answer key", () => {
  const parsed = parseMockQuestions(`【试题】
一、选择题
1. 进程从运行态进入阻塞态的原因是？
2. 死锁的四个必要条件是什么？

【题目解析】
1. 答案：B。解析：等待 I/O。
2. 答案：互斥、请求保持、不剥夺、循环等待。`);

  assert.deepEqual(parsed.questions.map((question) => question.question), [
    "1. 进程从运行态进入阻塞态的原因是？",
    "2. 死锁的四个必要条件是什么？"
  ]);
  assert.match(parsed.answerKey, /答案：B/);
  assert.doesNotMatch(parsed.answerKey, /【试题】/);
  assert.doesNotMatch(parsed.answerKey, /【题目解析】/);
});

test("parseMockQuestions splits same-line choice options", () => {
  const parsed = parseMockQuestions(`【试题】
一、选择题
1. 操作系统的主要功能不包括以下哪一项？
A. 进程管理 B. 内存管理 C. 文件管理 D. 数据库管理

【题目解析】
1. 答案：D。`);

  assert.deepEqual(parsed.questions[0], {
    type: "choice",
    question: "1. 操作系统的主要功能不包括以下哪一项？",
    options: ["A. 进程管理", "B. 内存管理", "C. 文件管理", "D. 数据库管理"]
  });
});

test("parseRequestedMockDuration keeps the exact requested minutes with spaces", () => {
  assert.equal(parseRequestedMockDuration("考试时长：90 分钟；题型要求：选择题", 30), 90);
});

test("extractMistakesFromGrading keeps only wrong or deducted questions", () => {
  const mistakes = extractMistakesFromGrading(`1. 得分：5/5。答案正确。
2. 得分：0/5。答案不正确，扣分原因：把阻塞态写成就绪态。
3. 得分：3/5。扣分原因：漏写循环等待条件。`);

  assert.deepEqual(mistakes, [
    "2. 得分：0/5。答案不正确，扣分原因：把阻塞态写成就绪态。",
    "3. 得分：3/5。扣分原因：漏写循环等待条件。"
  ]);
});
