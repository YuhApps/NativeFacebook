const { contextBridge } = require('electron')
const settings = require('./settings')
const appearance = settings.get('title-bar') || '0'
contextBridge.exposeInMainWorld('appearance', appearance)