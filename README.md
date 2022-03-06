# UNOFFICIAL FACEBOOK DESKTOP #

This is an **unofficial** Facebook desktop app, which is actually an Electron (https://www.electronjs.org) app wraps the Facebook website with my additional features to make it feel a bit native.

## FOR CONSUMERS ##

**Since Facebook has released the official Facebook app for Windows 10 on Windows Store, Windows users are recommended to use that app instead of this one for better experience. The project is now only focus on macOS and Linux.**

So why using this app instead of just simply open Facebook website in a browser? Well, this app is faster. Plus, as we all know, Facebook has their SDK used by so many websites out there. So Facebook can track your web history. They know what sites you visited. Even there is no "Sign in with Facebook" button on a website does not mean it does not have Facebook SDK bundled. By using this app, your Facebook social life is isolated from your browser.

However, please don't expect this app to behave like Facebook mobile app. It's just an app wrapping the Facebook website with my additional touches. Moreover, Facebook has no intention to release SDK for desktop apps. Plus, this is an unofficial app. So if you use a desktop app with "Sign in with Facebook" button, like Spotify, unfortunately, it will need to open your browser. The app will soon support ***fb://*** protocol like Facebook for Android, but that would require developers out there to adopt the feature.

For info about what's new in every release, see CHANGELOG.md

## FOR DEVELOPERS ##

If you wish to build and extend the app to add your customizations, it's very easy to do so. Node.js is the only base requirement here. Then, in your Terminal, just simply execute these super familiar commands:

```
  npm install
  npm start
```

To build the project, use [electron-builder](https://www.electron.build/). For more information, read DEVELOPERS.md