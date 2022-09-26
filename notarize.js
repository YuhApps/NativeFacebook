const { notarize } = require('electron-notarize')

exports.default = async function notarizing({ electronPlatformName, appOutDir, packager }) {
  if (electronPlatformName !== 'darwin') {
    return
  }
  
  const bundeId = packager.appInfo.info._configuration.appId
  const appName = packager.appInfo.productFilename

  // You'll need an Apple Developer account to notarize a build in case you want to fork this project.
  // DEV_APPLE_ID is your Apple ID email address.
  // DEV_APPLE_ID_PASSWORD is app password, NOT the password of your Apple ID.
  // For more info about app password, visit https://support.apple.com/en-us/HT204397.
  // Define them in your ~/.zshrc or ./.env file to keep them hidden from the public.
  const appleId = process.env.DEV_APPLE_ID
  const appleIdPassword = process.env.DEV_APPLE_ID_PASSWORD

  if (appleId && appleIdPassword) {
    console.log('Notarizing macOS builds...')
    return await notarize({
      appBundleId: bundeId,
      appPath: `${appOutDir}/${appName}.app`,
      appleId: appleId,
      appleIdPassword: appleIdPassword,
    })
  } else {
    console.log('No Apple ID found. Notarization skipped.')
    return
  }
}