import type { State } from "../shared/domain";
export type Snapshot = {
  state: State;
  capabilities: {
    openaiConfigured: boolean;
    model: string;
    deepseekConfigured: boolean;
    deepseekModel: string;
  };
};
export async function api<T = any>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    headers:
      body instanceof FormData
        ? { "X-StudyBuddy-Intent": "user" }
        : body !== undefined
          ? {
              "Content-Type": "application/json",
              "X-StudyBuddy-Intent": "user",
            }
          : {},
    body:
      body instanceof FormData
        ? body
        : body !== undefined
          ? JSON.stringify(body)
          : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "请求失败，请稍后重试");
  return result;
}
export function saveFile(name: string, data: unknown) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
