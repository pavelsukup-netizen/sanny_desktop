const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sanny', {
  openConsole: () => ipcRenderer.invoke('open-console'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: patch => ipcRenderer.invoke('set-config', patch),
  health: () => ipcRenderer.invoke('health'),
  chat: payload => ipcRenderer.invoke('chat', payload),
  speak: text => ipcRenderer.invoke('speak', text),
  stopSpeech: () => ipcRenderer.invoke('stop-speech'),
  assetInfo: () => ipcRenderer.invoke('asset-info'),
  openAssets: () => ipcRenderer.invoke('open-assets'),
  saveVoiceSample: data => ipcRenderer.invoke('save-voice-sample', data),
  listVoiceSamples: () => ipcRenderer.invoke('list-voice-samples'),
  operator: action => ipcRenderer.invoke('operator', action)
});
