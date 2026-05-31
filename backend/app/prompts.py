from typing import Iterable

from .schemas import MaterialSummary, StudyProject


def format_project(project: StudyProject) -> str:
    weak_points = project.weak_points.strip() if project.weak_points else "未填写，先根据资料和答题表现推断。"
    return (
        f"科目：{project.subject}\n"
        f"考试日期：{project.exam_date}\n"
        f"每天可学习：{project.daily_minutes} 分钟\n"
        f"目标分数：{project.target_score or '未填写'}\n"
        f"已知薄弱项：{weak_points}"
    )


def format_materials(materials: Iterable[MaterialSummary], limit: int = 10000) -> str:
    chunks = []
    used = 0
    for material in materials:
        content = material.content.strip()
        if not content:
            continue
        left = max(limit - used, 0)
        if left <= 0:
            break
        clipped = content[:left]
        used += len(clipped)
        chunks.append(f"## {material.title}（{material.kind}）\n{clipped}")
    return "\n\n".join(chunks) or "暂无可用资料。"


PLAN_SYSTEM_PROMPT = (
    "你是一个务实的中文备考教练。请根据考试时间、资料和用户时间安排，"
    "输出按知识点组织的模块计划。不要使用 Markdown 语法，不要使用 #、**、代码块或 Markdown 表格。"
    "每个模块用普通中文短段落说明模块名、预计学习时间、为什么重要和练习方式。"
    "薄弱项如果为空，不要追问，先从资料高频点推断。"
)

TEACH_SYSTEM_PROMPT = (
    "你是一个会把难点讲清楚的中文老师。回答要适合手机阅读，先讲结论，"
    "再讲例子和易错点。不要使用 Markdown 语法。不要编造资料里不存在的硬性事实。"
)

PRACTICE_SYSTEM_PROMPT = (
    "你是中文考试出题和批改助手。基于资料生成练习，题目要贴近考试，"
    "做完后给出解析、薄弱项和下一步建议。不要使用 Markdown 语法。"
)

MOCK_SYSTEM_PROMPT = (
    "你是中文模考助手。请生成一套短模考卷，并给出评分规则、答题区和考后查漏建议。不要使用 Markdown 语法。"
)

OCR_SYSTEM_PROMPT = (
    "你是学习资料视觉识别助手。请尽量忠实识别图片里的中文、英文、公式、表格、流程图和截图内容。"
    "遇到图表时，用自然中文说明图表表达的含义。不确定的字用 [?] 标记。不要使用 Markdown 语法。"
)
