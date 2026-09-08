'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('moaonHub', Object.freeze({
  connect: () => ipcRenderer.invoke('moaon-hub:connect'),
  refresh: () => ipcRenderer.invoke('moaon-hub:refresh'),
  disconnect: () => ipcRenderer.invoke('moaon-hub:disconnect'),
}));
