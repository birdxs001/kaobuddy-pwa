import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
const RENDER_SCALE = 2;

interface SectionBlock {
  label: string;
  lines: string[];
}

function parseSections(content: string): SectionBlock[] {
  const sections: SectionBlock[] = [];
  const lines = content.split("\n");
  let currentLabel = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^【(.+?)】/);
    if (match) {
      if (currentLabel || currentLines.length) {
        sections.push({ label: currentLabel, lines: [...currentLines] });
      }
      currentLabel = match[1];
      currentLines = [];
      const rest = line.slice(match[0].length).trim();
      if (rest) currentLines.push(rest);
    } else {
      currentLines.push(line);
    }
  }
  if (currentLabel || currentLines.length) {
    sections.push({ label: currentLabel, lines: [...currentLines] });
  }
  return sections;
}

function splitCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "").trim();
  if (!trimmed.includes("|")) return [];
  return trimmed.split("|").map((c) => c.trim()).filter(Boolean);
}

function isTableSep(line: string): boolean {
  const cells = splitCells(line);
  return cells.length > 1 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function tryExtractTable(lines: string[], start: number): { headers: string[]; rows: string[][]; end: number } | null {
  const firstCells = splitCells(lines[start]);
  if (firstCells.length < 2) return null;

  if (start + 2 < lines.length && isTableSep(lines[start + 1])) {
    const headerCells = firstCells;
    const rows: string[][] = [];
    let i = start + 2;
    while (i < lines.length) {
      const cells = splitCells(lines[i]);
      if (cells.length < 2 || cells.length !== headerCells.length) break;
      rows.push(cells);
      i++;
    }
    if (rows.length) return { headers: headerCells, rows, end: i };
  }

  if (start + 1 < lines.length) {
    const secondCells = splitCells(lines[start + 1]);
    if (secondCells.length === firstCells.length) {
      const headers = firstCells;
      const rows: string[][] = [secondCells];
      let i = start + 2;
      while (i < lines.length) {
        const cells = splitCells(lines[i]);
        if (cells.length !== headers.length) break;
        rows.push(cells);
        i++;
      }
      return { headers, rows, end: i };
    }
  }

  return null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildExamHtml(content: string, title: string): string {
  const sections = parseSections(content);

  const questionsSection = sections.find((s) => s.label === "试题");
  const explainSection = sections.find((s) => s.label && /解析/.test(s.label));

  // ===== Page 1: Exam Paper =====
  let html = '<div class="exam-paper">';
  html += `<h1>${escapeHtml(title)}</h1>`;

  if (questionsSection) {
    let i = 0;
    while (i < questionsSection.lines.length) {
      const line = questionsSection.lines[i];
      const trimmed = line.trim();

      if (!trimmed) { i++; continue; }

      // Section header: "一、选择题（每题5分）"
      if (/^(一|二|三|四|五)[、，]/.test(trimmed)) {
        html += `<h2>${escapeHtml(trimmed)}</h2>`;
        i++;
        continue;
      }

      // Question: "1. 题目内容" or "1. 题目内容（5分）"
      html += `<p class="q">${escapeHtml(trimmed)}</p>`;
      i++;
    }
  }

  html += '</div>';

  // ===== Page 2: Answers =====
  if (explainSection) {
    html += '<div class="exam-paper page-break">';
    html += '<h1>参考答案与解析</h1>';

    let i = 0;
    while (i < explainSection.lines.length) {
      const line = explainSection.lines[i];
      const trimmed = line.trim();

      if (!trimmed) { i++; continue; }

      // Table detection
      const table = tryExtractTable(explainSection.lines, i);
      if (table) {
        html += '<table class="pdf-table"><thead><tr>';
        for (const h of table.headers) {
          html += `<th>${escapeHtml(h)}</th>`;
        }
        html += '</tr></thead><tbody>';
        for (const row of table.rows) {
          html += '<tr>';
          for (const cell of row) {
            html += `<td>${escapeHtml(cell)}</td>`;
          }
          html += '</tr>';
        }
        html += '</tbody></table>';
        i = table.end;
        continue;
      }

      html += `<p>${escapeHtml(trimmed)}</p>`;
      i++;
    }

    html += '</div>';
  }

  return html;
}

export async function exportMockExamPdf(content: string, title: string): Promise<void> {
  const container = document.createElement("div");
  container.className = "pdf-render-container";
  container.innerHTML = buildExamHtml(content, title);
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: RENDER_SCALE,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const pageHeightPx = A4_HEIGHT_PX * RENDER_SCALE;
    const pageWidthPx = A4_WIDTH_PX * RENDER_SCALE;
    const totalPages = Math.ceil(canvas.height / pageHeightPx);

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage();

      const srcY = page * pageHeightPx;
      const srcH = Math.min(pageHeightPx, canvas.height - srcY);

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = pageWidthPx;
      pageCanvas.height = srcH;
      const ctx = pageCanvas.getContext("2d")!;
      ctx.drawImage(
        canvas,
        0, srcY, pageWidthPx, srcH,
        0, 0, pageWidthPx, srcH
      );

      const imgData = pageCanvas.toDataURL("image/jpeg", 0.92);
      pdf.addImage(imgData, "JPEG", 0, 0, A4_WIDTH_MM, (srcH / pageHeightPx) * A4_HEIGHT_MM);
    }

    pdf.save(`${title.replace(/[<>:"/\\|?*]/g, "_")}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
