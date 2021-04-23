const { app, BrowserWindow, clipboard, dialog, Menu, MenuItem, nativeImage, shell, systemPreferences, TouchBar } = require('electron')
const { setup: setuPushReceiver } = require('electron-push-receiver')
const settings = require('electron-settings')
const { platform } = require('os')
const path = require('path')
const validUrlUtf8 = require('valid-url-utf8')

const FACEBOOK_URL = 'https://www.facebook.com'
const MESSENGER_URL = 'https://www.messenger.com'
const INSTAGRAM_URL = 'https://www.instagram.com'

const FACEBOOK = 'facebook'
const MESSENGER = 'messenger'
const INSTAGRAM = 'instagram'

const MOBILE_USER_AGENT = 'Mozilla/5.0 (Android 9; Mobile; rv:68.0) Gecko/68.0 Firefox/68.0'
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
            console.log(i);
            video.requestPictureInPicture().then((res) => {
              video.setAttribute('__pip__', true);
              video.addEventListener('leavepictureinpicture', (e) => {
                video.removeAttribute('__pip__');
              })
              console.log(res);
            }).catch((error) => console.log(error));
            break;
          }
        }
      }
    }
    `

const DEFAULT_WINDOW_BOUNDS = { x: undefined, y: undefined, width: 1280, height: 800 }

let mainWindow, instagramMobileWindow, prefsWindow

/** Basic Electron app events: */

app.whenReady().then(() => {
  requestCameraAndMicrophonePermissions()
  createMainWindow()
  createAppMenu()
  createDockActions()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 || mainWindow.isDestroyed()) {
    createMainWindow()
  } else if (mainWindow) {
    mainWindow.show()
  }
})

app.on('open-url', (event, url) => {
  createBrowserWindow(url, DEFAULT_WINDOW_BOUNDS)
})

// https://www.electronjs.org/docs/api/app#appsetaboutpaneloptionsoptions
app.setAboutPanelOptions({
  applicationName: 'Facebook (unofficial)',
  applicationVersion: '1.0.2',
  copyright: 'Developed by YUH APPS. This app is not the official Facebook client and has no affliations with Facebook. All right reserved.',
  version: '20210418'
})

app.on('before-quit', (event) => {
  askRevertToTheDefaultBrowser(isDefaultHttpProtocolClient())
})

app.on('window-all-closed', () => {
  askRevertToTheDefaultBrowser(isDefaultHttpProtocolClient())
  let acb = settings.getSync('acb') || '0'
  if (process.platform !== 'darwin' || acb === '1') {
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

/** End of Basic Electron app events. */

/**************************************/

function requestCameraAndMicrophonePermissions() {
  let cam_mic = settings.getSync('cam_mic', 1)
  if (cam_mic === 0) return
  Promise.all([systemPreferences.getMediaAccessStatus("camera"), systemPreferences.getMediaAccessStatus("microphone")])
      .then(async ([cam, mic]) => {
        console.log(cam, mic)
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
function createBrowserWindow(url, bounds, useMobileUserAgent) {
  let { x, y, width, height } = bounds || settings.getSync('mainWindow') || DEFAULT_WINDOW_BOUNDS
  let window = new BrowserWindow({
    x: x,
    y: y,
    width: width,
    height: height,
    title: "New Tab",
    webviewTag: true,
    webPreferences: {
      webSecurity: true,
      plugins: true,
      spellcheck: settings.getSync('spell') === '1' || false
    },
  })
  if (useMobileUserAgent) {
    window.webContents.setUserAgent(MOBILE_USER_AGENT)
  }
  window.loadURL(url)
  setuPushReceiver(window.webContents)
  createTouchBarForWindow(window)

  // This will create a tab everytime an <a target="_blank" /> is clicked, instead of a new window
  // Unused params in the callback in order: frameName, disposition, options, additionalFeatures, referrer, postBody
  window.webContents.on('new-window', (event, url) => {
    event.preventDefault()
    window.addTabbedWindow(createBrowserWindow(url))
  })

  // Create context menu for each window
  window.webContents.on('context-menu', (event, params) => {
    params['mute'] = window && window.webContents.isAudioMuted()
    createContextMenuForWindow(params).popup()
  })

  window.webContents.on('did-navigate-in-page', ((event, url, httpResponseCode) => {
    let menu = Menu.getApplicationMenu()
    menu.getMenuItemById('app-menu-go-back').enabled = window.webContents.canGoBack()
    menu.getMenuItemById('app-menu-go-forward').enabled = window.webContents.canGoForward()
  }))

  window.on('focus', () => {
    let menu = Menu.getApplicationMenu()
    menu.getMenuItemById('app-menu-go-back').enabled = window.webContents.canGoBack()
    menu.getMenuItemById('app-menu-go-forward').enabled = window.webContents.canGoForward()
    menu.getMenuItemById('app-menu-reload').enabled = true
    menu.getMenuItemById('app-menu-copy-url').enabled = true
    menu.getMenuItemById('app-menu-mute-tab').enabled = true
    menu.getMenuItemById('app-menu-mute-website').enabled = true
    menu.getMenuItemById('app-menu-mute-tabs').enabled = true
    menu.getMenuItemById('app-menu-unmute-tabs').enabled = true
  })

  /*
  window.on('close', (event) => {
    let windows = BrowserWindow.getAllWindows()
    if ((window === mainWindow) && windows.length === 1) {
      event.preventDefault()
      window.hide()
    }
  })
   */

  window.webContents.session.on('will-download', (event, item, webContents) => {
    let downloads = settings.getSync('downloads')
    if (!downloads) settings.setSync('downloads', [])
    downloads.unshift(item)
  })

  return window
}

/**
 * Create the mainWindow object.
 * @see mainWindow
 * @see createBrowserWindow
 */
function createMainWindow(url) {
  mainWindow = createBrowserWindow(url || FACEBOOK_URL)
  mainWindow.on('ready-to-show', () => {
    let ins = settings.getSync('ins') || '0'
    let msg = settings.getSync('msg') || '0'
    console.log(ins, msg)
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
  mainWindow.on('resize', () => {
    settings.set('mainWindow', mainWindow.getBounds())
  })
  mainWindow.on('move', () => {
    settings.set('mainWindow', mainWindow.getBounds())
  })
}

/**
 * Create the prefsWindow
 * @see prefsWindow
 */
function createPrefsWindow() {
  if (prefsWindow) {
    prefsWindow.show()
  } else {
    prefsWindow = new BrowserWindow({
      maximizable: false,
      webPreferences: {
        webSecurity: true,
        tabbingIdentifier: "Prefs",
        plugins: true,
        nodeIntegration: true,
        enableRemoteModule: true,
        devTools: true,
        contextIsolation: false
      }
    })
    prefsWindow.loadFile('src/' + 'prefs.html')
    prefsWindow.on('close', () => {
      let dev = settings.getSync('dev') || '0'
      let pip = settings.getSync('pip') || '0'
      let menu = Menu.getApplicationMenu()
      menu.getMenuItemById('pip').visible = pip === '1'
      menu.getMenuItemById('pip-sep').visible = pip === '1'
      menu.getMenuItemById('dev-tools').visible = dev === '1'
      menu.getMenuItemById('dev-tools-sep').visible = dev === '1'
    })
  }
  prefsWindow.on('closed', () => prefsWindow = null)
}

/**
 * Create the instagramMobileWindow
 * @see instagramMobileWindow
 */
function createInstagramMobileWindow() {
  if (instagramMobileWindow) {
    instagramMobileWindow.show()
  } else {
    instagramMobileWindow = createBrowserWindow(INSTAGRAM_URL, { width: 480, height: 720 }, true)
  }
  instagramMobileWindow.on('closed', () => instagramMobileWindow = null)
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
 * Create the app menu.
 * @see app.whenReady
 */
function createAppMenu() {
  let dev = settings.getSync('dev') || '0'
  let pip = settings.getSync('pip') || '0'
  let appMenu = new MenuItem({
    label: 'Facebook',
    submenu: [
      new MenuItem({ role: 'about' }),
      new MenuItem({type: 'separator' }),
      new MenuItem({
        label: 'Preferences',
        accelerator: 'Cmd+,',
        click: createPrefsWindow,
      }),
      new MenuItem({ type: 'separator' }),
      new MenuItem({
        label: 'Set default browser',
        accelerator: 'Cmd+Option+F',
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
      }),
      new MenuItem({
        label: 'New Instagram Mobile Window',
        click: (menuItem, browserWindow, event) => {
          createInstagramMobileWindow()
        },
      }),
      new MenuItem({ type: 'separator' }),
      new MenuItem({
        label: 'New Tab from Clipboard',
        click: (menuItem, browserWindow, event) => {
          let text = clipboard.readText().trim()
          if (!isLink(text)) {
            dialog.showErrorBox('Invalid URL', 'Either your clipboard is empty or the copied item is not a valid URL.')
          } else if (mainWindow.isDestroyed()) {
            createMainWindow(text)
          } else {
            mainWindow.addTabbedWindow(createBrowserWindow(text))
          }
        },
      }),
      new MenuItem({ type: 'separator' }),
      new MenuItem({
        visible: process.platform !== 'darwin',
        label: 'Preferences',
        click: createPrefsWindow
      }),
      new MenuItem({
        visible: process.platform !== 'darwin',
        label: 'Set default browser',
        accelerator: 'Cmd+Option+F',
        click: (menuItem, browserWindow, event) => {
          let checked = isDefaultHttpProtocolClient()
          if (checked) {
            askRevertToTheDefaultBrowser(checked)
          } else {
            requestToBeTheDefaultBrowser()
          }
        }
      }),
      new MenuItem({ type: 'separator', visible: process.platform !== 'darwin', }),
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
      new MenuItem({ type: 'separator', visible: dev === '1', id: 'dev-tools-sep' }),
      new MenuItem({ id: 'dev-tools', role: 'toggleDevTools' }),
    ]
  })

  // Window menu
  let window = new MenuItem({role: 'windowMenu' })

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

  // Build app menu. On macOS, the 'Preferences' is placed in the Facebook menu (appMenu).
  // On Linux and Windows, it's placed in the 'File' menu instead.
  let template = process.platform === 'darwin' ? [ appMenu, file, edit, view, window, help ] : [ file, edit, view, window, help ]
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
  // Link handlers
  menu.append(new MenuItem({
    label: 'Open Link in New Background Tab',
    visible: linkURL || isLink(selectionText),
    click: (menuItem, browserWindow, event) => {
      if (browserWindow) {
        if (linkURL) browserWindow.addTabbedWindow(createBrowserWindow(linkURL))
        else browserWindow.addTabbedWindow(createBrowserWindow(selectionText.trim()))
        browserWindow.focus()
      }
    }
  }))
  menu.append(new MenuItem({
    label: 'Open Link in New Foreground Tab',
    visible: linkURL || isLink(selectionText),
    click: (menuItem, browserWindow, event) => {
      if (browserWindow) {
        if (linkURL) browserWindow.addTabbedWindow(createBrowserWindow(linkURL))
        else browserWindow.addTabbedWindow(createBrowserWindow(selectionText.trim()))
      }
    }
  }))
  menu.append(new MenuItem({
    label: 'Open Link in Browser',
    visible: linkURL || isLink(selectionText),
    click: (menuItem, browserWindow, event) => {
      shell.openExternal(linkURL)
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
    visible: linkURL && linkText,
    click: (menuItem, browserWindow, event) => {
      clipboard.writeText(linkText)
    }
  }))
  menu.append(new MenuItem({
    type: 'separator',
    visible: linkURL
  }))

  // macOS Look Up and Search with Google
  menu.append(new MenuItem({
    id: 'look-up',
    label: 'Look Up \"' + (selectionText.length < 61 ? selectionText : selectionText.substring(0, 58) + "...") + '\"',
    visible: process.platform === 'darwin' && selectionText.trim(),
    click: (menuItem, browserWindow, event) => {
      browserWindow.webContents.showDefinitionForSelection()
    }
  }))
  menu.append(new MenuItem({
    type: 'separator',
    visible: process.platform === 'darwin' && selectionText.trim()
  }))
  menu.append(new MenuItem({
    id: 'google-search',
    label: 'Search with Google',
    visible: process.platform === 'darwin' && selectionText.trim(),
    click: (menuItem, browserWindow, event) => {
      shell.openExternal('https://www.google.com/search?q=' + selectionText)
    }
  }))
  menu.append(new MenuItem({
    type: 'separator',
    visible: process.platform === 'darwin' && selectionText
  }))

  // Image handlers, only displays with <img>
  menu.append(new MenuItem({
    label: 'Open Image in New Tab',
    visible: mediaType === 'image',
    click: (menuItem, browserWindow, event) => {
      if (browserWindow && browserWindow) {
        let url = menuItem.transform ? menuItem.transform(srcURL) : srcURL
        browserWindow.addTabbedWindow(createBrowserWindow(url))
      }
    }
  }))
  menu.append(new MenuItem({
    label: 'Copy Image address',
    visible: mediaType === 'image',
    click: (menuItem, browserWindow, event) => {
      let url = menuItem.transform ? menuItem.transform(srcURL) : srcURL
      clipboard.writeText(url)
    }
  }))
  menu.append(new MenuItem({
    label: 'Copy Image to Clipboard',
    visible: mediaType === 'image',
    click: (menuItem, browserWindow, event) => {
      browserWindow.webContents.copyImageAt(x, y)
    }
  }))
  menu.append(new MenuItem({
    label: 'Save Image',
    visible: mediaType === 'image',
    click: (menuItem, browserWindow, event) => {
      let url = menuItem.transform ? menuItem.transform(srcURL) : srcURL
      browserWindow.webContents.downloadURL(url)
    }
  }))
  menu.append(new MenuItem({
    label: 'Download video',
    visible: mediaType === 'video',
    click: (menuItem, browserWindow, event) => {
      let url = menuItem.transform ? menuItem.transform(srcURL) : srcURL
      console.log(url)
    }
  }))

  // Editable handlers (<input />)
  menu.append(new MenuItem({
    label: 'Cut',
    enabled: editFlags.canCut,
    visible: isEditable,
    click: (menuItem, browserWindow, event) => {
      browserWindow.webContents.cut()
    }
  }))
  menu.append(new MenuItem({
    label: 'Copy',
    enabled: editFlags.canCopy,
    visible: !linkURL && (isEditable || selectionText),
    click: (menuItem, browserWindow, event) => {
      browserWindow.webContents.copy()
    }
  }))
  menu.append(new MenuItem({
    label: 'Paste',
    enabled: editFlags.canPaste,
    visible: isEditable,
    click: (menuItem, browserWindow, event) => {
      browserWindow.webContents.paste()
    }
  }))
  menu.append(new MenuItem({
    label: 'Paste and Match Style',
    enabled: editFlags.canPaste,
    visible: isEditable,
    click: (menuItem, browserWindow, event) => {
      browserWindow.webContents.pasteAndMatchStyle()
    }
  }))
  menu.append(new MenuItem({
    label: 'Select all',
    enabled: editFlags.canSelectAll,
    visible: isEditable,
    click: (menuItem, browserWindow, event) => {
      browserWindow.webContents.cut()
    }
  }))
  menu.append(new MenuItem({
    type: 'separator',
    visible: isEditable|| selectionText
  }))

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
    enabled: BrowserWindow.getFocusedWindow().webContents.canGoBack(),
    click: (menuItem, browserWindow, event) => {
      if (browserWindow) browserWindow.webContents.goBack()
    }
  }))
  menu.append(new MenuItem({
    label: 'Go Forward',
    enabled: BrowserWindow.getFocusedWindow().webContents.canGoForward(),
    click: (menuItem, browserWindow, event) => {
      if (browserWindow) browserWindow.webContents.goForward()
    }
  }))
  menu.append(new MenuItem({ label: 'Reload', role: 'reload' }))
  menu.append(new MenuItem({
    label: 'Copy Current page URL',
    visible: true,
    click: (menuItem, browserWindow, event) => {
      if (browserWindow) clipboard.writeText(browserWindow.webContents.getURL())
    }
  }))
  menu.append(new MenuItem({
    label: mute ? 'Unmute' : 'Mute',
    visible: true,
    click: (menuItem, browserWindow, event) => {
      let webContents = browserWindow.webContents
      webContents.setAudioMuted(!webContents.isAudioMuted())
    }
  }))


  // Inspect elements (dev tools)
  menu.append(new MenuItem({ type: 'separator', visible: dev === '1' }))
  menu.append(new MenuItem({
    label: 'Inspect element',
    visible: dev === '1',
    click: (menuItem, browserWindow, event) => {
      if (browserWindow) browserWindow.webContents.inspectElement(x, y)
    }
  }))
  menu.append(new MenuItem({
    label: 'Open Developer Console',
    visible: dev === '1',
    click: (menuItem, browserWindow, event) => {
      if (browserWindow) browserWindow.webContents.openDevTools()
    }
  }))

  return menu
}

/**
 * Create Dock actions on macOS
 */
function createDockActions() {
  if (process.platform === 'darwin') {
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