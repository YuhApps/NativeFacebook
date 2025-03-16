const { app, BaseWindow, BrowserWindow, clipboard, desktopCapturer, dialog, ipcMain, Menu, MenuItem, nativeImage, nativeTheme, Notification, powerMonitor, ShareMenu, screen, session, shell, systemPreferences, TouchBar, WebContentsView, webContents } = require('electron')
const electronRemote = require('@electron/remote/main')
const { autoUpdater } = require('electron-updater')
const { platform, release } = require('os')
const path = require('path')
const validUrlUtf8 = require('valid-url-utf8')
const fs = require('fs')

const settings = require('./settings')

const VERSION_CODE = 9
const BUILD_DATE = '2025.03.14'
const DOWNLOADS_JSON_PATH = app.getPath('userData') + path.sep + 'downloads.json'
const DEFAULT_WINDOW_BOUNDS = { x: undefined, y: undefined, width: 1280, height: 800 }
const FACEBOOK_URL = 'https://www.facebook.com'
const MESSENGER_URL = 'https://www.messenger.com'
const INSTAGRAM_URL = 'https://www.instagram.com'
const THREADS_URL = 'https://www.threads.net'
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
const FACEBOOK_REFRESH = 'document.querySelector(".oajrlxb2.g5ia77u1.qu0x051f.esr5mh6w.e9989ue4.r7d6kgcz.rq0escxv.nhd2j8a9.j83agx80'
    + '.p7hjln8o.kvgmc6g5.cxmmr5t8.oygrvhab.hcukyx3x.jb3vyjys.rz4wbd8a.qt6c0cv9.a8nywdso.i1ao9s8h.esuyzwwr.f1sip0of.lzcic4wl.n00je7tq.'
    + 'arfg74bv.qs9ysxi8.k77z8yql.l9j0dhe7.abiwlrkh.p8dawk7l.bp9cbjyn.cbu4d94t.datstx6m.taijpn5t.k4urcfbm").click()'
const SEARCH_ENGINES = {
    '0': 'https://www.google.com/?q=',
    '1': 'https://duckduckgo.com/?q=',
    '2': 'https://www.bing.com/search?q=',
}
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + process.versions.chrome + 'Safari/537.36'


let aboutWindow, downloadsWindow, prefsWindow
let titleBarAppearance, forceDarkScrollbar
let tempUrl, updateAvailable = false, sandbox = false
let lastUpdate = 0

/** Basic Electron app events: */

electronRemote.initialize()

app.whenReady().then(() => {
    titleBarAppearance = settings.get('title-bar') || '0'
    forceDarkScrollbar = settings.get('scrollbar') || '0'
    sandbox = settings.get('sbox') === '1'
    global.recentDownloads = []
    global.previousDownloads = fs.existsSync(DOWNLOADS_JSON_PATH) ? JSON.parse(fs.readFileSync(DOWNLOADS_JSON_PATH, 'utf-8') || '[]') : []
    requestCameraAndMicrophonePermissions()
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
            callback({ video: sources[0], audio: 'loopback' })
        })
    }, { useSystemPicker: true })
    let mw = createBrowserWindow(FACEBOOK_URL)
    if (process.platform === 'darwin') {
        createAppMenu()
        createDockActions()
        if (app.getLoginItemSettings().wasOpenedAtLogin) {
            mw.hide()
        }
    } else {
        Menu.setApplicationMenu(null)
    }
    if (tempUrl) {
        createBrowserWindow(tempUrl)
        tempUrl = undefined
    }
    if (process.platform !== 'darwin') {
        checkForUpdates()
    }
})

app.on('activate', (event, hasVisibleWindows) => {
    if (hasVisibleWindows) {
        let focusedWindow = BaseWindow.getFocusedWindow()
        if (focusedWindow) focusedWindow.show()
    } else {
        createBrowserWindow(FACEBOOK_URL)
    }
    app.show()
    checkForUpdates()
})

app.on('open-url', (event, url) => {
    if (url.startsWith('https://m.facebook.com')) url = url.replace('https://m.facebook.com', 'https://www.facebook.com')
    if (app.isReady()) {
        createBrowserWindow(url)
    } else {
        tempUrl = url
    }
})

app.on('new-window-for-tab', (event) => {
    let window = createBrowserWindow('src/blank.html', { blank: true, show: true })
    BrowserWindow.getAllWindows()[1].addTabbedWindow(window)
    window.show()
    window.focus()
    createTouchBarForWindow(window)
})

// https://www.electronjs.org/docs/api/app#appsetaboutpaneloptionsoptions
app.setAboutPanelOptions({
    applicationName: 'Facebook (unofficial)',
    applicationVersion: app.getVersion(),
    copyright: 'Developed by YUH APPS. This app is not the official Facebook client and has no affliations with Facebook.',
    version: BUILD_DATE
})

app.on('before-quit', (event) => {
    let downloads = [...global.recentDownloads.filter((item) => item.getState() === 'completed'), ...global.previousDownloads]
    fs.writeFileSync(DOWNLOADS_JSON_PATH, JSON.stringify(downloads))
    askRevertToTheDefaultBrowser(isDefaultHttpProtocolClient()).then(() => app.exit(0))
})

app.on('window-all-closed', () => {
    if (updateAvailable) {
        autoUpdater.quitAndInstall()
    } else if (process.platform !== 'darwin') {
        app.quit()
    } else {
        let menu = Menu.getApplicationMenu()
        menu.getMenuItemById('app-menu-go-back').enabled = false
        menu.getMenuItemById('app-menu-go-forward').enabled = false
        menu.getMenuItemById('app-menu-reload').enabled = false
        menu.getMenuItemById('app-menu-copy-url').enabled = false
        menu.getMenuItemById('app-menu-mute-tab').enabled = false
    }
})

autoUpdater.on('error', (error) => {
    dialog.showErrorBox('Update error', error || 'Something went wrong.')
})

autoUpdater.on('update-available', (info) => {

})

autoUpdater.on('update-not-available', (info) => {

})

autoUpdater.on('update-downloaded', (event) => {
    updateAvailable = true
})

