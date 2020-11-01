const { app, BrowserWindow, clipboard, Menu, MenuItem, nativeImage, shell, TouchBar } = require('electron')
const settings = require('electron-settings')
const path = require('path')

let mainWindow

/** Basic Electron app events: */

app.whenReady().then(() => {
  createMainWindow()
  createAppMenu()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  } else if (mainWindow) {
    mainWindow.show()
  }
})

app.on('window-all-closed', () => {
  let acb = settings.getSync('acb') || 0
  if (process.platform !== 'darwin' || acb == 1) {
    app.quit()
  }
})

app.setLoginItemSettings({
  openAtLogin: settings.getSync('auto-launch') === 1 || false,
  openAsHidden: true,
})

/** End of Basic Electron app events. */

/**************************************/

/** Create a browser window, used to createMainWindow and create a tab
 * @param url: The URL for the tab. The URL for mainWindow is 'https://www.facebook.com'
 * @see createMainWindow
 * @see createContextMenuForWindow
 * @returns The window to be created.
 */
function createBrowserWindow(url, x, y, width, height) {
  let window = new BrowserWindow({
    x: x,
    y: y,
    width: width || 1280,
    height: height || 800,
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
function createMainWindow () {
  let s = settings.getSync('mainWindow')
  let { x, y, width, height } = s || { x: undefined, y: undefined, width: 1280, height: 800 }
  mainWindow = createBrowserWindow('https://www.facebook.com', x, y, width, height)
  mainWindow.on('ready-to-show', () => {
    let ins = settings.getSync('ins') || 0
    let msg = settings.getSync('msg') || 0
    if (ins == 1) {
      let focusedWindow = BrowserWindow.getFocusedWindow()
      focusedWindow.addTabbedWindow(createBrowserWindow('https://www.instagram.com'))
    }
    if (msg == 1) {
      let focusedWindow = BrowserWindow.getFocusedWindow()
      focusedWindow.addTabbedWindow(createBrowserWindow('https://www.messenger.com'))
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
 * Create the app menu.
 * @see app.whenReady
 */
function createAppMenu() {
  let appMenu = new MenuItem({
    label: 'Facebook',
    submenu: [
      new MenuItem({ role: 'about' }),
      new MenuItem({type: 'separator' }),
      new MenuItem({
        label: 'Preferences',
        accelerator: 'Cmd+,',
        click: () => {
          let window = new BrowserWindow({
            webPreferences: {
              webSecurity: true,
              tabbingIdentifier: "Prefs",
              plugins: true,
              nodeIntegration: true,
              enableRemoteModule: true
            }
          })
          window.loadFile('src/' + 'prefs.html')
        },
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
          if (browserWindow) {
            browserWindow.addTabbedWindow(createBrowserWindow('https://www.facebook.com'))
          } else {
            let s = settings.getSync('mainWindow')
            let { x, y, width, height } = s || { x: undefined, y: undefined, width: 1280, height: 800 }
            mainWindow = createBrowserWindow('https://www.facebook.com', x, y, width, height)
          }
        },
      }),
      new MenuItem({
        label: 'New Messenger Tab',
        click: (menuItem, browserWindow, event) => {
          if (browserWindow) {
            browserWindow.addTabbedWindow(createBrowserWindow('https://www.messenger.com'))
          } else {
            let s = settings.getSync('mainWindow')
            let { x, y, width, height } = s || { x: undefined, y: undefined, width: 1280, height: 800 }
            mainWindow = createBrowserWindow('https://www.messenger.com', x, y, width, height)
          }
        },
      }),
      new MenuItem({
        label: 'New Instagram Tab',
        click: (menuItem, browserWindow, event) => {
          let allWindows = BrowserWindow.getAllWindows()
          if (allWindows.length > 0) {
            allWindows[allWindows.length - 1].addTabbedWindow(createBrowserWindow('https://www.instagram.com'))
          } else {
            let s = settings.getSync('mainWindow')
            let { x, y, width, height } = s || { x: undefined, y: undefined, width: 1280, height: 800 }
            mainWindow = createBrowserWindow('https://www.instagram.com', x, y, width, height)
          }
        },
      }),
      new MenuItem({ type: 'separator' }),
      new MenuItem({
        id: 'hide-on-mac-prefs',
        label: 'Preferences',
        click: () => {
          let window = new BrowserWindow({
            webPreferences: {
              webSecurity: true,
              tabbingIdentifier: "Prefs",
              plugins: true,
              nodeIntegration: true,
              enableRemoteModule: true
            }
          })
          window.loadFile('src/' + 'prefs.html')
        },
      }),
      new MenuItem({ id: 'hide-on-mac-prefs-sep', type: 'separator' }),
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
function createContextMenuForWindow(params) {
  let menu = new Menu()

  // Link handlers, top priority
  menu.append(new MenuItem({
    label: 'Open Link in New Tab',
    visible: params.linkURL,
    click: (menuItem, browserWindow, event) => {
      if (browserWindow) browserWindow.addTabbedWindow(createBrowserWindow(params.linkURL))
    }
  }))
  menu.append(new MenuItem({
    label: 'Open Link in Browser',
    visible: params.linkURL,
    click: (menuItem, browserWindow, event) => {
      shell.openExternal(params.linkURL)
    }
  }))
  menu.append(new MenuItem({
    label: 'Copy Link Address',
    visible: params.linkURL,
    click: (menuItem, browserWindow, event) => {
      clipboard.writeText(params.linkURL)
    }
  }))
  menu.append(new MenuItem({
    label: 'Copy Link Text',
    visible: params.linkURL,
    click: (menuItem, browserWindow, event) => {
      clipboard.writeText(params.linkText)
    }
  }))
  menu.append(new MenuItem({
    type: 'separator',
    visible: params.linkURL
  }))

  // macOS Look Up and Search with Google
  menu.append(new MenuItem({
    id: 'look-up',
    label: 'Look Up \"' + params.selectionText + '\"',
    visible: process.platform === 'darwin' && params.selectionText.trim(),
    click: (menuItem, browserWindow, event) => {
      browserWindow.webContents.showDefinitionForSelection()
    }
  }))
  menu.append(new MenuItem({
    type: 'separator',
    visible: process.platform === 'darwin' && params.selectionText.trim()
  }))
  menu.append(new MenuItem({
    id: 'google-search',
    label: 'Search with Google',
    visible: process.platform === 'darwin' && params.selectionText.trim(),
    click: (menuItem, browserWindow, event) => {
      shell.openExternal('https://www.google.com/search?q=' + params.selectionText)
    }
  }))
  menu.append(new MenuItem({
    type: 'separator',
    visible: process.platform === 'darwin' && params.selectionText
  }))

  // Image handlers, only displays with <img>
  menu.append(new MenuItem({
    label: 'Copy Image Address',
    visible: params.mediaType === 'image',
    click: (menuItem, browserWindow, event) => {
      let url = menuItem.transform ? menuItem.transform(params.srcURL) : params.srcURL
      electron.clipboard.writeText(url)
    }
  }))
  menu.append(new MenuItem({
    label: 'Save Image As…',
    visible: params.mediaType === 'image',
    click: (menuItem, browserWindow, event) => {
      let url = menuItem.transform ? menuItem.transform(params.srcURL) : params.srcURL
      browserWindow.webContents.downloadURL(url)
    }
  }))

  // Editable handlers (<input />)
  menu.append(new MenuItem({
    label: 'Cut',
    enabled: params.editFlags.canCut,
    visible: params.isEditable,
    click: (menuItem, browserWindow, event) => {
      browserWindow.webContents.cut()
    }
  }))
  menu.append(new MenuItem({
    label: 'Copy',
    enabled: params.editFlags.canCopy,
    visible: !params.linkURL && (params.isEditable || params.selectionText),
    click: (menuItem, browserWindow, event) => {
      browserWindow.webContents.copy()
    }
  }))
  menu.append(new MenuItem({
    label: 'Paste',
    enabled: params.editFlags.canPaste,
    visible: params.isEditable,
    click: (menuItem, browserWindow, event) => {
      browserWindow.webContents.paste()
    }
  }))
  menu.append(new MenuItem({
    label: 'Paste and Match Style',
    enabled: params.editFlags.canPaste,
    visible: params.isEditable,
    click: (menuItem, browserWindow, event) => {
      browserWindow.webContents.pasteAndMatchStyle()
    }
  }))
  menu.append(new MenuItem({
    label: 'Select all',
    enabled: params.editFlags.canSelectAll,
    visible: params.isEditable,
    click: (menuItem, browserWindow, event) => {
      browserWindow.webContents.cut()
    }
  }))
  menu.append(new MenuItem({
    type: 'separator',
    visible: params.isEditable|| params.selectionText
  }))

  /* To be used later if necessary
  menu.append(new MenuItem({
    label: 'Undo',
    enabled: params.editFlags.canUndo,
    visible: params.isEditable,
    click: (menuItem, browserWindow, event) => {
      browserWindow.webContents.undo()
    }
  }))
  menu.append(new MenuItem({
    label: 'Redo',
    enabled: params.editFlags.canRedo,
    visible: params.isEditable,
    click: (menuItem, browserWindow, event) => {
      browserWindow.webContents.redo()
    }
  }))
  menu.append(new MenuItem({
    type: 'separator',
    visible: params.isEditable
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
  menu.append(new MenuItem({ type: 'separator' }))
  return menu
}

/**
 * Initialize TouchBar (MBP only)
 */
function createTouchBarForWindow(window) {
  function resolvePath(name, useMonoIcon) {
    let m = useMonoIcon == 1 ? '_mono' : ''
    return path.join(__dirname, `/assets/${name}${m}.png`)
  }
  let resizeOptions = { width: 24, height: 24 }
  let useMonoIcon = settings.getSync('mono-icons') || 0
  window.setTouchBar(
    new TouchBar({
      items: [
        new TouchBar.TouchBarButton({
          icon: nativeImage.createFromPath(resolvePath('facebook', useMonoIcon)).resize(resizeOptions),
          click: () => {
            let browserWindow = BrowserWindow.getFocusedWindow()
            if (browserWindow) {
              browserWindow.addTabbedWindow(createBrowserWindow('https://www.facebook.com'))
            } else {
              let s = settings.getSync('mainWindow')
              let { x, y, width, height } = s || { x: undefined, y: undefined, width: 1280, height: 800 }
              mainWindow = createBrowserWindow('https://www.facebook.com', x, y, width, height)
            }
          }
        }),
        new TouchBar.TouchBarButton({
          icon: nativeImage.createFromPath(resolvePath('messenger', useMonoIcon)).resize(resizeOptions),
          click: () => {
            let browserWindow = BrowserWindow.getFocusedWindow()
            if (browserWindow) {
              browserWindow.addTabbedWindow(createBrowserWindow('https://www.messenger.com'))
            } else {
              let s = settings.getSync('mainWindow')
              let { x, y, width, height } = s || { x: undefined, y: undefined, width: 1280, height: 800 }
              mainWindow = createBrowserWindow('https://www.messenger.com', x, y, width, height)
            }
          }
        }),
        new TouchBar.TouchBarButton({
          icon: nativeImage.createFromPath(resolvePath('instagram', useMonoIcon)).resize(resizeOptions),
          click: () => {
            let browserWindow = BrowserWindow.getFocusedWindow()
            if (browserWindow) {
              browserWindow.addTabbedWindow(createBrowserWindow('https://www.instagram.com'))
            } else {
              let s = settings.getSync('mainWindow')
              let { x, y, width, height } = s || { x: undefined, y: undefined, width: 1280, height: 800 }
              mainWindow = createBrowserWindow('https://www.instagram.com', x, y, width, height)
            }
          }
        }),
      ]
    })
  )
}