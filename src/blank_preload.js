const { contextBridge } = require('electron')
const settings = require('./settings')
const appearance = settings.getSync('title-bar') || '0'
contextBridge.exposeInMainWorld('appearance', appearance)