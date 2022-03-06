# THIS IS FOR DEVELOPERS WHO WANT TO EXTEND THIS PROJECT #

The project is fully open source, so feel free to folk it and add your custom touches. However, please include the reference to this project as the source, or at least, the "inspiration".

As noted in the README.md, this is simply an Electron wrapper for the Facebook website with my additional touches to make it easier to use while retaining most of browser features, such as editable options. So, it's very obvious that you have [Node.js](https://nodejs.org/) installed, and have basic [Electron](https://www.electronjs.org/) knowledge. [Electron Builder](https://www.electron.build/) is used to build the project.

To pack the project, run `npm run dist-mac` on macOS, `npm run dist-linux` or `npm run dist-tux` on Linux, and `npm run dist-win` on Windows. If you have electron-builder installed globally, run `npm run pack-mac`, `npm run pack-tux` and `npm run pack-win`. Default targets are `dir` for macOS, `AppImage` for Linux, and `msi` for Windows. If you wish use other targets, use `electron-builder` commands directly.