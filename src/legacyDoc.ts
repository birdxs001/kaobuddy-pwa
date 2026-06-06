function cleanDecodedText(text: string) {
  const runs = text.match(/[\u3400-\u9fffA-Za-z0-9，。！？；：、（）《》“”‘’【】\[\]().,!?;:：\-_/\\\s]{2,}/g) || [];
  return runs
    .map((run) => run.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim())
    .filter((run) => run.length >= 2 && /[\u3400-\u9fffA-Za-z0-9]/.test(run))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractLegacyDocText(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const utf16 = cleanDecodedText(new TextDecoder("utf-16le").decode(bytes));
  const utf8 = cleanDecodedText(new TextDecoder("utf-8").decode(bytes));
  const text = utf16.length >= utf8.length ? utf16 : utf8;
  if (!text) {
    throw new Error("这个 .doc 没提取到正文，可以另存为 .docx 或 PDF 后再导入。");
  }
  return text;
}
