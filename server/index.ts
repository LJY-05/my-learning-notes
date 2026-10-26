import "dotenv/config";
import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { Store } from "./db.js";
import {
  timeInputSchema,
  recordTime,
  duplicateTime,
  setActualTime,
} from "../shared/time.js";
import { parseWorkbook, applyImport, type Parsed } from "./importer.js";
import { propose, confirm } from "./scheduler.js";
import { providers } from "./providers.js";
import { executePending } from "./tools.js";
import {
  uid,
  localDate,
  addDays,
  stateSchema,
  taskSchema,
  wrongSchema,
  examSchema,
  interviewSchema,
  teachingSchema,
  settingsSchema,
  dateSchema,
  finishTask,
  audit,
  type State,
} from "../shared/domain.js";
const store = new Store();
const source = resolve("public/StudyBuddy_备考计划_结合实习课表调整版.xlsx");
if (!store.read().batches.length && existsSync(source))
  store.mutate((s) => {
    const r = applyImport(
      s,
      parseWorkbook(
        readFileSync(source),
        "StudyBuddy_备考计划_结合实习课表调整版.xlsx",
      ),
    );
    audit(s, "初始Excel导入", JSON.stringify(r), "system");
  });
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "20mb" }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
const sessions = new Set<string>();
const previews = new Map<string, { parsed: Parsed; expires: number }>();
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.headers["sec-fetch-site"] === "cross-site")
    return res.status(403).json({ error: "不允许跨站请求" });
  const cookie = req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("studybuddy="))
    ?.slice(11);
  if (req.method === "GET") {
    if (!cookie || !sessions.has(cookie)) {
      const token = uid();
      sessions.add(token);
      res.cookie("studybuddy", token, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 7 * 24 * 3600 * 1000,
      });
    }
    return next();
  }
  if (
    !cookie ||
    !sessions.has(cookie) ||
    req.headers["x-studybuddy-intent"] !== "user"
  )
    return res.status(403).json({ error: "会话失效，请刷新页面后重试" });
  next();
});
const action = (req: express.Request, fn: (s: State) => unknown) =>
  store.mutate((s) => {
    const revision = z.number().int().parse(req.body.revision);
    if (revision !== s.revision) throw Error("数据已更新，请刷新后重试");
    return fn(s);
  });
