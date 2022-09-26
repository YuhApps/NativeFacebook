const ipcRenderer = require('electron')

function setNotificationCallback(createCallback, clickCallback) {
    var OldNotification = window.Notification;
    class NewNotification {
        constructor(title, opt) {
            createCallback(title, opt);
            var instance = new OldNotification(title, opt);
            instance.addEventListener('click', clickCallback);
            return instance;
        }
    }
    NewNotification.requestPermission = OldNotification.requestPermission.bind(OldNotification);
    Object.defineProperty(NewNotification, 'permission', {
        get: function () { return OldNotification.permission; },
    })
    console.log('setNotificationCallback')
    window.Notification = NewNotification;
}

function notifyNotificationCreate(title, opt) {
    ipcRenderer.send('notification', title, opt);
}
function notifyNotificationClick() {
    ipcRenderer.send('notification-click');
}

setNotificationCallback(notifyNotificationCreate, notifyNotificationClick);

ipcRenderer.on('params', function (event, message) {
    // log.debug('ipcRenderer.params', { event: event, message: message });
    var appArgs = JSON.parse(message);
    // log.info('nativefier.json', appArgs);
});
ipcRenderer.on('debug', function (event, message) {
    // log.debug('ipcRenderer.debug', { event: event, message: message });
});