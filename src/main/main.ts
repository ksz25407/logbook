// Electron main process: one window, data storage over IPC.
import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import path from "node:path";
import { Store } from "./store";
import type { Db } from "../shared/types";

const devUrl = process.env.VITE_DEV_SERVER_URL;
let win: BrowserWindow | null = null;

if (!app.requestSingleInstanceLock()) app.quit();

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.whenReady().then(() => {
  const store = new Store(app.getPath("userData"));

  ipcMain.handle("db:load", () => store.load());
  ipcMain.handle("db:save", (_e, db: Db) => store.save(db));
  ipcMain.on("db:save-sync", (e, db: Db) => {
    try { store.save(db); e.returnValue = true; } catch (err) { console.error(err); e.returnValue = false; }
  });

  Menu.setApplicationMenu(null);
  createWindow();
});

app.on("window-all-closed", () => app.quit());

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: "#000000",
    title: "LOGBOOK",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.once("ready-to-show", () => win?.show());

  // Keep the app on its own page; open external links in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());

  // F12 opens DevTools in development only.
  win.webContents.on("before-input-event", (_e, input) => {
    if (devUrl && input.type === "keyDown" && input.key === "F12") win?.webContents.toggleDevTools();
  });

  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, "../dist/index.html"));

  win.on("closed", () => (win = null));
}
