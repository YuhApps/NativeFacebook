const { app, BrowserWindow, clipboard, Menu, MenuItemConstructorOptions, MenuItem, shell } = require('electron')
const contextMenu = require('electron-context-menu')
const settings = require('electron-settings')

let mainWindow

/** Basic Electron app events: */

app.whenReady().then(() => {
  createMainWindow()
  createAppMenu()
  createContextMenu()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
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
      tabbingIdentifier: "FB",
      plugins: true
    }
  })

  window.loadURL(url)

  // This will create a tab everytime an <a target="_blank" /> is clicked, instead of a new window
  window.webContents.on('new-window', (event, url, frameName, disposition, options, additionalFeatures, referrer, postBody) => {
    event.preventDefault()
    let focusedWindow = BrowserWindow.getFocusedWindow()
    focusedWindow.addTabbedWindow(createBrowserWindow(url))
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
  let file = {
    label: '&File',
    submenu: [
      {
        label: 'Go Back',
        accelerator: 'CmdOrCtrl+Left',
        click: () => {
          BrowserWindow.getFocusedWindow().webContents.goBack()
        }
      },
      {
        label: 'Go Forward',
        accelerator: 'CmdOrCtrl+Right',
        click: () => {
          BrowserWindow.getFocusedWindow().webContents.goForward()
        }
      },
      {
        label: 'Reload',
        role: 'reload'
      },
      {
        label: 'Copy Current page URL',
        visible: true,
        click: () => {
          clipboard.writeText(BrowserWindow.getFocusedWindow().webContents.getURL())
        }
      },
      {
        type: 'separator',
      },
      {
        label: 'New Facebook Tab',
        click: () => {
          let allWindows = BrowserWindow.getAllWindows()
          if (allWindows.length > 0) {
            allWindows[allWindows.length - 1].addTabbedWindow(createBrowserWindow('https://www.facebook.com'))
          } else {
            let s = settings.getSync('mainWindow')
            let { x, y, width, height } = s || { x: undefined, y: undefined, width: 1280, height: 800 }
            mainWindow = createBrowserWindow('https://www.facebook.com', x, y, width, height)
          }
        },
      },
      {
        label: 'New Messenger Tab',
        click: () => {
          let allWindows = BrowserWindow.getAllWindows()
          if (allWindows.length > 0) {
            allWindows[allWindows.length - 1].addTabbedWindow(createBrowserWindow('https://www.messenger.com'))
          } else {
            let s = settings.getSync('mainWindow')
            let { x, y, width, height } = s || { x: undefined, y: undefined, width: 1280, height: 800 }
            mainWindow = createBrowserWindow('https://www.messenger.com', x, y, width, height)
          }
        },
      },
      {
        label: 'New Instagram Tab',
        click: () => {
          let allWindows = BrowserWindow.getAllWindows()
          if (allWindows.length > 0) {
            allWindows[allWindows.length - 1].addTabbedWindow(createBrowserWindow('https://www.instagram.com'))
          } else {
            let s = settings.getSync('mainWindow')
            let { x, y, width, height } = s || { x: undefined, y: undefined, width: 1280, height: 800 }
            mainWindow = createBrowserWindow('https://www.instagram.com', x, y, width, height)
          }
        },
      },
      {
        type: 'separator',
      },
      {
        role: 'close',
      },
    ],
  }
  let edit = {
    label: '&Edit',
    role: 'editMenu'
  }
  let view = {
    role: 'viewMenu'
  }
  let window = {
    role: 'windowMenu'
  }
  let template = []
  if (process.platform === 'darwin') {
    let facebook = {
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
            window.loadFile('prefs.html')
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
    }
    template = [ facebook, file, edit, view, window ]
  } else {

  }
  let menu = Menu.buildFromTemplate(template)
  menu.items[3].submenu.items.find((item) => item.role === 'toggledevtools').visible = false
  menu.items[4].submenu.items.forEach((item) => console.log(item))
  Menu.setApplicationMenu(menu)
}

/**
 * Create the right-click context menu.
 * @see app.whenReady
 */
function createContextMenu() {
  contextMenu({
    prepend: (defaultActions, params, browserWindow) => [
      {
        label: 'Open link in new tab',
        visible: params.linkURL,
        click: () => {
          BrowserWindow.getFocusedWindow().addTabbedWindow(createBrowserWindow(params.linkURL))
        }
      },
      {
        label: 'Open link in browser',
        visible: params.linkURL,
        click: () => {
          shell.openExternal(params.linkURL)
        }
      }
    ],
    append: (defaultActions, params, browserWindow) => [
      {
        label: 'Go Back',
        enabled: BrowserWindow.getFocusedWindow().webContents.canGoBack(),
        click: () => {
          BrowserWindow.getFocusedWindow().webContents.goBack()
        }
      },
      {
        label: 'Go Forward',
        enabled: BrowserWindow.getFocusedWindow().webContents.canGoForward(),
        click: () => {
          BrowserWindow.getFocusedWindow().webContents.goForward()
        }
      },
      {
        label: 'Reload',
        visible: true,
        click: () => {
          BrowserWindow.getFocusedWindow().webContents.reload()
        }
      },
      {
        label: 'Copy Current page URL',
        visible: true,
        click: () => {
          clipboard.writeText(BrowserWindow.getFocusedWindow().webContents.getURL())
        }
      }
    ],
    showCopyImageAddress: true,
    showInspectElement: false,
    showSaveImageAs: true,
    showSearchWithGoogle: false,
  })
}