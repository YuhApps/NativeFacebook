const { app, BrowserView, BrowserWindow, clipboard, dialog, ipcMain, Menu, MenuItem, nativeImage, nativeTheme, Notification, powerMonitor, ShareMenu, screen, shell, systemPreferences, TouchBar, webContents } = require('electron')
const electronRemote = require('@electron/remote/main')
const pushReceiver = require('electron-fcm-push-receiver')
const fetch = require('electron-fetch').default
const { platform } = require('os')
const path = require('path')
const validUrlUtf8 = require('valid-url-utf8')
const fs = require('fs')

const settings = require('./settings')

const VERSION_CODE = 1
const BUILD_DATE = '2022.09.25'
const DOWNLOADS_JSON_PATH = app.getPath('userData') + path.sep + 'downloads.json'
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
const FACEBOOK_REFRESH = 'document.querySelector(".oajrlxb2.g5ia77u1.qu0x051f.esr5mh6w.e9989ue4.r7d6kgcz.rq0escxv.nhd2j8a9.j83agx80'
    + '.p7hjln8o.kvgmc6g5.cxmmr5t8.oygrvhab.hcukyx3x.jb3vyjys.rz4wbd8a.qt6c0cv9.a8nywdso.i1ao9s8h.esuyzwwr.f1sip0of.lzcic4wl.n00je7tq.'
    + 'arfg74bv.qs9ysxi8.k77z8yql.l9j0dhe7.abiwlrkh.p8dawk7l.bp9cbjyn.cbu4d94t.datstx6m.taijpn5t.k4urcfbm").click()'
const SEARCH_ENGINES = {
    '0': 'https://www.google.com/?q=',
    '1': 'https://duckduckgo.com/?q=',
}


let aboutWindow, downloadsWindow, mainWindow, prefsWindow
let titleBarAppearance, forceDarkScrollbar
let tempUrl, forceCloseMainWindow = false, updateAvailable = false, sandbox = false

/** Basic Electron app events: */

electronRemote.initialize()

app.whenReady().then(() => {
    titleBarAppearance = settings.get('title-bar') || '0'
    forceDarkScrollbar = settings.get('scrollbar') || '0'
    sandbox = settings.get('sbox') === '1'
    console.log('sanbox', settings.get('sbox'))
    global.recentDownloads = [] 
    global.previousDownloads = fs.existsSync(DOWNLOADS_JSON_PATH) ? JSON.parse(fs.readFileSync(DOWNLOADS_JSON_PATH, 'utf-8') || '[]') : [] 
    requestCameraAndMicrophonePermissions()
    let mw = createMainWindow()
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
    checkForUpdate()
})

app.on('activate', (event, hasVisibleWindows) => {
    let badgeCount = app.getBadgeCount()
    if (BrowserWindow.getAllWindows().length === 0 || mainWindow === null || mainWindow.isDestroyed()) {
        createMainWindow()
    } else if (hasVisibleWindows && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.showInactive()
        let focusedWindow = BrowserWindow.getFocusedWindow()
        if (focusedWindow) focusedWindow.show()
    } else if (mainWindow) {
        mainWindow.show()
    }
    app.show()
    setTimeout(() => app.setBadgeCount(badgeCount), 500)
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
    let acb = settings.get('acb') || '0'
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
    let acb = settings.get('acb') || '0'
    if (acb === '1' && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
        mainWindow.close()
    }
})

powerMonitor.on('on-ac', () => {
    // Should do nothing
})

powerMonitor.on('suspend', () => {
    if (process.platform !== 'darwin') return
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
        forceCloseMainWindow = true
        mainWindow.close()
    }
})

powerMonitor.on('resume', (event) => {
    // Do nothing
})

