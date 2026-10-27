import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { openStore } from "./store.mjs";
import { SOURCES, officialURL, screenJob } from "./sources.mjs";
import { fetchOfficial, collectSource, articleFrom } from "./collector.mjs";
import { generateQuiz, dayCN } from "./quiz.mjs";
export async function startServer({
  root = process.env.YUETEACH_DATA ||
    join(dirname(fileURLToPath(import.meta.url)), "data"),
  port = Number(process.env.PORT || 3188),
  token = process.env.YUETEACH_TOKEN,
  auto = process.env.YUETEACH_NO_AUTO !== "1",
} = {}) {
  const store = openStore(root);
  const web = join(dirname(fileURLToPath(import.meta.url)), "web");
  const session = randomUUID();
  let updating = false,
    generating = false,
    activeSource = "",
    updateStarted = null,
    lastRun = store.get("lastRun", null),
    notice = "";
  const lifetime = new AbortController();
  const activeRequests = new Set();
  let quizPromise = null;
  const ensureQuiz = async () => {
    const day = dayCN();
    const existing = store.daily(day);
    // 当天已有题目即固定，避免已做题目被自动替换。
    if (existing?.questions.length) return existing;
    if (quizPromise) return quizPromise;
    quizPromise = (async () => {
      generating = true;
      try {
        const generated = await generateQuiz(
          store.articles(),
          day,
          store.config(),
          lifetime.signal,
        );
        const value = { ...generated, day, created: new Date().toISOString() };
        store.setDaily(day, value);
        notice = "";
        return value;
      } catch (e) {
        notice = e.message;
        return (
          existing || { day, questions: [], note: e.message, mode: "待生成" }
        );
      } finally {
        generating = false;
        quizPromise = null;
      }
    })();
    return quizPromise;
  };
  const update = async () => {
    if (updating) return;
    updating = true;
    updateStarted = new Date().toISOString();
    try {
      const seen = new Set(store.articles().map((a) => a.url));
      for (const source of SOURCES) {
        if (lifetime.signal.aborted) break;
        activeSource = source.name;
        const previous = store.sources().find((s) => s.id === source.id);
        try {
          const result = await collectSource(source, {
            seen,
            signal: lifetime.signal,
            onArticle: (a) => {
              store.addArticle(a);
              seen.add(a.url);
            },
          });
          store.setSource(source.id, {
            lastAttempt: new Date().toISOString(),
            lastSuccess: new Date().toISOString(),
            status: result.warning ? "需核对" : "已检查",
            error: result.warning || "",
            count: result.count,
          });
        } catch (e) {
          if (lifetime.signal.aborted) break;
          store.setSource(source.id, {
            lastAttempt: new Date().toISOString(),
            lastSuccess: previous.lastSuccess || null,
            status: "更新失败",
            error: e.message,
            count: 0,
          });
        }
      }
      if (!lifetime.signal.aborted) {
        lastRun = new Date().toISOString();
        store.set("lastRun", lastRun);
        await ensureQuiz();
      }
    } finally {
      updating = false;
      activeSource = "";
    }
  };
  const state = () => {
    const day = dayCN();
    const daily = store.daily(day);
    const answers = store.answers(day);
    const safeQuestions = (daily?.questions || []).map((q) => {
      const { answer, explanation, evidence, ...publicQ } = q;
      const submitted = answers.find((a) => a.qid === q.id);
      return submitted
        ? { ...publicQ, answer, explanation, evidence, submitted }
        : publicQ;
    });
    const articles = store.articles();
    return {
      day,
      profile: store.profile(),
      sources: store.sources(),
      articles: articles.map((a) => ({
        ...a,
        text: a.text.slice(0, 1600),
        screening: a.kind === "招聘" ? screenJob(a, store.profile()) : null,
      })),
      marks: store.marks(),
      daily: daily ? { ...daily, questions: safeQuestions } : null,
      answers,
      history: store.allAnswers(),
      updating,
      generating,
      activeSource,
      updateStarted,
      lastRun,
      notice,
      hasKey: !!store.config().apiKey,
      canImportStudyBuddy:
        !!process.env.YUETEACH_STUDYBUDDY_ENV &&
        existsSync(process.env.YUETEACH_STUDYBUDDY_ENV),
      autoIntervalHours: 6,
    };
  };
  const json = (res, status, data) => {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    res.end(JSON.stringify(data));
  };
  const body = async (req) => {
    let text = "";
    for await (const chunk of req) {
      text += chunk;
      if (Buffer.byteLength(text) > 100000) throw Error("请求过大");
    }
    return JSON.parse(text || "{}");
  };
  const server = http.createServer(async (req, res) => {
    try {
      if (!/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host || ""))
        return json(res, 403, { error: "仅支持本机访问" });
      const url = new URL(req.url, "http://127.0.0.1");
      const trusted = token
        ? req.headers["x-yueteach-token"] === token
        : (req.headers.cookie || "")
            .split(";")
            .some((c) => c.trim() === `yt_session=${session}`);
      if (url.pathname.startsWith("/api/")) {
        if (!trusted) return json(res, 403, { error: "请从应用首页重新打开" });
        if (req.method !== "GET" && req.headers["x-yueteach-intent"] !== "user")
          return json(res, 403, { error: "缺少操作标识" });
        if (
          !token &&
          req.headers.origin &&
          req.headers.origin !== `http://${req.headers.host}`
        )
          return json(res, 403, { error: "跨站请求被拒绝" });
        if (req.method === "GET" && url.pathname === "/api/state")
          return json(res, 200, state());
        if (req.method === "GET" && url.pathname === "/api/article") {
          const a = store
            .articles()
            .find((a) => a.url === url.searchParams.get("url"));
          return a
            ? json(res, 200, a)
            : json(res, 404, { error: "未找到文章" });
        }
        if (req.method === "GET" && url.pathname === "/api/backup") {
          res.setHeader(
            "content-disposition",
            `attachment; filename="YueTeach-${dayCN()}.json"`,
          );
          return json(res, 200, {
            version: 1,
            profile: store.profile(),
            articles: store.articles(),
            marks: store.marks(),
            answers: store.allAnswers(),
            daily: store.db
              .prepare("SELECT day,payload FROM daily")
              .all()
              .map((x) => ({ day: x.day, ...JSON.parse(x.payload) })),
          });
        }
        if (req.method !== "POST")
          return json(res, 404, { error: "接口不存在" });
        const b = await body(req);
        if (url.pathname === "/api/update") {
          if (!updating) void update();
          return json(res, 202, { ok: true });
        }
        if (url.pathname === "/api/quiz") {
          if (!generating) void ensureQuiz();
          return json(res, 202, { ok: true });
        }
        if (url.pathname === "/api/profile") {
          if (
            typeof b.major !== "string" ||
            !/^20\d{2}$/.test(b.graduation) ||
            !["初中政治", "高中政治", "小学"].includes(b.qualification) ||
            !["待确认", "学士", "无"].includes(b.degree)
          )
            throw Error("请检查个人档案字段");
          store.set("profile", {
            major: b.major.slice(0, 80),
            graduation: b.graduation,
            qualification: b.qualification,
            degree: b.degree,
            cities: ["广州", "深圳", "惠州", "肇庆"],
          });
          return json(res, 200, { ok: true });
        }
        if (url.pathname === "/api/config") {
          const config = store.config();
          if (b.clear) delete config.apiKey;
          else if (b.apiKey) {
            if (
              typeof b.apiKey !== "string" ||
              b.apiKey.length < 10 ||
              b.apiKey.length > 300 ||
              /[\s\r\n]/.test(b.apiKey)
            )
              throw Error("密钥格式不正确");
            config.apiKey = b.apiKey;
          }
          await store.saveConfig(config);
          return json(res, 200, { ok: true });
        }
        if (url.pathname === "/api/import-studybuddy") {
          const file = process.env.YUETEACH_STUDYBUDDY_ENV;
          if (!file || !existsSync(file))
            throw Error("未找到本机 StudyBuddy 配置，请在设置中自行填写密钥");
          const line = readFileSync(file, "utf8")
            .match(/^\s*DEEPSEEK_API_KEY\s*=\s*(.+)\s*$/m)?.[1]
            ?.trim();
          const apiKey = line?.replace(/^["']|["']$/g, "");
          if (
            !apiKey ||
            apiKey.length < 10 ||
            apiKey.length > 300 ||
            /\s/.test(apiKey)
          )
            throw Error("StudyBuddy 尚未配置有效的 DeepSeek 密钥");
          await store.saveConfig({ ...store.config(), apiKey });
          return json(res, 200, { ok: true });
        }
        if (url.pathname === "/api/mark") {
          if (
            !store.articles().some((a) => a.url === b.url) ||
            !["待看", "已读", "重点", "隐藏"].includes(b.status)
          )
            throw Error("无效标记");
          store.mark(b.url, {
            status: b.status,
            note: typeof b.note === "string" ? b.note.slice(0, 2000) : "",
            updated: new Date().toISOString(),
          });
          return json(res, 200, { ok: true });
        }
        if (url.pathname === "/api/answer") {
          const day = dayCN();
          const q = store.daily(day)?.questions.find((q) => q.id === b.qid);
          if (
            !q ||
            !Array.isArray(b.choice) ||
            !b.choice.length ||
            b.choice.some(
              (n) => !Number.isInteger(n) || n < 0 || n >= q.options.length,
            ) ||
            new Set(b.choice).size !== b.choice.length
          )
            throw Error("请先选择答案");
          if (q.type !== "多选" && b.choice.length !== 1)
            throw Error("此题只选一个答案");
          const correct =
            [...b.choice].sort().join(",") === [...q.answer].sort().join(",");
          store.answer(day, q.id, {
            choice: b.choice,
            correct,
            at: new Date().toISOString(),
            question: q,
          });
          return json(res, 200, { ok: true });
        }
        if (url.pathname === "/api/import-url") {
          const u = officialURL(b.url);
          if (!u) throw Error("请使用支持地区的官方 HTTPS 原文链接");
          if (activeRequests.size >= 2)
            throw Error("正在读取其他原文，请稍后再试");
          const controller = new AbortController();
          activeRequests.add(controller);
          try {
            const r = await fetchOfficial(u, {
              signal: AbortSignal.any([controller.signal, lifetime.signal]),
            });
            const hostname = new URL(r.url).hostname;
            const source =
              SOURCES.find((s) => new URL(s.url).hostname === hostname) ||
              SOURCES.find((s) => s.region === b.region);
            if (
              !source ||
              !["广州", "深圳", "惠州", "肇庆", "广东", "国家"].includes(
                b.region,
              )
            )
              throw Error("请选择所属地区");
            const a = articleFrom(r.html, r.url, {
              ...source,
              region: b.region,
            });
            if (!a)
              throw Error(
                "未识别到正文，请到官网查看。暂不支持直接导入 PDF 或表格附件。",
              );
            store.addArticle(a);
            return json(res, 200, { ok: true });
          } finally {
            activeRequests.delete(controller);
          }
        }
        return json(res, 404, { error: "接口不存在" });
      }
      if (token && !trusted)
        return json(res, 403, { error: "请从桌面应用访问" });
      if (req.method !== "GET") return json(res, 405, { error: "方法不支持" });
      const files = {
        "/": ["index.html", "text/html"],
        "/app.js": ["app.js", "text/javascript"],
        "/style.css": ["style.css", "text/css"],
      };
      const file = files[url.pathname];
      if (!file) return json(res, 404, { error: "页面不存在" });
      res.writeHead(200, {
        "content-type": file[1] + "; charset=utf-8",
        "x-content-type-options": "nosniff",
        "content-security-policy":
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
        ...(!token
          ? {
              "set-cookie": `yt_session=${session}; HttpOnly; SameSite=Strict; Path=/`,
            }
          : {}),
      });
      res.end(readFileSync(join(web, file[0])));
    } catch (e) {
      json(res, 400, {
        error:
          e.message === "Unexpected end of JSON input"
            ? "请求格式错误"
            : e.message,
      });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = `http://127.0.0.1:${server.address().port}`;
  // 启动即补更新；开着时每6小时检查。关机期间不运行，重新打开后补查。
  const tick = () => {
    if (
      !updating &&
      (!lastRun || Date.now() - Date.parse(lastRun) >= 6 * 3600000)
    )
      void update();
    else if (!generating && !store.daily(dayCN()) && !notice) void ensureQuiz();
  };
  const timer = auto ? setInterval(tick, 60000) : null;
  if (auto) setTimeout(tick, 1500).unref();
  return {
    server,
    store,
    address,
    update,
    ensureQuiz,
    close: async () => {
      lifetime.abort();
      for (const c of activeRequests) c.abort();
      if (timer) clearInterval(timer);
      await quizPromise?.catch(() => {});
      while (updating) await new Promise((r) => setTimeout(r, 10));
      await new Promise((r) => server.close(r));
      store.close();
    },
  };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const app = await startServer();
  console.log(`粤教上岸已启动：${app.address}`);
  process.send?.({ type: "ready", port: app.server.address().port });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
    process.exit(0);
  };
  process.on("message", (m) => {
    if (m?.type === "shutdown") void stop();
  });
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  if (process.send) process.on("disconnect", stop);
}
