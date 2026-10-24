const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Add IPC calls here as needed
});
