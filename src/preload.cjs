const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("maddenAPI", {
  pickFranchise: () => ipcRenderer.invoke("pick-franchise"),
  parseFranchise: (filePath) => ipcRenderer.invoke("parse-franchise", filePath),
  reparseFranchise: () => ipcRenderer.invoke("reparse-franchise"),
  loadAppState: () => ipcRenderer.invoke("load-app-state"),
  saveAppState: (state) => ipcRenderer.invoke("save-app-state", state),
  onFranchiseSaveChanged: (callback) => ipcRenderer.on("franchise-save-changed", (_event, data) => callback(data)),
  minimizeWindow: () => ipcRenderer.send("window-minimize"),
  toggleMaximizeWindow: () => ipcRenderer.send("window-toggle-maximize"),
  closeWindow: () => ipcRenderer.send("window-close"),
  startMobile: () => ipcRenderer.invoke("mobile-start"),
  stopMobile: () => ipcRenderer.invoke("mobile-stop"),
  mobileStatus: () => ipcRenderer.invoke("mobile-status"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url)
});
