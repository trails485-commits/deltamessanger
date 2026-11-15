self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data.json(); } catch (e) {}
  var title = data.title || 'Новое сообщение';
  var body = data.body || '';
  var payload = data.data || {};
  var room = payload.room || '';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'delta_' + room,
      renotify: true,
      data: payload
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var room = event.notification.data && event.notification.data.room;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
      for (var i = 0; i < cs.length; i++) {
        var c = cs[i];
        if ('focus' in c) {
          try { c.postMessage({ type: 'open-room', room: room }); } catch (e) {}
          return c.focus();
        }
      }
      if (self.clients.openWindow) {
        var url = room ? ('/?open_room=' + encodeURIComponent(room)) : '/';
        return self.clients.openWindow(url);
      }
    })
  );
});