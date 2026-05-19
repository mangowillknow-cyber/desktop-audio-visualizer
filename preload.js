const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAudioSourceId: () => ipcRenderer.invoke('get-audio-source-id'),
  togglePassthrough: (enable) => ipcRenderer.send('toggle-passthrough', enable),
  toggleOnTop: (enable) => ipcRenderer.send('toggle-ontop', enable),
  onPassthroughChanged: (callback) => ipcRenderer.on('passthrough-changed', (_, val) => callback(val)),
  onOnTopChanged: (callback) => ipcRenderer.on('ontop-changed', (_, val) => callback(val)),
});
