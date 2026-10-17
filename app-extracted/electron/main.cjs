const { app, BrowserWindow, ipcMain, safeStorage, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("node:path");
const { registerGoogleDriveHandlers } = require("./googleDrive.cjs");
const whatsappService = require("./whatsapp/whatsappService.cjs");
const whatsappScheduler = require("./whatsapp/scheduler.cjs");

const OFFICIAL_RELEASES_URL =
  "https://github.com/amankingofai/bright-nexa-school-os-releases/releases/latest";

let updateStatus = {
  phase: "idle",
  currentVersion: app.getVersion(),
  availableVersion: "",
  releaseName: "",
  releaseDate: "",
  releaseNotes: "",
  percent: 0,
  message: "Updates are checked securely from the official Bright Nexa release channel.",
  releasesUrl: OFFICIAL_RELEASES_URL,
};

app.setName("Bright Nexa");
// GPU-driver instability is a common source of Electron freezes on older school PCs.
// The interface is lightweight, so reliable software rendering is the safer default.
app.disableHardwareAcceleration();

const hasSingleInstanceLock = app.requestSingleInstanceLock();
let mainWindow;

function publishUpdateStatus(patch = {}) {
  updateStatus = { ...updateStatus, ...patch, currentVersion: app.getVersion() };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("software-update:status", updateStatus);
  }
  return updateStatus;
}

function releaseNotesText(notes) {
  if (typeof notes === "string") return notes.slice(0, 4000);
  if (Array.isArray(notes)) {
    return notes
      .map((item) => (typeof item?.note === "string" ? item.note : ""))
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000);
  }
  return "";
}

function friendlyUpdateError(error) {
  const message = String(error?.message || error || "");
  if (/404|latest\.yml|no published versions/i.test(message)) {
    return "No public update release has been published yet.";
  }
  if (/net::|ENOTFOUND|ETIMEDOUT|ECONN|internet|network/i.test(message)) {
    return "The update service could not be reached. Check the internet connection and try again.";
  }
  return "The update check could not be completed safely. Please try again later.";
}

function registerSoftwareUpdateHandlers() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("checking-for-update", () =>
    publishUpdateStatus({
      phase: "checking",
      percent: 0,
      message: "Checking the official Bright Nexa release channel…",
    }),
  );
  autoUpdater.on("update-available", (info) =>
    publishUpdateStatus({
      phase: "available",
      availableVersion: info.version || "",
      releaseName: info.releaseName || `Bright Nexa ${info.version || "update"}`,
      releaseDate: info.releaseDate || "",
      releaseNotes: releaseNotesText(info.releaseNotes),
      percent: 0,
      message: `Version ${info.version} is available. Create the encrypted safety backup before downloading.`,
    }),
  );
  autoUpdater.on("update-not-available", () =>
    publishUpdateStatus({
      phase: "current",
      availableVersion: "",
      releaseName: "",
      releaseDate: "",
      releaseNotes: "",
      percent: 0,
      message: "This computer already has the latest published version.",
    }),
  );
  autoUpdater.on("download-progress", (progress) =>
    publishUpdateStatus({
      phase: "downloading",
      percent: Math.max(0, Math.min(100, Math.round(progress.percent || 0))),
      message: `Downloading and verifying the official update… ${Math.round(progress.percent || 0)}%`,
    }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    publishUpdateStatus({
      phase: "ready",
      availableVersion: info.version || updateStatus.availableVersion,
      percent: 100,
      message: "The update was downloaded and cryptographically verified. It is ready to install.",
    }),
  );
  autoUpdater.on("error", (error) =>
    publishUpdateStatus({
      phase: "error",
      percent: 0,
      message: friendlyUpdateError(error),
    }),
  );

  ipcMain.handle("software-update:status", () => updateStatus);
  ipcMain.handle("software-update:check", async () => {
    if (!app.isPackaged) {
      return publishUpdateStatus({
        phase: "development",
        message: "Update checks are available in the installed Windows application.",
      });
    }
    if (["checking", "downloading"].includes(updateStatus.phase)) return updateStatus;
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      publishUpdateStatus({ phase: "error", message: friendlyUpdateError(error) });
    }
    return updateStatus;
  });
  ipcMain.handle("software-update:download", async () => {
    if (updateStatus.phase !== "available") return updateStatus;
    try {
      publishUpdateStatus({ phase: "downloading", percent: 0, message: "Starting the verified update download…" });
      await autoUpdater.downloadUpdate();
    } catch (error) {
      publishUpdateStatus({ phase: "error", message: friendlyUpdateError(error) });
    }
    return updateStatus;
  });
  ipcMain.handle("software-update:install", () => {
    if (updateStatus.phase !== "ready") return updateStatus;
    publishUpdateStatus({ message: "Closing Bright Nexa and installing the verified update…" });
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return updateStatus;
  });
  ipcMain.handle("software-update:open-releases", async () => {
    await shell.openExternal(OFFICIAL_RELEASES_URL);
    return true;
  });
}

function registerWhatsAppHandlers() {
  ipcMain.handle("whatsapp:get-config", async () => {
    return whatsappService.loadConfig();
  });
  ipcMain.handle("whatsapp:save-config", async (_event, patch) => {
    return whatsappService.saveConfig(patch);
  });
  ipcMain.handle("whatsapp:send-fee-reminder", async (_event, payload) => {
    return whatsappService.sendFeeDueReminder(payload);
  });
  ipcMain.handle("whatsapp:send-absent-alert", async (_event, payload) => {
    return whatsappService.sendAbsentAlert(payload);
  });
  ipcMain.handle("whatsapp:send-receipt", async (_event, payload) => {
    return whatsappService.sendPaymentReceiptNotification(payload);
  });
  ipcMain.handle("whatsapp:trigger-scheduler", async () => {
    return whatsappScheduler.runScheduledChecks();
  });

  try {
    whatsappScheduler.startScheduler();
  } catch (err) {
    console.error("[WhatsApp] Could not start scheduler:", err.message);
  }
}


function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    icon: path.join(__dirname, "..", "dist", "app-icon-512.png"),
    backgroundColor: "#f3f7fb",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) {
      event.preventDefault();
      if (url.startsWith("https://")) shell.openExternal(url);
    }
  });

  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    if (
      details.reason !== "clean-exit" &&
      !window.isDestroyed() &&
      !window.webContents.isDestroyed()
    ) {
      window.webContents.reload();
    }
  });
  window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  mainWindow = window;
  return window;
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      createWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    registerGoogleDriveHandlers({ ipcMain, app, shell, safeStorage });
    registerSoftwareUpdateHandlers();
    registerWhatsAppHandlers();
    createWindow();
    if (app.isPackaged) {
      setTimeout(() => {
        if (updateStatus.phase === "idle") {
          void autoUpdater.checkForUpdates().catch((error) =>
            publishUpdateStatus({ phase: "error", message: friendlyUpdateError(error) }),
          );
        }
      }, 15000);
    }
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
