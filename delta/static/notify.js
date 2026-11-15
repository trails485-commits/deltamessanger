// ============================================================
// static/notify.js v2 — с диагностикой и фиксами для iOS
// ============================================================
(function () {
  'use strict';
  console.log('[notify.js] v2 загружен');

  var TOAST_TIMEOUT = 5000;
  var SOUND_VOLUME = 0.08;
  var SOUND_ENABLED_KEY = 'delta_notify_sound';
  var NOTIFY_ENABLED_KEY = 'delta_notify_enabled';
  var ANTISPAM_MS = 1500;   // уменьшили с 3000

  var unreadCounts = {};
  var lastRoom = null;
  var audioCtx = null;
  var lastNotifyTime = {};
  var notifyLog = [];  // история последних 50 уведомлений для отладки

  // ---------------------------------------------------------
  // Диагностика: определяем окружение
  // ---------------------------------------------------------
  function getEnv() {
    var isStandalone = false;
    try {
      isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                     window.navigator.standalone === true;
    } catch (e) {}
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var permission = (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
    return {
      isIOS: isIOS,
      isStandalone: isStandalone,
      isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
      permission: permission,
      visibility: document.visibilityState,
    };
  }
  console.log('[notify.js] env:', getEnv());

  // ---------------------------------------------------------
  // Audio
  // ---------------------------------------------------------
  function unlockAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      console.log('[notify.js] audio unlocked');
    } catch (e) { console.warn('[notify.js] audio fail', e); }
  }
  document.addEventListener('click', unlockAudio, { once: true, capture: true });
  document.addEventListener('touchstart', unlockAudio, { once: true, capture: true });

  function playSound() {
    if (localStorage.getItem(SOUND_ENABLED_KEY) === '0') return;
    if (!audioCtx) {
      console.log('[notify.js] sound: audioCtx not ready (нужен клик)');
      return;
    }
    try {
      var t = audioCtx.currentTime;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      gain.gain.setValueAtTime(SOUND_VOLUME, t);
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.setValueAtTime(660, t + 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.start(t);
      osc.stop(t + 0.2);
    } catch (e) { console.warn('[notify.js] sound fail', e); }
  }

  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  function getState() {
    try { if (typeof state !== 'undefined' && state) return state; } catch (e) {}
    return window.state || null;
  }
  function getUsername() {
    var s = getState();
    return s && s.user ? s.user.username : null;
  }
  function getCurrentRoom() {
    var s = getState();
    if (!s || !s.user || !s.currentPeer) return null;
    var peer = s.currentPeer;
    if (peer.is_channel && peer.channel_id) return 'channel_' + peer.channel_id;
    if (peer.username && s.user.username) {
      return [s.user.username.toLowerCase(), peer.username.toLowerCase()].sort().join('_');
    }
    return null;
  }
  function isPageVisible() {
    return document.visibilityState === 'visible' && !document.hidden;
  }

  // ---------------------------------------------------------
  // Заголовок
  // ---------------------------------------------------------
  function updateTitle() {
    var total = Object.keys(unreadCounts).reduce(function (s, k) { return s + (unreadCounts[k] || 0); }, 0);
    var base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = total > 0 ? '(' + total + ') ' + base : base;
  }
  function addUnread(room) { unreadCounts[room] = (unreadCounts[room] || 0) + 1; updateTitle(); }
  function clearRoomUnread(room) { if (unreadCounts[room]) { delete unreadCounts[room]; updateTitle(); } }
  function clearAllUnread() { unreadCounts = {}; updateTitle(); }

  // ---------------------------------------------------------
  // Открытие чата
  // ---------------------------------------------------------
  function openChat(peer) {
    window.focus();
    if (!peer) return;
    try {
      window.dispatchEvent(new CustomEvent('delta:open-chat', { detail: { peer: peer } }));
    } catch (e) {}
    setTimeout(function () {
      var el = null;
      try { el = document.querySelector('[data-peer="' + peer.username + '"]'); } catch (e) {}
      if (!el) {
        var items = document.querySelectorAll('.chat-item, [class*="chat-item"], [class*="chatItem"]');
        for (var i = 0; i < items.length; i++) {
          var txt = (items[i].textContent || '').toLowerCase();
          if (peer.username && txt.indexOf(peer.username.toLowerCase()) >= 0) {
            el = items[i]; break;
          }
        }
      }
      if (el) el.click();
    }, 100);
  }

  // ---------------------------------------------------------
  // In-app toast
  // ---------------------------------------------------------
  function getOrCreateToastContainer() {
    var c = document.getElementById('delta-toast-container');
    if (c) return c;
    c = document.createElement('div');
    c.id = 'delta-toast-container';
    c.style.cssText =
      'position:fixed;top:16px;right:16px;z-index:99999;' +
      'display:flex;flex-direction:column;gap:10px;max-width:360px;pointer-events:none;';
    document.body.appendChild(c);
    return c;
  }

  function showToast(opts) {
    var container = getOrCreateToastContainer();
    var toast = document.createElement('div');
    toast.style.cssText =
      'pointer-events:auto;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.15);' +
      'padding:12px;display:flex;gap:10px;align-items:flex-start;cursor:pointer;' +
      'transform:translateX(400px);transition:transform .25s ease;min-width:260px;max-width:360px;';

    var av = document.createElement('div');
    av.style.cssText = 'width:40px;height:40px;border-radius:50%;flex-shrink:0;' +
      'background:#4a90e2;color:#fff;display:flex;align-items:center;justify-content:center;' +
      'font-weight:600;font-size:16px;overflow:hidden;';
    if (opts.avatar) av.innerHTML = '<img src="' + opts.avatar + '" style="width:100%;height:100%;object-fit:cover;">';
    else av.textContent = ((opts.title || '?').trim().charAt(0) || '?').toUpperCase();

    var body = document.createElement('div');
    body.style.cssText = 'flex:1;min-width:0;';
    var title = document.createElement('div');
    title.style.cssText = 'font-weight:600;font-size:14px;color:#222;margin-bottom:2px;';
    title.textContent = opts.title || 'Новое сообщение';
    var text = document.createElement('div');
    text.style.cssText = 'font-size:13px;color:#555;word-break:break-word;' +
      'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;';
    text.textContent = opts.text || '';
    body.appendChild(title); body.appendChild(text);

    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;color:#999;font-size:16px;cursor:pointer;padding:0;line-height:1;flex-shrink:0;';
    closeBtn.onclick = function (e) { e.stopPropagation(); dismiss(); };

    toast.appendChild(av); toast.appendChild(body); toast.appendChild(closeBtn);
    container.appendChild(toast);
    requestAnimationFrame(function () { toast.style.transform = 'translateX(0)'; });

    var dismiss = function () {
      toast.style.transform = 'translateX(400px)';
      setTimeout(function () { toast.remove(); }, 300);
    };
    toast.onclick = function () { dismiss(); if (opts.onClick) opts.onClick(); };
    setTimeout(dismiss, TOAST_TIMEOUT);
  }

  // ---------------------------------------------------------
  // Native notification — БЕЗ tag!
  // ---------------------------------------------------------
  function showNative(title, text, avatar, room, onClick) {
    if (typeof Notification === 'undefined') {
      console.log('[notify.js] native: Notification API отсутствует');
      return false;
    }
    if (Notification.permission !== 'granted') {
      console.log('[notify.js] native: permission =', Notification.permission);
      return false;
    }
    try {
      // НЕ ставим tag — это главный фикс для iOS!
      var n = new Notification(title, {
        body: text,
        icon: avatar || undefined,
        badge: '/favicon.ico',
        silent: true,
        requireInteraction: false
      });
      n.onclick = function () {
        try { window.focus(); } catch (e) {}
        onClick();
        try { n.close(); } catch (e) {}
      };
      n.onerror = function (e) { console.warn('[notify.js] notification error', e); };
      console.log('[notify.js] ✅ native показано:', title);
      return true;
    } catch (e) {
      console.error('[notify.js] native fail', e);
      return false;
    }
  }

  // ---------------------------------------------------------
  // Главный notify
  // ---------------------------------------------------------
  function notify(payload) {
    var room = payload.room;
    var fromUser = payload.from_user || {};
    var text = payload.text || '';

    var now = Date.now();
    if (lastNotifyTime[room] && now - lastNotifyTime[room] < ANTISPAM_MS) {
      console.log('[notify.js] antispam block', room);
      return;
    }
    lastNotifyTime[room] = now;

    var curRoom = getCurrentRoom();
    var visible = isPageVisible();

    var title = fromUser.is_channel ? (fromUser.name || 'Канал')
                                    : (fromUser.firstname || fromUser.username || 'Сообщение');
    var avatar = fromUser.avatar || null;
    var onClick = function () { clearRoomUnread(room); openChat(fromUser); };

    // ВСЕГДА добавляем в счётчик
    addUnread(room);

    // Не беспокоим, если пользователь активно смотрит этот чат
    if (visible && curRoom === room) {
      console.log('[notify.js] skip: смотрим этот чат');
      // звук всё равно — приятнее
      playSound();
      return;
    }

    // 1. Тосты — всегда
    showToast({ title: title, text: text, avatar: avatar, onClick: onClick });
    playSound();

    // 2. Native — только если страница НЕ видима (в фоне/свёрнуто)
    //    или если это PWA и пользователь ушёл с экрана
    var shouldNative = !visible || (getEnv().isStandalone && !visible);
    if (shouldNative) {
      showNative(title, text, avatar, room, onClick);
    } else {
      console.log('[notify.js] native skip: страница видима');
    }

    // Лог для отладки
    notifyLog.push({ ts: now, room: room, text: text, native: shouldNative, visible: visible });
    if (notifyLog.length > 50) notifyLog.shift();
  }

  // ---------------------------------------------------------
  // Перехват WS
  // ---------------------------------------------------------
  var OriginalWebSocket = window.WebSocket;
  if (OriginalWebSocket && !window.__notifyPatched) {
    window.__notifyPatched = true;
    function WSPatch(url, protocols) {
      console.log('[notify.js] WS создать:', url);
      var ws = protocols ? new OriginalWebSocket(url, protocols) : new OriginalWebSocket(url);
      ws.addEventListener('message', function (e) {
        try { handleIncoming(e.data); }
        catch (err) { console.warn('[notify.js] handler error', err); }
      });
      ws.addEventListener('close', function (e) {
        console.log('[notify.js] WS закрыт:', e.code, e.reason);
      });
      return ws;
    }
    WSPatch.prototype = OriginalWebSocket.prototype;
    WSPatch.CONNECTING = OriginalWebSocket.CONNECTING;
    WSPatch.OPEN = OriginalWebSocket.OPEN;
    WSPatch.CLOSING = OriginalWebSocket.CLOSING;
    WSPatch.CLOSED = OriginalWebSocket.CLOSED;
    window.WebSocket = WSPatch;
    console.log('[notify.js] WS перехвачен');
  }

  function handleIncoming(raw) {
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    if (!data || typeof data !== 'object') return;
    if (data.type === 'new_message' && data.room) {
      console.log('[notify.js] incoming:', data.room, data.text);
      notify({
        room: data.room,
        from_user: data.from_user || {},
        text: data.text || '',
        ts: data.ts || 0
      });
    }
  }

  // ---------------------------------------------------------
  // Отслеживание смены чата
  // ---------------------------------------------------------
  setInterval(function () {
    var cur = getCurrentRoom();
    if (cur !== lastRoom) {
      if (cur) clearRoomUnread(cur);
      lastRoom = cur;
    }
  }, 500);

  // На визибилити-чендж: если вернулись в приложение и открыт чат — сбросим его счётчик
  document.addEventListener('visibilitychange', function () {
    if (isPageVisible()) {
      var cur = getCurrentRoom();
      if (cur) clearRoomUnread(cur);
    }
  });

  // ---------------------------------------------------------
  // Запрос разрешения — при первом клике
  // ---------------------------------------------------------
  function askPermission() {
    if (typeof Notification === 'undefined') return Promise.resolve('unsupported');
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    if (Notification.permission === 'denied') {
      console.warn('[notify.js] permission DENIED — надо сбросить в настройках iOS');
      return Promise.resolve('denied');
    }
    console.log('[notify.js] requesting permission...');
    return Notification.requestPermission().then(function (p) {
      console.log('[notify.js] permission result:', p);
      return p;
    });
  }

  document.addEventListener('click', function once() {
    if (localStorage.getItem(NOTIFY_ENABLED_KEY) === '0') return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') askPermission();
  }, { once: true, capture: true });

  // ---------------------------------------------------------
  // Публичный API
  // ---------------------------------------------------------
  window.__notify = {
    setEnabled: function (on) { localStorage.setItem(NOTIFY_ENABLED_KEY, on ? '1' : '0'); if (on) askPermission(); },
    setSound: function (on) { localStorage.setItem(SOUND_ENABLED_KEY, on ? '1' : '0'); },
    isEnabled: function () { return localStorage.getItem(NOTIFY_ENABLED_KEY) !== '0'; },
    isSoundOn: function () { return localStorage.getItem(SOUND_ENABLED_KEY) !== '0'; },
    requestPermission: askPermission,
    unread: function () { return Object.assign({}, unreadCounts); },
    clearAll: clearAllUnread,
    env: getEnv,
    log: function () { return notifyLog.slice(); },
    // Тест: full pipeline
    test: function () {
      notify({
        room: 'test_room',
        from_user: { firstname: 'Тест', username: 'test', avatar: null },
        text: 'Тестовое уведомление ' + new Date().toLocaleTimeString(),
        ts: Date.now()
      });
    },
    // Тест native напрямую (в обход фильтра visible)
    testNative: function () {
      return showNative('Тест native', 'Это native-уведомление', null, 'test', function () {});
    }
  };

  console.log('[notify.js] инициализирован');
})();