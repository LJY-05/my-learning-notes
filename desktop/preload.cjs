const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("studybuddySettings", {
  status: () => ipcRenderer.invoke("desktop-config-status"),
  save: (input) => ipcRenderer.invoke("desktop-config-save", input),
});
