// 官方入口是采集起点，不是已核实的最新文章。每次采集单独记录成功/失败。
export const SOURCES = [
  {
    id: "gd-edu",
    name: "广东省教育厅",
    region: "广东",
    kind: "政策",
    url: "https://edu.gd.gov.cn/",
  },
  {
    id: "gd-gov",
    name: "广东省人民政府",
    region: "广东",
    kind: "时政",
    url: "https://www.gd.gov.cn/",
  },
  {
    id: "gz-edu",
    name: "广州市教育局",
    region: "广州",
    kind: "综合",
    url: "https://jyj.gz.gov.cn/",
  },
  {
    id: "gz-hr",
    name: "广州市人力资源和社会保障局",
    region: "广州",
    kind: "招聘",
    url: "https://rsj.gz.gov.cn/",
  },
  {
    id: "sz-edu",
    name: "深圳市教育局",
    region: "深圳",
    kind: "综合",
    url: "https://szeb.sz.gov.cn/",
  },
  {
    id: "sz-hr",
    name: "深圳市人力资源和社会保障局",
    region: "深圳",
    kind: "招聘",
    url: "https://hrss.sz.gov.cn/",
  },
  {
    id: "hz-gov",
    name: "惠州市人民政府",
    region: "惠州",
    kind: "综合",
    url: "https://www.huizhou.gov.cn/",
  },
  {
    id: "zq-gov",
    name: "肇庆市人民政府",
    region: "肇庆",
    kind: "综合",
    url: "https://www.zhaoqing.gov.cn/",
  },
  {
    id: "moe",
    name: "教育部",
    region: "国家",
    kind: "政策",
    url: "https://www.moe.gov.cn/",
  },
];
export const DEFAULT_PROFILE = {
  major: "思想政治教育",
  graduation: "2027",
  qualification: "初中政治",
  degree: "待确认",
  cities: ["广州", "深圳", "惠州", "肇庆"],
};
const roots = [
  "gd.gov.cn",
  "gz.gov.cn",
  "sz.gov.cn",
  "huizhou.gov.cn",
  "zhaoqing.gov.cn",
  "moe.gov.cn",
];
export function officialURL(value) {
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      (u.port && u.port !== "443")
    )
      return null;
    if (!roots.some((h) => u.hostname === h || u.hostname.endsWith("." + h)))
      return null;
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}
export function classify(title, text = "") {
  const t = title + " " + text.slice(0, 400);
  if (
    /教师|教职员|事业单位/.test(t) &&
    /招聘|招考|选聘|引进|补充公告|更正公告/.test(title)
  )
    return "招聘";
  if (/通知|办法|意见|方案|条例|规定|政策|规则|标准|规划|决定/.test(title))
    return "政策";
  return "时政";
}
export function screenJob(doc, profile = DEFAULT_PROFILE) {
  const t = doc.title + "\n" + doc.text;
  const checks = [];
  const add = (label, state, evidence) =>
    checks.push({ label, state, evidence });
  add(
    "学历",
    /(?:仅限|须为|要求为|限为)?(?:博士|硕士)研究生|研究生学历/.test(t) &&
      !/本科|学士/.test(t)
      ? "风险"
      : /本科/.test(t)
        ? "线索"
        : "待核对",
    t.match(/[^。\n]{0,32}(?:本科|研究生学历)[^。\n]{0,45}/)?.[0] ||
      "正文未提取到学历要求，需查看岗位表",
  );
  const majorHit =
    t.includes(profile.major) ||
    (profile.major === "思想政治教育" && /马克思主义理论|030503/.test(t));
  add(
    "专业",
    majorHit ? "线索" : "待核对",
    majorHit
      ? `正文包含专业或相关类别线索；${profile.major}仍须对照岗位代码与附件`
      : `未找到${profile.major}的明确线索，须核对岗位表；不同专业大类不能自动等同`,
  );
  add(
    `${profile.graduation}届身份`,
    t.includes(profile.graduation) ? "线索" : "待核对",
    t.includes(profile.graduation)
      ? `正文出现${profile.graduation}，须核对应届生定义、毕业与取证期限`
      : "应届生范围、毕业及取证期限需按公告核对",
  );
  const gradeRisk =
    profile.qualification !== "高中政治" && /高中|高级中学/.test(t);
  add(
    "教资学段",
    gradeRisk ? "风险" : /初中|初级中学|小学|高中/.test(t) ? "线索" : "待核对",
    gradeRisk
      ? `公告含高中岗位；${profile.qualification}教资不能据此认定符合高中岗位要求`
      : `${profile.qualification}教资；任教学科、取证期限和岗位要求仍需核对`,
  );
  add(
    "学位",
    profile.degree === "学士" ? "线索" : "待核对",
    profile.degree === "学士"
      ? "个人档案填报为学士，需以证书和岗位表为准"
      : "尚未确认学士学位；本科学历与学士学位需分别核对",
  );
  return {
    status: checks.some((x) => x.state === "风险")
      ? "存在条件风险"
      : "待岗位表核对",
    checks,
    note: "正文关键词初筛，不是资格审核结论；同一公告不同岗位要求可能不同。附件尚未自动解析。",
  };
}
