const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const safeLink = (v) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? esc(u.href) : "#";
  } catch {
    return "#";
  }
};
const labels = {
  home: "我的工作台",
  jobs: "招聘雷达",
  policy: "政策与时政",
  quiz: "每日 15 题",
  mistakes: "错题回看",
  saved: "我的收藏",
  sources: "来源与更新",
  settings: "个人档案与设置",
};
document
  .querySelectorAll("[data-page]")
  .forEach((el) => el.setAttribute("aria-label", labels[el.dataset.page]));
let state = null,
  page = "home",
  city = "全部",
  kind = "全部",
  query = "",
  jobFilter = "本科线索",
  quizIndex = 0,
  selection = [],
  selectionFor = "",
  readerArticle = null,
  refreshing = false;
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").hidden = true), 5500);
}
async function request(path, body) {
  const r = await fetch(
    "/api/" + path,
    body
      ? {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-yueteach-intent": "user",
          },
          body: JSON.stringify(body),
        }
      : {},
  );
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "请求失败");
  return data;
}
async function refresh(renderPage = true) {
  if (refreshing) return;
  refreshing = true;
  try {
    const previousDay = state?.day;
    const previousQuiz = state?.daily?.questions.map((q) => q.id).join(",");
    state = await request("state");
    const failures = state.sources.filter(
      (s) => s.status === "更新失败",
    ).length;
    $("#side-status").textContent = state.updating
      ? `↻ 正在检查 ${state.activeSource || "来源"}`
      : failures
        ? `○ ${failures} 个来源更新失败`
        : "○ 数据保存在这台电脑";
    $("#side-status").classList.toggle("warn", !!failures);
    if (
      renderPage ||
      previousDay !== state.day ||
      (page === "quiz" &&
        previousQuiz !== state.daily?.questions.map((q) => q.id).join(","))
    )
      render();
  } catch (e) {
    toast(e.message);
  } finally {
    refreshing = false;
  }
}
const fmt = (value) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "尚未检查";
const empty = (title, text, button = "") =>
  `<div class="empty"><strong>${esc(title)}</strong>${esc(text)}${button ? "<br>" + button : ""}</div>`;
const updateBtn = () =>
  `<button class="btn" data-action="update" ${state.updating ? "disabled" : ""}><span ${state.updating ? 'class="spinner"' : ""}>↻</span>${state.updating ? "正在更新" : "更新官方来源"}</button>`;
function heading(title, subtitle, eyebrow = "YOUR TEACHING JOURNEY") {
  return `<div class="eyebrow">${eyebrow}</div><div class="heading"><div><h1>${title}</h1><div class="sub">${subtitle}</div></div>${updateBtn()}</div>`;
}
const articleMark = (a) => state.marks.find((m) => m.url === a.url);
function articleCard(a, compact = false) {
  const mark = articleMark(a);
  return `<article class="${compact ? "list-item" : "article-card"}"><div><span class="tag green">${esc(a.region)}</span><span class="tag">${esc(a.kind)}</span>${mark ? `<span class="tag orange">${esc(mark.status)}</span>` : ""}</div><h3>${esc(a.title)}</h3><div class="meta"><span>${esc(a.sourceName)}</span><span>发布：${esc(a.date || "日期未识别")}</span></div>${compact ? "" : `<div class="excerpt">${esc(a.text.slice(0, 160))}…</div>`}<div class="card-bottom"><button class="btn small" data-action="read" data-url="${esc(a.url)}">${a.kind === "招聘" ? "查看与核对条件" : "阅读原文"}</button><a class="btn small" href="${safeLink(a.url)}" target="_blank" rel="noopener noreferrer">官方来源 ↗</a><button class="text-link" data-action="save" data-url="${esc(a.url)}">${mark?.status === "重点" ? "★ 已收藏" : "☆ 收藏"}</button>${a.screening ? `<span class="risk">${esc(a.screening.status)}</span>` : ""}</div></article>`;
}
const sortedDocs = () =>
  [...state.articles].sort((a, b) =>
    (b.date || "").localeCompare(a.date || ""),
  );
