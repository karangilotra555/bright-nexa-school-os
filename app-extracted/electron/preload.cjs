const { contextBridge, ipcRenderer } = require("electron");

const api = {
  googleDrive: {
    status: () => ipcRenderer.invoke("google-drive:status"),
    configure: (credentials) => ipcRenderer.invoke("google-drive:configure", credentials),
    connect: (preferredEmail) => ipcRenderer.invoke("google-drive:connect", preferredEmail),
    disconnect: () => ipcRenderer.invoke("google-drive:disconnect"),
    uploadBackup: (fileName, bytes) => ipcRenderer.invoke("google-drive:upload-backup", { fileName, bytes }),
    downloadLatest: () => ipcRenderer.invoke("google-drive:download-latest"),
  },
  softwareUpdate: {
    status: () => ipcRenderer.invoke("software-update:status"),
    check: () => ipcRenderer.invoke("software-update:check"),
    download: () => ipcRenderer.invoke("software-update:download"),
    install: () => ipcRenderer.invoke("software-update:install"),
    openReleases: () => ipcRenderer.invoke("software-update:open-releases"),
    onStatus: (callback) => {
      const listener = (_event, status) => callback(status);
      ipcRenderer.on("software-update:status", listener);
      return () => ipcRenderer.removeListener("software-update:status", listener);
    },
  },
  whatsapp: {
    getConfig: () => ipcRenderer.invoke("whatsapp:get-config"),
    saveConfig: (patch) => ipcRenderer.invoke("whatsapp:save-config", patch),
    sendFeeReminder: (payload) => ipcRenderer.invoke("whatsapp:send-fee-reminder", payload),
    sendAbsentAlert: (payload) => ipcRenderer.invoke("whatsapp:send-absent-alert", payload),
    sendReceipt: (payload) => ipcRenderer.invoke("whatsapp:send-receipt", payload),
    triggerScheduler: () => ipcRenderer.invoke("whatsapp:trigger-scheduler"),
  },
};

contextBridge.exposeInMainWorld("brightNexa", api);
contextBridge.exposeInMainWorld("bharatSchool", api);
