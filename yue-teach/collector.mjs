import * as cheerio from "cheerio";
import { officialURL, classify } from "./sources.mjs";
export function linksFrom(html, base) {
  const $ = cheerio.load(html);
  const found = new Map();
  $("a[href]").each((_, el) => {
    const title = ($(el).attr("title") || $(el).text())
      .replace(/\s+/g, " ")
      .trim();
    let url;
    try {
      url = officialURL(new URL($(el).attr("href"), base).href);
    } catch {
      return;
    }
    if (
      !url ||
      title.length < 4 ||
      /javascript|登录|邮箱|无障碍|繁体|简体|隐私|网站地图/.test(title)
    )
      return;
    if (/\.(pdf|docx?|xlsx?|zip|rar)(?:\?|$)/i.test(url)) return;
    found.set(url, { url, title });
  });
  return [...found.values()];
}
export function articleFrom(html, url, source) {
  const $ = cheerio.load(html);
  const meta = (name) => $(`meta[name="${name}"]`).attr("content") || "";
  const title = (
    meta("ArticleTitle") ||
    $("h1").first().text() ||
    $("title").text()
  )
    .replace(/\s+/g, " ")
    .trim();
  const dateRaw =
    meta("PubDate") ||
    meta("pubdate") ||
    meta("publishdate") ||
    $("time").first().text() ||
    $("body")
      .text()
      .match(
        /(?:发布时间|发布日期|时间|日期)[：:\s]*(\d{4}[年/-]\d{1,2}[月/-]\d{1,2})/,
      )?.[1] ||
    "";
  const m = dateRaw.match(/(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})/);
  const date = m
    ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
    : null;
  const attachments = [];
  $("a[href]").each((_, el) => {
    try {
      const u = officialURL(new URL($(el).attr("href"), url).href);
      if (u && /\.(pdf|docx?|xlsx?|zip|rar)(?:\?|$)/i.test(u))
        attachments.push({ title: $(el).text().trim() || "公告附件", url: u });
    } catch {}
  });
  $("script,style,nav,header,footer,noscript,iframe").remove();
  let body = "";
  for (const sel of [
    "#zoom",
    "#zoomcon",
    "#articleContent",
    ".TRS_Editor",
    ".article-content",
    ".article_content",
    ".viewTRS",
    ".content-detail",
    "article",
  ]) {
    const el = $(sel);
    if (el.text().trim().length > 100) {
      body = el.text();
      break;
    }
  }
  // 不把门户导航整页当成新闻正文。未知模板留待官网查看。
  if (!body) return null;
  body = body
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim()
    .slice(0, 40000);
  if (title.length < 6 || title.length > 220 || body.length < 100) return null;
  const education =
    /教育|教师|教学|学校|学生|课程|师德|校园|招生|考试|未成年人|事业单位/.test(
      title,
    );
  if (!education && source.kind !== "时政") return null;
  if (/网站声明|隐私|网站地图|机构职能/.test(title)) return null;
  const kind = classify(title, body);
  const city =
    kind === "招聘" && ["广东", "国家"].includes(source.region)
      ? ["广州", "深圳", "惠州", "肇庆"].filter((c) => title.includes(c))
      : [];
  return {
    url,
    title,
    text: body,
    date,
    region: city.length === 1 ? city[0] : source.region,
    sourceId: source.id,
    sourceName: source.name,
    kind,
    attachments,
  };
}
export async function fetchOfficial(url, { signal, fetchImpl = fetch } = {}) {
  let current = officialURL(url);
  if (!current) throw Error("仅支持已列入范围的官方 HTTPS 网站");
  for (let i = 0; i < 4; i++) {
    const response = await fetchImpl(current, {
      redirect: "manual",
      signal: AbortSignal.any([
        AbortSignal.timeout(12000),
        ...(signal ? [signal] : []),
      ]),
      headers: {
        "user-agent": "YueTeach/1.0 personal education reading tool",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      current = officialURL(
        new URL(response.headers.get("location"), current).href,
      );
      if (!current) throw Error("跳转目标不在官方来源范围内");
      continue;
    }
    if (!response.ok) throw Error(`官网返回 HTTP ${response.status}`);
    const type = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml/i.test(type))
      throw Error("来源不是 HTML 正文");
    let size = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 3_000_000) throw Error("页面超过大小限制");
      chunks.push(chunk);
    }
    const buf = Buffer.concat(chunks);
    const encoding =
      /charset\s*=\s*["']?([\w-]+)/i.exec(type)?.[1] ||
      /charset\s*=\s*["']?([\w-]+)/i.exec(
        buf.toString("ascii", 0, 1500),
      )?.[1] ||
      "utf-8";
    try {
      return { url: current, html: new TextDecoder(encoding).decode(buf) };
    } catch {
      return { url: current, html: buf.toString("utf8") };
    }
  }
  throw Error("官网跳转次数过多");
}
const articlePath =
  /(?:\/content\/|\/t\d{6,}|\/\d{4}[-/]\d{2}\/|\/\d{6,}\.html|\/post_\d+|\/content_\d+|\/c_\d+)/i;
const categoryWords =
  /通知公告|工作动态|教育新闻|广东教育|政策文件|政策解读|教师招聘|事业单位招聘|招考信息|人事招聘|政务动态|政声传递|政府文件/;
export async function collectSource(
  source,
  { load = fetchOfficial, seen = new Set(), onArticle = () => {}, signal } = {},
) {
  let count = 0,
    failures = 0;
  const queue = [];
  const visited = new Set();
  const root = await load(source.url, { signal });
  const links = linksFrom(root.html, root.url);
  const categories = links
    .filter((x) => categoryWords.test(x.title))
    .slice(0, 3);
  queue.push(...links.filter((x) => articlePath.test(x.url)));
  for (const link of categories) {
    if (signal?.aborted) break;
    try {
      const r = await load(link.url, { signal });
      queue.push(
        ...linksFrom(r.html, r.url).filter((x) => articlePath.test(x.url)),
      );
    } catch {
      failures++;
    }
  }
  for (const link of queue) {
    if (signal?.aborted) break;
    if (visited.has(link.url) || seen.has(link.url)) continue;
    if (visited.size >= 10) break; // 单来源最多抓10篇；不并发轰炸官网。
    visited.add(link.url);
    try {
      const r = await load(link.url, { signal });
      const article = articleFrom(r.html, r.url, source);
      if (article) {
        await onArticle(article);
        count++;
      }
    } catch {
      failures++;
    }
  }
  if (!count && !visited.size && !queue.some((x) => seen.has(x.url)))
    throw Error("未识别到文章链接；请打开官网核对，入口可能改版");
  if (!count && visited.size && failures >= visited.size + categories.length)
    throw Error("文章读取失败，请打开官网核对");
  if (!count && visited.size)
    return {
      count,
      warning:
        "本轮未识别到新的可用正文，可能已收录、模板变化或内容不相关；不代表官网没有更新",
    };
  return {
    count,
    warning: failures ? `${failures} 个页面未能读取，请按需核对官网` : null,
  };
}
