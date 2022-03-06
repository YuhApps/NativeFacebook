const app = require('electron').app || require('@electron/remote').app
const fs = require('fs')
const path = require('path')

const CONFIG_JSON_PATH = app.getPath('userData') + path.sep + 'settings.json'

let settings

module.exports.get = function(key) {
    if (settings) {
        return settings[key]
    } else if (fs.existsSync(CONFIG_JSON_PATH)) {
        settings = JSON.parse(fs.readFileSync(CONFIG_JSON_PATH, 'utf-8')) || {}
        return settings[key]
    } else {
        fs.writeFileSync(CONFIG_JSON_PATH, JSON.stringify({}))
        return undefined
    }
}

module.exports.refresh = function() {
    if (fs.existsSync(CONFIG_JSON_PATH)) {
        settings = JSON.parse(fs.readFileSync(CONFIG_JSON_PATH, 'utf-8')) || {}
    } else {
        fs.writeFileSync(CONFIG_JSON_PATH, JSON.stringify({}))
        settings = {}
    }
}

module.exports.set = function(key, value) {
    settings[key] = value
    if (fs.existsSync(CONFIG_JSON_PATH)) {
        let json = JSON.parse(fs.readFileSync(CONFIG_JSON_PATH, 'utf-8')) || {}
        json[key] = value
        fs.writeFileSync(CONFIG_JSON_PATH, JSON.stringify(json))
    } else {
        fs.writeFileSync(CONFIG_JSON_PATH, JSON.stringify({ key: value }))
    }
}