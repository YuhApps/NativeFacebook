const { app, BrowserWindow, clipboard, Menu, MenuItem, nativeImage, shell, TouchBar } = require('electron')
const settings = require('electron-settings')

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
    createContextMenuForWindow(window, params).popup()
  })

  window.on('page-title-updated', (event, title, explicitSet) => {
    // event.preventDefault()
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
      {
        role: 'about'
      },
      {
        type: 'separator',
      },
      {
        label: 'Preferences',
        accelerator: 'Cmd+,',
        click: () => {
          let window = new BrowserWindow({
            webPreferences: {
              webSecurity: true,
              tabbingIdentifier: "FB",
              plugins: true,
              nodeIntegration: true,
              enableRemoteModule: true
            }
          })
          window.loadFile('src/' + 'prefs.html')
        },
      },
      {
        type: 'separator',
      },
      {
        role: 'services'
      },
      {
        role: 'hide'
      },
      {
        role: 'hideOthers'
      },
      {
        type: 'separator',
      },
      {
        role: 'quit'
      },
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
      new MenuItem({ role: 'close' }),
    ],
  })
  let edit = new MenuItem({ role: 'editMenu' })
  let window = new MenuItem({ role: 'windowMenu' })
  let template = [ appMenu, file, edit, window ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/**
 * Create context menu for each BrowserWindow.
 * @returns The created menu.
 * @see createBrowserWindow
 */
function createContextMenuForWindow(browserWindow, params) {
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

  // Navigators
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
  window.setTouchBar(
    new TouchBar({
      items: [
        new TouchBar.TouchBarButton({
          icon: nativeImage.createFromPath('src/assets/facebook.png'),
          label: 'Facebook',
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
          icon: nativeImage.createFromPath('src/assets/messenger.png'),
          label: 'Messenger',
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
          icon: nativeImage.createFromPath('src/assets/instagram.png'),
          label: 'Instagram',
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