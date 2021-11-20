const { app, BrowserWindow, clipboard, dialog, Menu, MenuItem, nativeImage, nativeTheme, powerMonitor, shell, screen, systemPreferences, TouchBar } = require('electron')
const { setup: setuPushReceiver } = require('electron-push-receiver')
const settings = require('electron-settings')
const { platform } = require('os')
const path = require('path')
const validUrlUtf8 = require('valid-url-utf8')

const DEFAULT_WINDOW_BOUNDS = { x: undefined, y: undefined, width: 1280, height: 800 }
const FACEBOOK_URL = 'https://www.facebook.com'
const MESSENGER_URL = 'https://www.messenger.com'
const INSTAGRAM_URL = 'https://www.instagram.com'
const FACEBOOK = 'facebook'
const MESSENGER = 'messenger'
const INSTAGRAM = 'instagram'
const PIP_JS_EXE =
    `
    if (document.pictureInPictureEnabled) {
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture();
      } else {
        let videos = document.querySelectorAll('video');
        for (let i = 0; i < videos.length; i++) {
          let video = videos[i];
          if (!video.paused) {
            video.requestPictureInPicture().then((res) => {
              video.setAttribute('__pip__', true);
              video.addEventListener('leavepictureinpicture', (e) => {
                video.removeAttribute('__pip__');
              })
            }).catch((error) => console.log(error));
            break;
          }
        }
      }
    }
    `

let aboutWindow, downloadsWindow, mainWindow, prefsWindow, ongoingDownloads = []

/** Basic Electron app events: */

app.whenReady().then(() => {
    requestCameraAndMicrophonePermissions()
    createMainWindow()
    if (process.platform === 'darwin') {
        createAppMenu()
        createDockActions()
    } else {
        Menu.setApplicationMenu(null)
    }
})

app.on('activate', (event, hasVisibleWindows) => {
    let badgeCount = app.getBadgeCount()
    if (BrowserWindow.getAllWindows().length === 0 || mainWindow.isDestroyed()) {
        createMainWindow()
    } else if (mainWindow && !hasVisibleWindows) {
        mainWindow.show()
    }
    app.show()
    setTimeout(() => app.setBadgeCount(badgeCount), 500)
})

app.on('open-url', (event, url) => {
    createBrowserWindow(url, DEFAULT_WINDOW_BOUNDS)
})

app.on('new-window-for-tab', (event) => {
    let window = new BrowserWindow({
        show: false,
        webPreferences: {
            webSecurity: true,
        },
    })
    window.loadFile('src/blank.html')
    window.webContents.on('context-menu', (event, params) => {
        createContextMenuForWindow(params).popup()
    })
    BrowserWindow.getAllWindows()[1].addTabbedWindow(window)
    window.show()
    window.focus()
    createTouchBarForWindow(window)
})

// https://www.electronjs.org/docs/api/app#appsetaboutpaneloptionsoptions
app.setAboutPanelOptions({
    applicationName: 'Facebook (unofficial)',
    applicationVersion: '1.0.9',
    copyright: 'Developed by YUH APPS. This app is not the official Facebook client and has no affliations with Facebook.\n' +
        '"Facebook" is a registered trademark of Meta.',
    version: '20211120'
})

app.on('before-quit', (event) => {
    askRevertToTheDefaultBrowser(isDefaultHttpProtocolClient())
    app.exit(0)
})

app.on('window-all-closed', () => {
    askRevertToTheDefaultBrowser(isDefaultHttpProtocolClient())
    let acb = settings.getSync('acb') || '0'
    if (process.platform !== 'darwin' || acb === '3') {
        app.quit()
    } else {
        let menu = Menu.getApplicationMenu()
        menu.getMenuItemById('app-menu-go-back').enabled = false
        menu.getMenuItemById('app-menu-go-forward').enabled = false
        menu.getMenuItemById('app-menu-reload').enabled = false
        menu.getMenuItemById('app-menu-copy-url').enabled = false
        menu.getMenuItemById('app-menu-mute-tab').enabled = false
        menu.getMenuItemById('app-menu-mute-website').enabled = false
        menu.getMenuItemById('app-menu-mute-tabs').enabled = false
        menu.getMenuItemById('app-menu-unmute-tabs').enabled = false
    }
})

powerMonitor.on('on-battery', () => {
    if (process.platform !== 'darwin') return
    let acb = settings.getSync('acb') || '0'
    if (acb === '1' && !mainWindow.isVisible()) {
        mainWindow.close()
    }
})

powerMonitor.on('on-ac', () => {
    if (process.platform !== 'darwin') return
    let acb = settings.getSync('acb') || '0'
    if ((acb === '0' || acb === '1') && (mainWindow.isDestroyed())) {
        createMainWindow(FACEBOOK_URL, false)
        app.hide()
    }
})