function freshness() {
  const failures = state.sources.filter((s) => s.status === "更新失败").length;
  return `<div class="toolbar-note">上次完成检查：${fmt(state.lastRun)} · 应用打开时每 6 小时检查，重新打开会补查${failures ? ` · ${failures} 个来源失败，不能据此判断没有新公告` : ""}。<a href="#sources">查看来源状态 ↗</a></div>`;
}
function home() {
  const docs = sortedDocs(),
    jobs = docs.filter((a) => a.kind === "招聘"),
    policies = docs.filter((a) => a.kind !== "招聘" && a.region !== "国家"),
    done = state.answers.length,
    correct = state.answers.filter((a) => a.correct).length;
  const total = state.daily?.questions.length || 0;
  return (
    heading(
      "给未来的自己，多一点准备。",
      "招聘有方向，政策有来源，今天也向前走一点。",
    ) +
    `<div class="profile-summary"><span class="tag">${esc(state.profile.major)}</span><span class="tag">${esc(state.profile.graduation)} 届本科</span><span class="tag">${esc(state.profile.qualification)}教资</span><span class="tag green">广州 / 深圳 / 惠州 / 肇庆</span></div><section class="hero"><div><div class="eyebrow">ONE DAY AT A TIME · ${esc(state.day)}</div><h2>今天，从 15 道小题开始。</h2><p>广东教育政策与时政，读懂变化，也记住重点。</p><div class="card-bottom"><a class="btn primary" href="#quiz">${done ? "继续今日练习" : "开始今日练习"} →</a><span class="sub">${total ? `${done} / ${total} 已完成` : "等待官方素材，不使用虚构题目"}</span></div></div><div class="hero-art" aria-hidden="true">✳</div></section><div class="stats"><div class="stat"><label>已收录招聘公告</label><strong>${jobs.length}</strong><small>资格待核对</small></div><div class="stat"><label>广东政策与时政</label><strong>${policies.length}</strong><small>篇官方正文</small></div><div class="stat"><label>今日完成</label><strong>${done}</strong><small>/ 目标 15 题</small></div><div class="stat"><label>今日正确率</label><strong>${done ? Math.round((correct / done) * 100) + "%" : "—"}</strong><small>${done ? "全选对计分" : "做完后统计"}</small></div></div>${freshness()}<div class="columns"><section><div class="section-title"><h2>招聘雷达</h2><a href="#jobs">查看全部 ↗</a></div>${
      jobs.length
        ? jobs
            .slice(0, 3)
            .map((a) => articleCard(a, true))
            .join("")
        : empty(
            "还没有收录招聘公告",
            "第一次更新可能需要几分钟。也可以导入官方公告原文。",
            '<a class="btn small" href="#sources">查看更新与导入</a>',
          )
    }</section><section><div class="section-title"><h2>最近的政策变化</h2><a href="#policy">查看全部 ↗</a></div>${
      policies.length
        ? policies
            .slice(0, 2)
            .map((a) => articleCard(a, true))
            .join("")
        : empty(
            "等一条有来源的消息",
            "这里会显示实际采集到的文章，不用示例新闻填充。",
          )
    }<div class="panel soft"><h3>给自己的小提醒</h3><p class="sub">本科可报 ≠ 已符合全部条件。专业代码、2027 届范围、学位和教资期限，要以岗位表与补充公告为准。</p></div></section></div>`
  );
}
function filters(isJob) {
  return `<div class="filters">${["全部", "广州", "深圳", "惠州", "肇庆", ...(!isJob ? ["广东", "国家"] : [])].map((c) => `<button class="chip ${city === c ? "active" : ""}" data-city="${c}">${c}</button>`).join("")}<input id="search" class="search" aria-label="搜索公告标题和正文" placeholder="搜索标题、专业或政策关键词…" value="${esc(query)}"></div><div class="filters">${isJob ? `<label class="sub">条件线索 <select id="job-filter"><option ${jobFilter === "全部" ? "selected" : ""}>全部</option><option ${jobFilter === "本科线索" ? "selected" : ""}>本科线索</option><option ${jobFilter === "专业线索" ? "selected" : ""}>专业线索</option></select></label><span class="sub">仅筛选正文线索，附件未自动解析，未命中不代表不能报。</span>` : ["全部", "政策", "时政"].map((k) => `<button class="chip ${kind === k ? "active" : ""}" data-kind="${k}">${k}</button>`).join("")}</div>`;
}
function library(isJob = false, saved = false) {
  let docs = sortedDocs().filter((a) =>
    saved
      ? articleMark(a)?.status === "重点"
      : isJob
        ? a.kind === "招聘"
        : a.kind !== "招聘",
  );
  docs = docs.filter(
    (a) =>
      (city === "全部" || a.region === city) &&
      (!query || (a.title + a.text).includes(query)) &&
      (isJob || kind === "全部" || a.kind === kind),
  );
  if (isJob && jobFilter !== "全部")
    docs = docs.filter((a) =>
      a.screening?.checks.some(
        (c) =>
          c.label === (jobFilter === "本科线索" ? "学历" : "专业") &&
          c.state === "线索",
      ),
    );
  return (
    heading(
      saved
        ? "收藏，留给下一次回看。"
        : isJob
          ? "在合适的地方，遇见机会。"
          : "读懂政策，也读懂变化。",
      isJob
        ? "四地及区县官方信息；筛选结果是线索，不是报考资格结论。"
        : "发布日期不等于实施日期。原文可能修订或废止，请结合考试公告核对。",
      isJob ? "OPPORTUNITY RADAR" : "READ, UNDERSTAND, REMEMBER",
    ) +
    filters(isJob) +
    freshness() +
    `<div class="toolbar-note">显示 ${docs.length} 篇。按识别到的发布日期排序，日期缺失排在末尾；不保证覆盖全部区县。</div>` +
    (docs.length
      ? docs.map((a) => articleCard(a)).join("")
      : empty(
          "这个范围暂时没有收录内容",
          "可以调整筛选，查看来源状态，或导入官方原文。",
          '<a class="btn" href="#sources">来源与更新 ↗</a>',
        ))
  );
}
function quiz() {
  const daily = state.daily,
    questions = daily?.questions || [],
    done = state.answers.length;
  let out = heading(
    "每天 15 题，把积累变成底气。",
    "只使用近 90 天的广东地区官方素材；题目每日固定，按北京时间换日。",
    "A LITTLE PRACTICE, EVERY DAY",
  );
  out += `<div class="status-box ${questions.length === 15 ? "good" : ""}">${esc(state.generating ? "正在生成并校验题目…" : state.notice || daily?.note || "先更新官方来源，再生成今天的练习。")}<br>目标 15 题，当前可用 ${questions.length} 题。${state.hasKey ? "DeepSeek 已配置；生成会使用你的 API 额度。" : "免费原文提取模式；可在设置中配置 DeepSeek，生成三种题型。"}</div>`;
  if (!questions.length)
    return (
      out +
      empty(
        "先有可靠的材料，再有值得做的题",
        "没有足够的近期广东官方正文时，不生成示例时政题。",
        `<button class="btn primary" data-action="quiz" ${state.generating ? "disabled" : ""}>${state.generating ? "生成中…" : "检查素材并生成"}</button> <a class="btn" href="#sources">查看来源</a>`,
      )
    );
  quizIndex = Math.min(quizIndex, questions.length - 1);
  const q = questions[quizIndex];
  if (selectionFor !== q.id) {
    selection = [];
    selectionFor = q.id;
  }
  const submitted = q.submitted;
  const chosen = submitted?.choice || selection;
  out += `<div class="progress-track"><progress max="15" value="${done}"></progress></div><div class="quiz-layout"><section class="question"><div class="meta"><span class="tag green">${q.type}</span><span>第 ${quizIndex + 1} / ${questions.length} 题</span><span>${esc(q.region)} · ${esc(q.sourceDate)}</span></div><h2>${esc(q.stem)}</h2>${q.options.map((o, i) => `<button class="option ${chosen.includes(i) ? "selected" : ""} ${submitted ? (q.answer.includes(i) ? "correct" : chosen.includes(i) ? "incorrect" : "") : ""}" data-option="${i}" ${submitted ? "disabled" : ""}><b>${String.fromCharCode(65 + i)}</b><span>${esc(o)}</span></button>`).join("")}<div class="card-bottom">${!submitted ? `<button class="btn primary" data-action="answer" ${!chosen.length ? "disabled" : ""}>提交答案</button>` : `<span class="tag ${submitted.correct ? "green" : "orange"}">${submitted.correct ? "回答正确" : "再看一下原文"}</span>`}<button class="btn" data-action="prev" ${quizIndex === 0 ? "disabled" : ""}>上一题</button><button class="btn" data-action="next" ${quizIndex === questions.length - 1 ? "disabled" : ""}>下一题</button></div>${submitted ? `<div class="explanation"><strong>答案：${q.answer.map((i) => String.fromCharCode(65 + i)).join("、")}</strong><p>${esc(q.explanation)}</p><blockquote>${esc(q.evidence)}</blockquote><a href="${safeLink(q.url)}" target="_blank" rel="noopener noreferrer">${esc(q.sourceTitle)} ↗</a><p class="sub">${esc(q.method)}。如果解析与原文冲突，以有效的官方原文为准。</p></div>` : `<div class="footnote">${esc(q.method)} · 提交后查看引用、答案与解析</div>`}</section><aside class="quiz-aside"><h3>今天的进度</h3><div>${done} / ${questions.length} 已完成 · 目标 15</div><div class="question-grid">${questions.map((x, i) => `<button data-question="${i}" class="${i === quizIndex ? "current" : ""} ${x.submitted ? (x.submitted.correct ? "done" : "wrong") : ""}">${i + 1}</button>`).join("")}</div><p>多选题需全部选对，不计部分分。</p><p>今天已生成的题目不会因更新新闻而替换。答案和错题保存在本机。</p><a href="#mistakes">回看错题 →</a></aside></div>`;
  return out;
}
function mistakes() {
  const wrong = state.history.filter((a) => !a.correct);
  return (
    heading(
      "把没分清的，再看懂一次。",
      "错题按首次提交记录。回看时先自己想答案，再展开原文。",
      "MAKE ROOM FOR MISTAKES",
    ) +
    (wrong.length
      ? wrong
          .map(
            (a) =>
              `<article class="article-card"><div class="meta"><span>${esc(a.day)}</span><span class="tag">${esc(a.question.type)}</span></div><h3>${esc(a.question.stem)}</h3><details><summary>展开答案与依据</summary><div class="explanation"><p>你的选择：${a.choice.map((i) => esc(a.question.options[i])).join("；")}</p><p>正确答案：${a.question.answer.map((i) => esc(a.question.options[i])).join("；")}</p><p>${esc(a.question.explanation)}</p><blockquote>${esc(a.question.evidence)}</blockquote><a href="${safeLink(a.question.url)}" target="_blank" rel="noopener noreferrer">核对官方原文 ↗</a></div></details></article>`,
          )
          .join("")
      : empty("还没有错题记录", "完成每日练习后，答错的题会自动收在这里。"))
  );
}
function sources() {
  return (
    heading(
      "每一条消息，都有来处。",
      "官网改版、访问限制和采集失败会显示在这里；更新完成不等于覆盖全部公告。",
      "TRUST THE SOURCE",
    ) +
    freshness() +
    `<div class="status-box">当前为官网首页＋部分栏目自动发现，单来源每轮最多读取 10 篇。区县可能单独发布公告；Excel/PDF 岗位附件需点开核对。系统不能保证全量收录或自动判断政策是否仍有效。</div><div class="source-grid">${state.sources.map((s) => `<article class="source-card"><div class="source-row"><h3>${esc(s.name)}</h3><span class="tag ${s.status === "已检查" ? "green" : s.status === "更新失败" ? "orange" : ""}">${esc(s.status || "尚未检查")}</span></div><p class="sub">${esc(s.region)} · 上次尝试 ${fmt(s.lastAttempt)}<br>最近成功 ${fmt(s.lastSuccess)} · 本轮新增 ${s.count || 0} 篇${s.error ? "<br>" + esc(s.error) : ""}</p><a class="text-link" href="${safeLink(s.url)}" target="_blank" rel="noopener noreferrer">打开官方入口 ↗</a></article>`).join("")}</div><div class="divider"></div><h2>补充一篇官方原文</h2><p class="sub">官网没自动发现时，可粘贴文章链接。支持六个官方域名体系，暂不支持直接导入附件。</p><form id="import-form" class="form"><label for="article-url">官方 HTTPS 文章链接</label><input id="article-url" name="url" type="url" required placeholder="https://…"><label for="import-region">所属地区</label><select id="import-region" name="region">${["广东", "广州", "深圳", "惠州", "肇庆", "国家"].map((x) => `<option>${x}</option>`).join("")}</select><button class="btn primary" type="submit">读取并收录原文</button></form>`
  );
}
function settings() {
  const p = state.profile;
  return (
    heading(
      "让这个空间，更适合你。",
      "个人档案、练习方式和本机数据。",
      "MAKE IT YOURS",
    ) +
    `<h2>我的报考档案</h2><p class="sub">初中政治教资不会自动匹配高中岗位。资格最终以公告和岗位表为准。</p><form id="profile-form" class="form"><label for="major">本科专业</label><input id="major" name="major" value="${esc(p.major)}" required><label for="graduation">毕业年份</label><input id="graduation" name="graduation" value="${esc(p.graduation)}" pattern="20[0-9]{2}" required><label for="qualification">教师资格证</label><select name="qualification" id="qualification">${["初中政治", "高中政治", "小学"].map((x) => `<option ${p.qualification === x ? "selected" : ""}>${x}</option>`).join("")}</select><label for="degree">学士学位</label><select name="degree" id="degree">${["待确认", "学士", "无"].map((x) => `<option ${p.degree === x ? "selected" : ""}>${x}</option>`).join("")}</select><button class="btn primary">保存档案</button></form><div class="divider"></div><h2>每日练习 · DeepSeek</h2><p class="sub">${state.hasKey ? "已保存密钥，不回显。留空保存可保留原密钥。" : "未配置：仍可自动生成免费的原文数字填空题。"}<br>接入后可生成单选、多选、判断题，会产生 DeepSeek API 费用；没有余额时会显示错误，不自动扣用其他服务。<br>密钥仅保存在本机数据目录的 ai-config.json（明文文件），不进入练习备份或 GitHub。</p><form id="config-form" class="form"><label for="api-key">DeepSeek API Key</label><input id="api-key" name="apiKey" type="password" autocomplete="off" placeholder="在自己电脑上填写，不要发到聊天里"><label class="check"><input type="checkbox" name="clear">清除已保存密钥，使用免费模式</label><button class="btn primary">保存 AI 设置</button></form><div class="divider"></div><h2>数据与使用</h2><p class="sub">程序打开时每 6 小时检查来源；电脑关机或应用关闭时不运行，下次启动补查。每日按北京时间换题。<br>本程序独立于 StudyBuddy，退出会自动停止内部服务。Windows 使用 Segoe UI／微软雅黑；苹果系统使用系统字体，不附带苹果商业字体。</p><button class="btn" data-action="export">导出资料与答题记录</button><p class="sub">备份不包含 API 密钥。桌面菜单可打开数据目录；更换版本保留该目录即可。</p>`
  );
}
function render() {
  if (!state) return;
  $("#breadcrumb").textContent = labels[page];
  document
    .querySelectorAll("[data-page]")
    .forEach((el) => el.classList.toggle("active", el.dataset.page === page));
  $("#content").innerHTML =
    (
      {
        home,
        jobs: () => library(true),
        policy: () => library(),
        saved: () => library(false, true),
        quiz,
        mistakes,
        sources,
        settings,
      }[page] || home
    )() +
    `<div class="footnote">粤教上岸 · 认真准备，也给自己一点余地。官方公告与有效政策原文为准。</div>`;
  if (page === "settings" && state.canImportStudyBuddy) {
    const button = document.createElement("button");
    button.className = "btn";
    button.dataset.action = "import-key";
    button.textContent = "复用本机 StudyBuddy 的 DeepSeek 密钥";
    $("#config-form").after(button);
  }
}
function navigate() {
  const next = location.hash.slice(1) || "home";
  page = Object.hasOwn(labels, next) ? next : "home";
  query = "";
  city = "全部";
  kind = "全部";
  selection = [];
  $("#reader").close();
  $(".sidebar").classList.remove("open");
  render();
  window.scrollTo(0, 0);
}
async function openArticle(url) {
  const a = await request("article?url=" + encodeURIComponent(url));
  readerArticle = a;
  const screen = state.articles.find((x) => x.url === url)?.screening,
    mark = articleMark(a);
  $("#reader-content").innerHTML =
    `<div class="meta"><span>${esc(a.region)} · ${esc(a.sourceName)}</span><span>${esc(a.date || "发布日期未识别")}</span></div><h2>${esc(a.title)}</h2><a class="btn small" href="${safeLink(a.url)}" target="_blank" rel="noopener noreferrer">查看官方原文 ↗</a>${screen ? `<div class="status-box">${esc(screen.note)}</div>${screen.checks.map((c) => `<div class="evidence-item"><strong>${esc(c.label)} · ${esc(c.state)}</strong><p>${esc(c.evidence)}</p></div>`).join("")}` : `<div class="status-box">此处显示提取正文，不自动判断是否已废止、是否已实施或是否列入考试范围。</div>`}${a.attachments.length ? `<h3>公告附件 · 需要自行核对岗位条件</h3>${a.attachments.map((x) => `<p><a href="${safeLink(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)} ↗</a></p>`).join("")}` : ""}<div class="article-body">${esc(a.text)}</div><label for="reader-note">我的核对笔记</label><textarea id="reader-note" class="note-edit" placeholder="例如：需核对2027届身份、岗位代码、报名截止日期…">${esc(mark?.note || "")}</textarea><div class="card-bottom"><button class="btn primary" data-action="note">保存笔记并收藏</button><button class="btn" data-action="read-mark">标为已读</button></div>`;
  $("#reader").showModal();
}
document.addEventListener("click", async (e) => {
  const el = e.target.closest("button,[data-page]");
  if (!el) return;
  try {
    if (el.dataset.page) {
      location.hash = el.dataset.page;
      return;
    }
    if (el.dataset.city) {
      city = el.dataset.city;
      render();
      return;
    }
    if (el.dataset.kind) {
      kind = el.dataset.kind;
      render();
      return;
    }
    if (el.dataset.question !== undefined) {
      quizIndex = Number(el.dataset.question);
      render();
      return;
    }
    if (el.dataset.option !== undefined) {
      const i = Number(el.dataset.option),
        q = state.daily.questions[quizIndex];
      selection =
        q.type === "多选"
          ? selection.includes(i)
            ? selection.filter((x) => x !== i)
            : [...selection, i]
          : [i];
      render();
      return;
    }
    const action = el.dataset.action;
    if (!action) return;
    if (action === "update") {
      await request("update", {});
      toast("已开始检查官方来源，可继续使用其他页面");
      await refresh();
    }
    if (action === "quiz") {
      await request("quiz", {});
      toast("正在检查素材并生成，请稍候");
      await refresh();
    }
    if (action === "import-key") {
      await request("import-studybuddy", {});
      toast("已从本机 StudyBuddy 复制密钥，原配置保留");
      await refresh();
    }
    if (action === "read") await openArticle(el.dataset.url);
    if (action === "save") {
      const m = state.marks.find((m) => m.url === el.dataset.url);
      await request("mark", {
        url: el.dataset.url,
        status: m?.status === "重点" ? "待看" : "重点",
        note: m?.note || "",
      });
      await refresh();
    }
    if (action === "note" || action === "read-mark") {
      await request("mark", {
        url: readerArticle.url,
        status: action === "note" ? "重点" : "已读",
        note: $("#reader-note").value,
      });
      toast("已保存");
      await refresh(false);
    }
    if (action === "prev") {
      quizIndex--;
      render();
    }
    if (action === "next") {
      quizIndex++;
      render();
    }
    if (action === "answer") {
      await request("answer", {
        qid: state.daily.questions[quizIndex].id,
        choice: selection,
      });
      selection = [];
      await refresh();
    }
    if (action === "export") {
      const data = await request("backup");
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const href = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = href;
      a.download = `YueTeach-${state.day}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      toast("已请求导出备份");
    }
  } catch (err) {
    toast(err.message);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "search") {
    const position = e.target.selectionStart;
    query = e.target.value;
    render();
    $("#search").focus();
    $("#search").setSelectionRange(position, position);
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "job-filter") {
    jobFilter = e.target.value;
    render();
  }
});
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  if (!["profile-form", "config-form", "import-form"].includes(form.id)) return;
  const button = form.querySelector("button[type=submit],button");
  button.disabled = true;
  try {
    const fields = Object.fromEntries(new FormData(form));
    if (form.id === "config-form") fields.clear = fields.clear === "on";
    await request(
      form.id === "profile-form"
        ? "profile"
        : form.id === "config-form"
          ? "config"
          : "import-url",
      fields,
    );
    toast("已保存");
    await refresh();
  } catch (err) {
    toast(err.message);
    button.disabled = false;
  }
});
$("#close-reader").onclick = () => $("#reader").close();
$("#menu-toggle").onclick = () => $(".sidebar").classList.toggle("open");
window.addEventListener("hashchange", navigate);
await refresh(false);
navigate();
setInterval(() => {
  if (!state) return;
  const busy = state.updating || state.generating;
  if (
    page !== "settings" &&
    !$("#reader").open &&
    !document.activeElement?.matches("input,textarea,select")
  )
    void refresh(busy || page === "home" || page === "sources");
}, 5000);
