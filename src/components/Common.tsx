import { AnimatePresence, motion } from "motion/react";
import { CheckCircle, Lightning, Sparkle, X } from "@phosphor-icons/react";
import { humanReadableAiText, isDividerLine, parseTableBlock, readingTextBlocks } from "../utils";

// ---------------------------------------------------------------------------
// BrandMark
// ---------------------------------------------------------------------------

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand-lockup compact" : "brand-lockup"}>
      <span>
        <strong>考搭子</strong>
        <small>KaoBuddy</small>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusToast
// ---------------------------------------------------------------------------

export function StatusToast({ className, message, onCancel }: { className: string; message: string; onCancel?: () => void }) {
  const Icon = className.includes("danger") ? Lightning : className.includes("success") ? CheckCircle : Sparkle;
  const isLoading = className.includes("loading");
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={message}
        className={className}
        aria-live="polite"
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.18 }}
      >
        {isLoading && onCancel ? (
          <motion.button
            className="status-cancel"
            onClick={onCancel}
            title="取消生成"
            type="button"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, duration: 0.15 }}
          >
            <X size={16} weight="bold" />
          </motion.button>
        ) : (
          <Icon size={18} weight="duotone" />
        )}
        <span>{message}</span>
      </motion.div>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// renderHumanText — renders AI output as structured JSX
// ---------------------------------------------------------------------------

function proseBlockMeta(block: string) {
  const match = block.match(/^([^：:]{2,10})[：:]\s*([\s\S]*)$/);
  const label = match?.[1]?.trim() || "";
  const body = match?.[2]?.trim() || block;
  if (!/^(结论|零基础解释|高频考点|例题|易错点|易错提醒|核心概念|必背要点|常见考法|考试答法|参考答案|解析)$/.test(label)) {
    return { label: "", body: block, tone: "" };
  }
  const tone = /例题|解析|参考答案|考试答法/.test(label)
    ? "example"
    : /结论|核心概念/.test(label)
      ? "summary"
      : /易错/.test(label)
        ? "warning"
        : "focus";
  return { label, body, tone };
}

export function RenderHumanText({ text, variant = "default" }: { text: string; variant?: "default" | "reading" }) {
  const isReading = variant === "reading";
  const blocks = isReading
    ? readingTextBlocks(text)
    : humanReadableAiText(text)
      .split(/\n{2,}/)
      .map((block) =>
        block
          .split(/\n/)
          .map((line) => line.trim())
          .filter((line) => line && !isDividerLine(line))
          .join("\n")
          .trim()
      )
      .filter(Boolean);
  if (!blocks.length) return <p className="muted">暂无内容。</p>;

  return (
    <div className={isReading ? "ai-text reading-text" : "ai-text"}>
      {blocks.map((block, index) => {
        const lines = block
          .split(/\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        const table = parseTableBlock(lines);
        if (table) {
          return (
            <table className="ai-table" key={index}>
              <thead>
                <tr>
                  {table.headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr key={`${index}-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`${cell}-${cellIndex}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }
        const isList =
          lines.length > 1 &&
          lines.every((line) => line.startsWith("• "));
        if (isList) {
          return (
            <ul key={index}>
              {lines.map((line) => (
                <li key={line}>{line.replace(/^•\s*/, "")}</li>
              ))}
            </ul>
          );
        }
        if (isReading) {
          const meta = proseBlockMeta(block);
          return (
            <p key={index} className={`ai-prose-card ${meta.tone}`}>
              {meta.label && <span className="ai-prose-label">{meta.label}</span>}
              {meta.body}
            </p>
          );
        }
        return <p key={index}>{block}</p>;
      })}
    </div>
  );
}
