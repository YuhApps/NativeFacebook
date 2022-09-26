# THIS IS FOR DEVELOPERS WHO WANT TO EXTEND THIS PROJECT #

The project is fully open source, so feel free to folk it and add your custom touches. However, please include the reference to this project as the source, or at least, the "inspiration".

As noted in the README.md, this is simply an Electron wrapper for the Facebook website with my additional touches to make it easier to use while retaining most of browser features, such as editable options. So, it's very obvious that you have [Node.js](https://nodejs.org/) installed, and have basic [Electron](https://www.electronjs.org/) knowledge. [Electron Builder](https://www.electron.build/) is used to build the project.

To pack the project, run `npm run pack` to build binary files for your current OS with default configurations in `package.json` file. Or you can run `npm run pack-mac`, `npm run pack-linux` on Linux, or `npm run pack-win` to build binary files for other OS'es.

You'll need to notarize macOS package. See `notarize.js` for more details.