powerMonitor.on('resume', () => {
    if (process.platform !== 'darwin') return
    let acb = settings.getSync('acb') || '0'
    if ((acb === '0' || acb === '1') && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.reload()
})

powerMonitor.on('lock-screen', () => {
    if (process.platform !== 'darwin') return
    let acb = settings.getSync('acb') || '0'
    if ((acb === '0' || acb === '1') && !mainWindow.isDestroyed()) {
        mainWindow.close()
    }
})

/** End of Basic Electron app events. */

/**************************************/

function requestCameraAndMicrophonePermissions() {
    let cam_mic = settings.getSync('cam_mic') || '0'
    if (cam_mic === '0') return
    Promise.all([systemPreferences.getMediaAccessStatus('camera'), systemPreferences.getMediaAccessStatus('microphone')])
        .then(async([cam, mic]) => {
            if (cam !== 'granted' || mic !== 'granted') {
                const { response } = await dialog.showMessageBox({
                    defaultId: 1,
                    message: 'Camera and Microphone permissions',
                    detail: 'In order to allow livestreaming, Native Facebook requires access to Camera and Microphone. Please open System Preferences, ' +
                        'click on Security & Privacy, select the Privacy tab, and give Native Facebook access to Camera and Microphone. If you do not ' +
                        'wish to give permissions, you can turn off this check in Settings/Preferences screen.',
                    buttons: ['Cancel', 'Open System Preferences', 'Do not ask again']
                })
                if (response === 2) {
                    settings.setSync('cam_mic', 0)
                } else if (response === 1) {
                    shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?privacy`)
                }
            }
        })
        .catch((error) => console.log(error))
}

function isDefaultHttpProtocolClient() {
    return app.isDefaultProtocolClient('http') || app.isDefaultProtocolClient('https')
}

function requestToBeTheDefaultBrowser() {
    dialog.showMessageBox({
        id: 0,
        message: 'Temporarily set Facebook as the default browser',
        detail: 'You can temporarily set Facebook as the default browser to handle Facebook sign in and share processes from other apps. ' +
            'After that, you are recommended to switch back to your favourite browser. This Facebook app is only made to work with Facebook websites. ' +
            'Therefore, it should not be used or treated like a normal web browser.',
        buttons: ['Proceed', 'Cancel']
    }).then(({ response }) => {
        if (response === 0) {
            app.setAsDefaultProtocolClient('http')
            app.setAsDefaultProtocolClient('https')
        }
    })
}

function askRevertToTheDefaultBrowser(show) {
    if (show) {
        if (platform === 'darwin') {
            dialog.showMessageBox({
                id: 0,
                message: 'Facebook is still your default browser',
                detail: 'Open System Preferences, click General and set your favourite browser as the default one. Facebook should not remain as the default browser.',
                buttons: ['Open System Preferences', 'Use Safari', 'Cancel']
            }).then(({ response }) => {
                if (response === 0) {
                    let url = 'x-apple.systempreferences:com.apple.preference.general'
                    shell.openExternal(url)
                } else if (response == 1) {
                    app.removeAsDefaultProtocolClient('http')
                    app.removeAsDefaultProtocolClient('https')
                }
            })
        } else if (platform === 'win32') {
            dialog.showMessageBox({
                id: 0,
                message: 'Facebook is still your default browser',
                detail: 'Open Settings, and select System/Apps, then Default Apps, and select your favourite browser under Web browser section. Facebook should not remain as the default browser.',
                buttons: ['Open Settings', 'Cancel']
            }).then(({ response }) => {
                if (response === 0) {
                    let url = 'ms-settings:defaultapps'
                    shell.openExternal(url)
                }
            })
        } else { // linux
            dialog.showMessageBox({
                id: 0,
                message: 'Facebook is still your default browser',
                detail: 'Open System Settings, and search for Default apps, then set your favourite browser as the default one. Facebook should not remain as the default browser.',
                buttons: ['OK', 'Cancel']
            }).then(({ response }) => {
                if (response === 0) {
                    app.removeAsDefaultProtocolClient('http')
                    app.removeAsDefaultProtocolClient('https')
                }
            })
        }
    }
}

/** Create a browser window, used to createMainWindow and create a tab
 * @param url: The URL for the tab. The URL for mainWindow is 'https://www.facebook.com'
 * @param bounds: Window bounds
 * @param useMobileUserAgent: Request mobile website instead of the desktop version
 * @see createMainWindow
 * @see createContextMenuForWindow
 * @returns The window to be created.
 */
function createBrowserWindow(url, bounds) {
    let { x, y, width, height } = bounds || settings.getSync('mainWindow') || DEFAULT_WINDOW_BOUNDS
    let max = settings.getSync('max') || '0' // Windows and Linux only
    let window = new BrowserWindow({
        x: x,
        y: y,
        width: width,
        height: height,
        show: false,
        title: "New Tab",
        webviewTag: true,
        webPreferences: {
            webSecurity: true,
            plugins: true,
            spellcheck: settings.getSync('spell') === '1' || false
        },
    })
    if (max) {
        window.maximize()
    }
    window.show()
    window.loadURL(url)
    setuPushReceiver(window.webContents)
    createTouchBarForWindow(window)

    // This will create a tab everytime an <a target="_blank" /> is clicked, instead of a new window
    // Unused params in the callback in order: frameName, disposition, options, additionalFeatures, referrer, postBody
    window.webContents.on('new-window', (event, url) => {
        event.preventDefault()
        if (process.platform === 'darwin') {
            window.addTabbedWindow(createBrowserWindow(url))
        } else {
            createBrowserWindow(url)
        }
    })
    // Create context menu for each window
    window.webContents.on('context-menu', (event, params) => {
        params['mute'] = window && window.webContents.isAudioMuted()
        createContextMenuForWindow(params).popup()
    })
    window.webContents.on('did-navigate-in-page', ((event, url, httpResponseCode) => {
        let menu = Menu.getApplicationMenu()
        if (menu !== null) {
            menu.getMenuItemById('app-menu-go-back').enabled = window.webContents.canGoBack()
            menu.getMenuItemById('app-menu-go-forward').enabled = window.webContents.canGoForward()
        }
    }))
    window.webContents.session.on('will-download', (event, item, webContents) => {
        item['id'] = Date.now()
        ongoingDownloads.splice(0, 0, item)
        item.once('done', (event, state) => {
            if (state === 'completed') {
                let downloadItems = settings.getSync('downloads') || []
                item.fileName = item.getFilename()
                settings.setSync('downloads', [item, ...downloadItems])
                ongoingDownloads = ongoingDownloads.filter((d) => d.id !== item.id)
            }
        })
    })
    window.on('focus', () => {
        let menu = Menu.getApplicationMenu()
        if (menu !== null) {
            menu.getMenuItemById('app-menu-go-back').enabled = window.webContents.canGoBack()
            menu.getMenuItemById('app-menu-go-forward').enabled = window.webContents.canGoForward()
            menu.getMenuItemById('app-menu-reload').enabled = true
            menu.getMenuItemById('app-menu-copy-url').enabled = true
            menu.getMenuItemById('app-menu-mute-tab').enabled = true
            menu.getMenuItemById('app-menu-mute-website').enabled = true
            menu.getMenuItemById('app-menu-mute-tabs').enabled = true
            menu.getMenuItemById('app-menu-unmute-tabs').enabled = true
        }
    })

    return window
}

/**
 * Create the mainWindow object.
 * @see mainWindow
 * @see createBrowserWindow
 */
function createMainWindow(url, show) {
    mainWindow = createBrowserWindow(url || FACEBOOK_URL, undefined)
    mainWindow.on('ready-to-show', () => {
        let ins = settings.getSync('ins') || '0'
        let msg = settings.getSync('msg') || '0'
        if (ins === '1') {
            let focusedWindow = BrowserWindow.getFocusedWindow()
            focusedWindow.addTabbedWindow(createBrowserWindow(INSTAGRAM_URL))
        }
        if (msg === '1') {
            let focusedWindow = BrowserWindow.getFocusedWindow()
            focusedWindow.addTabbedWindow(createBrowserWindow(MESSENGER_URL))
        }
        mainWindow.focus()
    })
    mainWindow.on('focus', () => {
        let title = mainWindow.getTitle()
        if (title.startsWith('(')) {
            try {
                app.setBadgeCount(parseInt(title.substring(1, title.indexOf(')'))))
            } catch (e) {}
        }
    })
    mainWindow.on('resize', () => {
        settings.set('mainWindow', mainWindow.getBounds())
    })
    mainWindow.on('move', () => {
        settings.set('mainWindow', mainWindow.getBounds())
    })
    mainWindow.on('close', (event) => {
        let acb = settings.getSync('acb') || '0'
        if (process.platform !== 'darwin') {
            return
        } else if (acb === '0' || (acb === '1' && !powerMonitor.onBatteryPower)) {
            event.preventDefault()
            mainWindow.hide()
        } else {
            let downloads = ongoingDownloads.map((item) => {
                return {
                    filename: item.getFilename(),
                    savePath: item.savePath,
                    url: item.getURL()
                }
            })
            settings.setSync('downloads', downloads)
            ongoingDownloads = []
        }
    })
    mainWindow.on('page-title-updated', (event, title, explicitSet) => {
        let badgeCount = 0
        if (title.startsWith('(')) {
            try {
                badgeCount = parseInt(title.substring(1, title.indexOf(')')))
            } catch (e) {}
        }
        app.setBadgeCount(badgeCount)
    })
}

function createAboutWindow() {
    if (aboutWindow) {
        aboutWindow.show()
    } else {
        let s = (mainWindow && !mainWindow.isDestroyed()) ? mainWindow.getBounds() : screen.getPrimaryDisplay().workAreaSize
        let x = s.width / 2 - 360
        let y = 120
        aboutWindow = new BrowserWindow({
            height: 240,
            width: 720,
            x: x,
            y: y,
            center: false,
            alwaysOnTop: true,
            frame: false,
            maximizable: false,
            minimizable: false,
            resizable: false,
            titleBarStyle: 'hidden',
            useContentSize: true,
            webPreferences: {
                contextIsolation: false,
                enableRemoteModule: true,
                nodeIntegration: true,
                devTools: true
            }
        })
        aboutWindow.loadFile('src/about.html')
        aboutWindow.on('close', () => aboutWindow = null)
    }
}

/**
 * Create the prefsWindow
 * @see prefsWindow
 */
function createPrefsWindow() {
    if (prefsWindow) {
        prefsWindow.show()
    } else {
        let s = (mainWindow && !mainWindow.isDestroyed()) ? mainWindow.getBounds() : screen.getPrimaryDisplay().workAreaSize
        let x = s.width / 2 - 400
        let y = 120
        prefsWindow = new BrowserWindow({
            x: x,
            y: y,
            alwaysOnTop: true,
            focusable: true,
            maximizable: false,
            webPreferences: {
                webSecurity: true,
                tabbingIdentifier: "Prefs",
                plugins: true,
                nodeIntegration: true,
                enableRemoteModule: true,
                devTools: true,
                contextIsolation: false
            },
        })
        prefsWindow.loadFile('src/prefs.html')
        prefsWindow.on('close', () => {
            let dev = settings.getSync('dev') || '0'
            let pip = settings.getSync('pip') || '0'
            let menu = Menu.getApplicationMenu()
            if (menu !== null) {
                menu.getMenuItemById('pip').visible = pip === '1'
                menu.getMenuItemById('pip-sep').visible = pip === '1'
                menu.getMenuItemById('dev-tools').visible = dev === '1'
                menu.getMenuItemById('dev-tools-sep').visible = dev === '1'
            }
        })
        prefsWindow.on('closed', () => prefsWindow = null)
    }
}

/**
 * Create the downloadsWindow
 */
function createDownloadsWindow() {
    if (downloadsWindow) {
        downloadsWindow.show()
    } else {
        let s = (mainWindow && !mainWindow.isDestroyed()) ? mainWindow.getBounds() : screen.getPrimaryDisplay().workAreaSize
        let x = s.width / 2 - 400
        let y = 120
        downloadsWindow = new BrowserWindow({
            x: x,
            y: y,
            alwaysOnTop: true,
            focusable: true,
            frame: false,
            maximizable: false,
            titleBarStyle: 'hidden',
            webPreferences: {
                webSecurity: true,
                tabbingIdentifier: "Prefs",
                plugins: true,
                nodeIntegration: true,
                enableRemoteModule: true,
                devTools: true,
                contextIsolation: false
            },
        })
        downloadsWindow.loadFile('src/downloads.html')
        downloadsWindow.on('closed', () => downloadsWindow = null)
    }
}

/**
 * Return true if the selectionText param is a possible link
 * All credits go to https://stackoverflow.com/questions/5717093/check-if-a-javascript-string-is-a-url
 * @param text
 * @returns {boolean}
 */
function isLink(text) {
    return validUrlUtf8(text)
}

/**
 * Create the app menu. Since version 1.0.9, this is only applied on macOS. Windows and Linux will rely on context menu.
 * @see app.whenReady
 */
function createAppMenu() {
    let dev = settings.getSync('dev') || '0'
    let pip = settings.getSync('pip') || '0'
    let appMenu = new MenuItem({
        label: 'Facebook',
        submenu: [
            new MenuItem({
                label: 'About Facebook',
                role: 'about'
            }),
            new MenuItem({ type: 'separator' }),
            new MenuItem({
                label: 'Preferences',
                accelerator: 'Cmd+,',
                click: createPrefsWindow,
            }),
            new MenuItem({ type: 'separator' }),
            new MenuItem({
                label: 'Set default browser',
                click: (menuItem, browserWindow, event) => {
                    let checked = isDefaultHttpProtocolClient()
                    if (checked) {
                        askRevertToTheDefaultBrowser(checked)
                    } else {
                        requestToBeTheDefaultBrowser()
                    }
                }
            }),
            new MenuItem({ type: 'separator' }),
            new MenuItem({ role: 'services' }),
            new MenuItem({ role: 'hide' }),
            new MenuItem({ role: 'hideOthers' }),
            new MenuItem({ type: 'separator' }),
            new MenuItem({ role: 'quit' }),
        ],
    })
    let file = new MenuItem({
        label: '&File',
        submenu: [
            new MenuItem({
                label: 'Go Back',
                id: 'app-menu-go-back',
                accelerator: 'CmdOrCtrl+Left',
                click: (menuItem, browserWindow, event) => {
                    if (browserWindow) browserWindow.webContents.goBack()
                }
            }),
            new MenuItem({
                label: 'Go Forward',
                id: 'app-menu-go-forward',
                accelerator: 'CmdOrCtrl+Right',
                click: (menuItem, browserWindow, event) => {
                    if (browserWindow) browserWindow.webContents.goForward()
                }
            }),
            new MenuItem({ label: 'Reload', id: 'app-menu-reload', role: 'reload' }),
            new MenuItem({
                label: 'Copy Current page URL',
                id: 'app-menu-copy-url',
                visible: true,
                click: (menuItem, browserWindow, event) => {
                    if (browserWindow) clipboard.writeText(browserWindow.webContents.getURL())
                }
            }),
            new MenuItem({
                label: 'Mute/Unmute Current Tab',
                id: 'app-menu-mute-tab',
                visible: true,
                click: (menuItem, browserWindow, event) => {
                    if (browserWindow) browserWindow.webContents.setAudioMuted(!browserWindow.webContents.isAudioMuted())
                }
            }),
            new MenuItem({
                label: 'Mute Website',
                id: 'app-menu-mute-website',
                visible: true,
                click: (menuItem, browserWindow, event) => {
                    let browserWindows = BrowserWindow.getAllWindows()
                    if (browserWindow && browserWindows) {
                        browserWindow.webContents.executeJavaScript('window.location.origin')
                            .then((origin) => {
                                browserWindows.forEach((window) =>
                                    window.webContents.setAudioMuted(window.webContents.getURL().startsWith(origin)))
                            })
                    }
                }
            }),
            new MenuItem({
                label: 'Mute All Tabs',
                id: 'app-menu-mute-tabs',
                visible: true,
                click: (menuItem, browserWindow, event) => {
                    let browserWindows = BrowserWindow.getAllWindows()
                    if (browserWindows) browserWindows.forEach((browserWindow) => browserWindow.webContents.setAudioMuted(true))
                }
            }),
            new MenuItem({
                label: 'Unmute All Tabs',
                id: 'app-menu-unmute-tabs',
                visible: true,
                click: (menuItem, browserWindow, event) => {
                    let browserWindows = BrowserWindow.getAllWindows()
                    if (browserWindows) browserWindows.forEach((browserWindow) => browserWindow.webContents.setAudioMuted(false))
                }
            }),
            new MenuItem({ type: 'separator' }),
            new MenuItem({
                label: 'Facebook Home',
                accelerator: 'CmdOrCtrl+Shift+F',
                id: 'fb-home',
                click: (menuItem, browserWindow, event) => {
                    if (browserWindow) browserWindow.loadURL(FACEBOOK_URL)
                }
            }),
            new MenuItem({
                label: 'New Facebook Tab',
                accelerator: 'CmdOrCtrl+F',
                click: (menuItem, browserWindow, event) => {
                    if (mainWindow.isDestroyed()) {
                        createMainWindow(FACEBOOK_URL)
                    } else if (browserWindow) {
                        browserWindow.addTabbedWindow(createBrowserWindow(FACEBOOK_URL))
                    } else {
                        mainWindow = createBrowserWindow(FACEBOOK_URL)
                    }
                },
            }),
            new MenuItem({
                label: 'New Messenger Tab',
                accelerator: 'CmdOrCtrl+M',
                click: (menuItem, browserWindow, event) => {
                    if (mainWindow.isDestroyed()) {
                        createMainWindow(MESSENGER_URL)
                    } else if (browserWindow) {
                        browserWindow.addTabbedWindow(createBrowserWindow(MESSENGER_URL))
                    } else {
                        let bounds = settings.getSync('mainWindow') || DEFAULT_WINDOW_BOUNDS
                        mainWindow = createBrowserWindow(MESSENGER_URL, bounds)
                    }
                },
            }),
            new MenuItem({
                label: 'New Instagram Tab',
                accelerator: 'CmdOrCtrl+I',
                click: (menuItem, browserWindow, event) => {
                    if (mainWindow.isDestroyed()) {
                        createMainWindow(INSTAGRAM_URL)
                    } else if (browserWindow) {
                        browserWindow.addTabbedWindow(createBrowserWindow(INSTAGRAM_URL))
                    } else {
                        mainWindow = createBrowserWindow(INSTAGRAM_URL)
                    }
                },
            }),
            new MenuItem({
                label: 'New Blank Tab',
                accelerator: 'CmdOrCtrl+T',
                click: (menuItem, browserWindow, event) => {
                    let window = new BrowserWindow({
                        webPreferences: {
                            webSecurity: true,
                        },
                    })
                    window.loadFile('src/blank.html')
                    window.webContents.on('context-menu', (event, params) => {
                        createContextMenuForWindow(params).popup()
                    })
                    if (mainWindow.isDestroyed()) {
                        window.show()
                    } else {
                        BrowserWindow.getAllWindows()[1].addTabbedWindow(window)
                        window.show()
                        window.focus()
                        createTouchBarForWindow(window)
                    }
                },
            }),
            new MenuItem({
                type: "separator",
            }), new MenuItem({
                role: 'close',
            }),
        ],
    })

    // Edit menu
    let edit = new MenuItem({ role: 'editMenu' })

    // View menu
    let view = new MenuItem({
        label: 'View',
        submenu: [
            new MenuItem({ role: 'zoomIn' }),
            new MenuItem({ role: 'zoomOut' }),
            new MenuItem({ role: 'resetZoom' }),
            new MenuItem({ type: 'separator' }),
            new MenuItem({ role: 'togglefullscreen' }),
            new MenuItem({ type: 'separator', visible: pip === '1', id: 'pip-sep' }),
            new MenuItem({
                label: 'Toggle Picture in Picture',
                id: 'pip',
                visible: pip === '1',
                click: (menuItem, browserWindow, event) => {
                    if (browserWindow) {
                        browserWindow.webContents.executeJavaScript(PIP_JS_EXE)
                    }
                }
            }),
            new MenuItem({
                label: 'View Downloads',
                id: 'downloads',
                click: (menuItem, browserWindow, event) => {
                    createDownloadsWindow()
                }
            }),
            new MenuItem({ type: 'separator', visible: dev === '1', id: 'dev-tools-sep' }),
            new MenuItem({ id: 'dev-tools', role: 'toggleDevTools' }),
        ]
    })

    // Window menu
    let window = new MenuItem({ role: 'windowMenu' })

    // Help menu
    let help = new MenuItem({
        label: 'Help',
        role: 'help',
        submenu: [
            new MenuItem({
                label: 'Developed by YUH APPS'
            })
        ]
    })
    let template = [appMenu, file, edit, view, window, help]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/**
 * Create context menu for each BrowserWindow.
 * @returns The created menu.
 * @see createBrowserWindow
 * @see Electron.ContextMenuParams
 */
function createContextMenuForWindow({ editFlags, isEditable, linkURL, linkText, mediaType, mute, selectionText, srcURL, x, y }) {
    let menu = new Menu()
    let dev = settings.getSync('dev') || '0'
    let pip = settings.getSync('pip') || '0'

    if (linkURL) {
        menu.append(new MenuItem({
            label: 'Open Link in New Background Tab',
            visible: process.platform === 'darwin' && (linkURL || isLink(selectionText)),
            click: (menuItem, browserWindow, event) => {
                if (browserWindow) {
                    let finalWindow, windows = BrowserWindow.getAllWindows()
                    if (windows.length === 1) {
                        finalWindow = windows[0]
                    } else {
                        finalWindow = windows[1]
                    }
                    if (linkURL) {
                        finalWindow.addTabbedWindow(createBrowserWindow(linkURL))
                    } else {
                        finalWindow.getAllWindows()[1].addTabbedWindow(createBrowserWindow(selectionText.trim()))
                    }
                    browserWindow.focus()
                }
            }
        }))
        menu.append(new MenuItem({
            label: 'Open Link in New Foreground Tab',
            visible: process.platform === 'darwin' && (linkURL || isLink(selectionText)),
            click: (menuItem, browserWindow, event) => {
                if (browserWindow) {
                    let finalWindow, windows = BrowserWindow.getAllWindows()
                    if (windows.length === 1) {
                        finalWindow = windows[0]
                    } else {
                        finalWindow = windows[1]
                    }
                    if (linkURL) {
                        finalWindow.addTabbedWindow(createBrowserWindow(linkURL))
                    } else {
                        finalWindow.getAllWindows()[1].addTabbedWindow(createBrowserWindow(selectionText.trim()))
                    }
                }
            }
        }))
        menu.append(new MenuItem({
            label: 'Open Link in New Window',
            visible: process.platform !== 'darwin' && (linkURL || isLink(selectionText)),
            click: (menuItem, browserWindow, event) => {
                if (browserWindow) {
                    createBrowserWindow(linkURL ? linkURL : selectionText.trim())
                }
            }
        }))
        menu.append(new MenuItem({
            label: 'Open Link in Browser',
            visible: linkURL || isLink(selectionText),
            click: (menuItem, browserWindow, event) => {
                shell.openExternal(linkURL ? linkURL : selectionText.trim())
            }
        }))
        menu.append(new MenuItem({
            label: 'Copy Link address',
            visible: linkURL,
            click: (menuItem, browserWindow, event) => {
                clipboard.writeText(linkURL)
            }
        }))
        menu.append(new MenuItem({
            label: 'Copy \"' + (linkText.length < 61 ? linkText : linkText.substring(0, 58) + "...") + '\"',
            visible: linkText,
            click: (menuItem, browserWindow, event) => {
                clipboard.writeText(linkText)
            }
        }))
        menu.append(new MenuItem({
            type: 'separator'
        }))
    }

    // macOS Look Up and Search with Google
    if (process.platform === 'darwin' && selectionText.trim()) {
        menu.append(new MenuItem({
            id: 'look-up',
            label: 'Look Up \"' + (selectionText.length < 61 ? selectionText : selectionText.substring(0, 58) + "...") + '\"',
            click: (menuItem, browserWindow, event) => {
                if (browserWindow) browserWindow.webContents.showDefinitionForSelection()
            }
        }))
        menu.append(new MenuItem({
            type: 'separator',
        }))
        menu.append(new MenuItem({
            id: 'google-search',
            label: 'Search with Google',
            click: (menuItem, browserWindow, event) => {
                shell.openExternal('https://www.google.com/search?q=' + selectionText)
            }
        }))
        menu.append(new MenuItem({
            type: 'separator',
        }))
    }

    // Image handlers, only displays with <img>
    if (mediaType === 'image') {
        menu.append(new MenuItem({
            label: 'Open Image in New Tab',
            click: (menuItem, browserWindow, event) => {
                if (browserWindow && browserWindow) {
                    let url = menuItem.transform ? menuItem.transform(srcURL) : srcURL
                    browserWindow.addTabbedWindow(createBrowserWindow(url))
                }
            }
        }))
        menu.append(new MenuItem({
            label: 'Copy Image address',
            click: (menuItem, browserWindow, event) => {
                let url = menuItem.transform ? menuItem.transform(srcURL) : srcURL
                clipboard.writeText(url)
            }
        }))
        menu.append(new MenuItem({
            label: 'Copy Image to Clipboard',
            click: (menuItem, browserWindow, event) => {
                if (browserWindow) browserWindow.webContents.copyImageAt(x, y)
            }
        }))
        menu.append(new MenuItem({
            label: 'Download Image',
            click: (menuItem, browserWindow, event) => {
                let url = menuItem.transform ? menuItem.transform(srcURL) : srcURL
                if (browserWindow) browserWindow.webContents.downloadURL(url)
            }
        }))
        menu.append(new MenuItem({
            type: 'separator',
        }))
    }

    // For non-input text selection.
    if (selectionText && !isEditable) {
        menu.append(new MenuItem({
            label: 'Copy \"' + (selectionText.length < 61 ? selectionText : selectionText.substring(0, 58) + "...") + '\"',
            enabled: editFlags.canCopy,
            visible: !linkURL && selectionText,
            click: (menuItem, browserWindow, event) => {
                if (browserWindow) browserWindow.webContents.copy()
            }
        }))
        menu.append(new MenuItem({
            type: 'separator',
        }))
    }

    // Editable handlers (<input />)
    if (isEditable) {
        menu.append(new MenuItem({
            label: 'Cut',
            enabled: editFlags.canCut,
            click: (menuItem, browserWindow, event) => {
                if (browserWindow) browserWindow.webContents.cut()
            }
        }))
        menu.append(new MenuItem({
            label: 'Copy',
            enabled: editFlags.canCopy,
            visible: !linkURL && selectionText,
            click: (menuItem, browserWindow, event) => {
                if (browserWindow) browserWindow.webContents.copy()
            }
        }))
        menu.append(new MenuItem({
            label: 'Paste',
            enabled: editFlags.canPaste,
            click: (menuItem, browserWindow, event) => {
                if (browserWindow) browserWindow.webContents.paste()
            }
        }))
        menu.append(new MenuItem({
            label: 'Paste and Match Style',
            enabled: editFlags.canPaste,
            click: (menuItem, browserWindow, event) => {
                if (browserWindow) browserWindow.webContents.pasteAndMatchStyle()
            }
        }))
        menu.append(new MenuItem({
            label: 'Select all',
            enabled: editFlags.canSelectAll,
            click: (menuItem, browserWindow, event) => {
                if (browserWindow) browserWindow.webContents.selectAll()
            }
        }))
        menu.append(new MenuItem({
            type: 'separator',
        }))
    }

    /* To be used later if necessary
    menu.append(new MenuItem({
      label: 'Undo',
      enabled: editFlags.canUndo,
      visible: isEditable,
      click: (menuItem, browserWindow, event) => {
        browserWindow.webContents.undo()
      }
    }))
    menu.append(new MenuItem({
      label: 'Redo',
      enabled: editFlags.canRedo,
      visible: isEditable,
      click: (menuItem, browserWindow, event) => {
        browserWindow.webContents.redo()
      }
    }))
    menu.append(new MenuItem({
      type: 'separator',
      visible: isEditable
    }))
    */

    // Navigators, always available
    menu.append(new MenuItem({
        label: 'Go Back',
        visible: BrowserWindow.getFocusedWindow() != null,
        enabled: BrowserWindow.getFocusedWindow() != null && BrowserWindow.getFocusedWindow().webContents.canGoBack(),
        click: (menuItem, browserWindow, event) => {
            if (browserWindow) browserWindow.webContents.goBack()
        }
    }))
    menu.append(new MenuItem({
        label: 'Go Forward',
        visible: BrowserWindow.getFocusedWindow() != null,
        enabled: BrowserWindow.getFocusedWindow() != null && BrowserWindow.getFocusedWindow().webContents.canGoForward(),
        click: (menuItem, browserWindow, event) => {
            if (browserWindow) browserWindow.webContents.goForward()
        }
    }))
    menu.append(new MenuItem({
        label: 'Reload',
        visible: BrowserWindow.getFocusedWindow() != null,
        enabled: BrowserWindow.getFocusedWindow() != null,
        click: (menuItem, browserWindow, event) => {
            if (browserWindow) browserWindow.webContents.reload()
        }
    }))
    menu.append(new MenuItem({
        label: 'Copy Current page URL',
        visible: BrowserWindow.getFocusedWindow() != null,
        click: (menuItem, browserWindow, event) => {
            if (browserWindow) clipboard.writeText(browserWindow.webContents.getURL())
        }
    }))
    menu.append(new MenuItem({
        label: mute ? 'Unmute' : 'Mute',
        visible: BrowserWindow.getFocusedWindow() != null,
        click: (menuItem, browserWindow, event) => {
            let webContents = browserWindow.webContents
            webContents.setAudioMuted(!webContents.isAudioMuted())
        }
    }))
    if (process.platform !== 'darwin') {
        menu.append(new MenuItem({
            label: 'Facebook Home',
            click: (menuItem, browserWindow, event) => {
                if (browserWindow) browserWindow.loadURL(FACEBOOK_URL)
            }
        }))
        menu.append(new MenuItem({
            label: 'New Messenger Window',
            click: (menuItem, browserWindow, event) => {
                createBrowserWindow(MESSENGER_URL)
            },
        }))
        menu.append(new MenuItem({
            label: 'New Instagram Window',
            click: (menuItem, browserWindow, event) => {
                createBrowserWindow(INSTAGRAM_URL)
            },
        }))
        menu.append(new MenuItem({
            label: 'New Blank Window',
            click: (menuItem, browserWindow, event) => {
                let max = settings.getSync('max') || '0'
                let window = new BrowserWindow({
                    show: false,
                    webPreferences: {
                        webSecurity: true,
                    },
                })
                window.loadFile('src/blank.html')
                window.webContents.on('context-menu', (event, params) => {
                    createContextMenuForWindow(params).popup()
                })
                if (max) {
                    window.maximize()
                }
                window.show
            },
        }))
        menu.append(new MenuItem({
            label: 'Toggle Picture in Picture',
            id: 'pip',
            visible: pip === '1',
            click: (menuItem, browserWindow, event) => {
                if (browserWindow) {
                    browserWindow.webContents.executeJavaScript(PIP_JS_EXE)
                }
            }
        }))
    }


    // Inspect elements (dev tools)
    if (BrowserWindow.getFocusedWindow() != null && dev === '1') {
        menu.append(new MenuItem({ type: 'separator' }))
        menu.append(new MenuItem({
            label: 'Inspect element',
            click: (menuItem, browserWindow, event) => {
                if (browserWindow) browserWindow.webContents.inspectElement(x, y)
            }
        }))
        menu.append(new MenuItem({
            label: 'Open Developer Console',
            click: (menuItem, browserWindow, event) => {
                if (browserWindow) browserWindow.webContents.openDevTools()
            }
        }))
    }

    if (process.platform !== 'darwin') {
        menu.append(new MenuItem({ type: 'separator' }))
        menu.append(new MenuItem({
            label: 'Settings',
            click: createPrefsWindow,
        }))
    }

    return menu
}

/**
 * Create Dock actions on macOS
 */
function createDockActions() {
    let template = [
        new MenuItem({
            label: 'New Facebook Tab',
            click: (menuItem, browserWindow, event) => {
                if (mainWindow.isDestroyed()) {
                    createMainWindow(FACEBOOK_URL)
                } else if (browserWindow) {
                    browserWindow.addTabbedWindow(createBrowserWindow(FACEBOOK_URL))
                } else {
                    mainWindow = createBrowserWindow(FACEBOOK_URL)
                }
            },
        }),
        new MenuItem({
            label: 'New Messenger Tab',
            click: (menuItem, browserWindow, event) => {
                if (mainWindow.isDestroyed()) {
                    createMainWindow(MESSENGER_URL)
                } else if (browserWindow) {
                    browserWindow.addTabbedWindow(createBrowserWindow(MESSENGER_URL))
                } else {
                    let bounds = settings.getSync('mainWindow') || DEFAULT_WINDOW_BOUNDS
                    mainWindow = createBrowserWindow(MESSENGER_URL, bounds)
                }
            },
        }),
        new MenuItem({
            label: 'New Instagram Tab',
            click: (menuItem, browserWindow, event) => {
                if (mainWindow.isDestroyed()) {
                    createMainWindow(INSTAGRAM_URL)
                } else if (browserWindow) {
                    browserWindow.addTabbedWindow(createBrowserWindow(INSTAGRAM_URL))
                } else {
                    mainWindow = createBrowserWindow(INSTAGRAM_URL)
                }
            },
        })
    ]
    app.dock.setMenu(Menu.buildFromTemplate(template))
}

/**
 * Initialize TouchBar (MBP only)
 */
function createTouchBarForWindow(window) {
    if (process.platform !== 'darwin') return
    let resolvePath = (name) => path.join(__dirname, `/assets/${name}_mono.png`)
    let resizeOptions = { width: 24, height: 24 }
    window.setTouchBar(
        new TouchBar({
            items: [
                new TouchBar.TouchBarButton({
                    icon: nativeImage.createFromPath(resolvePath(FACEBOOK)).resize(resizeOptions),
                    click: () => {
                        let browserWindow = BrowserWindow.getFocusedWindow()
                        if (browserWindow) {
                            browserWindow.addTabbedWindow(createBrowserWindow(FACEBOOK_URL))
                        } else {
                            mainWindow = createBrowserWindow(FACEBOOK_URL)
                        }
                    }
                }),
                new TouchBar.TouchBarButton({
                    icon: nativeImage.createFromPath(resolvePath(MESSENGER)).resize(resizeOptions),
                    click: () => {
                        let browserWindow = BrowserWindow.getFocusedWindow()
                        if (browserWindow) {
                            browserWindow.addTabbedWindow(createBrowserWindow(MESSENGER_URL))
                        } else {
                            mainWindow = createBrowserWindow(MESSENGER_URL)
                        }
                    }
                }),
                new TouchBar.TouchBarButton({
                    icon: nativeImage.createFromPath(resolvePath(INSTAGRAM)).resize(resizeOptions),
                    click: () => {
                        let browserWindow = BrowserWindow.getFocusedWindow()
                        if (browserWindow) {
                            browserWindow.addTabbedWindow(createBrowserWindow(INSTAGRAM_URL))
                        } else {
                            mainWindow = createBrowserWindow(INSTAGRAM_URL)
                        }
                    }
                }),
            ]
        })
    )
}