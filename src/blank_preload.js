const { contextBridge } = require("electron")
const settings = require('electron-settings')
const appearance = settings.getSync('title-bar') || '0'
contextBridge.exposeInMainWorld("appearance", appearance)