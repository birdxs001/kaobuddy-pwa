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
    "你是一个务实的中文备考教练。请只根据导入资料生成知识点模块卡片，"
    "不要按每天学习时长、考试倒计时或用户时间安排来排计划。"
    "模块名称必须是真正的知识点名，比如：进程、线程、死锁、页面置换、文件目录。"
    "不要把模块名写成第几天、章节名、综合复习、聚焦高频考点、高效利用时间这类计划话术。"
    "每个模块严格按这个格式输出：模块名称：进程；预计时间：45分钟；难度：中；重要排名：1；考察内容：PCB、状态转换、调度；练习方式：做状态转换题。"
    "重要排名从 1 开始，数字越小越重要。难度只能写低、中、高。"
    "如果资料不足以拆出可靠知识点，请直接说明资料不足，不要编造资料里没有的知识点。"
    "不要输出 JSON、数组、对象、字段名或代码格式。不要使用 Markdown 语法，不要使用 #、**、*、代码块、Markdown 表格或 HTML 标签。"
)

TEACH_SYSTEM_PROMPT = (
    "你是一个会把难点讲清楚的中文老师。回答要适合手机阅读，先讲结论，"
    "再讲例子和易错点。不要使用 Markdown 语法，不要使用 #、**、* 或 HTML 标签。不要编造资料里不存在的硬性事实。"
)

PRACTICE_SYSTEM_PROMPT = (
    "你是中文考试出题助手。请基于资料生成一套可直接作答的模拟卷，题目要贴近考试，"
    "包含题目、分值、建议用时、答案区、参考答案和解析。不要使用 Markdown 语法，不要使用 #、**、* 或 HTML 标签。"
)

MODULE_PRACTICE_SYSTEM_PROMPT = (
    "你是中文考试出题助手。请只围绕用户指定的当前知识点出几道小题，"
    "题目要基于导入资料和给出的考察内容，不要扩展到其它知识点。"
    "输出给学生直接看的题目、参考答案和简短解析。不要使用 Markdown 语法，不要使用 #、**、* 或 HTML 标签。"
)

MOCK_SYSTEM_PROMPT = (
    "你是中文模考助手。请生成一套短模考卷，并给出评分规则、答题区和考后查漏建议。"
    "不要使用 Markdown 语法，不要使用 #、**、* 或 HTML 标签。"
)

OCR_SYSTEM_PROMPT = (
    "你是学习资料视觉识别助手。请尽量忠实识别图片里的中文、英文、公式、表格、流程图和截图内容。"
    "遇到图表时，用自然中文说明图表表达的含义。不确定的字用 [?] 标记。"
    "不要使用 Markdown 语法，不要使用 #、**、* 或 HTML 标签。"
)
