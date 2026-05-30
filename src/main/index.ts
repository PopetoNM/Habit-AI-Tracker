import { app, BrowserWindow, session, shell } from "electron";
import { join } from "node:path";
import { HabitRepository } from "./db/repository";
import { registerIpc } from "./ipc/register";

let mainWindow: BrowserWindow | null = null;
let repository: HabitRepository | null = null;

const isDev = !app.isPackaged;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1180,
    minHeight: 760,
    title: "Habit OS",
    backgroundColor: "#f2eee6",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" || parsed.protocol === "mailto:") {
        shell.openExternal(url);
      }
    } catch {
      return { action: "deny" };
    }
    return { action: "deny" };
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      const mediaDetails = details as { mediaTypes?: string[] };
      if (
        permission === "media" &&
        (mediaDetails.mediaTypes?.includes("audio") ?? true)
      ) {
        callback(true);
        return;
      }
      callback(false);
    },
  );
  const userData = app.getPath("userData");
  repository = new HabitRepository(
    join(userData, "habit-os.sqlite"),
    join(userData, "backups"),
  );
  registerIpc(repository, () => mainWindow);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  repository?.db.close();
});
