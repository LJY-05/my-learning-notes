const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  protocol,
  net,
  shell,
  ipcMain,
} = require("electron");
const { fork } = require("node:child_process");
const { join } = require("node:path");
const { mkdirSync, writeFileSync } = require("node:fs");
const { randomUUID } = require("node:crypto");
app.setName("StudyBuddy");
app.disableHardwareAcceleration();
if (process.env.STUDYBUDDY_DESKTOP_DATA_PATH)
  app.setPath("userData", process.env.STUDYBUDDY_DESKTOP_DATA_PATH);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "studybuddy",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
let mainWindow,
  settingsWindow,
  child,
  origin = "",
  closing = false,
  transitioning = false,
  quitAllowed = false;
const token = randomUUID();
const dataRoot = app.getPath("userData");
const generated = app.isPackaged
  ? join(process.resourcesPath, "app.asar.unpacked/generated")
  : join(__dirname, "generated");
const helpers = () => require(join(generated, "migrate.cjs"));
function startBackend() {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      DATABASE_PATH: join(dataRoot, "studybuddy.sqlite"),
      PORT: "0",
      DOTENV_CONFIG_PATH: join(dataRoot, ".env"),
      DOTENV_CONFIG_QUIET: "true",
      STUDYBUDDY_WEB_ROOT: join(generated, "web"),
      STUDYBUDDY_WORKBOOK_PATH: join(generated, "plan.xlsx"),
      STUDYBUDDY_DESKTOP_TOKEN: token,
    };
    delete env.NODE_OPTIONS;
    child = fork(join(generated, "server.cjs"), [], {
      execPath: process.execPath,
      env,
      windowsHide: true,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    const active = child;
    const timeout = setTimeout(() => {
      active.kill();
      reject(Error("本机服务启动超时"));
    }, 30000);
    active.on("message", (m) => {
      if (m?.type === "ready") {
        clearTimeout(timeout);
        origin = `http://127.0.0.1:${m.port}`;
        resolve(m);
      } else if (m?.type === "startup-error") {
        clearTimeout(timeout);
        reject(Error("本机服务启动失败"));
      }
    });
    active.once("error", () => {
      clearTimeout(timeout);
      reject(Error("无法启动本机服务"));
    });
    active.once("exit", (code) => {
      clearTimeout(timeout);
      if (!origin) reject(Error("本机服务意外退出"));
      else if (!closing && !transitioning) {
        dialog.showErrorBox("StudyBuddy", "本机服务已退出，请重新打开软件。");
        app.quit();
      }
    });
  });
}
function stopBackend() {
  return new Promise((resolve) => {
    const active = child;
    if (!active || active.exitCode !== null || active.killed) return resolve();
    const timeout = setTimeout(() => {
      active.kill();
      resolve();
    }, 5000);
    active.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    if (active.connected) active.send({ type: "shutdown" });
    else active.kill();
  });
}
function navigateSafely(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("studybuddy://studybuddy/")) {
      event.preventDefault();
      if (url.startsWith("https://")) shell.openExternal(url);
    }
  });
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
}
function openSettings() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 550,
    height: 720,
    parent: mainWindow,
    modal: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  settingsWindow.on("closed", () => (settingsWindow = null));
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  settingsWindow.webContents.on("will-navigate", (e) => e.preventDefault());
  settingsWindow.loadFile(join(__dirname, "settings.html"));
}
function assertSettings(event) {
  if (!settingsWindow || event.sender !== settingsWindow.webContents)
    throw Error("无权访问配置");
}
ipcMain.handle("desktop-config-status", (event) => {
  assertSettings(event);
  return helpers().configStatus(dataRoot);
});
ipcMain.handle("desktop-config-save", async (event, input) => {
  assertSettings(event);
  if (transitioning) throw Error("服务正在更新");
  helpers().saveConfig(dataRoot, input);
  transitioning = true;
  try {
    await stopBackend();
    origin = "";
    await startBackend();
    await mainWindow.loadURL("studybuddy://studybuddy/");
    return helpers().configStatus(dataRoot);
  } finally {
    transitioning = false;
  }
});
async function importOldProject() {
  if (transitioning) return;
  const chosen = await dialog.showOpenDialog(mainWindow, {
    title: "选择旧项目中包含 package.json 的文件夹",
    properties: ["openDirectory"],
  });
  if (chosen.canceled) return;
  try {
    const info = helpers().inspectProject(chosen.filePaths[0]);
    const answer = await dialog.showMessageBox(mainWindow, {
      type: "question",
      title: "导入旧项目",
      message: `找到 ${info.tasks} 项任务，其中 ${info.completed} 项已完成。`,
      detail: `请先关闭旧版启动窗口。导入会替换桌面版当前学习数据，当前数据将自动备份。${info.hasConfig ? "同时复制旧项目的AI配置。" : "未找到旧AI配置，可稍后在“AI配置”中填写。"}原项目不会被修改。`,
      buttons: ["导入", "取消"],
      defaultId: 1,
      cancelId: 1,
    });
    if (answer.response !== 0) return;
    transitioning = true;
    await stopBackend();
    origin = "";
    const result = await helpers().migrateProject(
      chosen.filePaths[0],
      dataRoot,
    );
    await startBackend();
    await mainWindow.loadURL("studybuddy://studybuddy/");
    await dialog.showMessageBox(mainWindow, {
      message: "导入完成",
      detail: `学习记录已迁移。原项目保留，桌面旧数据备份位于：${result.backups}`,
    });
  } catch {
    if (!origin)
      try {
        await startBackend();
      } catch {}
    dialog.showErrorBox(
      "导入未完成",
      "请选择完整旧项目文件夹，并先关闭旧版。原项目未被修改；当前桌面数据的备份可在应用数据目录的 backups 中找到。",
    );
  } finally {
    transitioning = false;
  }
}
async function smoke(backend) {
  try {
    await mainWindow.webContents.executeJavaScript(
      `new Promise((resolve,reject)=>{const end=Date.now()+15000;const poll=()=>{if(document.querySelector('h1'))return resolve(true);if(Date.now()>end)return reject(Error('UI did not render'));setTimeout(poll,50)};poll()})`,
    );
    const unauthorized = await net.fetch(origin + "/api/state");
    if (unauthorized.status !== 403) throw Error("desktop auth failed");
    const result = await mainWindow.webContents.executeJavaScript(
      `(async()=>{const r=await fetch('/api/state');if(!r.ok)throw Error('state failed');const j=await r.json();if(j.state.version!==2||typeof window.require!=='undefined'||typeof window.process!=='undefined')throw Error('isolation failed');const old=j.state.tasks.find(t=>t.title==='桌面持久化自检');if(!old){const body={revision:j.state.revision,task:{subject:'教综',module:'自检',title:'桌面持久化自检',date:'2026-10-27',estimatedMinutes:0,actualMinutes:0,priority:'低',status:'未开始',source:'桌面自动测试',note:'',mastery:'未评估',kind:'其他',deadline:null}};const saved=await fetch('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json','X-StudyBuddy-Intent':'user'},body:JSON.stringify(body)});if(!saved.ok)throw Error('write failed')}const denied=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(denied.status!==403)throw Error('intent guard failed');const persistent=localStorage.getItem('desktop-origin-test');localStorage.setItem('desktop-origin-test','persisted');return {ok:true,previouslySaved:!!old,storagePersisted:persistent==='persisted',origin:location.origin,tasks:j.state.tasks.length}})()`,
    );
    writeFileSync(
      join(dataRoot, "desktop-smoke.json"),
      JSON.stringify({ ...result, port: backend.port, node: backend.node }),
    );
    app.exitCode = 0;
    app.quit();
  } catch (error) {
    writeFileSync(
      join(dataRoot, "desktop-smoke.json"),
      JSON.stringify({ ok: false, error: error.message }),
    );
    app.exitCode = 1;
    app.quit();
  }
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      mkdirSync(dataRoot, { recursive: true });
      const backend = await startBackend();
      protocol.handle("studybuddy", async (request) => {
        const url = new URL(request.url);
        if (url.hostname !== "studybuddy")
          return new Response("Forbidden", { status: 403 });
        if (!origin)
          return new Response(
            JSON.stringify({ error: "本机服务正在重启，请稍后重试" }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          );
        const headers = new Headers();
        for (const name of ["content-type", "accept", "x-studybuddy-intent"]) {
          const value = request.headers.get(name);
          if (value) headers.set(name, value);
        }
        headers.set("X-StudyBuddy-Desktop-Token", token);
        const options = { method: request.method, headers, redirect: "manual" };
        if (!["GET", "HEAD"].includes(request.method))
          options.body = await request.arrayBuffer();
        const response = await net.fetch(
          origin + url.pathname + url.search,
          options,
        );
        const safeHeaders = new Headers(response.headers);
        safeHeaders.delete("set-cookie");
        safeHeaders.set(
          "Access-Control-Allow-Origin",
          "studybuddy://studybuddy",
        );
        safeHeaders.set(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-src 'none'",
        );
        return new Response(response.body, {
          status: response.status,
          headers: safeHeaders,
        });
      });
      mainWindow = new BrowserWindow({
        width: 1440,
        height: 1000,
        minWidth: 700,
        minHeight: 600,
        show: false,
        title: "StudyBuddy",
        backgroundColor: "#1e1e24",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      navigateSafely(mainWindow);
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "StudyBuddy",
            submenu: [
              { label: "导入旧项目…", click: importOldProject },
              { label: "AI 配置…", click: openSettings },
              { label: "打开数据目录", click: () => shell.openPath(dataRoot) },
              { type: "separator" },
              { role: "quit", label: "退出" },
            ],
          },
          {
            label: "编辑",
            submenu: [
              { role: "undo" },
              { role: "redo" },
              { type: "separator" },
              { role: "cut" },
              { role: "copy" },
              { role: "paste" },
              { role: "selectAll" },
            ],
          },
          {
            label: "视图",
            submenu: [
              { role: "reload" },
              { role: "resetZoom" },
              { role: "zoomIn" },
              { role: "zoomOut" },
              { role: "togglefullscreen" },
            ],
          },
        ]),
      );
      await mainWindow.loadURL("studybuddy://studybuddy/");
      if (process.argv.includes("--smoke-test")) await smoke(backend);
      else mainWindow.show();
    })
    .catch(() => {
      dialog.showErrorBox(
        "StudyBuddy启动失败",
        "无法启动本机服务。请确认已完整解压桌面版文件夹，而不是只复制一个exe。",
      );
      app.exit(1);
    });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (quitAllowed) return;
    event.preventDefault();
    closing = true;
    stopBackend().finally(() => {
      quitAllowed = true;
      app.exit(app.exitCode || 0);
    });
  });
}
