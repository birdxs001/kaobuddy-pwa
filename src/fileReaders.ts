import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export function readTextFile(file: File): Promise<string> {
  return file.text();
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export async function readPdfText(file: File): Promise<string> {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    pages.push(`第 ${pageNumber} 页\n${text}`);
  }
  return pages.join("\n\n");
}

export async function readPdfForAi(file: File): Promise<{ text: string; pageImages: string[]; pageCount: number }> {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];
  const pageImages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    pages.push(`第 ${pageNumber} 页\n${text}`);

    const viewport = page.getViewport({ scale: 1 });
    const maxWidth = 1000;
    const scale = Math.min(1.6, Math.max(0.8, maxWidth / viewport.width));
    const renderViewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) continue;
    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    await page.render({ canvasContext: context, viewport: renderViewport }).promise;
    pageImages.push(canvas.toDataURL("image/jpeg", 0.72));
  }

  return { text: pages.join("\n\n"), pageImages, pageCount: pdf.numPages };
}

export function documentPlaceholder(file: File) {
  return [
    `${file.name} 已作为 Word/文档资料保存。`,
    "当前版本会记录文件名和资料类型，但浏览器端暂时不直接解析 doc/docx 正文。",
    "如果要让 AI 使用正文内容，可以先把文档另存为 PDF，或复制重点内容到文本资料。"
  ].join("\n");
}

export function downloadText(filename: string, text: string, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
