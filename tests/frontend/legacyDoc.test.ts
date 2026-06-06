import assert from "node:assert/strict";
import test from "node:test";
import { extractLegacyDocText } from "../../src/legacyDoc.ts";

test("extracts readable Chinese text from legacy doc-like utf16 bytes", () => {
  const encoded = new TextEncoder().encode("binary-prefix");
  const docText = new Uint8Array(new TextEncoder().encode("placeholder"));
  const utf16Text = new Uint8Array(Buffer.from("操作系统原理样卷\n一、选择题\n进程管理和文件管理", "utf16le"));
  const mixed = new Uint8Array(encoded.length + docText.length + utf16Text.length);
  mixed.set(encoded, 0);
  mixed.set(docText, encoded.length);
  mixed.set(utf16Text, encoded.length + docText.length);

  const text = extractLegacyDocText(mixed.buffer);

  assert.match(text, /操作系统原理样卷/);
  assert.match(text, /进程管理和文件管理/);
});

test("throws a useful message when legacy doc text cannot be extracted", () => {
  assert.throws(
    () => extractLegacyDocText(new Uint8Array([0, 1, 2, 3]).buffer),
    /这个 \.doc 没提取到正文/
  );
});
