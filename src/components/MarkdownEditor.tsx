import { useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
export function MarkdownView({ value }: { value: string }) {
  const html = DOMPurify.sanitize(
    marked.parse(value, { async: false, breaks: true }) as string,
    {
      FORBID_TAGS: ["img", "iframe", "video", "audio", "style"],
      FORBID_ATTR: ["style"],
    },
  );
  return (
    <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
export default function MarkdownEditor({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  return (
    <div className="markdown-editor">
      <div className="markdown-toolbar">
        <span>Markdown</span>
        <div>
          <button
            type="button"
            aria-pressed={mode === "edit"}
            onClick={() => setMode("edit")}
          >
            编辑
          </button>
          <button
            type="button"
            aria-pressed={mode === "preview"}
            onClick={() => setMode("preview")}
          >
            预览
          </button>
        </div>
      </div>
      {mode === "edit" ? (
        <textarea
          id={id}
          rows={6}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="支持 # 标题、**重点**、列表和引用…"
        />
      ) : (
        <div id={id} tabIndex={0} className="markdown-preview">
          {value ? (
            <MarkdownView value={value} />
          ) : (
            <p className="muted">还没有笔记，切换到编辑开始记录。</p>
          )}
        </div>
      )}
    </div>
  );
}
