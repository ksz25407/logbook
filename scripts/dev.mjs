// Dev runner: Vite dev server for the UI, Vite watch build for main/preload,
// and (re)starts Electron whenever main/preload are rebuilt.
import { createServer, build } from "vite";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const electronPath = createRequire(import.meta.url)("electron");

const server = await createServer({ configFile: "vite.config.ts" });
await server.listen();
const url = `http://localhost:${server.config.server.port}`;
console.log(`[dev] renderer at ${url}`);

let child = null;
function restartElectron() {
  if (child) { child.removeAllListeners("exit"); child.kill(); }
  child = spawn(electronPath, ["."], {
    stdio: "inherit",
    env: { ...process.env, VITE_DEV_SERVER_URL: url },
  });
  child.on("exit", () => { server.close(); process.exit(0); });
}

const watcher = await build({ configFile: "vite.main.config.ts", build: { watch: {} }, logLevel: "warn" });
watcher.on("event", (e) => {
  if (e.code === "END") { console.log("[dev] main rebuilt, starting electron"); restartElectron(); }
  if (e.code === "ERROR") console.error(e.error);
});
