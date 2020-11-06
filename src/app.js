const { app, BrowserWindow, clipboard, Menu, MenuItem, nativeImage, shell, TouchBar } = require('electron')
const settings = require('electron-settings')
const path = require('path')

const FACEBOOK_URL = 'https://www.facebook.com'
const MESSENGER_URL = 'https://www.messenger.com'
const INSTAGRAM_URL = 'https://www.instagram.com'

const FACEBOOK = 'facebook'
const MESSENGER = 'messenger'
const INSTAGRAM = 'instagram'

const DEFAULT_WINDOW_BOUNDS = { x: undefined, y: undefined, width: 1280, height: 800 }

let mainWindow, prefsWindow

/** Basic Electron app events: */

app.whenReady().then(() => {
  createMainWindow()
  createAppMenu()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 || mainWindow.isDestroyed()) {
    createMainWindow()
  } else if (mainWindow) {
    mainWindow.show()
  }
})

app.on('window-all-closed', () => {
  let acb = settings.getSync('acb') || '0'
  if (process.platform !== 'darwin' || acb === '1') {
    app.quit()
  }
})

/** End of Basic Electron app events. */

/**************************************/

/** Create a browser window, used to createMainWindow and create a tab
 * @param url: The URL for the tab. The URL for mainWindow is 'https://www.facebook.com'
 * @param bounds: Window bounds
 * @see createMainWindow
 * @see createContextMenuForWindow
 * @returns The window to be created.
 */
function createBrowserWindow(url, bounds) {
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
      plugins: true
    }
  })

  window.loadURL(url)
  createTouchBarForWindow(window)

  // This will create a tab everytime an <a target="_blank" /> is clicked, instead of a new window
  // Unused params in the callback in order: frameName, disposition, options, additionalFeatures, referrer, postBody
  window.webContents.on('new-window', (event, url) => {
    event.preventDefault()
    let focusedWindow = BrowserWindow.getFocusedWindow()
    focusedWindow.addTabbedWindow(createBrowserWindow(url))
  })

  // Create context menu for each window
  window.webContents.on('context-menu', (event, params) => {
    createContextMenuForWindow(params).popup()
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
      webPreferences: {
        webSecurity: true,
        tabbingIdentifier: "Prefs",
        plugins: true,
        nodeIntegration: true,
        enableRemoteModule: true
      }
    })
    prefsWindow.loadFile('src/' + 'prefs.html')
  }
  prefsWindow.on('closed', () => prefsWindow = null)
}

/**
 * Create the app menu.
 * @see app.whenReady
 */
function createAppMenu() {
  let dev = settings.getSync('dev') || '0'
  console.log(dev)
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
        accelerator: 'CmdOrCtrl+Left',
        click: (menuItem, browserWindow, event) => {
          if (browserWindow) browserWindow.webContents.goBack()
        }
      }),
      new MenuItem({
        label: 'Go Forward',
        accelerator: 'CmdOrCtrl+Right',
        click: (menuItem, browserWindow, event) => {
          if (browserWindow) browserWindow.webContents.goForward()
        }
      }),
      new MenuItem({ label: 'Reload', role: 'reload' }),
      new MenuItem({
        label: 'Copy Current page URL',
        visible: true,
        click: (menuItem, browserWindow, event) => {
          if (browserWindow) clipboard.writeText(browserWindow.webContents.getURL())
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
      new MenuItem({ type: 'separator' }),
      new MenuItem({
        id: 'hide-on-mac-prefs',
        label: 'Preferences',
        click: createPrefsWindow
      }),
      new MenuItem({ id: 'hide-on-mac-prefs-sep', type: 'separator' }),
      new MenuItem({
        label: 'Open Developer Tools',
        visible: dev === '1',
        click: (menuItem, browserWindow, event) => {
          if (browserWindow) browserWindow.webContents.openDevTools()
        }
      }),
      new MenuItem({ type: 'separator', visible: dev === '1' }),
      new MenuItem({ role: 'close' })
    ],
  })

  // Edit menu
  let edit = new MenuItem({ role: 'editMenu' })

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

  // Build app menu. On macOS, the 'Preferences' is placed in the Facebook menu (appMenu).
  // On Linux and Windows, it's placed in the 'File' menu instead.
  let template
  if (process.platform === 'darwin') {
    // Hide the 'File/Preferences' menu item because it's already placed in the 'Facebook' menu.
    file.submenu.items.find((item) => item.id && item.id.startsWith('hide-on-mac')).visible = false
    template = [ appMenu, file, edit, window, help ]
  } else {
    template = [ file, edit, window, help ]
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/**
 * Create context menu for each BrowserWindow.
 * @returns The created menu.
 * @see createBrowserWindow
 * @see Electron.ContextMenuParams
 */
function createContextMenuForWindow({ editFlags, isEditable, linkURL, linkText, mediaType, selectionText, srcURL, x, y }) {
  let menu = new Menu()
  let dev = settings.getSync('dev') || '0'
  console.log(dev)
  // Link handlers, top priority
  menu.append(new MenuItem({
    label: 'Open Link in New Tab',
    visible: linkURL,
    click: (menuItem, browserWindow, event) => {
      if (browserWindow) browserWindow.addTabbedWindow(createBrowserWindow(linkURL))
    }
  }))
  menu.append(new MenuItem({
    label: 'Open Link in Browser',
    visible: linkURL,
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


  // Inspect elements (dev tools)
  menu.append(new MenuItem({ type: 'separator', visible: dev === '1' }))
  menu.append(new MenuItem({
    label: 'Inspect elements',
    visible: dev === '1',
    click: (menuItem, browserWindow, event) => {
      if (browserWindow) browserWindow.webContents.inspectElement(x, y)
    }
  }))

  return menu
}

/**
 * Initialize TouchBar (MBP only)
 */
function createTouchBarForWindow(window) {
  let resolvePath = (name, mono) => path.join(__dirname, `/assets/${name}${mono == 1 ? '_mono' : ''}.png`)
  let resizeOptions = { width: 24, height: 24 }
  let useMonoIcons = settings.getSync('mono-icons') || '0'
  window.setTouchBar(
    new TouchBar({
      items: [
        new TouchBar.TouchBarButton({
          icon: nativeImage.createFromPath(resolvePath(FACEBOOK, useMonoIcons)).resize(resizeOptions),
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
          icon: nativeImage.createFromPath(resolvePath(MESSENGER, useMonoIcons)).resize(resizeOptions),
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
          icon: nativeImage.createFromPath(resolvePath(INSTAGRAM, useMonoIcons)).resize(resizeOptions),
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