app.get("/api/state", (_req, res) =>
  res.json({
    state: store.read(),
    capabilities: {
      openaiConfigured: !!process.env.OPENAI_API_KEY,
      deepseekConfigured: !!process.env.DEEPSEEK_API_KEY,
      deepseekModel: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    },
  }),
);
app.post("/api/tasks", (req, res) =>
  res.json(
    action(req, (s) => {
      const t = taskSchema.parse({
        ...req.body.task,
        id: uid(),
        originalDate: req.body.task.date,
        version: 1,
        actualMinutes: req.body.task.actualMinutes ?? 0,
        deleted: false,
        completedAt: null,
        status: z
          .enum(["未开始", "进行中", "待确认"])
          .parse(req.body.task.status ?? "未开始"),
      });
      s.tasks.push(t);
      if (t.actualMinutes > 0)
        setActualTime(
          s,
          t,
          t.actualMinutes,
          dateSchema.parse(req.body.recordDate ?? localDate()),
        );
      audit(s, "新增任务", t.title);
      return t;
    }),
  ),
);
app.patch("/api/tasks/:id", (req, res) =>
  res.json(
    action(req, (s) => {
      const t = s.tasks.find((t) => t.id === req.params.id);
      if (!t) throw Error("任务不存在");
      const patch = taskSchema
        .pick({
          title: true,
          subject: true,
          module: true,
          date: true,
          estimatedMinutes: true,
          actualMinutes: true,
          priority: true,
          note: true,
          mastery: true,
          kind: true,
          deadline: true,
          status: true,
        })
        .partial()
        .strict()
        .parse(req.body.patch);
      if (patch.status === "已完成" || (t.status === "已完成" && patch.status))
        throw Error("请使用完成或撤销按钮修改完成状态");
      if (
        patch.actualMinutes !== undefined &&
        patch.actualMinutes !== t.actualMinutes
      )
        setActualTime(
          s,
          t,
          patch.actualMinutes,
          dateSchema.parse(req.body.recordDate ?? localDate()),
        );
      Object.assign(t, patch);
      t.version++;
      audit(s, "修改任务", t.id);
      return t;
    }),
  ),
);
app.post("/api/time", (req, res) => {
  const input = timeInputSchema.parse(req.body);
  res.json(
    store.mutate((s) => {
      if (duplicateTime(s, input)) return { duplicate: true };
      if (z.number().int().parse(req.body.revision) !== s.revision)
        throw Error("数据已更新，请重试保存计时；本次计时保留在浏览器中");
      return recordTime(s, input);
    }),
  );
});
app.post("/api/tasks/:id/:operation", (req, res) =>
  res.json(
    action(req, (s) => {
      const t = s.tasks.find((t) => t.id === req.params.id);
      if (!t) throw Error("任务不存在");
      switch (req.params.operation) {
        case "complete":
          finishTask(s, t.id);
          break;
        case "undo":
          t.status = "未开始";
          t.completedAt = null;
          t.version++;
          s.reviews = s.reviews.filter(
            (r) => r.taskId !== t.id || r.completedAt,
          );
          s.sessions = s.sessions.filter(
            (x) => x.taskId !== t.id || x.type === "复习" || !!x.source,
          );
          break;
        case "delete":
          t.deleted = true;
          t.version++;
          break;
        case "restore":
          t.deleted = false;
          t.version++;
          break;
        default:
          throw Error("未知操作");
      }
      audit(s, "任务" + req.params.operation, t.title);
      return { ok: true };
    }),
  ),
);
app.post("/api/reviews/:id", (req, res) =>
  res.json(
    action(req, (s) => {
      const r = s.reviews.find((r) => r.id === req.params.id);
      if (!r) throw Error("复习不存在");
      const input = z
        .object({
          complete: z.boolean().optional(),
          date: dateSchema.optional(),
          mastery: z.enum(["生疏", "一般", "熟练"]).optional(),
        })
        .parse(req.body);
      if (input.complete && !r.completedAt) {
        r.completedAt = new Date().toISOString();
        s.sessions.push({
          id: uid(),
          taskId: r.taskId,
          date: localDate(),
          minutes: 0,
          type: "复习",
        });
      }
      if (input.date) r.date = input.date;
      if (input.mastery) r.mastery = input.mastery;
      audit(s, "更新复习", r.id);
      return { ok: true };
    }),
  ),
);
for (const [route, key, schema] of [
  ["wrongs", "wrongs", wrongSchema],
  ["exams", "exams", examSchema],
  ["interviews", "interviews", interviewSchema],
] as const) {
  app.post("/api/" + route, (req, res) =>
    res.json(
      action(req, (s) => {
        const value = schema.parse({
          ...req.body.entry,
          id: req.body.entry.id || uid(),
        });
        const items = s[key] as { id: string }[];
        const idx = items.findIndex((x) => x.id === value.id);
        if (idx >= 0) items[idx] = value;
        else items.push(value);
        audit(s, "保存" + route, value.id);
        return value;
      }),
    ),
  );
  app.delete("/api/" + route + "/:id", (req, res) =>
    res.json(
      action(req, (s) => {
        const items = s[key] as { id: string }[];
        const idx = items.findIndex((x) => x.id === req.params.id);
        if (idx < 0) throw Error("记录不存在");
        items.splice(idx, 1);
        audit(s, "删除" + route, String(req.params.id));
        return { ok: true };
      }),
    ),
  );
}
app.post("/api/wrongs/:id/review", (req, res) =>
  res.json(
    action(req, (s) => {
      const w = s.wrongs.find((x) => x.id === req.params.id);
      if (!w) throw Error("错题不存在");
      const again = z.boolean().parse(req.body.again);
      w.round++;
      if (again) w.errors++;
      w.history.push(
        `${localDate()} ${again ? "再次错误" : "完成复习"}，第${w.round}轮`,
      );
      w.date = addDays(localDate(), again ? 1 : 3);
      audit(s, "错题复习", w.id);
      return w;
    }),
  ),
);
app.post("/api/settings", (req, res) =>
  res.json(
    action(req, (s) => {
      s.settings = settingsSchema.parse(req.body.settings);
      audit(s, "保存偏好", "已更新学习偏好");
      return s.settings;
    }),
  ),
);
app.post("/api/teaching", (req, res) =>
  res.json(
    action(req, (s) => {
      const row = teachingSchema.parse({
        ...req.body.entry,
        id: req.body.entry.id || uid(),
      });
      const idx = s.teaching.findIndex((x) => x.date === row.date);
      if (idx >= 0) {
        row.id = s.teaching[idx].id;
        s.teaching[idx] = row;
      } else s.teaching.push(row);
      audit(s, "课表确认", row.date);
      return row;
    }),
  ),
);
app.post("/api/schedule/propose", (req, res) =>
  res.json(
    action(req, (s) => {
      const v = z
        .object({
          date: dateSchema,
          minutes: z.number().int().min(0).max(1440),
        })
        .parse(req.body);
      const p = propose(s, v.date, v.minutes);
      s.proposals.push(p);
      audit(s, "生成候选排期", p.id);
      return p;
    }),
  ),
);
app.post("/api/schedule/confirm", (req, res) =>
  res.json(
    action(req, (s) => {
      if (req.body.confirmed !== true) throw Error("需要用户明确确认");
      const p = s.proposals.find((p) => p.id === req.body.id);
      if (!p) throw Error("方案不存在");
      confirm(s, p);
      audit(s, "确认排期", p.id);
      return {
        executed: true,
        selected: p.selected.length,
        deferred: p.deferred.length,
      };
    }),
  ),
);
app.post("/api/tools/confirm", (req, res) =>
  res.json(
    action(req, (s) => {
      if (req.body.confirmed !== true) throw Error("需要用户明确确认");
      return executePending(s, z.string().parse(req.body.id));
    }),
  ),
);
app.post("/api/import/preview", upload.single("file"), (req, res) => {
  if (!req.file) throw Error("请选择Excel文件");
  const p = parseWorkbook(
    req.file.buffer,
    Buffer.from(req.file.originalname, "latin1").toString("utf8"),
  );
  for (const [k, v] of previews) if (v.expires < Date.now()) previews.delete(k);
  if (previews.size >= 10) throw Error("待导入文件过多，请稍后重试");
  const token = uid();
  previews.set(token, { parsed: p, expires: Date.now() + 15 * 60000 });
  res.json({
    token,
    duplicate: store.read().batches.some((b) => b.hash === p.hash),
    taskCount: p.tasks.length,
    warnings: p.warnings,
    sheets: p.sheets.map((x) => ({
      name: x.name,
      rows: x.rows.length,
      preview: x.rows.slice(0, 5),
    })),
    tasks: p.tasks.slice(0, 12),
  });
});
app.post("/api/import/confirm", (req, res) =>
  res.json(
    action(req, (s) => {
      const entry = previews.get(z.string().parse(req.body.token));
      if (!entry || entry.expires < Date.now())
        throw Error("预览已过期，请重新上传");
      const result = applyImport(s, entry.parsed);
      audit(s, "Excel导入", JSON.stringify(result));
      return result;
    }),
  ),
);
app.get("/api/backup", (_req, res) =>
  res.attachment("StudyBuddy-backup.json").json(store.read()),
);
app.get("/api/export", (_req, res) => {
  const s = store.read();
  const w = XLSX.utils.book_new();
  for (const p of s.plans)
    XLSX.utils.book_append_sheet(
      w,
      XLSX.utils.aoa_to_sheet(p.rows),
      p.name.slice(0, 31),
    );
  for (const [name, data] of [
    ["当前任务", s.tasks],
    ["错题记录", s.wrongs],
    ["练习记录", s.exams],
    ["复习事件", s.reviews],
  ] as const)
    XLSX.utils.book_append_sheet(w, XLSX.utils.json_to_sheet(data), name);
  res
    .attachment("StudyBuddy-export.xlsx")
    .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .send(XLSX.write(w, { type: "buffer", bookType: "xlsx" }));
});
app.post("/api/restore", (req, res) => {
  if (req.body.confirmed !== true) throw Error("恢复前请明确确认覆盖");
  const incoming = stateSchema.parse(req.body.backup);
  const result = action(req, (s) => {
    const revision = s.revision;
    Object.assign(s, incoming, { revision });
    audit(s, "恢复备份", "用户明确确认恢复数据");
    return { restored: true };
  });
  res.json(result);
});
app.post("/api/chat", async (req, res, next) => {
  try {
    const input = z
      .object({
        text: z.string().min(1).max(4000),
        date: dateSchema,
        conversationId: z.string().min(1).max(100),
        revision: z.number().int(),
      })
      .parse(req.body);
    const s = store.read();
    if (s.revision !== input.revision) throw Error("数据已变化，请刷新后重试");
    if (s.settings.provider === "off")
      throw Error("AI服务已关闭，普通学习功能仍可使用");
    if (!s.conversations.some((c) => c.id === input.conversationId))
      s.conversations.push({
        id: input.conversationId,
        title: input.text.slice(0, 60),
        at: new Date().toISOString(),
      });
    s.messages.push({
      id: uid(),
      conversationId: input.conversationId,
      role: "user",
      content: input.text,
      at: new Date().toISOString(),
    });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const send = (type: string, data: unknown) =>
      res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
    try {
      const reply = await providers[s.settings.provider].reply(s, input, (t) =>
        send("delta", t),
      );
      s.messages.push({
        id: uid(),
        conversationId: input.conversationId,
        role: "assistant",
        content: reply,
        at: new Date().toISOString(),
      });
      s.revision++;
      store.save(s, input.revision);
      send("done", { saved: true });
    } catch (e) {
      send(
        "error",
        e instanceof Error ? e.message : "AI请求失败；候选操作未保存，请重试",
      );
    }
    res.end();
  } catch (e) {
    next(e);
  }
});
app.use(express.static("dist"));
app.use((req, res) => {
  if (req.path.startsWith("/api/"))
    res.status(404).json({ error: "接口不存在" });
  else if (existsSync(resolve("dist/index.html")))
    res.sendFile(resolve("dist/index.html"));
  else res.status(404).send("请先运行 npm run build");
});
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const message =
      err instanceof z.ZodError
        ? "输入校验失败：" +
          err.issues.map((i) => i.path.join(".") + " " + i.message).join("；")
        : err instanceof Error
          ? err.message
          : "服务器操作失败";
    console.error("[StudyBuddy]", message);
    res.status(400).json({ error: message });
  },
);
const port = Number(process.env.PORT || 3001);
const server = app.listen(port, "127.0.0.1", () =>
  console.log(
    `StudyBuddy API ready on port ${port}; SQLite revision ${store.read().revision}`,
  ),
);
function stop() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
