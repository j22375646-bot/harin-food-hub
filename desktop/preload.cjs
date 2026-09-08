'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('moaonHub', Object.freeze({
  appInfo: () => ipcRenderer.invoke('moaon-hub:app-info'),
  inspectPrinters: () => ipcRenderer.invoke('moaon-hub:inspect-printers'),
  previewLabel: (id) => ipcRenderer.invoke('moaon-hub:preview-label',id),
  issueShipment: (id) => ipcRenderer.invoke('moaon-hub:issue-shipment',id),
  checkShipment: (id) => ipcRenderer.invoke('moaon-hub:check-shipment',id),
  confirmShipmentReview: (id) => ipcRenderer.invoke('moaon-hub:confirm-shipment-review',id),
  connect: () => ipcRenderer.invoke('moaon-hub:connect'),
  refresh: () => ipcRenderer.invoke('moaon-hub:refresh'),
  recheckPage: () => ipcRenderer.invoke('moaon-hub:recheck-page'),
  nextPage: () => ipcRenderer.invoke('moaon-hub:next-page'),
  previousPage: () => ipcRenderer.invoke('moaon-hub:previous-page'),
  viewActive: () => ipcRenderer.invoke('moaon-hub:view-active'),
  viewRegistered: () => ipcRenderer.invoke('moaon-hub:view-registered'),
  viewInTransit: () => ipcRenderer.invoke('moaon-hub:view-in-transit'),
  viewCompleted: () => ipcRenderer.invoke('moaon-hub:view-completed'),
  disconnect: () => ipcRenderer.invoke('moaon-hub:disconnect'),
}));
