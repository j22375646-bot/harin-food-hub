'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('moaonHub', Object.freeze({
  connect: () => ipcRenderer.invoke('moaon-hub:connect'),
  refresh: () => ipcRenderer.invoke('moaon-hub:refresh'),
  nextPage: () => ipcRenderer.invoke('moaon-hub:next-page'),
  previousPage: () => ipcRenderer.invoke('moaon-hub:previous-page'),
  disconnect: () => ipcRenderer.invoke('moaon-hub:disconnect'),
}));
