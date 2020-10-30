# THIS IS FOR DEVELOPERS WHO WANT TO EXTEND THIS PROJECT #

The project is fully open source, so feel free to folk it and add your custom touches. However, please include the reference to this project as the source, or at least, the "inspiration".

As noted in the README.md, this is simply an Electron wrapper for the Facebook website with my additional touches to make it easier to use while retaining most of browser features, such as editable options. So, it's very obvious that you have [Node.js](https://nodejs.org/) installed. Plus, you'll need basic [Electron](https://www.electronjs.org/) knowledge to continue. [Electron Builder](https://www.electron.build/) is used to build the project. At the moment, all the code is targeted and optimized for macOS only. Optimizations for Linux and Windows will be added later when everything becomes more stable. However, you can help me with that. All contributions are welcomed.

In case you experience with `code-sign` on macOS, you can install `electron-builder` globally, and use it to build.
```
  npm i -g electron-builder
  electron-builder -m dir
```