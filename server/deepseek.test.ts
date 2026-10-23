import { test } from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { DeepSeekProvider } from "./deepseek.js";
import { emptyState } from "../shared/domain.js";
const request = {
  text: "帮我准备新任务",
  date: "2026-10-23",
  conversationId: "test",
};
function chunk(delta: unknown, finish_reason: string | null = null) {
  return {
    id: "test-response",
    object: "chat.completion.chunk",
    created: 0,
    model: "deepseek-chat",
    choices: [{ index: 0, delta, finish_reason }],
  };
}
function response(events: unknown[]) {
  return new Response(
    events.map((e) => "data: " + JSON.stringify(e) + "\n\n").join("") +
      "data: [DONE]\n\n",
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
test("DeepSeek流式工具参数拼接、真实工具执行与写入确认保护", async () => {
  const s = emptyState();
  const bodies: any[] = [];
  const args = JSON.stringify({
    subject: "教综",
    module: "自定义",
    title: "背诵教育目的",
    date: "2026-10-23",
    estimatedMinutes: 20,
    priority: "高",
    status: "未开始",
    source: "用户请求",
    note: "",
    mastery: "未评估",
    kind: "背诵",
    deadline: null,
  });
  const client = new OpenAI({
    apiKey: "test-placeholder",
    baseURL: "https://api.deepseek.com",
    maxRetries: 0,
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      if (bodies.length === 1)
        return response([
          chunk({
            tool_calls: [
              {
                index: 0,
                id: "call-1",
                type: "function",
                function: { name: "create_task", arguments: args.slice(0, 30) },
              },
            ],
          }),
          chunk(
            {
              tool_calls: [
                { index: 0, function: { arguments: args.slice(30) } },
              ],
            },
            "tool_calls",
          ),
        ]);
      return response([
        chunk({ content: "任务已准备，" }),
        chunk({ content: "请确认后执行。" }, "stop"),
      ]);
    },
  });
  let streamed = "";
  const result = await new DeepSeekProvider(client).reply(
    s,
    request,
    (t) => (streamed += t),
  );
  assert.equal(result, "任务已准备，请确认后执行。");
  assert.equal(streamed, result);
  assert.equal(s.tasks.length, 0);
  assert.ok(s.logs.some((l) => l.action === "待确认工具"));
  assert.equal(bodies[0].model, "deepseek-chat");
  assert.equal(bodies[0].tools[0].type, "function");
  const tool = bodies[1].messages.find((m: any) => m.role === "tool");
  assert.equal(JSON.parse(tool.content).requiresConfirmation, true);
});
test("DeepSeek无效工具参数返回错误供模型处理，不写入任务", async () => {
  let count = 0;
  let body: any;
  const client = new OpenAI({
    apiKey: "test-placeholder",
    maxRetries: 0,
    fetch: async (_u, init) => {
      body = JSON.parse(String(init?.body));
      return ++count === 1
        ? response([
            chunk(
              {
                tool_calls: [
                  {
                    index: 0,
                    id: "bad",
                    type: "function",
                    function: {
                      name: "propose_reschedule",
                      arguments: '{"date":"bad","minutes":-1}',
                    },
                  },
                ],
              },
              "tool_calls",
            ),
          ])
        : response([chunk({ content: "请提供有效日期和分钟数。" }, "stop")]);
    },
  });
  const s = emptyState();
  await new DeepSeekProvider(client).reply(s, request, () => {});
  assert.equal(
    JSON.parse(body.messages.find((m: any) => m.role === "tool").content)
      .executed,
    false,
  );
  assert.equal(s.proposals.length, 0);
});
test("DeepSeek截断响应不会作为完整成功结果", async () => {
  const client = new OpenAI({
    apiKey: "test-placeholder",
    maxRetries: 0,
    fetch: async () => response([chunk({ content: "部分结果" }, "length")]),
  });
  await assert.rejects(
    () => new DeepSeekProvider(client).reply(emptyState(), request, () => {}),
    /未完整结束/,
  );
});
test("DeepSeek认证失败返回中文诊断，不输出密钥", async () => {
  const client = new OpenAI({
    apiKey: "test-placeholder",
    maxRetries: 0,
    fetch: async () =>
      new Response(JSON.stringify({ error: { message: "invalid key" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
  });
  await assert.rejects(
    () => new DeepSeekProvider(client).reply(emptyState(), request, () => {}),
    /密钥验证失败/,
  );
});
