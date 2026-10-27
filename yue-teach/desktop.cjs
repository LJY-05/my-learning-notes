const {
  app,
  BrowserWindow,
  Menu,
  protocol,
  net,
  shell,
  dialog,
} = require("electron");
const { fork } = require("node:child_process");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
app.setName("YueTeach");
app.disableHardwareAcceleration();
if (process.env.YUETEACH_DESKTOP_DATA)
  app.setPath("userData", process.env.YUETEACH_DESKTOP_DATA);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "yueteach",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
const token = randomUUID();
let worker,
  origin = "",
  win,
  quitting = false,
  allowed = false;
function createShortcut() {
  if (process.platform !== "win32") return;
  const target = process.execPath;
  const ok = shell.writeShortcutLink(
    join(app.getPath("desktop"), "粤教上岸.lnk"),
    "create",
    {
      target,
      cwd: require("node:path").dirname(target),
      description: "广东教招与每日时政练习",
      icon: target,
      iconIndex: 0,
    },
  );
  if (!ok)
    throw Error("桌面快捷方式创建失败，可右键 YueTeach.exe 手动创建快捷方式");
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      const base = app.isPackaged
        ? join(process.resourcesPath, "app.asar.unpacked")
        : __dirname;
      const env = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        PORT: "0",
        YUETEACH_DATA: app.getPath("userData"),
        YUETEACH_TOKEN: token,
        YUETEACH_STUDYBUDDY_ENV: join(
          app.getPath("appData"),
          "StudyBuddy",
          ".env",
        ),
      };
      delete env.NODE_OPTIONS;
      if (process.env.YUETEACH_SMOKE) env.YUETEACH_NO_AUTO = "1";
      worker = fork(join(base, "server.mjs"), [], {
        execPath: process.execPath,
        execArgv: [],
        env,
        windowsHide: true,
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("本机服务启动超时")),
          30000,
        );
        worker.on("message", (m) => {
          if (m?.type === "ready") {
            clearTimeout(timer);
            origin = `http://127.0.0.1:${m.port}`;
            resolve();
          }
        });
        worker.once("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
        worker.once("exit", () => {
          clearTimeout(timer);
          if (!origin) reject(Error("本机服务启动失败"));
          else if (!quitting) {
            dialog.showErrorBox("粤教上岸", "内部服务已退出，请重新打开应用。");
            app.quit();
          }
        });
      });
      protocol.handle("yueteach", async (req) => {
        const u = new URL(req.url);
        if (u.hostname !== "app")
          return new Response("Forbidden", { status: 403 });
        const headers = { "x-yueteach-token": token };
        for (const key of ["content-type", "accept", "x-yueteach-intent"])
          if (req.headers.has(key)) headers[key] = req.headers.get(key);
        try {
          const r = await net.fetch(origin + u.pathname + u.search, {
            method: req.method,
            headers,
            ...(!["GET", "HEAD"].includes(req.method)
              ? { body: await req.arrayBuffer() }
              : {}),
            bypassCustomProtocolHandlers: true,
          });
          const h = new Headers(r.headers);
          h.delete("set-cookie");
          h.set("access-control-allow-origin", "yueteach://app");
          return new Response(await r.arrayBuffer(), {
            status: r.status,
            headers: h,
          });
        } catch {
          return new Response("服务暂不可用", { status: 503 });
        }
      });
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "粤教上岸",
            submenu: [
              {
                label: "创建桌面快捷方式",
                enabled: process.platform === "win32",
                click: () => {
                  try {
                    createShortcut();
                    dialog.showMessageBox(win, {
                      message: "桌面快捷方式已创建，请保留当前完整程序文件夹。",
                    });
                  } catch (e) {
                    dialog.showErrorBox("粤教上岸", e.message);
                  }
                },
              },
              {
                label: "打开数据目录",
                click: () => shell.openPath(app.getPath("userData")),
              },
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
              { role: "reload", label: "刷新页面" },
              { role: "resetZoom", label: "实际大小" },
              { role: "zoomIn", label: "放大" },
              { role: "zoomOut", label: "缩小" },
              { role: "togglefullscreen", label: "全屏" },
            ],
          },
        ]),
      );
      win = new BrowserWindow({
        width: 1370,
        height: 940,
        minWidth: 820,
        minHeight: 620,
        title: "粤教上岸",
        backgroundColor: "#ffffff",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("https://")) shell.openExternal(url);
        return { action: "deny" };
      });
      win.webContents.on("will-navigate", (e, url) => {
        if (!url.startsWith("yueteach://app/")) {
          e.preventDefault();
          if (url.startsWith("https://")) shell.openExternal(url);
        }
      });
      // Electron 默认下载处理会弹出保存位置，无需将文件写入应用安装目录。
      await win.loadURL("yueteach://app/");
      if (process.env.YUETEACH_SMOKE) {
        await win.webContents.executeJavaScript(
          `new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(document.querySelector('h1')){clearInterval(timer);resolve();}else if(n++>100){clearInterval(timer);reject(Error('UI initialization timeout'));}},50);})`,
        );
        const result = await win.webContents.executeJavaScript(
          `(async()=>({heading:document.querySelector('h1')?.textContent,state:await(await fetch('/api/state')).json(),isolated:typeof require==='undefined'&&typeof process==='undefined'}))()`,
        );
        require("node:fs").writeFileSync(
          join(app.getPath("userData"), "smoke.json"),
          JSON.stringify({
            heading: result.heading,
            isolated: result.isolated,
            day: result.state.day,
            profile: result.state.profile,
            port: origin,
            node: process.versions.node,
          }),
        );
        app.quit();
      }
    })
    .catch((e) => {
      if (process.env.YUETEACH_SMOKE) {
        console.error(e);
        require("node:fs").mkdirSync(app.getPath("userData"), {
          recursive: true,
        });
        require("node:fs").writeFileSync(
          join(app.getPath("userData"), "smoke-error.txt"),
          e.stack || e.message,
        );
      } else dialog.showErrorBox("粤教上岸", e.message);
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (e) => {
    if (allowed) return;
    e.preventDefault();
    if (quitting) return;
    quitting = true;
    const done = () => {
      allowed = true;
      app.quit();
    };
    if (!worker || worker.exitCode !== null) return done();
    const timer = setTimeout(() => {
      worker.kill();
      done();
    }, 5000);
    worker.once("exit", () => {
      clearTimeout(timer);
      done();
    });
    if (worker.connected) worker.send({ type: "shutdown" });
    else worker.kill();
  });
}
