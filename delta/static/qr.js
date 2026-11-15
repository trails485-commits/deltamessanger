// ============================================================
// static/qr.js — только список устройств + завершение сессий
// QR-функционал полностью убран.
// ============================================================
(function () {
  'use strict';
  console.log('[qr.js] загружен (devices-only)');

  var LS_TOKEN_PREFIX = 'delta_token_';
  var LS_LAST_LOGIN = 'delta_last_active_login';

  // ---------------------------------------------------------
  // Авторизация: state → localStorage fallback
  // ---------------------------------------------------------
  function getAuth() {
    var username = null, token = null;
    try {
      if (typeof state !== 'undefined' && state && state.user && state.user.username) {
        username = state.user.username;
        token = state.sessionToken || null;
      }
    } catch (e) {}
    if (!username && window.state && window.state.user && window.state.user.username) {
      username = window.state.user.username;
      token = window.state.sessionToken || null;
    }
    if (!username) {
      var last = null;
      try { last = localStorage.getItem(LS_LAST_LOGIN); } catch (e) {}
      if (last) {
        username = last;
        try { token = localStorage.getItem(LS_TOKEN_PREFIX + last); } catch (e) {}
      }
    }
    return { username: username, token: token };
  }
  function getUsername() { return getAuth().username; }
  function getToken() { return getAuth().token; }
  function isAuthed() { return !!(getUsername() && getToken()); }
  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (getToken() || '')
    };
  }

  // ---------------------------------------------------------
  // Хелперы
  // ---------------------------------------------------------
  function $id(id) { return document.getElementById(id); }
  function fmtDate(ts) {
    if (!ts) return '';
    var d = new Date(ts * 1000), now = new Date();
    var t = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === now.toDateString()
      ? 'сегодня в ' + t
      : d.toLocaleDateString('ru-RU') + ' ' + t;
  }
  function deviceIcon(d) {
    d = (d || '').toLowerCase();
    if (d.indexOf('iphone') >= 0 || d.indexOf('android') >= 0 ||
        d.indexOf('mobile') >= 0 || d.indexOf('ios') >= 0) return '📱';
    if (d.indexOf('ipad') >= 0 || d.indexOf('tablet') >= 0) return '📲';
    return '💻';
  }

  // ---------------------------------------------------------
  // Список устройств
  // ---------------------------------------------------------
  async function loadDevices() {
    var list = $id('devices-list');
    if (!list) return;
    if (!isAuthed()) {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">Войдите в аккаунт</div>';
      return;
    }
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">Загрузка...</div>';
    try {
      var res = await fetch(
        '/api/sessions/list?username=' + encodeURIComponent(getUsername()),
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var sessions = await res.json();
      if (!sessions.length) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">Нет активных устройств</div>';
        return;
      }
      list.innerHTML = sessions.map(function (s, i) {
        return '<div style="display:flex;gap:12px;align-items:center;padding:12px;border-bottom:1px solid #eee;">' +
          '<div style="font-size:28px;">' + deviceIcon(s.device_id) + '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;">' + (s.is_current ? 'Это устройство' : 'Устройство ' + (i + 1)) + '</div>' +
            '<div style="font-size:12px;color:#888;">' + (s.ip || 'IP неизвестен') + '</div>' +
            '<div style="font-size:12px;color:#888;">' +
              (s.is_current ? 'Активно сейчас' : 'Было активно: ' + fmtDate(s.last_used)) +
            '</div>' +
          '</div>' +
          (s.is_current
            ? '<span style="font-size:11px;background:#e8f5e9;color:#2e7d32;padding:4px 8px;border-radius:6px;">текущее</span>'
            : '<button class="device-revoke" data-token="' + s.session_token + '" style="background:none;border:none;color:#e53935;font-size:20px;cursor:pointer;padding:8px;">✕</button>'
          ) +
        '</div>';
      }).join('');
      list.querySelectorAll('.device-revoke').forEach(function (b) {
        b.addEventListener('click', async function () {
          if (!confirm('Завершить сессию этого устройства?')) return;
          var r = await fetch('/api/sessions/revoke', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
              username: getUsername(),
              session_token: b.dataset.token
            })
          });
          if (!r.ok) {
            var e = await r.json().catch(function () { return {}; });
            alert(e.detail || 'Не удалось');
            return;
          }
          loadDevices();
        });
      });
    } catch (e) {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:#c33;">Ошибка: ' + e.message + '</div>';
    }
  }

  async function revokeAllOthers() {
    if (!isAuthed()) return alert('Войдите в аккаунт');
    if (!confirm('Завершить все другие сеансы? Все остальные устройства выйдут из аккаунта.')) return;
    try {
      var r = await fetch(
        '/api/sessions/revoke_others?username=' + encodeURIComponent(getUsername()),
        { method: 'POST', headers: authHeaders() }
      );
      if (!r.ok) {
        var e = await r.json().catch(function () { return {}; });
        alert(e.detail || 'Не удалось');
        return;
      }
      loadDevices();
    } catch (e) { alert('Ошибка соединения'); }
  }

  // ---------------------------------------------------------
  // Раздел "Устройства": создаём контейнер списка
  // ---------------------------------------------------------
  function ensureDevicesSection() {
    var devicesView = document.querySelector(
      '#devices-view, [data-view="devices"], #devices, #devices-section'
    );
    if (!devicesView) return;

    if (!$id('devices-list')) {
      var list = document.createElement('div');
      list.id = 'devices-list';
      list.style.cssText = 'background:#fff;border-radius:12px;margin-top:12px;overflow:hidden;';
      devicesView.appendChild(list);
      console.log('[qr.js] создан контейнер devices-list');
    }

    if (isAuthed() && devicesView.offsetParent !== null) {
      loadDevices();
    }
  }

  // ---------------------------------------------------------
  // Перехват "Завершить другие сеансы"
  // ---------------------------------------------------------
  function wireEndSessions() {
    var btnEnd = $id('btn-end-sessions');
    if (!btnEnd || btnEnd._qrWired) return;
    btnEnd._qrWired = true;
    btnEnd.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      revokeAllOthers();
    }, true);
    console.log('[qr.js] привязан click к btn-end-sessions');
  }

  // ---------------------------------------------------------
  // Запуск
  // ---------------------------------------------------------
  function tick() {
    ensureDevicesSection();
    wireEndSessions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tick);
  } else {
    tick();
  }
  setInterval(tick, 2000);

  window.__qrDebug = {
    state: getAuth,
    user: getUsername,
    token: getToken,
    authed: isAuthed,
    loadDevices: loadDevices,
    revokeAllOthers: revokeAllOthers,
  };
  console.log('[qr.js] инициализирован. QR-кнопки больше нет. __qrDebug доступен.');
})();