// Handle app context menu invoke on Windows
ipcMain.on('app-context-menu', () => {
    let menu = new Menu()
    menu.append(new MenuItem({
        label: 'Facebook Home',
        click: (menuItem, browserWindow, event) => {
            browserWindow.contentView.children[1].webContents.loadURL(FACEBOOK_URL, { userAgent: USER_AGENT })
        }
    }))
    menu.append(new MenuItem({
        label: 'New Blank Window',
        click: (menuItem, browserWindow, event) => {
            let window = createBrowserWindow('src/blank.html', { blank: true })
            window.show()
            window.focus()
        },
    }))
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(new MenuItem({
        label: 'Settings',
        click: createPrefsWindow,
    }))
    menu.append(new MenuItem({
        label: 'Downloads',
        click: createDownloadsWindow,
    }))
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(new MenuItem({
        label: 'Toggle Full screen mode',
        click: (menuItem, browserWindow, event) => {
            let isFullScreen = browserWindow.isFullScreen()
            browserWindow.setFullScreen(!isFullScreen)
        }
    }))
    menu.append(new MenuItem({
        label: 'Toggle Picture in Picture',
        id: 'pip',
        visible: (settings.get('pip') || '0') === '1',
        click: (menuItem, browserWindow, event) => {
            browserWindow.webContents.executeJavaScript(PIP_JS_EXE)
        }
    }))
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(new MenuItem({
        label: 'About Native Facebook',
        click: createAboutWindow
    }))
    menu.append(new MenuItem({
        label: 'Check for Updates...',
        click: () => checkForUpdates(),
    }))
    menu.append(new MenuItem({
        label: 'Developed by YUH APPS',
        click: () => createBrowserWindow('https://yuhapps.dev')
    }))
    menu.popup({
        window: BrowserWindow.getFocusedWindow(),
        x: 12,
        y: 4
    })
})

ipcMain.on('create-new-window', () => {
    createBrowserWindowWithCustomTitleBar('src/blank.html', { blank: true, show: true })
})

ipcMain.on('delete-download-item', (event, id) => {
    global.previousDownloads = global.previousDownloads.filter((d) => d.id !== id)
    global.recentDownloads = global.recentDownloads.filter((d) => d.id !== id)
})

ipcMain.on('cancel-download-item', (event, id, state) => {
    global.previousDownloads = global.previousDownloads.filter((d) => d.id !== id)
    global.recentDownloads = global.recentDownloads.filter((d) => d.id !== id)
    global.recentDownloads = global.recentDownloads.filter((d, i, a) => d.getState() !== 'cancelled')
    // global.recentDownloads = global.recentDownloads.filter((d, i, a) => a.indexOf(d) === i)
})

ipcMain.on('re-download-file', (event, id, url) => {
    global.recentDownloads = global.recentDownloads.filter((d) => d.id !== id)
    global.previousDownloads = global.previousDownloads.filter((d) => d.id !== id)
    downloadsWindow.webContents.downloadURL(url)
})

ipcMain.on('show-download-item-in-files', (event, savePath) => {
    if (fs.existsSync(savePath)) {
        shell.showItemInFolder(savePath)
    }
})

ipcMain.on('delete-all-recent-downloads', (event) => {
    global.recentDownloads.forEach((d) => d.cancel())
    global.recentDownloads = []
})

ipcMain.on('delete-all-previous-downloads', (event) => {
    global.previousDownloads = []
    fs.writeFileSync(DOWNLOADS_JSON_PATH, JSON.stringify([]))
})

ipcMain.on('open-about', (event) => createAboutWindow())

ipcMain.on('open-dl-page', (event) => openDownloadPageOnGitHub())

ipcMain.on('open-yh-page', (event) => createBrowserWindow('https://yuhapps.dev'))

/** End of Basic Electron app events. */

/**************************************/

