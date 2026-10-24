import {
  app,
  BrowserWindow,
  protocol,
  net,
  ipcMain,
  dialog,
  session,
} from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GameLibrary } from "./library";
protocol.registerSchemesAsPrivileged([
  {
    scheme: "atlas",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
const base = path.dirname(fileURLToPath(import.meta.url));
let library: GameLibrary | null = null;
let settings: { root?: string; lastMission?: string } = {};
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(name + "="))?.slice(name.length + 1);
if (arg("--user-data")) app.setPath("userData", arg("--user-data")!);
async function save() {
  const file = path.join(app.getPath("userData"), "viewer.json");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file + ".tmp", JSON.stringify(settings, null, 2));
  await fs.rename(file + ".tmp", file);
}
const result = async (fn: () => Promise<unknown>) => {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};
void app
  .whenReady()
  .then(async () => {
    try {
      settings = JSON.parse(
        await fs.readFile(
          path.join(app.getPath("userData"), "viewer.json"),
          "utf8",
        ),
      );
    } catch {}
    if (arg("--game-root")) settings.root = arg("--game-root");
    protocol.handle("atlas", async (request) => {
      const url = new URL(request.url);
      if (url.host !== "viewer")
        return new Response("Forbidden", { status: 403 });
      const rel =
        decodeURIComponent(url.pathname).replace(/^\//, "") || "index.html";
      const root = path.resolve(base, "../dist"),
        file = path.resolve(root, rel);
      if (!file.startsWith(root + path.sep))
        return new Response("Forbidden", { status: 403 });
      return net.fetch(pathToFileURL(file).href);
    });
    session.defaultSession.setPermissionRequestHandler(
      (_wc, _permission, callback) => callback(false),
    );
    for (const [channel, handler] of Object.entries({
      "viewer:bootstrap": async () => {
        if (!library && settings.root) {
          try {
            library = await GameLibrary.open(settings.root);
          } catch {
            settings.root = undefined;
          }
        }
        return library?.info(settings.lastMission ?? null) ?? null;
      },
      "viewer:folder": async () => {
        const selected = await dialog.showOpenDialog({
          title: "Choose your Uprising game folder",
          properties: ["openDirectory"],
        });
        if (selected.canceled)
          return library?.info(settings.lastMission ?? null) ?? null;
        const candidate = await GameLibrary.open(selected.filePaths[0]);
        library = candidate;
        settings = { root: library.root };
        await save();
        return library.info(null);
      },
      "viewer:level": async (id: unknown, playerTechnology: unknown = 0) => {
        if (!library || typeof id !== "string")
          throw new Error("Choose a game folder first");
        if (
          typeof playerTechnology !== "number" ||
          !Number.isInteger(playerTechnology) ||
          playerTechnology < 0 ||
          playerTechnology > 4
        )
          throw new Error("Invalid player technology");
        const level = await library.load(id, playerTechnology);
        settings.lastMission = id;
        await save();
        return level;
      },
    })) {
      ipcMain.handle(channel, (event, ...args) => {
        if (!event.senderFrame?.url.startsWith("atlas://viewer/"))
          throw new Error("Forbidden");
        return result(() => handler(args[0], args[1]));
      });
    }
    function createWindow() {
      const win = new BrowserWindow({
        width: 1440,
        height: 960,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: "#141c1e",
        autoHideMenuBar: true,
        title: "Uprising Level Explorer",
        icon: path.join(base, "../dist/app-icon.png"),
        webPreferences: {
          preload: path.join(base, "preload.cjs"),
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith("atlas://viewer/")) event.preventDefault();
      });
      void win.loadURL("atlas://viewer/index.html");
    }
    createWindow();
    app.on("activate", () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    });
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
