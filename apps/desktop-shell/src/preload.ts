import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("researchWorkstation", {
  openUserData: () => ipcRenderer.invoke("desktop:open-user-data"),
  coreStatus: () => ipcRenderer.invoke("desktop:core-status"),
  onNotice: (listener: (message: string) => void) => {
    ipcRenderer.on("desktop:notice", (_event, message) => {
      if (typeof message === "string") {
        listener(message);
      }
    });
  }
});
