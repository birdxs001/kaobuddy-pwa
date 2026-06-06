import mammoth from "mammoth";
import { extractLegacyDocText } from "./legacyDoc";

// pdfjs-dist is ~2.2 MB — only load it when the user actually imports a PDF.
let _pdfLib: typeof import("pdfjs-dist") | null = null;

async function _getPdfLib() {
  if (!_pdfLib) {
    const pdfjsLib = await import("pdfjs-dist");
    const workerMod = await import("pdfjs-dist/build/pdf.worker.mjs?url");
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default;
    _pdfLib = pdfjsLib;
  }
  return _pdfLib;
}

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
  const pdfjsLib = await _getPdfLib();
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

function stripRtf(text: string) {
  return text
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'[0-9a-fA-F]{2}/g, "")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function readDocumentText(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    const warnings = result.messages.map((message) => message.message).filter(Boolean);
    const text = result.value.trim();
    if (!text) throw new Error("这个 DOCX 没提取到正文，可以另存为 PDF 后再导入。");
    return [`Word 正文\n${text}`, warnings.length ? `\n读取提醒：${warnings.join("；")}` : ""].filter(Boolean).join("\n");
  }
  if (lower.endsWith(".rtf")) {
    const text = stripRtf(await file.text());
    if (!text) throw new Error("这个 RTF 没提取到正文，可以另存为 DOCX 或 PDF 后再导入。");
    return `RTF 正文\n${text}`;
  }
  if (lower.endsWith(".doc")) {
    const text = extractLegacyDocText(await file.arrayBuffer());
    return `旧版 Word 正文\n${text}`;
  }
  throw new Error("这个文档格式暂时不能解析，请换成 DOCX、PDF、TXT 或 Markdown。");
}

export async function readPdfForAi(file: File): Promise<{ text: string; pageImages: string[]; pageCount: number }> {
  const pdfjsLib = await _getPdfLib();
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