function requestCameraAndMicrophonePermissions() {
    let cam_mic = settings.get('cam_mic') || '0'
    if (cam_mic === '0') return
    let not_granted = ['denied', 'restricted', 'unknown']
    Promise.all([systemPreferences.getMediaAccessStatus('camera'), systemPreferences.getMediaAccessStatus('microphone')])
        .then(([cam, mic]) => {
            if (not_granted.indexOf(cam) > -1 || not_granted.indexOf(mic) > -1) {
                dialog.showMessageBox({
                    defaultId: 1,
                    message: 'Camera and Microphone permissions',
                    detail: 'In order to allow livestreaming, Facebook (Unofficial) requires access to Camera and Microphone. Please open System Preferences, ' +
                        'click on Security & Privacy, select the Privacy tab, and give Facebook (Unofficial) access to Camera and Microphone. If you do not ' +
                        'wish to give permissions, you can turn off this check in Settings/Preferences screen.',
                    buttons: ['Cancel', 'Open System Preferences', 'Do not ask again']
                }).then(({ response }) => {
                    if (response === 2) {
                        settings.set('cam_mic', '0')
                    } else if (response === 1) {
                        shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?privacy`)
                            .then(() => {
                                return Promise.all(
                                    systemPreferences.askForMediaAccess('camera'),
                                    systemPreferences.askForMediaAccess('microphone')
                                )
                            })
                    }
                })
            }
            if (cam === 'not-determined') {
                systemPreferences.askForMediaAccess('camera')
            }
            if (mic === 'not-determined') {
                systemPreferences.askForMediaAccess('microphone')
            }
        })
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

async function askRevertToTheDefaultBrowser(menuItem, show) {
    if (show) {
        if (platform === 'darwin') {
            const { response_0 } = await dialog.showMessageBox({
                id: 0,
                message: 'Facebook is still your default browser',
                detail: 'Open System Preferences, click General and set your favourite browser as the default one. Facebook should not remain as the default browser.',
                buttons: ['Open System Preferences', 'Use Safari', 'Cancel']
            })
            if (response_0 === 0) {
                let url = 'x-apple.systempreferences:com.apple.preference.general'
                shell.openExternal(url)
            } else if (response_0 == 1) {
                app.removeAsDefaultProtocolClient('http')
                app.removeAsDefaultProtocolClient('https')
            }
        } else if (platform === 'win32') {
            const { response: response_1 } = await dialog.showMessageBox({
                id: 0,
                message: 'Facebook is still your default browser',
                detail: 'Open Settings, and select System/Apps, then Default Apps, and select your favourite browser under Web browser section. Facebook should not remain as the default browser.',
                buttons: ['Open Settings', 'Cancel']
            })
            if (response_1 === 0) {
                let url_2 = 'ms-settings:defaultapps'
                shell.openExternal(url_2)
            }
        } else { // linux
            const { response: response_2 } = await dialog.showMessageBox({
                id: 0,
                message: 'Facebook is still your default browser',
                detail: 'Open System Settings, and search for Default apps, then set your favourite browser as the default one. Facebook should not remain as the default browser.',
                buttons: ['OK', 'Cancel']
            })
            if (response_2 === 0) {
                app.removeAsDefaultProtocolClient('http')
                app.removeAsDefaultProtocolClient('https')
            }
        }
    } else {
        return Promise.resolve()
    }
}

function checkForUpdates(showUpToDateDialog) {
    let now = Date.now()
    if (now - lastUpdate < 86400000) {
        return
    }
    lastUpdate = now
    autoUpdater.autoDownload = (settings.get('silent-update') || '0') === '1'
    if (autoUpdater.autoDownload) {
        autoUpdater.checkForUpdatesAndNotify()
        return
    }
    autoUpdater.checkForUpdates().then((result) => {
        if (!result) {
            return Promise.reject()
        }
        let info = result.updateInfo
        if (info.version > app.getVersion()) {
            return dialog.showMessageBox({
                message: `There's a new available update, ${info.version}, you currently have ${app.getVersion()}. What's new:`,
                detail: info.releaseNotes.replace(/<\/?[^>]+(>|$)/g, '') || '',
                buttons: ['Download now', 'Visit GitHub Releases', 'Cancel']
            })
        } else {
            return Promise.reject(showUpToDateDialog ? `Native Facebook is up-to-date.` : undefined)
        }
    }).then(({ response }) => {
        if (response === 0) {
            return autoUpdater.downloadUpdate()
        } else if (response === 1) {
            shell.openExternal('https://github.com/YuhApps/NativeFacebook/releases')
        } else {
            return Promise.reject()
        }
    }).then(() => {
        return dialog.showMessageBox({
            message: `The update is ready to be installed.`,
            buttons: ['Install and Relaunch', 'Install on App close']
        })
    }).then(({ response }) => {
        if (response === 0) {
            setImmediate(() => autoUpdater.quitAndInstall())
        } else {
            updateAvailable = true
        }
    }).catch((message) => {
        if (typeof (message) === 'string') {
            dialog.showMessageBox({
                message: message,
                buttons: ['OK', 'GitHub']
            }).then(({ response }) => {
                if (response === 1) {
                    shell.openExternal('https://github.com/YuhApps/NativeFacebook/')
                }
            })
        } else {
            console.log(message)
        }
    })
}

function brightnessByColor(color) {
    if (color === undefined) {
        return 255
    }
    var color = "" + color, isHEX = color.indexOf("#") == 0, isRGB = color.indexOf("rgb") == 0;
    if (isHEX) {
        const hasFullSpec = color.length == 7;
        var m = color.substr(1).match(hasFullSpec ? /(\S{2})/g : /(\S{1})/g);
        if (m) var r = parseInt(m[0] + (hasFullSpec ? '' : m[0]), 16), g = parseInt(m[1] + (hasFullSpec ? '' : m[1]), 16), b = parseInt(m[2] + (hasFullSpec ? '' : m[2]), 16);
    }
    if (isRGB) {
        var m = color.match(/(\d+){3}/g);
        if (m) var r = m[0], g = m[1], b = m[2];
    }
    if (typeof r != "undefined") return ((r * 299) + (g * 587) + (b * 114)) / 1000;
}

/** Create a browser window, used to createMainWindow and create a tab
 * @param url: The URL for the tab. The URL for mainWindow is 'https://www.facebook.com'
 * @param bounds: Window bounds
 * @param useMobileUserAgent: Request mobile website instead of the desktop version
 * @see createMainWindow
 * @see createContextMenuForWindow
 * @returns The window to be created.
 */
function createBrowserWindow(url, options) {
    let window = process.platform === 'linux' ? createBrowserWindowWithSystemTitleBar(url, options) : createBrowserWindowWithCustomTitleBar(url, options)
    window.on('enter-full-screen', () => {
        window.setMinimumSize(600, 600)
    })
    window.on('exit-full-screen', () => {
        window.setMinimumSize(800, 600)
    })
    window.on('resize', () => {
        settings.set('mainWindow', window.getBounds())
    })
    window.on('move', () => {
        settings.set('mainWindow', window.getBounds())
    })
    return window
}

function createBrowserWindowWithSystemTitleBar(url, options) {
    let { bounds, blank, show } = options || { bounds: undefined, blank: false, show: true }
    let { x, y, width, height } = bounds || settings.get('mainWindow') || DEFAULT_WINDOW_BOUNDS
    let max = settings.get('max') || '0' // Windows and Linux only
    let browserWindowConstructorOptions = {
        x: x,
        y: y,
        height: height,
        width: width,
        minHeight: 600,
        minWidth: 800,
        show: false,
        tabbingIdentifier: 'WebView',
        title: 'Facebook',
        webviewTag: true,
        webPreferences: {
            webSecurity: true,
            spellcheck: settings.get('spell') === '1' || false,
            scrollBounce: true,
            sandbox: sandbox,
            plugins: true,
        },
    }
    let window = new BrowserWindow(browserWindowConstructorOptions)
    if (max === '1') {
        window.maximize()
    }
    if (show) {
        window.show()
    }

    if (blank) {
        window.webContents.loadFile(url).then(() => {
            window.webContents.executeJavaScript('window.nfbSearchEngine = ' + (settings.get('search') || '0'))
        })
    } else {
        window.webContents.loadURL(url, { userAgent: USER_AGENT })
    }
    createTouchBarForWindow(window)

    // This will create a tab everytime an <a target="_blank" /> is clicked, instead of a new window
    window.webContents.setWindowOpenHandler(({ url, frameName, features, disposition, referrer, postBody }) => {
        if (url.startsWith('https://m.facebook.com')) url = url.replace('https://m.facebook.com', 'https://www.facebook.com')
        return {
            action: 'allow',
            overrideBrowserWindowOptions: url === 'about:blank' ? undefined : {
                x: x,
                y: y,
                height: height,
                width: width,
                minHeight: 600,
                minWidth: 800,
            }
        }
    })
    // Create context menu for each window
    window.webContents.on('context-menu', (event, params) => {
        params['mute'] = window && window.webContents.isAudioMuted()
        createContextMenuForWindow(window.webContents, params).popup()
    })
    window.webContents.on('did-navigate-in-page', ((event, url, httpResponseCode) => {
        let menu = Menu.getApplicationMenu()
        if (menu !== null) {
            menu.getMenuItemById('app-menu-go-back').enabled = window.webContents.navigationHistory.canGoBack()
            menu.getMenuItemById('app-menu-go-forward').enabled = window.webContents.navigationHistory.canGoForward()
        }
    }))
    window.webContents.on('enter-html-full-screen', () => {
        window.toggleTabBar()
    })
    window.webContents.on('leave-html-full-screen', () => {
        window.toggleTabBar()
    })
    window.webContents.session.on('will-download', (event, item, webContents) => {
        handleDownload(item, webContents)
    })
    window.on('focus', () => {
        let menu = Menu.getApplicationMenu()
        if (menu !== null) {
            menu.getMenuItemById('app-menu-go-back').enabled = window.webContents.navigationHistory.canGoBack()
            menu.getMenuItemById('app-menu-go-forward').enabled = window.webContents.navigationHistory.canGoForward()
            menu.getMenuItemById('app-menu-reload').enabled = true
            menu.getMenuItemById('app-menu-copy-url').enabled = true
            menu.getMenuItemById('app-menu-mute-tab').enabled = true
        }
    })
    window.webContents.on('page-title-updated', (event, title, explicitSet) => {
        if (process.platform === 'win32') {
            event.preventDefault()
            window.setTitle(`   ${title}`)
        }
    })
    return window
}

function createBrowserWindowWithCustomTitleBar(url, options, browserWindowConstructorOptions) {
    let { bounds, blank, show } = options || { bounds: undefined, blank: false, show: options ? options.blank : true }
    let { x, y, width, height } = bounds || settings.get('mainWindow') || DEFAULT_WINDOW_BOUNDS
    let max = settings.get('max') || '0' // Windows and Linux only
    let titleBarHeight = process.platform === 'win32' ? 32 : 28
    let rightMargin = process.platform === 'win32' ? 14 : 0
    let window = new BaseWindow({
        x: x,
        y: y,
        height: height,
        width: width,
        minHeight: 600,
        minWidth: 800,
        show: false,
        /* backgroundColor: titleBarAppearance === '1' ? '#ffffff' : titleBarAppearance === '2' ? '#242526' : '#000000', */
        titleBarStyle: 'hidden',
        /* frame: titleBarAppearance !== '0', */
        tabbingIdentifier: 'WebView',
        title: 'Facebook',
        webPreferences: {
            webSecurity: true,
            spellcheck: settings.get('spell') === '1' || false,
            scrollBounce: true,
            sandbox: sandbox,
            plugins: true
        },
    })
    if (max === '1') {
        window.maximize()
    }
    if (show) {
        window.show()
    }
    // Title
    let titleView = new WebContentsView(browserWindowConstructorOptions ?? {
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true,
            contextIsolation: false,
        }
    })
    window.contentView.addChildView(titleView)
    titleView.setBounds({ x: 0, y: 0, width: window.getBounds().width - (max === '1' ? rightMargin : 0), height: titleBarHeight })
    // Main content
    let mainView = new WebContentsView({
        webPreferences: {
            sandbox: sandbox,
            scrollBounce: true,
            spellcheck: settings.get('spell') === '1' || false,
            enableRemoteModule: blank,
            contextIsolation: true,
            // preload: blank ? path.join(__dirname, 'blank_preload.js') : undefined,
        }
    })
    // mainView.setBackgroundColor(titleBarAppearance === '0' ? undefined : titleBarAppearance === '1' ? '#ffffffff' : titleBarAppearance === '2' ? '#ff232425' : '#ff000000')
    window.contentView.addChildView(mainView)
    mainView.setBounds({ x: 0, y: titleBarHeight, width: window.getBounds().width - rightMargin, height: window.getBounds().height - titleBarHeight })
    // Load URL or File
    electronRemote.enable(titleView.webContents)
    electronRemote.enable(mainView.webContents)
    // TODO: Separate Mac and Windows titlebar, as well as add support for Linux
    titleView.webContents.loadFile('src/title.html')
    if (blank) {
        mainView.webContents.loadFile(url).then(() => {
            if (nativeTheme.shouldUseDarkColors) {
                titleView.webContents.send('update-title-color', '#242526', true)
                mainView.webContents.executeJavaScript('document.body.classList.add("dark")')
            }
            mainView.webContents.executeJavaScript('window.nfbSearchEngine = ' + (settings.get('search') || '0'))
        })
    } else {
        if (url.startsWith('https://m.facebook.com')) {
            url = url.replace('https://m.facebook.com', 'https://www.facebook.com')
        }
        mainView.webContents.userAgent = USER_AGENT
        mainView.webContents.loadURL(url, { userAgent: USER_AGENT })
        let titleBarColors = settings.get('title-bar-colors')
        let color = titleBarColors ? titleBarColors[new URL(url).host] : undefined
        if (color) {
            titleView.webContents.send('update-title-color', color, brightnessByColor(color) < 95)
        }
    }
    createTouchBarForWindow(window)
    // Update title
    mainView.webContents.on('page-title-updated', (event, title, explicitSet) => {
        titleView.webContents.send('update-title', title)
        if (window && !window.isDestroyed()) window.setTitle(title)
        if (titleBarHeight > 100) titleView.webContents.openDevTools()
    })
    // Update title color
    mainView.webContents.on('did-change-theme-color', (e, color) => {
        titleView.webContents.send('update-title-color', color, brightnessByColor(color) < 95)
        let titleBarColors = settings.get('title-bar-colors') || {}
        titleBarColors[new URL(url).host] = color
        settings.set('title-bar-colors', titleBarColors)
    })
    // Create context menu for each window
    mainView.webContents.on('context-menu', (event, params) => {
        params['mute'] = window && mainView.webContents.isAudioMuted()
        createContextMenuForWindow(mainView.webContents, params).popup()
    })
    mainView.webContents.on('did-navigate-in-page', ((event, url, httpResponseCode) => {
        let menu = Menu.getApplicationMenu()
        if (menu !== null) {
            menu.getMenuItemById('app-menu-go-back').enabled = mainView.webContents.navigationHistory.canGoBack()
            menu.getMenuItemById('app-menu-go-forward').enabled = mainView.webContents.navigationHistory.canGoForward()
        }
    }))
    mainView.webContents.setWindowOpenHandler(({ url, frameName, features, disposition, referrer, postBody }) => {
        if (url === 'about:blank') {
            return { action: 'allow' }
        } else {
            createBrowserWindowWithCustomTitleBar(url)
            return { action: 'deny' }
        }
    })
    mainView.webContents.on('enter-html-full-screen', () => {
        titleView.setBounds({ x: 0, y: 0, width: window.getBounds().width, height: 0 })
        mainView.setBounds({ x: 0, y: 0, width: window.getBounds().width, height: window.getBounds().height })
    })
    mainView.webContents.on('leave-html-full-screen', () => {
        titleView.setBounds({ x: 0, y: 0, width: window.getBounds().width, height: titleBarHeight })
        mainView.setBounds({ x: 0, y: titleBarHeight, width: window.getBounds().width, height: window.getBounds().height - titleBarHeight })
    })
    mainView.webContents.session.on('will-download', (event, item, webContents) => {
        handleDownload(item, webContents)
    })
    mainView.webContents.on('did-create-window', (window, details) => {
        window.webContents.on('context-menu', (e, params) => createContextMenuForWindow(window.webContents, params).popup())
    })
    window.on('enter-full-screen', () => {
        titleView.setBounds({ x: 0, y: 0, width: window.getBounds().width, height: 0 })
        mainView.setBounds({ x: 0, y: 0, width: window.getBounds().width, height: window.getBounds().height })
    })
    window.on('enter-html-full-screen', () => {
        titleView.setBounds({ x: 0, y: 0, width: window.getBounds().width, height: 0 })
        mainView.setBounds({ x: 0, y: 0, width: window.getBounds().width, height: window.getBounds().height })
    })
    window.on('leave-html-full-screen', () => {
        titleView.setBounds({ x: 0, y: 0, width: window.getBounds().width, height: titleBarHeight })
        mainView.setBounds({ x: 0, y: titleBarHeight, width: window.getBounds().width, height: window.getBounds().height - titleBarHeight })
    })
    window.on('leave-full-screen', () => {
        mainView.webContents.executeJavaScript('document.exitFullscreen()')
    })
    window.on('maximize', (e) => {
        titleView.setBounds({ x: 0, y: 0, width: window.getBounds().width, height: titleBarHeight })
        mainView.setBounds({ x: 0, y: titleBarHeight, width: window.getBounds().width - rightMargin, height: window.getBounds().height - titleBarHeight })
    })
    window.on('unmaximize', (e) => {
        titleView.setBounds({ x: 0, y: 0, width: window.getBounds().width, height: titleBarHeight })
        mainView.setBounds({ x: 0, y: titleBarHeight, width: window.getBounds().width, height: window.getBounds().height - titleBarHeight })
    })
    window.on('resize', (e) => {
        titleView.setBounds({ x: 0, y: 0, width: window.getBounds().width, height: titleBarHeight })
        mainView.setBounds({ x: 0, y: titleBarHeight, width: window.getBounds().width, height: window.getBounds().height - titleBarHeight })
    })
    window.on('focus', () => {
        let menu = Menu.getApplicationMenu()
        if (menu !== null) {
            menu.getMenuItemById('app-menu-go-back').enabled = mainView.webContents.navigationHistory.canGoBack()
            menu.getMenuItemById('app-menu-go-forward').enabled = mainView.webContents.navigationHistory.canGoForward()
            menu.getMenuItemById('app-menu-reload').enabled = true
            menu.getMenuItemById('app-menu-copy-url').enabled = true
            menu.getMenuItemById('app-menu-mute-tab').enabled = true
        }
    })
    window.on('close', (event) => {
        titleView.webContents.destroy()
        mainView.webContents.destroy()
        titleView = null
        mainView = null
        return
    })
    return window
}

function handleDownload(item, webContents) {
    item['id'] = `${item.getStartTime()}`
    item['url'] = item.getURL()
    item['startTime'] = item.getStartTime()
    global.recentDownloads = [item, ...global.recentDownloads]
    item.on('done', (event, state) => new Notification({
        body: 'Download ' + state,
        title: item.getFilename(),
        silent: true,
    }).show())
}

function getWebContents(window) {
    let views = window.contentView.children
    return views.length ? views[1].webContents : window.webContents
}

function createAboutWindow() {
    if (aboutWindow) {
        aboutWindow.show()
    } else {
        let s = screen.getPrimaryDisplay().workAreaSize
        let x = Math.round(s.width / 2 - 360)
        let y = 120
        aboutWindow = new BrowserWindow({
            height: 240,
            width: 720,
            x: x,
            y: y,
            center: false,
            alwaysOnTop: true,
            maximizable: false,
            minimizable: false,
            resizable: false,
            tabbingIdentifier: 'About',
            titleBarStyle: process.platform === 'linux' ? 'default' : 'hidden',
            useContentSize: true,
            webPreferences: {
                contextIsolation: false,
                enableRemoteModule: true,
                devTools: true,
                nodeIntegration: true
            }
        })
        electronRemote.enable(aboutWindow.webContents)
        aboutWindow.loadFile('src/about.html')
        aboutWindow.setTitle('About Native Facebook')
        aboutWindow.on('close', () => aboutWindow = null)
        aboutWindow.webContents.on('did-finish-load', (e) => {
            let version = app.getVersion() + ' (' + BUILD_DATE + ')'
            let titleBarColors = settings.get('title-bar-colors')
            let color = titleBarColors ? titleBarColors['www.facebook.com'] : undefined
            let dark = brightnessByColor(color) < 95
            aboutWindow.webContents.send('dark', dark, version)
        })
    }
}


/**
 * Create the prefsWindow
 * @see prefsWindow
 */
function createPrefsWindow() {
    if (prefsWindow && prefsWindow.isDestroyed() === false) {
        prefsWindow.show()
    } else {
        let s = screen.getPrimaryDisplay().workAreaSize
        let x = Math.round(s.width / 2 - 400)
        let y = 120
        prefsWindow = new BrowserWindow({
            x: x,
            y: y,
            alwaysOnTop: true,
            focusable: true,
            maximizable: false,
            resizable: false,
            tabbingIdentifier: 'Prefs',
            title: process.platform === 'darwin' ? 'Preferences' : '   Settings',
            titleBarStyle: process.platform === 'linux' ? 'default' : 'hidden',
            webPreferences: {
                webSecurity: true,
                scrollBounce: true,
                plugins: true,
                nodeIntegration: true,
                enableRemoteModule: true,
                devTools: true,
                contextIsolation: false
            },
        })
        electronRemote.enable(prefsWindow.webContents)
        prefsWindow.loadFile('src/prefs.html')
        prefsWindow.setTitle(process.platform === 'darwin' ? 'Preferences' : 'Settings')
        prefsWindow.on('close', () => {
            let dev = settings.get('dev') || '0'
            let pip = settings.get('pip') || '0'
            let menu = Menu.getApplicationMenu()
            if (menu !== null) {
                menu.getMenuItemById('pip').visible = pip === '1'
                menu.getMenuItemById('dev-tools').visible = dev === '1'
            }
        })
        prefsWindow.webContents.on('did-finish-load', (e) => {
            let macRelease = release()
            let montereyOrLower = process.platform === 'darwin' && Number(macRelease.substring(0, macRelease.indexOf('.'))) <= 21
            let title = montereyOrLower ? 'Preferences' : 'Settings'
            let version = app.getVersion() + ' (' + BUILD_DATE + ')'
            prefsWindow.webContents.send('title', title)
            let titleBarColors = settings.get('title-bar-colors')
            let color = titleBarColors ? titleBarColors['www.facebook.com'] : undefined
            let dark = brightnessByColor(color) < 95
            prefsWindow.webContents.send('dark', dark, version)
        })
    }
}

/**
 * Create the downloadsWindow
 */
function createDownloadsWindow() {
    if (downloadsWindow) {
        downloadsWindow.show()
    } else {
        let s = screen.getPrimaryDisplay().workAreaSize
        let x = s.width / 2 - 400
        let y = 120
        downloadsWindow = new BrowserWindow({
            x: x,
            y: y,
            focusable: true,
            maximizable: false,
            minimizable: true,
            tabbingIdentifier: 'Downloads',
            titleBarStyle: process.platform === 'linux' ? 'default' : 'hidden',
            webPreferences: {
                webSecurity: true,
                scrollBounce: true,
                plugins: true,
                nodeIntegration: true,
                enableRemoteModule: true,
                devTools: true,
                contextIsolation: false
            },
        })
        electronRemote.enable(downloadsWindow.webContents)
        downloadsWindow.loadFile('src/downloads.html')
        downloadsWindow.setTitle('Downloads')
        downloadsWindow.on('closed', () => {
            downloadsWindow = null
        })
        downloadsWindow.webContents.on('did-finish-load', (e) => {
            let version = app.getVersion() + ' (' + BUILD_DATE + ')'
            let titleBarColors = settings.get('title-bar-colors')
            let color = titleBarColors ? titleBarColors['www.facebook.com'] : undefined
            let dark = brightnessByColor(color) < 95
            downloadsWindow.webContents.send('dark', dark, version)
        })
        downloadsWindow.webContents.session.on('will-download', (event, item, webContents) => {
            handleDownload(item, webContents)
        })
    }
}

function openDownloadPageOnGitHub() {
    createBrowserWindow('https://github.com/YuhApps/NativeFacebook/releases')
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
    let dev = settings.get('dev') || '0'
    let pip = settings.get('pip') || '0'
    let macRelease = release()
    let isVentura = Number(macRelease.substring(0, macRelease.indexOf('.'))) > 21
    let appMenu = new MenuItem({
        label: 'Facebook',
        submenu: [
            new MenuItem({
                label: 'About Native Facebook',
                click: createAboutWindow
            }),
            new MenuItem({
                label: 'Check for Updates...',
                click: () => checkForUpdates(true)
            }),
            new MenuItem({ type: 'separator' }),
            new MenuItem({
                label: isVentura ? 'Settings...' : 'Preferences...',
                accelerator: 'Cmd+,',
                click: createPrefsWindow,
            }),
            new MenuItem({ type: 'separator' }),
            new MenuItem({
                label: 'Set as default browser',
                click: (menuItem, browserWindow, event) => {
                    let checked = isDefaultHttpProtocolClient()
                    if (checked) {
                        askRevertToTheDefaultBrowser(menuItem, checked)
                    } else {
                        requestToBeTheDefaultBrowser()
                    }
                }
            }),
            new MenuItem({ type: 'separator' }),
            new MenuItem({ role: 'services' }),
            new MenuItem({ type: 'separator' }),
            new MenuItem({ role: 'hide' }),
            new MenuItem({ role: 'hideOthers' }),
            new MenuItem({ role: 'unhide' }),
            new MenuItem({ type: 'separator' }),
            new MenuItem({ role: 'quit' }),
        ],
    })
    let file = new MenuItem({
        label: 'File',
        submenu: [
            new MenuItem({
                label: 'Go Back',
                id: 'app-menu-go-back',
                enabled: true,
                accelerator: 'Cmd+Left',
                click: (menuItem, browserWindow, event) => {
                    if (browserWindow) {
                        getWebContents(browserWindow).goBack()
                    }
                }
            }),
            new MenuItem({
                label: 'Go Forward',
                id: 'app-menu-go-forward',
                enabled: true,
                accelerator: 'Cmd+Right',
                click: (menuItem, browserWindow, event) => {
                    if (browserWindow) {
                        getWebContents(browserWindow).goForward()
                    }
                }
            }),
            new MenuItem({
                label: 'Reload',
                id: 'app-menu-reload',
                accelerator: 'Cmd+R',
                click: (menuItem, browserWindow, event) => {
                    if (browserWindow) {
                        getWebContents(browserWindow).reload()
                    }
                }
            }),
            new MenuItem({
                label: 'Copy Current page URL',
                id: 'app-menu-copy-url',
                visible: true,
                click: (menuItem, browserWindow, event) => {
                    if (browserWindow) {
                        clipboard.writeText(getWebContents(browserWindow).getURL())
                    }
                }
            }),
            new MenuItem({
                label: 'Mute/Unmute Current Tab',
                id: 'app-menu-mute-tab',
                visible: true,
                click: (menuItem, browserWindow, event) => {
                    if (browserWindow) {
                        let webContents = getWebContents(browserWindow)
                        webContents.setAudioMuted(!webContents.isAudioMuted())
                    }
                }
            }),
            new MenuItem({ type: 'separator' }),
            new MenuItem({
                label: 'Go to Facebook Home',
                accelerator: 'Cmd+Shift+F',
                id: 'fb-home',
                click: (menuItem, browserWindow, event) => {
                    if (browserWindow) {
                        getWebContents(browserWindow).loadURL(FACEBOOK_URL, { userAgent: USER_AGENT })
                    }
                }
            }),
            new MenuItem({
                label: 'New Facebook Window',
                click: (menuItem, browserWindow, event) => {
                    createBrowserWindow(FACEBOOK_URL)
                },
            }),
            new MenuItem({
                label: 'New Messenger Window',
                click: (menuItem, browserWindow, event) => {
                    createBrowserWindow(MESSENGER_URL)
                },
            }),
            new MenuItem({
                label: 'New Instagram Window',
                click: (menuItem, browserWindow, event) => {
                    createBrowserWindow(INSTAGRAM_URL)
                },
            }),
            new MenuItem({
                label: 'New Threads Window',
                click: (menuItem, browserWindow, event) => {
                    createBrowserWindow(THREADS_URL)
                },
            }),
            new MenuItem({
                label: 'New Blank Window',
                accelerator: 'Cmd+N',
                enabled: true,
                click: (menuItem, browserWindow, event) => createBrowserWindow('src/blank.html', { blank: true, show: true })
            }),
            new MenuItem({ type: 'separator' }),
            new MenuItem({ role: 'close' })
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
            new MenuItem({
                label: 'Toggle Picture in Picture',
                id: 'pip',
                visible: pip === '1',
                click: (menuItem, browserWindow, event) => {
                    if (browserWindow) {
                        getWebContents(browserWindow).executeJavaScript(PIP_JS_EXE)
                    }
                }
            }),
            new MenuItem({
                id: 'dev-tools',
                label: 'Toggle Developer Tools',
                visible: dev === '1',
                click: (menuItem, browserWindow, event) => {
                    // let window = BrowserWindow.getFocusedWindow()
                    // print(window !== null)
                    // if (!window) return
                    let webContents = getWebContents(browserWindow)
                    if (webContents.isDevToolsOpened()) webContents.closeDevTools()
                    else webContents.openDevTools()
                }
            }),
            new MenuItem({ type: 'separator' }),
            new MenuItem({
                label: 'Downloads',
                accelerator: 'Cmd+Shift+J',
                click: (item, browserWindow, event) => createDownloadsWindow()
            }),
        ]
    })

    // Window menu
    let window = new MenuItem({ role: 'windowMenu' })

    // Help menu
    let help = new MenuItem({
        label: 'Help',
        role: 'help',
        submenu: [new MenuItem({ label: 'Developed by YUH APPS', click: () => createBrowserWindow('https://yuhapps.dev') })]
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
function createContextMenuForWindow(webContents, { editFlags, isEditable, linkURL, linkText, mediaType, mute, selectionText, srcURL, x, y }) {
    let menu = new Menu()
    let dev = settings.get('dev') || '0'
    let pip = settings.get('pip') || '0'
    let search = settings.get('search') || '0'
    let sctxm = settings.get('sctxm') || '0'
    let focusedWindow = BrowserWindow.getFocusedWindow()
    if (linkURL) {
        menu.append(new MenuItem({
            label: 'Open Link in New Window',
            visible: linkURL || isLink(selectionText),
            click: (menuItem, browserWindow, event) => {
                createBrowserWindow(linkURL ? linkURL : selectionText.trim())
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

    // Search with Google
    if (selectionText.trim()) {
        if (process.platform === 'darwin') {
            menu.append(new MenuItem({
                id: 'look-up',
                label: 'Look Up \"' + (selectionText.length < 61 ? selectionText : selectionText.substring(0, 58) + "...") + '\"',
                click: (menuItem, browserWindow, event) => {
                    if (webContents) webContents.showDefinitionForSelection()
                }
            }))
            menu.append(new MenuItem({
                type: 'separator',
            }))
        }
        menu.append(new MenuItem({
            id: 'search',
            label: 'Search with ' + (search === '0' ? 'Google' : search === '1' ? 'Duck Duck Go' : 'Bing'),
            click: (menuItem, browserWindow, event) => {
                let query = SEARCH_ENGINES[search]
                createBrowserWindow(query + selectionText)
            }
        }))
        menu.append(new MenuItem({
            type: 'separator',
        }))
    }

    // Image handlers, only displays with <img>
    if (mediaType === 'image') {
        menu.append(new MenuItem({
            label: 'Open Image in New Window',
            click: (menuItem, browserWindow, event) => {
                if (browserWindow) {
                    let url = menuItem.transform ? menuItem.transform(srcURL) : srcURL
                    createBrowserWindow(url)
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
                if (webContents) webContents.copyImageAt(x, y)
            }
        }))
        menu.append(new MenuItem({
            label: 'Download Image',
            click: (menuItem, browserWindow, event) => {
                let url = menuItem.transform ? menuItem.transform(srcURL) : srcURL
                if (webContents) webContents.downloadURL(url, { userAgent: USER_AGENT })
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
                if (webContents) webContents.copy()
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
                if (webContents) webContents.cut()
            }
        }))
        menu.append(new MenuItem({
            label: 'Copy',
            enabled: editFlags.canCopy,
            click: (menuItem, browserWindow, event) => {
                if (webContents) webContents.copy()
            }
        }))
        menu.append(new MenuItem({
            label: 'Paste',
            enabled: editFlags.canPaste,
            click: (menuItem, browserWindow, event) => {
                if (webContents) webContents.paste()
            }
        }))
        menu.append(new MenuItem({
            label: 'Paste and Match Style',
            enabled: editFlags.canPaste,
            click: (menuItem, browserWindow, event) => {
                if (webContents) webContents.pasteAndMatchStyle()
            }
        }))
        menu.append(new MenuItem({
            label: 'Select all',
            enabled: editFlags.canSelectAll,
            click: (menuItem, browserWindow, event) => {
                if (webContents) webContents.selectAll()
            }
        }))
        menu.append(new MenuItem({
            type: 'separator',
        }))
    }

    if (process.platform === 'darwin' && linkURL) {
        menu.append(new MenuItem({
            role: 'shareMenu',
            sharingItem: {
                urls: [linkURL]
            }
        }))
        menu.append(new MenuItem({
            type: 'separator',
        }))
    }

    if (focusedWindow && focusedWindow.isFullScreen() && process.platform === 'darwin') {
        menu.append(new MenuItem({
            label: 'Exit Full Screen mode',
            click: (menuItem, browserWindow, event) => {
                browserWindow.setFullScreen(false)
            }
        }))
        menu.append(new MenuItem({
            type: 'separator'
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
        visible: webContents,
        enabled: webContents && webContents.canGoBack(),
        click: (menuItem, browserWindow, event) => {
            if (webContents) webContents.goBack()
        }
    }))
    menu.append(new MenuItem({
        label: 'Go Forward',
        visible: webContents,
        enabled: webContents && webContents.canGoForward(),
        click: (menuItem, browserWindow, event) => {
            if (webContents) webContents.goForward()
        }
    }))
    menu.append(new MenuItem({
        label: 'Reload',
        visible: webContents,
        enabled: webContents,
        click: (menuItem, browserWindow, event) => {
            if (webContents) webContents.reload()
        }
    }))
    menu.append(new MenuItem({
        label: 'Copy Current page URL',
        visible: webContents,
        click: (menuItem, browserWindow, event) => {
            if (webContents) clipboard.writeText(webContents.getURL())
        }
    }))
    menu.append(new MenuItem({
        label: mute ? 'Unmute' : 'Mute',
        visible: webContents,
        click: (menuItem, browserWindow, event) => {
            webContents.setAudioMuted(!webContents.isAudioMuted())
        }
    }))
    menu.append(new MenuItem({
        label: 'Request Facebook Desktop site',
        visible: webContents && webContents.getURL().startsWith('https://m.facebook.com'),
        click: (menuItem, browserWindow, event) => {
            if (webContents) webContents.loadURL(webContents.getURL().replace('https://m.facebook.com', 'https://www.facebook.com'), { userAgent: USER_AGENT })
        }
    }))
    if (process.platform !== 'darwin' && sctxm === '0') {
        menu.append(new MenuItem({ type: 'separator' }))
        menu.append(new MenuItem({
            label: 'Facebook Home',
            click: (menuItem, browserWindow, event) => {
                if (webContents) webContents.loadURL(FACEBOOK_URL, { userAgent: USER_AGENT })
            }
        }))
        menu.append(new MenuItem({
            label: 'New Blank Window',
            click: (menuItem, browserWindow, event) => {
                let window = createBrowserWindow('src/blank.html', { blank: true })
                window.show()
            },
        }))
        menu.append(new MenuItem({ type: 'separator' }))
        menu.append(new MenuItem({
            label: 'Downloads',
            click: (item, window, event) => {
                createDownloadsWindow()
            }
        }),)
        menu.append(new MenuItem({
            label: 'Toggle Picture in Picture',
            id: 'pip',
            visible: pip === '1',
            click: (menuItem, browserWindow, event) => {
                if (browserWindow) {
                    webContents.executeJavaScript(PIP_JS_EXE)
                }
            }
        }))
        menu.append(new MenuItem({
            label: 'Toggle Full screen mode',
            click: (menuItem, browserWindow, event) => {
                let isFullScreen = browserWindow.isFullScreen()
                browserWindow.setFullScreen(!isFullScreen)
            }
        }))
    }


    // Inspect elements (dev tools)
    if (webContents && dev === '1') {
        menu.append(new MenuItem({ type: 'separator' }))
        menu.append(new MenuItem({
            label: 'Inspect element',
            click: (menuItem, browserWindow, event) => {
                webContents.inspectElement(x, y)
            }
        }))
        menu.append(new MenuItem({
            label: 'Open Developer Console',
            click: (menuItem, browserWindow, event) => {
                webContents.openDevTools()
            }
        }))
    }

    if (process.platform !== 'darwin' && sctxm === '0') {
        menu.append(new MenuItem({ type: 'separator' }))
        menu.append(new MenuItem({
            label: 'Settings',
            click: createPrefsWindow,
        }))
        menu.append(new MenuItem({
            label: 'About Native Facebook',
            click: createAboutWindow,
        }))
        menu.append(new MenuItem({
            label: 'Check for Updates...',
            click: () => checkForUpdates(true),
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
            label: 'New Facebook Window',
            click: (menuItem, browserWindow, event) => createBrowserWindow(FACEBOOK_URL)
        }),
        new MenuItem({
            label: 'New Messenger Window',
            click: (menuItem, browserWindow, event) => createBrowserWindow(MESSENGER_URL)
        }),
        new MenuItem({
            label: 'New Instagram Window',
            click: (menuItem, browserWindow, event) => createBrowserWindow(INSTAGRAM_URL)
        })
    ]
    app.dock.setMenu(Menu.buildFromTemplate(template))
}

/**
 * Initialize TouchBar (MBP only)
 */
function createTouchBarForWindow(window) {
    return
    let resolvePath = (name) => path.join(__dirname, `/assets/${name}_mono.png`)
    let resizeOptions = { width: 24, height: 24 }
    let useTab = titleBarAppearance === '0'
    window.setTouchBar(
        new TouchBar({
            items: [
                new TouchBar.TouchBarButton({
                    icon: nativeImage.createFromPath(resolvePath(FACEBOOK)).resize(resizeOptions),
                    click: () => {
                        let browserWindow = BrowserWindow.getFocusedWindow()
                        if (browserWindow && useTab) {
                            browserWindow.addTabbedWindow(createBrowserWindow(FACEBOOK_URL))
                        } else if (mainWindow.isDestroyed()) {
                            mainWindow = createBrowserWindow(FACEBOOK_URL)
                        } else {
                            createBrowserWindow(FACEBOOK_URL)
                        }
                    }
                }),
                new TouchBar.TouchBarButton({
                    icon: nativeImage.createFromPath(resolvePath(MESSENGER)).resize(resizeOptions),
                    click: () => {
                        let browserWindow = BrowserWindow.getFocusedWindow()
                        if (browserWindow && useTab) {
                            browserWindow.addTabbedWindow(createBrowserWindow(MESSENGER_URL))
                        } else if (mainWindow.isDestroyed()) {
                            mainWindow = createBrowserWindow(MESSENGER_URL)
                        } else {
                            createBrowserWindow(MESSENGER_URL)
                        }
                    }
                }),
                new TouchBar.TouchBarButton({
                    icon: nativeImage.createFromPath(resolvePath(INSTAGRAM)).resize(resizeOptions),
                    click: () => {
                        let browserWindow = BrowserWindow.getFocusedWindow()
                        if (browserWindow && useTab) {
                            browserWindow.addTabbedWindow(createBrowserWindow(INSTAGRAM_URL))
                        } else if (mainWindow.isDestroyed()) {
                            mainWindow = createBrowserWindow(INSTAGRAM_URL)
                        } else {
                            createBrowserWindow(INSTAGRAM_URL)
                        }
                    }
                }),
                new TouchBar.TouchBarButton({
                    icon: nativeImage.createFromPath(resolvePath('new_tab')).resize(resizeOptions),
                    click: () => {
                        let browserWindow = BrowserWindow.getFocusedWindow()
                        if (browserWindow && useTab) {
                            browserWindow.addTabbedWindow(createBrowserWindow('src/blank.html', { blank: true, show: true }))
                        } else if (mainWindow.isDestroyed()) {
                            mainWindow = createBrowserWindow('src/blank.html', { blank: true, show: true })
                        } else {
                            createBrowserWindow('src/blank.html', { blank: true, show: true })
                        }
                    }
                }),
            ]
        })
    )
}