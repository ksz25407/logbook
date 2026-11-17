// Electron main process: one window that hides to the system tray, a global
// show/hide hotkey, data storage, notifications and file dialogs over IPC.
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, Notification, shell, Tray } from "electron";
import fs from "node:fs";
import path from "node:path";
import { Store } from "./store";
import { ICON_16, ICON_32, ICON_256 } from "./icon";
import type { Db } from "../shared/types";

const devUrl = process.env.VITE_DEV_SERVER_URL;
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let toldAboutTray = false;
const live = new Set<Notification>();

if (!app.requestSingleInstanceLock()) app.exit(0);
app.setAppUserModelId("com.logbook.app"); // must match the installer's appId for notifications

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function toggleWindow() {
  if (win?.isVisible() && win.isFocused()) win.hide();
  else showWindow();
}

function notify(title: string, body: string) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: nativeImage.createFromBuffer(Buffer.from(ICON_256, "base64")) });
  live.add(n); // keep a reference so the click handler isn't garbage-collected
  n.on("click", () => { showWindow(); live.delete(n); });
  n.on("close", () => live.delete(n));
  n.show();
}

app.on("second-instance", showWindow);

app.whenReady().then(() => {
  const store = new Store(app.getPath("userData"));

  ipcMain.handle("db:load", () => store.load());
  ipcMain.handle("db:save", (_e, db: Db) => store.save(db));
  ipcMain.on("db:save-sync", (e, db: Db) => {
    try { store.save(db); e.returnValue = true; } catch (err) { console.error(err); e.returnValue = false; }
  });
  ipcMain.on("notify", (_e, title: string, body: string) => notify(String(title), String(body)));

  ipcMain.handle("file:open", async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: "Import into LOGBOOK",
      properties: ["openFile"],
      filters: [{ name: "LOGBOOK / notepad", extensions: ["json", "txt", "md"] }, { name: "All files", extensions: ["*"] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const file = r.filePaths[0];
    if (fs.statSync(file).size > 20 * 1024 * 1024) throw new Error("file is larger than 20 MB");
    return { name: path.basename(file), text: fs.readFileSync(file, "utf8") };
  });

  ipcMain.handle("file:save", async (_e, defaultName: string, content: string) => {
    const r = await dialog.showSaveDialog(win!, {
      title: "Export LOGBOOK",
      defaultPath: path.join(app.getPath("documents"), path.basename(String(defaultName))),
    });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, String(content), "utf8");
    return r.filePath;
  });

  Menu.setApplicationMenu(null);
  createWindow();
  createTray();

  const hotkey = store.load().db.settings.hotkey || "Ctrl+Alt+L";
  try {
    if (!globalShortcut.register(hotkey, toggleWindow)) console.error(`hotkey ${hotkey} is taken by another app`);
  } catch (err) {
    console.error(`invalid hotkey ${hotkey}`, err);
  }
});

app.on("before-quit", () => { quitting = true; });
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => { if (quitting) app.quit(); });

function createTray() {
  const img = nativeImage.createFromBuffer(Buffer.from(ICON_16, "base64"), { scaleFactor: 1 });
  img.addRepresentation({ scaleFactor: 2, buffer: Buffer.from(ICON_32, "base64") });
  tray = new Tray(img);
  tray.setToolTip("LOGBOOK  (Ctrl+Alt+L)");
  tray.on("click", toggleWindow);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show LOGBOOK", click: showWindow },
      { label: "Hide", click: () => win?.hide() },
      { type: "separator" },
      { label: "Quit", click: () => { quitting = true; app.quit(); } },
    ]),
  );
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: "#000000",
    title: "LOGBOOK",
    icon: nativeImage.createFromBuffer(Buffer.from(ICON_256, "base64")),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false, // keep the focus timer and reminder accurate while hidden
    },
  });

  win.once("ready-to-show", () => win?.show());

  // Closing the window hides it to the tray; Quit from the tray menu really quits.
  win.on("session-end", () => { quitting = true; }); // Windows logoff/shutdown: don't block it
  win.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    win?.hide();
    if (!toldAboutTray) {
      toldAboutTray = true;
      notify("LOGBOOK is still running", "It lives in the system tray. Ctrl+Alt+L shows it again.");
    }
  });

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