// Handle app context menu invoke on Windows
ipcMain.on('app-context-menu', () => {
    let menu = new Menu()
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
        label: updateAvailable ? 'New update is available' : 'About Native Facebook',
        click: updateAvailable ? openDownloadPageOnGitHub : createAboutWindow
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
        downloadsWindow.minimize()
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

/** Create a browser window, used to createMainWindow and create a tab
 * @param url: The URL for the tab. The URL for mainWindow is 'https://www.facebook.com'
 * @param bounds: Window bounds
 * @param useMobileUserAgent: Request mobile website instead of the desktop version
 * @see createMainWindow
 * @see createContextMenuForWindow
 * @returns The window to be created.
 */
function createBrowserWindow(url, options) {
    let window = titleBarAppearance === '0' ? createBrowserWindowWithSystemTitleBar(url, options)
                                            : createBrowserWindowWithCustomTitleBar(url, options)
    
    window.on('enter-full-screen', () => {
        window.setMinimumSize(600, 600)
    })
    window.on('exit-full-screen', () => {
        window.setMinimumSize(800, 600)
    })
    return window
}

function createBrowserWindowWithSystemTitleBar(url, options) {
    let { bounds, blank, show } = options || { bounds: undefined, blank: false, show: true }
    let { x, y, width, height } = bounds || settings.get('mainWindow') || DEFAULT_WINDOW_BOUNDS
    let max = settings.get('max') || '0' // Windows and Linux only
    let window = new BrowserWindow({
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
    })
    if (max === '1') {
        window.maximize()
    }
    if (show) {
        window.show()
    }

    if (blank) {
        window.webContents.loadFile(url).then(() => {
            if (forceDarkScrollbar === '2' || (forceDarkScrollbar === '1' && window.webContents.getURL().startsWith(FACEBOOK_URL))) {
                window.webContents.executeJavaScript('document.documentElement.style.colorScheme = "dark"')
            }
        })
    } else {
        window.webContents.loadURL(url).then(() => {
            if (forceDarkScrollbar === '2' || (forceDarkScrollbar === '1' && window.webContents.getURL().startsWith(FACEBOOK_URL))) {
                window.webContents.executeJavaScript('document.documentElement.style.colorScheme = "dark"')
            }
        }).then(() => window.focus())
    }
    createTouchBarForWindow(window)
    pushReceiver.setup(window.webContents)
    //
    window.webContents.on('did-finish-load', () => {
        if (titleBarAppearance === '2') {
            window.webContents.executeJavaScript('document.body.classList.add("dark")')
        } else if (titleBarAppearance === '3') {
            window.webContents.executeJavaScript('document.body.classList.add("black")')
        }
        window.webContents.executeJavaScript('window.nfbSearchEngine = ' + (settings.get('search') || '0'))
        if (forceDarkScrollbar === '2' || (forceDarkScrollbar === '1' && window.webContents.getURL().startsWith(FACEBOOK_URL))) {
            window.webContents.executeJavaScript('document.documentElement.style.colorScheme = "dark"')
        }
    })

    // This will create a tab everytime an <a target="_blank" /> is clicked, instead of a new window
    window.webContents.setWindowOpenHandler(({ url, frameName, features, disposition, referrer, postBody }) => {
        if (url.startsWith('https://m.facebook.com')) url = url.replace('https://m.facebook.com', 'https://www.facebook.com')
        if (process.platform === 'darwin') {
            window.addTabbedWindow(createBrowserWindow(url))
        } else {
            createBrowserWindow(url)
        }
        return { action: 'deny' }
    })
    // Create context menu for each window
    window.webContents.on('context-menu', (event, params) => {
        params['mute'] = window && window.webContents.isAudioMuted()
        createContextMenuForWindow(window.webContents, params).popup()
    })
    window.webContents.on('did-navigate-in-page', ((event, url, httpResponseCode) => {
        let menu = Menu.getApplicationMenu()
        if (menu !== null) {
            menu.getMenuItemById('app-menu-go-back').enabled = window.webContents.canGoBack()
            menu.getMenuItemById('app-menu-go-forward').enabled = window.webContents.canGoForward()
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
    window.webContents.on('page-title-updated', (event, title, explicitSet) => {
        if (process.platform === 'win32') {
            event.preventDefault()
            window.setTitle(`   ${title}`)
        }
    })
    return window
}

function createBrowserWindowWithCustomTitleBar(url, options) {
    let { bounds, blank, show } = options || { bounds: undefined, blank: false, show: options ? options.blank : true }
    let { x, y, width, height } = bounds || settings.get('mainWindow') || DEFAULT_WINDOW_BOUNDS
    let max = settings.get('max') || '0' // Windows and Linux only
    let titleBarHeight = process.platform === 'win32' ? 32 : 28
    if (titleBarAppearance === 0) {
        nativeTheme.themeSource = process.platform === 'win32' ? 'light' : 'system'
    } else if (titleBarAppearance === '1') {
        nativeTheme.themeSource = 'light'
    } else {
        nativeTheme.themeSource = 'dark'
    }
    let window = new BrowserWindow({
        x: x,
        y: y,
        height: height,
        width: width,
        minHeight: 600,
        minWidth: 800,
        show: false,
        backgroundColor: titleBarAppearance === '1' ? '#ffffff' : titleBarAppearance === '2' ? '#242526' : '#000000',
        titleBarStyle: titleBarAppearance !== '0' ? 'hidden' : undefined,
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
    let titleView = new BrowserView({
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true,
            contextIsolation: false,
        }
    })
    titleView.setAutoResize({ x: true, y: true, horizontal: true, vertical: false })
    window.addBrowserView(titleView)
    titleView.setBounds({ x: 0, y: 0, width: window.getBounds().width, height: titleBarHeight })
    // Main content
    let mainView = new BrowserView({
        webPreferences: {
            sandbox: sandbox,
            scrollBounce: true, 
            spellcheck: settings.get('spell') === '1' || false,
            enableRemoteModule: blank,
            contextIsolation: true,
            // preload: blank ? path.join(__dirname, 'blank_preload.js') : undefined,
        }
    })
    mainView.setAutoResize({ x: false, y: false, width: true, height: true })
    mainView.setBackgroundColor(titleBarAppearance === '0' ? undefined : titleBarAppearance === '1' ? '#ffffffff' : titleBarAppearance === '2' ? '#ff232425' : '#ff000000')
    window.addBrowserView(mainView)
    mainView.setBounds({ x: 0, y: titleBarHeight, width: window.getBounds().width, height: window.getBounds().height - titleBarHeight })
    // Load URL or File
    electronRemote.enable(titleView.webContents)
    electronRemote.enable(mainView.webContents)
    titleView.webContents.loadFile('src/title.html')
    if (blank) {
        mainView.webContents.loadFile(url).then(() => {
            if (forceDarkScrollbar === '2' || (forceDarkScrollbar === '1' && mainView.webContents.getURL().startsWith(FACEBOOK_URL))) {
                mainView.webContents.executeJavaScript('document.documentElement.style.colorScheme = "dark"')
            }
        }).then(() => mainView.webContents.focus())
    } else {
        mainView.webContents.loadURL(url).then(() => {
            if (forceDarkScrollbar === '2' || (forceDarkScrollbar === '1' && mainView.webContents.getURL().startsWith(FACEBOOK_URL))) {
                mainView.webContents.executeJavaScript('document.documentElement.style.colorScheme = "dark"')
            }
        }).then(() => window.focus())
    }
    createTouchBarForWindow(window)
    pushReceiver.setup(mainView.webContents)
    //
    mainView.webContents.on('did-finish-load', () => {
        if (titleBarAppearance === '2') {
            mainView.webContents.executeJavaScript('document.body.classList.add("dark")')
        } else if (titleBarAppearance === '3') {
            mainView.webContents.executeJavaScript('document.body.classList.add("black")')
        }
        mainView.webContents.executeJavaScript('window.nfbSearchEngine = ' + (settings.get('search') || '0'))
        if (forceDarkScrollbar === '2' || (forceDarkScrollbar === '1' && mainView.webContents.getURL().startsWith(FACEBOOK_URL))) {
            mainView.webContents.executeJavaScript('document.documentElement.style.colorScheme = "dark"')
        }
    })
    
    // Update title
    mainView.webContents.on('page-title-updated', (event, title, explicitSet) => {
        titleView.webContents.send('update-title', title)
        if (window && !window.isDestroyed()) window.setTitle(title)
        if (titleBarHeight > 100) titleView.webContents.openDevTools()
    })
    // Create context menu for each window
    mainView.webContents.on('context-menu', (event, params) => {
        params['mute'] = window && mainView.webContents.isAudioMuted()
        createContextMenuForWindow(mainView.webContents, params).popup()
    })
    mainView.webContents.on('did-navigate-in-page', ((event, url, httpResponseCode) => {
        let menu = Menu.getApplicationMenu()
        if (menu !== null) {
            menu.getMenuItemById('app-menu-go-back').enabled = mainView.webContents.canGoBack()
            menu.getMenuItemById('app-menu-go-forward').enabled = mainView.webContents.canGoForward()
        }
    }))
    mainView.webContents.setWindowOpenHandler(({ url, frameName, features, disposition, referrer, postBody }) => {
        if (url.startsWith('https://m.facebook.com')) url = url.replace('https://m.facebook.com', 'https://www.facebook.com')
        createBrowserWindow(url)
        return { action: 'deny' }
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
    window.on('leave-full-screen', () => {
        mainView.webContents.executeJavaScript('document.exitFullscreen()')
    })
    window.on('focus', () => {
        let menu = Menu.getApplicationMenu()
        if (menu !== null) {
            menu.getMenuItemById('app-menu-go-back').enabled = mainView.webContents.canGoBack()
            menu.getMenuItemById('app-menu-go-forward').enabled = mainView.webContents.canGoForward()
            menu.getMenuItemById('app-menu-reload').enabled = true
            menu.getMenuItemById('app-menu-copy-url').enabled = true
            menu.getMenuItemById('app-menu-mute-tab').enabled = true
            menu.getMenuItemById('app-menu-mute-website').visible = false
            menu.getMenuItemById('app-menu-mute-tabs').visible = false
            menu.getMenuItemById('app-menu-unmute-tabs').visible = false
        }
    })
    window.on('close', (event) => {
        let acb = settings.get('acb') || '0'
        if (window !== mainWindow || process.platform !== 'darwin') {
            titleView.webContents.destroy()
            mainView.webContents.destroy()
            window.removeBrowserView(titleView)
            window.removeBrowserView(mainView)
            titleView = null
            mainView = null
        } else if (acb === '2' || (acb === '1' && powerMonitor.onBatteryPower)) {
            titleView.webContents.destroy()
            mainView.webContents.destroy()
            window.removeBrowserView(titleView)
            window.removeBrowserView(mainView)
            titleView = null
            mainView = null
        }
    })
    return window
}

function handleDownload(item, webContents) {
    item['id'] = `${item.getStartTime()}`
    item['url'] = item.getURL()
    item['startTime'] = item.getStartTime()
    global.recentDownloads = [item, ...global.recentDownloads]
    new Notification({ body: 'Download started', title: item.getFilename() }).show()
    item.on('done', (event, state) => new Notification({ body: 'Download ' + state, title: item.getFilename() }).show())
}

/**
 * Create the mainWindow object.
 * @see mainWindow
 * @see createBrowserWindow
 */
function createMainWindow(url) {
    mainWindow = createBrowserWindow(url || FACEBOOK_URL)
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
        let acb = settings.get('acb') || '0'
        if (process.platform !== 'darwin' || forceCloseMainWindow) {
            forceCloseMainWindow = false
            return
        } else if (acb === '0' || (acb === '1' && !powerMonitor.onBatteryPower)) {
            event.preventDefault()
            mainWindow.hide()
        }
    })
    if (titleBarAppearance === '0') {
        mainWindow.webContents.on('page-title-updated', (event, title, explicitSet) => {
            let badgeCount = 0
            if (title.startsWith('(')) {
                try {
                    badgeCount = parseInt(title.substring(1, title.indexOf(')')))
                } catch (e) {}
            }
            app.setBadgeCount(badgeCount)
        })
    } else {
        mainWindow.getBrowserViews()[1].webContents.on('page-title-updated', (event, title, explicitSet) => {
            let badgeCount = 0
            if (title.startsWith('(')) {
                try {
                    badgeCount = parseInt(title.substring(1, title.indexOf(')')))
                } catch (e) {}
            }
            app.setBadgeCount(badgeCount)
        })
    }
    return mainWindow
}

function createAboutWindow() {
    if (aboutWindow) {
        aboutWindow.show()
    } else {
        let s = (mainWindow && !mainWindow.isDestroyed()) ? mainWindow.getBounds() : screen.getPrimaryDisplay().workAreaSize
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
            if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
                let webContents = titleBarAppearance === '0' ? mainWindow.webContents : mainWindow.getBrowserViews()[1].webContents
                if (webContents.getURL().startsWith(FACEBOOK_URL)) {
                    webContents.executeJavaScript('document.documentElement.classList.contains("__fb-dark-mode")')
                    .then((res) => {
                        aboutWindow.webContents.send('dark', res, version)
                        settings.set('prefs-dark', res)
                    })
                    .catch((e) => {
                        let dark = settings.get('prefs-dark') || false
                        aboutWindow.webContents.send('dark', dark, version)
                    })
                } else {
                    let dark = settings.get('prefs-dark') || false
                    aboutWindow.webContents.send('dark', dark, version)
                }
            } else {
                let dark = settings.get('prefs-dark') || false
                aboutWindow.webContents.send('dark', dark, version)
            }
        })
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
        let x = Math.round(s.width / 2 - 400)
        let y = 120
        prefsWindow = new BrowserWindow({
            x: x,
            y: y,
            alwaysOnTop: true,
            backgroundColor: titleBarAppearance === '0' ? undefined : titleBarAppearance === '1' ? '#ffffff' : '#000000',
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
        prefsWindow.on('closed', () => {
            prefsWindow = null
            settings.refresh()
            let t = settings.get('title-bar') || '0'
            let s = settings.get('scrollbar') || '0'
            if (t !== titleBarAppearance || s !== forceDarkScrollbar) {
                app.relaunch()
                setTimeout(app.quit, 500)
            }
        })
        prefsWindow.webContents.on('did-finish-load', (e) => {
            let version = app.getVersion() + ' (' + BUILD_DATE + ')'
            if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
                let webContents = titleBarAppearance === '0' ? mainWindow.webContents : mainWindow.getBrowserViews()[1].webContents
                if (webContents.getURL().startsWith(FACEBOOK_URL)) {
                    webContents.executeJavaScript('document.documentElement.classList.contains("__fb-dark-mode")')
                    .then((res) => {
                        prefsWindow.webContents.send('dark', res, version, updateAvailable)
                        settings.set('prefs-dark', res)
                    })
                    .catch((e) => {
                        let dark = settings.get('prefs-dark') || false
                        prefsWindow.webContents.send('dark', dark, version, updateAvailable)
                    })
                } else {
                    let dark = settings.get('prefs-dark') || false
                    prefsWindow.webContents.send('dark', dark, version, updateAvailable)
                }
            } else {
                let dark = settings.get('prefs-dark') || false
                prefsWindow.webContents.send('dark', dark, version, updateAvailable)
            }
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
        let s = (mainWindow && !mainWindow.isDestroyed()) ? mainWindow.getBounds() : screen.getPrimaryDisplay().workAreaSize
        let x = s.width / 2 - 400
        let y = 120
        downloadsWindow = new BrowserWindow({
            x: x,
            y: y,
            alwaysOnTop: true,
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
            if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
                let webContents = titleBarAppearance === '0' ? mainWindow.webContents : mainWindow.getBrowserViews()[1].webContents
                if (webContents.getURL().startsWith(FACEBOOK_URL)) {
                    webContents.executeJavaScript('document.documentElement.classList.contains("__fb-dark-mode")')
                    .then((res) => {
                        downloadsWindow.webContents.send('dark', res, version)
                        settings.set('prefs-dark', res)
                    })
                    .catch((e) => {
                        let dark = settings.get('prefs-dark') || false
                        downloadsWindow.webContents.send('dark', dark, version)
                    })
                } else {
                    let dark = settings.get('prefs-dark') || false
                    downloadsWindow.webContents.send('dark', dark, version)
                }
            } else {
                let dark = settings.get('prefs-dark') || false
                downloadsWindow.webContents.send('dark', dark, version)
            }
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
    let appMenu = new MenuItem({
        label: 'Facebook',
        submenu: [
            new MenuItem({
                label: 'About Native Facebook',
                click: createAboutWindow
            }),
            new MenuItem({ type: 'separator' }),
            new MenuItem({
                label: 'Preferences...',
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
            new MenuItem({ role: 'hide' }),
            new MenuItem({ role: 'hideOthers' }),
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
                    if (!browserWindow) return
                    if (titleBarAppearance === '0') {
                        browserWindow.webContents.goBack()
                    } else if (browserWindow) {
                        browserWindow.getBrowserViews()[1].webContents.goBack()
                    }
                }
            }),
            new MenuItem({
                label: 'Go Forward',
                id: 'app-menu-go-forward',
                enabled: true,
                accelerator: 'Cmd+Right',
                click: (menuItem, browserWindow, event) => {
                    if (!browserWindow) return
                    if (titleBarAppearance === '0') {
                        browserWindow.webContents.goForward()
                    } else if (browserWindow) {
                        browserWindow.getBrowserViews()[1].webContents.goForward()
                    }
                }
            }),
            new MenuItem({
                label: 'Reload',
                id: 'app-menu-reload',
                accelerator: 'Cmd+R',
                click: (menuItem, browserWindow, event) => {
                    if (!browserWindow) return
                    if (titleBarAppearance === '0') {
                        browserWindow.webContents.reload()
                    } else if (browserWindow) {
                        browserWindow.getBrowserViews()[1].webContents.reload()
                    }
                }
            }),
            new MenuItem({
                label: 'Copy Current page URL',
                id: 'app-menu-copy-url',
                visible: true,
                click: (menuItem, browserWindow, event) => {
                    if (!browserWindow) return
                    if (titleBarAppearance === '0') {
                        clipboard.writeText(browserWindow.webContents.getURL())
                    } else if (browserWindow) {
                        clipboard.writeText(browserWindow.getBrowserViews()[1].webContents.getURL())
                    }
                }
            }),
            new MenuItem({
                label: 'Mute/Unmute Current Tab',
                id: 'app-menu-mute-tab',
                visible: true,
                click: (menuItem, browserWindow, event) => {
                    if (!browserWindow) return
                    if (titleBarAppearance === '0') {
                        browserWindow.webContents.setAudioMuted(!browserWindow.webContents.isAudioMuted())
                    } else {
                        browserWindow.getBrowserViews()[1].webContents
                            .setAudioMuted(!browserWindow.getBrowserViews()[1].webContents.isAudioMuted())
                    }
                }
            }),
            new MenuItem({
                label: 'Mute Website',
                id: 'app-menu-mute-website',
                visible: true,
                enabled: titleBarAppearance === '0',
                click: (menuItem, browserWindow, event) => {
                    let browserWindows = BrowserWindow.getAllWindows()
                    if (!browserWindow) return
                    browserWindow.webContents.executeJavaScript('window.location.origin')
                    .then((origin) => {
                        browserWindows.forEach((window) =>
                            window.webContents.setAudioMuted(window.webContents.getURL().startsWith(origin)))
                        })
                }
            }),
            new MenuItem({
                label: 'Mute All Tabs',
                id: 'app-menu-mute-tabs',
                visible: true,
                enabled: titleBarAppearance === '0',
                click: (menuItem, browserWindow, event) => {
                    let browserWindows = BrowserWindow.getAllWindows()
                    if (!browserWindows) return
                    browserWindows.forEach((window) => window.webContents.setAudioMuted(true))
                }
            }),
            new MenuItem({
                label: 'Unmute All Tabs',
                id: 'app-menu-unmute-tabs',
                visible: true,
                enabled: titleBarAppearance === '0',
                click: (menuItem, browserWindow, event) => {
                    let browserWindows = BrowserWindow.getAllWindows()
                    if (!browserWindows) return
                    browserWindows.forEach((window) => window.webContents.setAudioMuted(false))
                }
            }),
            new MenuItem({ type: 'separator' }),
            new MenuItem({
                label: 'Facebook Home',
                accelerator: 'Cmd+Shift+F',
                id: 'fb-home',
                click: (menuItem, browserWindow, event) => {
                    if (!browserWindow) return
                    if (titleBarAppearance === '0') {
                        browserWindow.webContents.loadURL(FACEBOOK_URL)
                    } else if (browserWindow) {
                        browserWindow.getBrowserViews()[1].webContents.loadURL(FACEBOOK_URL)
                    }
                }
            }),
            new MenuItem({
                label: 'New Facebook Tab',
                accelerator: 'Cmd+F',
                visible: titleBarAppearance === '0',
                enabled: titleBarAppearance === '0',
                click: (menuItem, browserWindow, event) => {
                    if (mainWindow.isDestroyed()) {
                        createMainWindow(FACEBOOK_URL)
                    } else if (browserWindow) {
                        browserWindow.addTabbedWindow(createBrowserWindow(FACEBOOK_URL))
                    } else {
                        let bounds = settings.get('mainWindow') || DEFAULT_WINDOW_BOUNDS
                        mainWindow = createBrowserWindow(FACEBOOK_URL, { bounds })
                    }
                },
            }),
            new MenuItem({
                label: 'New Messenger Tab',
                accelerator: 'Cmd+M',
                visible: titleBarAppearance === '0',
                enabled: titleBarAppearance === '0',
                click: (menuItem, browserWindow, event) => {
                    if (mainWindow.isDestroyed()) {
                        createMainWindow(MESSENGER_URL)
                    } else if (browserWindow) {
                        browserWindow.addTabbedWindow(createBrowserWindow(MESSENGER_URL))
                    } else {
                        let bounds = settings.get('mainWindow') || DEFAULT_WINDOW_BOUNDS
                        mainWindow = createBrowserWindow(MESSENGER_URL, { bounds })
                    }
                },
            }),
            new MenuItem({
                label: 'New Instagram Tab',
                accelerator: 'Cmd+I',
                visible: titleBarAppearance === '0',
                enabled: titleBarAppearance === '0',
                click: (menuItem, browserWindow, event) => {
                    if (mainWindow.isDestroyed()) {
                        createMainWindow(INSTAGRAM_URL)
                    } else if (browserWindow) {
                        browserWindow.addTabbedWindow(createBrowserWindow(INSTAGRAM_URL))
                    } else {
                        let bounds = settings.get('mainWindow') || DEFAULT_WINDOW_BOUNDS
                        mainWindow = createBrowserWindow(INSTAGRAM_URL, { bounds })
                    }
                },
            }),
            new MenuItem({
                label: 'New Blank Tab',
                accelerator: 'Cmd+T',
                enabled: titleBarAppearance === '0',
                visible: titleBarAppearance === '0',
                click: (menuItem, browserWindow, event) => {
                    let window = createBrowserWindow('src/blank.html', { blank: true, show: true })
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
                label: 'New Blank Window',
                accelerator: 'Cmd+N',
                enabled: true,
                click: (menuItem, browserWindow, event) => createBrowserWindow('src/blank.html', { blank: true, show: true })
            }),
            new MenuItem({
                type: 'separator',
            }),
            new MenuItem({
                label: 'Downloads',
                accelerator: 'Cmd+Shift+J',
                click: (item, browserWindow, event) => createDownloadsWindow()
            }),
            new MenuItem({ type: 'separator' }),
            new MenuItem({ role: 'close' }),
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
                        browserWindow.webContents.executeJavaScript(PIP_JS_EXE)
                    }
                }
            }),
            new MenuItem({ 
                id: 'dev-tools',
                label: 'Toggle Developer Tools',
                visible: dev === '1',
                click: (menuItem, browserWindow, event) => {
                    let window = BrowserWindow.getFocusedWindow()
                    if (!window) return
                    let browserViews = window.getBrowserViews()
                    let webContents = browserViews !== null && browserViews.length > 1 ? browserViews[1].webContents : window.webContents
                    if (webContents.isDevToolsOpened()) webContents.closeDevTools() 
                    else                                webContents.openDevTools()
                }
            }),
        ]
    })

    // Window menu
    let window = new MenuItem({ role: 'windowMenu'})

    // Help menu
    let help = new MenuItem({
        label: 'Help',
        role: 'help',
        submenu: [ new MenuItem({ label: 'Developed by YUH APPS' })]
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
    let focusedWindow = BrowserWindow.getFocusedWindow()
    if (linkURL) {
        menu.append(new MenuItem({
            label: 'Open Link in New Background Tab',
            visible: process.platform === 'darwin' && titleBarAppearance === '0' && (linkURL || isLink(selectionText.trim())),
            click: (menuItem, browserWindow, event) => {
                let windows = BrowserWindow.getAllWindows()
                let finalWindow = windows[windows.length === 1 ? 0 : 1]
                if (browserWindow) {
                    browserWindow.addTabbedWindow(createBrowserWindow(linkURL || selectionText.trim(), { show: false }))
                    browserWindow.focus()
                } else {
                    finalWindow.addTabbedWindow(createBrowserWindow(linkURL || selectionText.trim(), { show: false }))
                }
            }
        }))
        menu.append(new MenuItem({
            label: 'Open Link in New Foreground Tab',
            visible: process.platform === 'darwin' && titleBarAppearance === '0' && (linkURL || isLink(selectionText.trim())),
            click: (menuItem, browserWindow, event) => {
                let windows = BrowserWindow.getAllWindows()
                let finalWindow = windows[windows.length === 1 ? 0 : 1]
                if (browserWindow) {
                    browserWindow.addTabbedWindow(createBrowserWindow(linkURL || selectionText.trim()))
                } else {
                    finalWindow.addTabbedWindow(createBrowserWindow(linkURL || selectionText.trim())) 
                }
            }
        }))
        menu.append(new MenuItem({
            label: 'Open Link in New Window',
            visible: (process.platform !== 'darwin' || titleBarAppearance !== '0' )&& (linkURL || isLink(selectionText)),
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
            label: 'Search with ' + (search === '0' ? 'Google' : 'Duck Duck Go'),
            click: (menuItem, browserWindow, event) => {
                let query = SEARCH_ENGINES[search]
                if (titleBarAppearance === '0') {
                    browserWindow.addTabbedWindow(createBrowserWindow(query + selectionText))
                } else {
                    createBrowserWindow(query + selectionText)
                }
            }
        }))
        menu.append(new MenuItem({
            type: 'separator',
        }))
    }

    // Image handlers, only displays with <img>
    if (mediaType === 'image') {
        menu.append(new MenuItem({
            label: process.platform === 'darwin' && titleBarAppearance === '0' ? 'Open Image in New Tab' : 'Open Image in New Window',
            click: (menuItem, browserWindow, event) => {
                if (browserWindow) {
                    let url = menuItem.transform ? menuItem.transform(srcURL) : srcURL
                    if (process.platform === 'darwin' && titleBarAppearance === '0') {
                        browserWindow.addTabbedWindow(createBrowserWindow(url))
                    } else {
                        createBrowserWindow(url)
                    }
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
                if (webContents) webContents.downloadURL(url)
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
            if (webContents) webContents.loadURL(webContents.getURL().replace('https://m.facebook.com', 'https://www.facebook.com'))
        }
    }))
    if (process.platform !== 'darwin') {
        menu.append(new MenuItem({ type: 'separator' }))
        menu.append(new MenuItem({
            label: 'Facebook Home',
            click: (menuItem, browserWindow, event) => {
                if (webContents) webContents.loadURL(FACEBOOK_URL)
            }
        }))
        menu.append(new MenuItem({
            label: 'New Blank Window',
            click: (menuItem, browserWindow, event) => {
                let window = createBrowserWindow('src/blank.html', { blank: true })
                if (mainWindow.isDestroyed()) {
                    window.show()
                } else {
                    window.show()
                    window.focus()
                    createTouchBarForWindow(window)
                }
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

    if (process.platform !== 'darwin') {
        menu.append(new MenuItem({ type: 'separator' }))
        menu.append(new MenuItem({
            label: 'Settings',
            click: createPrefsWindow,
        }))
        menu.append(new MenuItem({
            label: isDefaultHttpProtocolClient() ? 'Resign from default browser' : 'Set Native Facebook as the default browser',
            click: (menuItem, browserWindow, event) => {
                let checked = isDefaultHttpProtocolClient()
                if (checked) {
                    askRevertToTheDefaultBrowser(checked)
                } else {
                    requestToBeTheDefaultBrowser()
                }
            }
        }))
        menu.append(new MenuItem({
            label: 'About Native Facebook',
            click: createAboutWindow,
        }))
    }

    if (updateAvailable) {
        menu.append(new MenuItem({ type: 'separator' }))
        menu.append(new MenuItem({
            label: 'New version available',
            click: openDownloadPageOnGitHub,
        }))
    }

    return menu
}

/**
 * Create Dock actions on macOS
 */
function createDockActions() {
    let useTab = titleBarAppearance === '0'
    let template = [
        new MenuItem({
            label: useTab ? 'New Facebook Tab' : 'New Facebook Window',
            click: (menuItem, browserWindow, event) => {
                if (browserWindow && useTab) {
                    browserWindow.addTabbedWindow(createBrowserWindow(FACEBOOK_URL))
                } else if (mainWindow.isDestroyed()) {
                    mainWindow = createBrowserWindow(FACEBOOK_URL)
                } else {
                    createBrowserWindow(FACEBOOK_URL)
                }
            },
        }),
        new MenuItem({
            label: useTab ? 'New Messenger Tab' : 'New Messenger Window',
            click: (menuItem, browserWindow, event) => {
                if (browserWindow && useTab) {
                    browserWindow.addTabbedWindow(createBrowserWindow(MESSENGER_URL))
                } else if (mainWindow.isDestroyed()) {
                    mainWindow = createBrowserWindow(MESSENGER_URL)
                } else {
                    createBrowserWindow(MESSENGER_URL)
                }
            },
        }),
        new MenuItem({
            label: useTab ? 'New Instagram Tab' : 'New Instagram Window',
            click: (menuItem, browserWindow, event) => {
                if (browserWindow && useTab) {
                    browserWindow.addTabbedWindow(createBrowserWindow(INSTAGRAM_URL))
                } else if (mainWindow.isDestroyed()) {
                    mainWindow = createBrowserWindow(INSTAGRAM_URL)
                } else {
                    createBrowserWindow(INSTAGRAM_URL)
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

function checkForUpdate() {
    const cfuURL = 'https://yuhapps.dev/api/nfb/cfu'
    const now = Date.now()
    const lastUpdate = settings.get('cfu_last_fetch') || 0
    if (now - lastUpdate > 86400000 * 7) {
        fetch(cfuURL).then((res) => res.json())
        .then(({ vc, vn }) => {
            settings.set('cfu_last_fetch', now)
            if (vc > VERSION_CODE) {
                let notification = new Notification({
                    title: 'Update available',
                    body: 'There is a new update for Facebook (unofficial). Click here to download it.',
                    silent: true
                })
                notification.on('click', (e) => openDownloadPageOnGitHub())
                notification.show()
                updateAvailable = true
            }
        })
    }
}