import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("viewer", {
  bootstrap: () => ipcRenderer.invoke("viewer:bootstrap"),
  chooseFolder: () => ipcRenderer.invoke("viewer:folder"),
  loadLevel: (id: string, playerTechnology = 0) =>
    ipcRenderer.invoke("viewer:level", id, playerTechnology),
});
