import "dotenv/config";
import { Store } from "./db.js";
import { existsSync, readFileSync } from "node:fs";
import { parseWorkbook, applyImport } from "./importer.js";
const store = new Store();
const file = "public/StudyBuddy_备考计划_结合实习课表调整版.xlsx";
if (existsSync(file)) {
  const result = store.mutate((s) =>
    applyImport(s, parseWorkbook(readFileSync(file), file)),
  );
  console.log(result);
} else console.log("正式Excel不存在，请启动后在设置页上传");
console.log("数据库就绪，任务数", store.read().tasks.length);
store.close();
