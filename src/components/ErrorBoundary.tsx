import { Component, type ErrorInfo, type ReactNode } from "react";
import { WarningCircle } from "@phosphor-icons/react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMessage: error.message || "未知错误" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "50vh",
        padding: "32px 24px",
        textAlign: "center",
        color: "var(--ink)",
        gap: 16,
      }}>
        <WarningCircle size={48} weight="duotone" color="var(--danger)" />
        <div style={{ fontSize: 18, fontWeight: 600 }}>页面出了点问题</div>
        <p style={{ color: "var(--muted)", maxWidth: 360, margin: 0, lineHeight: 1.6 }}>
          可能是浏览器缓存或数据兼容问题。
          <br />
          试试刷新页面，通常能解决。
        </p>
        {this.state.errorMessage && (
          <pre style={{
            fontSize: 12,
            color: "var(--muted)",
            background: "var(--surface-muted)",
            padding: "12px 16px",
            borderRadius: "var(--radius-sm)",
            maxWidth: 400,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: 0,
          }}>
            {this.state.errorMessage}
          </pre>
        )}
        <button
          onClick={() => {
            this.setState({ hasError: false, errorMessage: "" });
            window.location.reload();
          }}
          style={{
            padding: "10px 24px",
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          刷新页面
        </button>
      </div>
    );
  }
}
