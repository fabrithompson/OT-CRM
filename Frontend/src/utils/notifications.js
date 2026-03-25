export function requestNotifPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

export function pushBrowserNotif(title, body, icon = '/images/favicon.svg') {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon, tag: title, renotify: true });
    }
}
