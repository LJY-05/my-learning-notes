const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const helpers = require("./generated/migrate.cjs");
function fixture(name) {
  const root = mkdtempSync(join(tmpdir(), "studybuddy-desktop-" + name + "-"));
  const source = join(root, "source"),
    target = join(root, "target");
  mkdirSync(join(source, "data"), { recursive: true });
  mkdirSync(target);
  return { root, source, target };
}
function create(file, name) {
  const db = new DatabaseSync(file);
  db.exec(readFileSync(join(__dirname, "../server/001_init.sql"), "utf8"));
  db.exec("PRAGMA journal_mode=WAL");
  const config = {
    name,
    dailyMinutes: 120,
    theme: "dark",
    energy: "普通",
    provider: "mock",
    reminders: true,
    planStart: "2026-10-23",
    planEnd: "2026-12-17",
    subjectTwoTotal: null,
  };
  db.prepare("INSERT INTO UserSettings VALUES(?,?)").run(
    "default",
    JSON.stringify(config),
  );
  db.prepare("INSERT INTO Metadata VALUES(1,0)").run();
  return db;
}
function name(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return JSON.parse(db.prepare("SELECT data FROM UserSettings").get().data)
      .name;
  } finally {
    db.close();
  }
}
test("从仍有WAL的旧项目一致迁移，保留源数据并备份目标数据库及配置", async () => {
  const { root, source, target } = fixture("wal");
  const old = create(join(source, "data/studybuddy.sqlite"), "旧学习记录");
  const current = create(join(target, "studybuddy.sqlite"), "桌面原记录");
  current.close();
  writeFileSync(
    join(source, ".env"),
    "DEEPSEEK_API_KEY=test-placeholder\nDEEPSEEK_MODEL=deepseek-chat\n",
  );
  writeFileSync(join(target, ".env"), "OPENAI_API_KEY=previous-placeholder\n");
  try {
    const result = await helpers.migrateProject(source, target);
    assert.equal(name(join(target, "studybuddy.sqlite")), "旧学习记录");
    assert.equal(name(join(source, "data/studybuddy.sqlite")), "旧学习记录");
    assert.equal(name(join(result.backups, "studybuddy.sqlite")), "桌面原记录");
    assert.equal(helpers.configStatus(target).deepseekConfigured, true);
    assert.ok(existsSync(join(result.backups, ".env")));
    assert.ok(!JSON.stringify(result).includes("test-placeholder"));
  } finally {
    old.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test("损坏的旧数据库不会覆盖桌面记录", async () => {
  const { root, source, target } = fixture("invalid");
  writeFileSync(join(source, "data/studybuddy.sqlite"), "not a database");
  create(join(target, "studybuddy.sqlite"), "保留数据").close();
  try {
    await assert.rejects(() => helpers.migrateProject(source, target));
    assert.equal(name(join(target, "studybuddy.sqlite")), "保留数据");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("AI配置迁移中断时回滚目标数据库，原项目不受影响", async () => {
  const { root, source, target } = fixture("rollback");
  create(join(source, "data/studybuddy.sqlite"), "源数据").close();
  create(join(target, "studybuddy.sqlite"), "目标数据").close();
  mkdirSync(join(source, ".env"));
  writeFileSync(
    join(target, ".env"),
    "DEEPSEEK_API_KEY=previous-placeholder\n",
  );
  try {
    await assert.rejects(() => helpers.migrateProject(source, target));
    assert.equal(name(join(target, "studybuddy.sqlite")), "目标数据");
    assert.equal(helpers.configStatus(target).deepseekConfigured, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("配置留空保留、显式清除、输入校验及返回值不含密钥", () => {
  const { root, target } = fixture("config");
  try {
    const s = helpers.saveConfig(target, {
      provider: "deepseek",
      key: "test-placeholder",
      model: "deepseek-chat",
    });
    assert.equal(s.deepseekConfigured, true);
    assert.ok(!JSON.stringify(s).includes("test-placeholder"));
    helpers.saveConfig(target, {
      provider: "deepseek",
      key: "",
      model: "deepseek-chat",
    });
    assert.equal(helpers.configStatus(target).deepseekConfigured, true);
    assert.throws(() =>
      helpers.saveConfig(target, {
        provider: "deepseek",
        key: "bad\nKEY=value",
        model: "deepseek-chat",
      }),
    );
    helpers.saveConfig(target, {
      provider: "deepseek",
      key: "",
      model: "deepseek-chat",
      clear: true,
    });
    assert.equal(helpers.configStatus(target).deepseekConfigured, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
