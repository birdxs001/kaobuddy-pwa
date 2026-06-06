import assert from "node:assert/strict";
import test from "node:test";
import { buildBalancedDailyPlan, buildDailyPlanGroups, dailyPlanDates, learningButtonAction, moduleImportanceLabel, parseDailyPlan, parseModulesFromPlan, readingTextBlocks } from "../../src/utils.ts";
import type { StudyProject, StudyTask } from "../../src/types.ts";

const project: StudyProject = {
  id: "project-os",
  subject: "操作系统",
  exam_date: "2026-06-07",
  daily_minutes: 120,
  created_at: "2026-06-05T00:00:00.000Z",
  updated_at: "2026-06-05T00:00:00.000Z"
};

function module(id: string, importance_rank: number, estimated_minutes = 45): StudyTask {
  return {
    id,
    project_id: project.id,
    title: id,
    date: "",
    estimated_minutes,
    status: "todo",
    module_status: "todo",
    importance_rank,
    created_at: "2026-06-05T00:00:00.000Z",
    updated_at: "2026-06-05T00:00:00.000Z"
  };
}

test("parseDailyPlan reads day-grouped AI JSON", () => {
  const parsed = parseDailyPlan(JSON.stringify([
    {
      date: "2026-06-05",
      modules: [
        { module_id: "module-process", day_order: 1, reason: "先学进程" },
        { id: "module-thread", dayOrder: 2 }
      ]
    }
  ]));

  assert.deepEqual(parsed, [
    { module_id: "module-process", date: "2026-06-05", day_order: 1, reason: "先学进程" },
    { module_id: "module-thread", date: "2026-06-05", day_order: 2, reason: "" }
  ]);
});

test("dailyPlanDates keeps the schedule window from today through exam day", () => {
  assert.deepEqual(dailyPlanDates(project, "2026-06-05"), [
    "2026-06-05",
    "2026-06-06",
    "2026-06-07"
  ]);
});

test("buildBalancedDailyPlan spreads high medium low importance across exam days", () => {
  const modules = [
    module("high-1", 1), module("high-2", 2), module("high-3", 3),
    module("mid-1", 4), module("mid-2", 5), module("mid-3", 6),
    module("low-1", 7), module("low-2", 8), module("low-3", 9)
  ];

  const plan = buildBalancedDailyPlan(modules, project, "2026-06-05");
  const grouped = new Map<string, string[]>();
  plan.forEach((item) => {
    grouped.set(item.date, [...(grouped.get(item.date) || []), item.module_id]);
  });

  assert.deepEqual(Array.from(grouped.keys()), ["2026-06-05", "2026-06-06", "2026-06-07"]);
  assert.deepEqual(grouped.get("2026-06-05"), ["high-1", "mid-1", "low-1"]);
  assert.deepEqual(grouped.get("2026-06-06"), ["high-2", "mid-2", "low-2"]);
  assert.deepEqual(grouped.get("2026-06-07"), ["high-3", "mid-3", "low-3"]);
});

test("daily plan groups do not put unscheduled modules into today", () => {
  const unscheduled = module("not-yet-scheduled", 1);
  const scheduledToday = { ...module("scheduled-today", 2), date: "2026-06-05" };

  const groups = buildDailyPlanGroups([unscheduled, scheduledToday], project, "2026-06-05");
  const today = groups.find((group) => group.date === "2026-06-05");

  assert.deepEqual(today?.items.map((item) => item.id), ["scheduled-today"]);
  assert.equal(groups.some((group) => group.items.some((item) => item.id === "not-yet-scheduled")), false);
});

test("newly parsed knowledge modules stay unscheduled until daily plan is generated", () => {
  const parsed = parseModulesFromPlan(
    JSON.stringify([
      {
        title: "进程同步",
        estimated_minutes: 45,
        difficulty: "高",
        importance_rank: 1,
        exam_points: "信号量、PV 操作、经典同步问题",
        sourceTitle: "操作系统课件",
        evidence: "资料中列出进程同步与信号量。"
      }
    ]),
    project.id,
    "note-plan",
    0,
    () => "module-sync"
  );

  assert.equal(parsed[0]?.date, "");
});

test("P V operation example titles are merged into one semaphore module", () => {
  const parsed = parseModulesFromPlan(
    JSON.stringify([
      {
        title: "P,V操作实现独木桥问题",
        estimated_minutes: 45,
        difficulty: "高",
        importance_rank: 1,
        exam_points: "用 P、V 操作控制独木桥互斥通行。",
        sourceTitle: "操作系统题库",
        evidence: "资料给出独木桥同步互斥问题。"
      },
      {
        title: "P,V操作实现水果盘问题",
        estimated_minutes: 45,
        difficulty: "高",
        importance_rank: 2,
        exam_points: "用 P、V 操作解决水果盘生产者消费者同步。",
        sourceTitle: "操作系统题库",
        evidence: "资料给出水果盘同步问题。"
      }
    ]),
    project.id,
    "note-plan",
    0,
    () => "module-pv"
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.title, "信号量P、V操作");
  assert.match(parsed[0]?.exam_points || "", /独木桥/);
  assert.match(parsed[0]?.exam_points || "", /水果盘/);
});

test("example scenario titles are abstracted into their underlying knowledge point", () => {
  const parsed = parseModulesFromPlan(
    JSON.stringify([
      {
        title: "银行家算法判断安全状态问题",
        estimated_minutes: 45,
        difficulty: "高",
        importance_rank: 1,
        exam_points: "给出 Available、Max、Allocation，判断系统是否安全。",
        sourceTitle: "操作系统题库",
        evidence: "资料给出银行家算法安全性检查题。"
      },
      {
        title: "银行家算法资源请求问题",
        estimated_minutes: 45,
        difficulty: "高",
        importance_rank: 2,
        exam_points: "判断某进程请求资源后是否可以分配。",
        sourceTitle: "操作系统题库",
        evidence: "资料给出银行家算法资源请求题。"
      }
    ]),
    project.id,
    "note-plan",
    0,
    () => "module-bank"
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.title, "银行家算法");
  assert.match(parsed[0]?.exam_points || "", /安全/);
  assert.match(parsed[0]?.exam_points || "", /资源请求/);
});

test("learning button opens details for modules already in progress", () => {
  const todoModule = module("todo-module", 1);
  const doingModule = { ...module("doing-module", 1), module_status: "doing" as const };

  assert.equal(learningButtonAction(todoModule), "start");
  assert.equal(learningButtonAction(doingModule), "open");
});

test("importance label prefers rank over stale medium priority", () => {
  const topRanked = { ...module("top-ranked", 1), priority: "medium" as const };

  assert.equal(moduleImportanceLabel(topRanked), "高重要");
});

test("reading blocks merge standalone section titles with their body", () => {
  assert.deepEqual(
    readingTextBlocks("核心概念\n\n操作系统负责协调硬件和软件。\n\n常考方式\n\n多用选择题考四大功能。"),
    ["核心概念：操作系统负责协调硬件和软件。", "常考方式：多用选择题考四大功能。"]
  );
});

test("reading blocks split inline module explanation sections", () => {
  assert.deepEqual(
    readingTextBlocks("结论：关系表要选主键和外键。零基础解释：表就像 Excel。高频考点：常考拆表。例题：设计部门表和员工表。易错点：不要混淆主键和外键。"),
    [
      "结论：关系表要选主键和外键。",
      "零基础解释：表就像 Excel。",
      "高频考点：常考拆表。",
      "例题：设计部门表和员工表。",
      "易错点：不要混淆主键和外键。"
    ]
  );
});
