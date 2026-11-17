// Exposes a small, typed API to the renderer. Nothing else from Node/Electron leaks through.
import { contextBridge, ipcRenderer } from "electron";
import type { LogbookApi } from "../shared/api";

const api: LogbookApi = {
  load: () => ipcRenderer.invoke("db:load"),
  save: (db) => ipcRenderer.invoke("db:save", db),
  saveSync: (db) => { ipcRenderer.sendSync("db:save-sync", db); },
  notify: (title, body) => ipcRenderer.send("notify", title, body),
  openFile: () => ipcRenderer.invoke("file:open"),
  saveFile: (name, content) => ipcRenderer.invoke("file:save", name, content),
};

contextBridge.exposeInMainWorld("logbook", api);
