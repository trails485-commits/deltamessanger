const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ============ ЗАЩИТА ОТ ПАДЕНИЙ НА ОТСУТСТВУЮЩИХ ЭЛЕМЕНТАХ ============
(function ensureAllElementsExist() {
  const required = [
    'btn-code-pass', 'btn-cancel-code', 'btn-setup-code', 'btn-remove-code',
    'input-code-setup', 'modal-code-setup', 'code-pass-val', 'login-code-password',
    'first-time-banner', 'btn-first-time-block', 'btn-first-time-add',
    'wallpaper-preview', 'btn-change-wallpaper', 'btn-reset-wallpaper', 'input-wallpaper',
    'btn-upload-custom-bg', 'input-custom-bg', 'personalization-custom-label',
    'modal-up-plus-required', 'btn-close-up-plus-required', 'btn-go-to-up-from-plus',
    'modal-username-info', 'username-info-title', 'username-info-desc', 'username-info-details',
    'btn-close-username-info', 'btn-ok-username-info',
    'chat-nftbot-start-wrap', 'chat-nftbot-start',
    'modal-sub-details', 'sub-details-title', 'sub-details-text', 'btn-close-sub-details',
    'modal-up-required', 'btn-go-to-up', 'btn-close-up-required',
    'modal-stars-info', 'btn-close-stars-info', 'btn-ok-stars-info',
    'btn-personalization', 'btn-edit-username', 'btn-edit-phone',
    'btn-cloud-pass', 'btn-setup-cloud', 'btn-remove-cloud', 'btn-cancel-cloud',
    'input-cloud-pass', 'input-cloud-pass2', 'cloud-pass-val',
    'my-stars-badge-btn', 'my-stars-badge-count',
    'user-view-stars-badge-btn', 'user-view-stars-badge-count',
    'btn-change-password', 'modal-change-password', 'input-old-password',
    'input-new-password', 'input-new-password2', 'input-new-password-cloud',
    'btn-confirm-change-password', 'btn-cancel-change-password',
    'btn-end-sessions', 'modal-end-sessions', 'input-end-sessions-password',
    'input-end-sessions-cloud', 'btn-confirm-end-sessions', 'btn-cancel-end-sessions'
  ];
  required.forEach(id => {
    if (!document.getElementById(id)) {
      const stub = document.createElement('div');
      stub.id = id;
      stub.style.display = 'none';
      document.body.appendChild(stub);
    }
  });
})();

// ============ LONG-PRESS ДЛЯ МОБИЛЬНЫХ ============
function bindLongPress(el, callback, duration = 500) {
  if (!el) return;
  let timer = null;
  let startX = 0, startY = 0;
  let triggered = false;
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    triggered = false;
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    timer = setTimeout(() => {
      timer = null;
      triggered = true;
      if (navigator.vibrate) navigator.vibrate(30);
      callback(e);
    }, duration);
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (!timer) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) {
      clearTimeout(timer); timer = null;
    }
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (triggered) { e.preventDefault(); triggered = false; }
  }, { passive: false });
  el.addEventListener('touchcancel', () => {
    if (timer) { clearTimeout(timer); timer = null; }
  }, { passive: true });
}

// ============ МОБИЛЬНАЯ КНОПКА «НАЗАД» В ЧАТЕ ============
document.addEventListener('click', (e) => {
  if (e.target.closest('#btn-mobile-back')) {
    e.preventDefault();
    e.stopPropagation();
    if (state.socket) { try { state.socket.close(); } catch {} state.socket = null; }
    if (state.peerStatusTimer) { clearInterval(state.peerStatusTimer); state.peerStatusTimer = null; }
    if (typeof cancelAction === 'function') cancelAction();
    state.currentPeer = null;
    state.messages = [];
    const chatArea = document.querySelector('.chat-area');
    if (chatArea) chatArea.classList.remove('visible');
    const chatView = $('#chat-view'); if (chatView) chatView.hidden = true;
    const emptyChat = $('#empty-chat'); if (emptyChat) emptyChat.style.display = 'flex';
  }
}, true);

window.deltaDebug = function() {
  console.log('=== DELTA DEBUG ===');
  console.log('user:', state.user ? state.user.username : 'НЕТ');
  console.log('sessionToken:', state.sessionToken ? 'ЕСТЬ ✅' : 'НЕТ ❌');
  console.log('socket:', state.socket ? state.socket.readyState : 'НЕТ');
  console.log('personalSocket:', state.personalSocket ? state.personalSocket.readyState : 'НЕТ');
  ['btn-privacy','btn-language','btn-delta-up','btn-appearance','btn-my-stars','btn-send-gift','btn-logout'].forEach(id => {
    console.log(`${id}: ${document.getElementById(id) ? '✅' : '❌'}`);
  });
};

const LAST_LOGIN_KEY = 'delta_last_active_login';

function saveTokenFor(username, token) {
  try { localStorage.setItem('delta_token_' + username.toLowerCase(), token); } catch {}
}
function loadTokenFor(username) {
  try { return localStorage.getItem('delta_token_' + username.toLowerCase()); } catch { return null; }
}
function clearTokenFor(username) {
  try { localStorage.removeItem('delta_token_' + username.toLowerCase()); } catch {}
}
function clearAllTokens() {
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('delta_token_')) localStorage.removeItem(k);
    });
  } catch {}
}

const state = {
  sessionToken: null,
  user: null, temp: {}, currentPeer: null, socket: null, personalSocket: null,
  chats: [], messages: [], contextTargetChat: null, contextTargetMsg: null,
  replyingTo: null, editingMsg: null, myProfileContextTarget: null, currentViewingUser: null,
  folders: [], privacyStates: ['everyone', 'contacts', 'nobody'],
  privacyLabels: { 'everyone': 'Все', 'contacts': 'Контакты', 'nobody': 'Никто' },
  lang: localStorage.getItem('delta_lang') || 'ru',
  theme: localStorage.getItem('delta_theme') || 'light',
  fontSize: localStorage.getItem('delta_font_size') || 'medium',
  profileBg: 'default', tempProfileBg: 'default', tempProfileBgCustom: null,
  wallpaper: null,
  upTab: 'up', selectedTariff: null,
  giftRecipients: [], giftSelected: new Set(), selectedGiftId: null, giftsOwner: null,
  GIFTS: {
    heart: { name: 'Сердечко', price: 15, icon: 'heart' },
    bear: { name: 'Мишка', price: 15, icon: 'bear' },
    gift: { name: 'Подарок', price: 25, icon: 'gift' },
    rose: { name: 'Роза', price: 25, icon: 'rose' },
    cake: { name: 'Тортик', price: 50, icon: 'cake' },
    rocket: { name: 'Ракета', price: 50, icon: 'rocket' },
    champagne: { name: 'Шампанское', price: 50, icon: 'champagne' },
    trophy: { name: 'Кубок', price: 100, icon: 'trophy' },
    diamond: { name: 'Алмаз', price: 100, icon: 'diamond' },
    ring: { name: 'Кольцо', price: 150, icon: 'ring' },
    crown: { name: 'Корона', price: 300, icon: 'crown' },
    liberty: { name: 'Статуя Свободы', price: 480, icon: 'liberty' },
    money: { name: 'Денежный букет', price: 518, icon: 'money' },
    dog: { name: 'Пёс', price: 518, icon: 'dog' },
    ramen: { name: 'Рамен', price: 463, icon: 'ramen' },
    flamingo: { name: 'Фламинго', price: 498, icon: 'flamingo' },
    lantern: { name: 'Фонарь', price: 518, icon: 'lantern' },
    poop: { name: 'Какашка', price: 500, icon: 'poop' },
  },
  adminPassword: localStorage.getItem('delta_admin_pw') || null,
  adminState: 'login', adminFormType: null, adminTargetUser: null,
  peerStatusTimer: null, typingTimer: null, typingLastSent: 0,
  refreshTimer: null, pingTimer: null,
  savedAccounts: [],
  authFromAddAccount: false,
  channelTemp: { name: '', description: '', avatar: null, is_public: true, username: '' },
  channelEditing: null, channelAccessType: 'public', channelViewing: null,
};

const translations = {
  ru: { auth_welcome: "Войдите, чтобы продолжить общение", login: "Войти", register: "Регистрация", no_account: "Нет аккаунта?", chats: "Чаты", profile: "Профиль", my_profile: "Мой профиль", favorites: "Избранное", contacts: "Контакты", devices: "Устройства", folders: "Папки с чатами", notifications: "Уведомления и звуки", appearance: "Оформление", privacy: "Конфиденциальность", language: "Язык", delta_up: "Delta UP", my_stars: "Мои звезды", logout: "Выйти", delete_account: "Удалить аккаунт", select_chat: "Выберите чат" },
  en: { auth_welcome: "Sign in to continue", login: "Sign In", register: "Register", no_account: "No account?", chats: "Chats", profile: "Profile", my_profile: "My Profile", favorites: "Saved", contacts: "Contacts", devices: "Devices", folders: "Chat Folders", notifications: "Notifications", appearance: "Appearance", privacy: "Privacy", language: "Language", delta_up: "Delta UP", my_stars: "My Stars", logout: "Log Out", delete_account: "Delete Account", select_chat: "Select a chat" },
  de: { auth_welcome: "Melden Sie sich an", login: "Anmelden", register: "Registrieren", no_account: "Kein Konto?", chats: "Chats", profile: "Profil", my_profile: "Mein Profil", favorites: "Gespeicherte", contacts: "Kontakte", devices: "Geräte", folders: "Chat-Ordner", notifications: "Benachrichtigungen", appearance: "Erscheinungsbild", privacy: "Datenschutz", language: "Sprache", delta_up: "Delta UP", my_stars: "Meine Sterne", logout: "Abmelden", delete_account: "Konto löschen", select_chat: "Chat auswählen" },
  zh: { auth_welcome: "登录以继续", login: "登录", register: "注册", no_account: "没有账号？", chats: "聊天", profile: "个人资料", my_profile: "我的资料", favorites: "收藏夹", contacts: "联系人", devices: "设备", folders: "聊天文件夹", notifications: "通知与声音", appearance: "外观", privacy: "隐私", language: "语言", delta_up: "Delta UP", my_stars: "我的星星", logout: "登出", delete_account: "删除账户", select_chat: "选择聊天" }
};

const LANGS = {
  ru: { name: 'Русский', flag: '🇷🇺' },
  en: { name: 'English', flag: '🇬🇧' },
  de: { name: 'Deutsch', flag: '🇩🇪' },
  zh: { name: '中文', flag: '🇨🇳' }
};

function detectDevice() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'Android-устройства';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone / iPad';
  if (/Windows/i.test(ua)) return 'компьютера (Windows)';
  if (/Mac/i.test(ua)) return 'компьютера (macOS)';
  if (/Linux/i.test(ua)) return 'компьютера (Linux)';
  return 'неизвестного устройства';
}

function applyLanguage() {
  const dict = translations[state.lang] || translations.ru;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) el.textContent = dict[key];
  });
  const label = $('#current-lang-label');
  if (label) label.textContent = LANGS[state.lang].name;
  if (state.user) renderChats();
}

function renderLanguages() {
  const list = $('#lang-list'); if (!list) return;
  list.innerHTML = '';
  Object.entries(LANGS).forEach(([code, data]) => {
    if (code === state.lang) return;
    const el = document.createElement('div');
    el.className = 'edit-row';
    el.innerHTML = `<div class="edit-row-text">${data.flag} ${data.name}</div>
      <svg class="edit-chevron" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>`;
    el.onclick = () => setLanguage(code);
    list.appendChild(el);
  });
  const t = $('#current-lang-text'); if (t) t.textContent = `${LANGS[state.lang].flag} ${LANGS[state.lang].name}`;
}

function setLanguage(code) {
  state.lang = code; localStorage.setItem('delta_lang', code);
  applyLanguage(); renderLanguages(); toast('Язык изменен');
}

function applyTheme(theme) {
  state.theme = theme; localStorage.setItem('delta_theme', theme);
  if (theme === 'dark') document.body.classList.add('dark-theme');
  else document.body.classList.remove('dark-theme');
  updateAppearanceChecks();
}

function applyFontSize(size) {
  state.fontSize = size; localStorage.setItem('delta_font_size', size);
  document.body.classList.remove('font-small', 'font-medium', 'font-large');
  document.body.classList.add('font-' + size);
  updateAppearanceChecks();
}

const ALL_BG = ['bg-default', 'bg-black', 'bg-green', 'bg-pink', 'bg-blue', 'bg-purple', 'bg-orange'];

function applyProfileBg(color, targetHeroId = null) {
  if (targetHeroId) {
    const preview = document.getElementById(targetHeroId);
    if (preview) { preview.classList.remove(...ALL_BG); preview.classList.add('bg-' + color); }
  } else {
    const screenMy = document.getElementById('screen-my-profile');
    if (screenMy) { screenMy.classList.remove(...ALL_BG); screenMy.classList.add('bg-' + color); }
  }
  updatePersonalizationChecks();
}

const _bgPreloaded = {};
function applyCustomProfileBg(imageUrl) {
  const screenMy = document.getElementById('screen-my-profile');
  const screenUser = document.getElementById('screen-user-view');
  const targets = [screenMy, screenUser].filter(Boolean);
  if (!imageUrl) {
    targets.forEach(s => {
      s.style.backgroundImage = ''; s.style.backgroundSize = ''; s.style.backgroundPosition = ''; s.style.backgroundRepeat = '';
      s.classList.remove('custom-bg-active');
    });
    return;
  }
  const applyNow = () => {
    targets.forEach(s => {
      s.style.backgroundImage = `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 200px, var(--bg-secondary) 600px), url(${imageUrl})`;
      s.style.backgroundSize = 'cover'; s.style.backgroundPosition = 'center top'; s.style.backgroundRepeat = 'no-repeat';
      s.classList.add('custom-bg-active');
    });
  };
  if (_bgPreloaded[imageUrl] === true) { applyNow(); return; }
  if (_bgPreloaded[imageUrl] === false) return;
  const img = new Image();
  img.onload = () => { _bgPreloaded[imageUrl] = true; applyNow(); };
  img.onerror = () => { _bgPreloaded[imageUrl] = false; };
  img.src = imageUrl;
}

function applyWallpaperToChat() {
  const chatArea = document.querySelector('.chat-area');
  if (!chatArea) return;
  const wp = state.wallpaper || (state.user && state.user.wallpaper) || null;
  if (wp) {
    chatArea.style.backgroundImage = `url(${wp})`;
    chatArea.style.backgroundSize = 'cover';
    chatArea.style.backgroundPosition = 'center';
    chatArea.style.backgroundRepeat = 'no-repeat';
  } else {
    chatArea.style.backgroundImage = ''; chatArea.style.backgroundSize = ''; chatArea.style.backgroundPosition = ''; chatArea.style.backgroundRepeat = '';
  }
}

function applyUserViewBg(color) {
  const s = document.getElementById('screen-user-view');
  if (!s) return;
  s.classList.remove(...ALL_BG); s.classList.add('bg-' + (color || 'default'));
}

function updateAppearanceChecks() {
  $$('.appearance-check').forEach(el => { el.hidden = (el.dataset.theme !== state.theme); });
  $$('.appearance-check-font').forEach(el => { el.hidden = (el.dataset.size !== state.fontSize); });
}

function updatePersonalizationChecks() {
  $$('.personalization-check').forEach(el => { el.hidden = (el.dataset.color !== state.tempProfileBg); });
}

function toast(msg) {
  const el = $('#toast'); if (!el) return;
  el.textContent = msg;
  el.classList.add('show'); clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2600);
}

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  const el = $('#' + id); if (el) el.classList.add('active');
}

function initials(u) { return (u.firstname || u.username || '?')[0].toUpperCase(); }

function renderAvatar(el, user) {
  if (!el) return;
  if (user.is_channel) {
    if (user.avatar) { el.style.backgroundImage = `url(${user.avatar})`; el.textContent = ''; }
    else {
      el.style.backgroundImage = ''; el.textContent = '';
      el.innerHTML = '<svg viewBox="0 0 24 24" width="50%" height="50%" fill="#fff"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
    }
    return;
  }
  if (user.is_saved) {
    el.style.backgroundImage = ''; el.style.background = 'var(--accent)';
    el.innerHTML = '<svg viewBox="0 0 24 24" width="55%" height="55%" fill="#fff"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>';
    return;
  }
  if (user.is_deleted || (user.is_frozen && (!state.user || user.username !== state.user.username))) {
    el.style.backgroundImage = ''; el.style.background = 'var(--bg-secondary)'; el.textContent = '';
    el.innerHTML = '<svg viewBox="0 0 24 24" width="50%" height="50%" fill="var(--text-secondary)"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
    return;
  }
  if (user.avatar) { el.style.backgroundImage = `url(${user.avatar})`; el.textContent = ''; }
  else { el.style.backgroundImage = ''; el.textContent = initials(user); }
}

function formatTime(ts) { return new Date(ts * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
function formatDate(ts) { if (!ts) return '—'; return new Date(ts * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); }
function formatBirthday(dateStr) {
  if (!dateStr) return 'Не установлен';
  const d = new Date(dateStr); if (isNaN(d.getTime())) return 'Не установлен';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
function pluralSubs(n) {
  const nAbs = Math.abs(n) % 100; const n1 = nAbs % 10;
  if (nAbs > 10 && nAbs < 20) return 'подписчиков';
  if (n1 > 1 && n1 < 5) return 'подписчика';
  if (n1 === 1) return 'подписчик';
  return 'подписчиков';
}
function isPeerFrozenForMe(peer) {
  if (!peer) return false;
  if (peer.is_channel) return false;
  if (!peer.is_frozen) return false;
  if (state.user && peer.username === state.user.username) return false;
  return true;
}
function displayName(peer) {
  if (!peer) return '';
  if (peer.is_channel) return peer.name || peer.username || 'Канал';
  if (peer.is_deleted) return 'Удаленный аккаунт';
  if (peer.is_saved) return 'Избранное';
  if (isPeerFrozenForMe(peer)) return 'Замороженный аккаунт';
  if (state.user && state.user.contacts && state.user.contacts[peer.username]) {
    const c = state.user.contacts[peer.username];
    const custom = `${c.firstname || ''} ${c.lastname || ''}`.trim();
    if (custom) return custom;
  }
  return `${peer.firstname || ''} ${peer.lastname || ''}`.trim() || peer.username;
}
function frozenIcon() { return '<span style="margin-left:4px;font-size:1em;">❄️</span>'; }
function formatStatus(user) {
  if (!user) return '';
  if (user.is_channel) return `${user.subscribers_count || 0} ${pluralSubs(user.subscribers_count || 0)}`;
  if (user.is_deleted) return '';
  if (isPeerFrozenForMe(user)) return '❄️ Заморожен';
  if (user.is_bot) return 'БОТ';
  if (!user.last_seen_ts || user.last_seen_ts === 0) return 'был(а) давно';
  const now = Date.now() / 1000; const diff = now - user.last_seen_ts;
  if (diff < 40) return 'в сети';
  const d = new Date(user.last_seen_ts * 1000); const nowD = new Date();
  if (d.toDateString() === nowD.toDateString()) return 'был(а) в ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (d.getFullYear() === nowD.getFullYear()) return 'был(а) ' + d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  return 'был(а) ' + d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function verifyBadgeSvg(size = 20) {
  return `<svg class="verify-badge" viewBox="0 0 24 24" width="${size}" height="${size}"><circle cx="12" cy="12" r="12" fill="#3390ec"/><path d="M10 17l-4-4 1.5-1.5L10 14l6.5-6.5L18 9z" fill="#fff"/></svg>`;
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function linkifyMessage(text) {
  if (!text) return '';
  const escaped = escapeHtml(text);
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = escaped.split(urlRegex);
  let result = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) result += `<a href="${parts[i]}" target="_blank" rel="noopener noreferrer" class="msg-link">${parts[i]}</a>`;
    else result += parts[i].replace(/@([a-zA-Z0-9_]{4,32})/g, '<a href="#" class="msg-mention" data-username="$1">@$1</a>');
  }
  return result;
}

function getGiftSvg(iconKey) {
  const SVGS = {
    heart: `<svg viewBox="0 0 100 100"><defs><radialGradient id="hg" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#ffb3e6"/><stop offset="40%" stop-color="#ff5cb8"/><stop offset="100%" stop-color="#c2185b"/></radialGradient><linearGradient id="hr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff176"/><stop offset="50%" stop-color="#ffd600"/><stop offset="100%" stop-color="#f9a825"/></linearGradient></defs><path d="M50 88 C18 62 6 32 28 15 C42 5 54 12 50 28 C46 12 58 5 72 15 C94 32 82 62 50 88 Z" fill="url(#hg)"/><ellipse cx="32" cy="32" rx="9" ry="5" fill="#fff" opacity="0.55" transform="rotate(-35 32 32)"/><path d="M40 44 L60 44 L66 56 L50 66 L34 56 Z" fill="url(#hr)"/></svg>`,
    bear: `<svg viewBox="0 0 100 100"><defs><radialGradient id="bf" cx="40%" cy="35%" r="70%"><stop offset="0%" stop-color="#d4a373"/><stop offset="60%" stop-color="#a0522d"/><stop offset="100%" stop-color="#6b3410"/></radialGradient><radialGradient id="bm" cx="50%" cy="45%" r="60%"><stop offset="0%" stop-color="#f5deb3"/><stop offset="100%" stop-color="#deb887"/></radialGradient></defs><circle cx="22" cy="28" r="14" fill="url(#bf)"/><circle cx="22" cy="28" r="7" fill="url(#bm)"/><circle cx="78" cy="28" r="14" fill="url(#bf)"/><circle cx="78" cy="28" r="7" fill="url(#bm)"/><circle cx="50" cy="55" r="32" fill="url(#bf)"/><circle cx="50" cy="68" r="17" fill="url(#bm)"/><ellipse cx="40" cy="48" rx="3.5" ry="5" fill="#1a1a1a"/><ellipse cx="60" cy="48" rx="3.5" ry="5" fill="#1a1a1a"/><ellipse cx="50" cy="62" rx="4" ry="3" fill="#1a1a1a"/><path d="M46 68 Q50 72 54 68" stroke="#1a1a1a" stroke-width="1.5" fill="none"/></svg>`,
    gift: `<svg viewBox="0 0 100 100"><defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ef5350"/><stop offset="100%" stop-color="#b71c1c"/></linearGradient><linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff59d"/><stop offset="100%" stop-color="#f9a825"/></linearGradient></defs><rect x="18" y="42" width="64" height="48" rx="4" fill="url(#gb)"/><rect x="12" y="32" width="76" height="16" rx="3" fill="url(#gb)"/><rect x="45" y="32" width="10" height="58" fill="url(#gr)"/><path d="M50 32 Q30 8 18 18 Q22 34 50 32" fill="url(#gr)"/><path d="M50 32 Q70 8 82 18 Q78 34 50 32" fill="url(#gr)"/><circle cx="50" cy="32" r="6" fill="#ffd600"/></svg>`,
    rose: `<svg viewBox="0 0 100 100"><defs><radialGradient id="rp" cx="40%" cy="35%" r="65%"><stop offset="0%" stop-color="#ff5252"/><stop offset="70%" stop-color="#c62828"/><stop offset="100%" stop-color="#7f0000"/></radialGradient></defs><path d="M50 82 Q46 62 50 42" stroke="#2e7d32" stroke-width="4" fill="none"/><path d="M50 58 Q32 50 26 58 Q34 72 50 58" fill="#388e3c"/><path d="M50 52 Q68 42 74 50 Q66 64 50 52" fill="#2e7d32"/><path d="M32 38 Q50 20 68 38 Q62 50 50 56 Q38 50 32 38" fill="url(#rp)"/><path d="M38 40 Q50 30 62 40 Q56 48 50 50 Q44 48 38 40" fill="#b71c1c"/></svg>`,
    cake: `<svg viewBox="0 0 100 100"><defs><linearGradient id="cb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffe0b2"/><stop offset="100%" stop-color="#d7a86e"/></linearGradient></defs><rect x="22" y="55" width="56" height="32" rx="4" fill="url(#cb)"/><rect x="22" y="45" width="56" height="18" rx="4" fill="#fff"/><path d="M22 45 Q30 56 38 45 Q46 56 54 45 Q62 56 70 45 Q78 56 78 45" stroke="#e53935" stroke-width="2.5" fill="none"/><rect x="47" y="26" width="6" height="22" fill="#fff"/><path d="M47 26 Q50 18 53 26 Z" fill="#e53935"/><ellipse cx="50" cy="16" rx="3" ry="4" fill="#ffeb3b"/></svg>`,
    rocket: `<svg viewBox="0 0 100 100"><defs><linearGradient id="rb" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#90a4ae"/><stop offset="50%" stop-color="#eceff1"/><stop offset="100%" stop-color="#78909c"/></linearGradient><linearGradient id="rf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffeb3b"/><stop offset="50%" stop-color="#ff9800"/><stop offset="100%" stop-color="#f44336"/></linearGradient></defs><path d="M50 12 Q68 34 68 62 L32 62 Q32 34 50 12 Z" fill="url(#rb)"/><circle cx="50" cy="40" r="10" fill="#64b5f6" stroke="#37474f" stroke-width="2"/><path d="M32 62 L20 82 L34 76 Z" fill="#e53935"/><path d="M68 62 L80 82 L66 76 Z" fill="#e53935"/><path d="M45 76 L55 76 L50 92 Z" fill="url(#rf)"/></svg>`,
    champagne: `<svg viewBox="0 0 100 100"><defs><linearGradient id="chb" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#1b5e20"/><stop offset="50%" stop-color="#4caf50"/><stop offset="100%" stop-color="#1b5e20"/></linearGradient></defs><path d="M60 22 L42 74 L58 78 L74 26 Z" fill="url(#chb)"/><path d="M42 74 Q38 92 52 96 Q66 96 60 76" fill="url(#chb)"/><rect x="56" y="18" width="14" height="8" fill="#2e7d32" transform="rotate(-16 63 22)"/><rect x="44" y="66" width="16" height="6" fill="#ffd600" transform="rotate(-16 52 69)"/></svg>`,
    trophy: `<svg viewBox="0 0 100 100"><defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff176"/><stop offset="35%" stop-color="#ffd600"/><stop offset="70%" stop-color="#f9a825"/><stop offset="100%" stop-color="#b8860b"/></linearGradient></defs><path d="M28 20 L72 20 L66 52 Q50 60 34 52 Z" fill="url(#tg)"/><path d="M28 20 Q12 20 20 42 Q28 52 36 52" fill="none" stroke="url(#tg)" stroke-width="6"/><path d="M72 20 Q88 20 80 42 Q72 52 64 52" fill="none" stroke="url(#tg)" stroke-width="6"/><rect x="46" y="52" width="8" height="16" fill="#8d6e63"/><rect x="34" y="66" width="32" height="8" rx="2" fill="url(#tg)"/><rect x="26" y="74" width="48" height="10" rx="2" fill="#4e342e"/></svg>`,
    diamond: `<svg viewBox="0 0 100 100"><defs><linearGradient id="dm1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#e1f5fe"/><stop offset="100%" stop-color="#4fc3f7"/></linearGradient><linearGradient id="dm2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#81d4fa"/><stop offset="100%" stop-color="#01579b"/></linearGradient></defs><polygon points="50,10 82,42 50,92 18,42" fill="url(#dm2)"/><polygon points="50,10 68,42 50,92 32,42" fill="#0288d1"/><polygon points="18,42 82,42 50,55" fill="url(#dm1)" opacity="0.8"/><polygon points="50,10 68,42 50,55 32,42" fill="#e1f5fe" opacity="0.5"/></svg>`,
    ring: `<svg viewBox="0 0 100 100"><defs><linearGradient id="rbd" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#eceff1"/><stop offset="30%" stop-color="#b0bec5"/><stop offset="60%" stop-color="#ffffff"/><stop offset="100%" stop-color="#78909c"/></linearGradient><linearGradient id="rgm" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#b3e5fc"/><stop offset="100%" stop-color="#0288d1"/></linearGradient></defs><ellipse cx="50" cy="65" rx="26" ry="24" fill="none" stroke="url(#rbd)" stroke-width="7"/><polygon points="50,20 65,38 50,58 35,38" fill="url(#rgm)"/><polygon points="50,20 58,38 50,58 42,38" fill="#4fc3f7"/></svg>`,
    crown: `<svg viewBox="0 0 100 100"><defs><linearGradient id="crg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff59d"/><stop offset="40%" stop-color="#ffd600"/><stop offset="100%" stop-color="#b8860b"/></linearGradient></defs><path d="M15 72 L10 32 L32 52 L50 20 L68 52 L90 32 L85 72 Z" fill="url(#crg)"/><path d="M15 72 L85 72 L85 78 L15 78 Z" fill="#b8860b"/><circle cx="50" cy="20" r="6" fill="#e53935"/><circle cx="10" cy="32" r="4" fill="#4caf50"/><circle cx="90" cy="32" r="4" fill="#4caf50"/><circle cx="32" cy="52" r="4" fill="#29b6f6"/><circle cx="68" cy="52" r="4" fill="#29b6f6"/></svg>`,
    liberty: `<svg viewBox="0 0 100 100"><defs><linearGradient id="lb" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#80cbc4"/><stop offset="50%" stop-color="#26a69a"/><stop offset="100%" stop-color="#00695c"/></linearGradient></defs><path d="M40 92 L38 68 Q42 60 50 60 Q58 60 62 68 L60 92 Z" fill="url(#lb)"/><path d="M50 60 L50 30" stroke="url(#lb)" stroke-width="6"/><ellipse cx="50" cy="28" rx="7" ry="9" fill="url(#lb)"/><path d="M62 44 L62 22 Q66 20 68 22 L68 44 Z" fill="url(#lb)"/><ellipse cx="65" cy="18" rx="4" ry="6" fill="#ffb300"/><path d="M30 92 Q50 82 70 92 L70 96 L30 96 Z" fill="#455a64"/></svg>`,
    money: `<svg viewBox="0 0 100 100"><defs><linearGradient id="mb" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#a5d6a7"/><stop offset="100%" stop-color="#2e7d32"/></linearGradient><linearGradient id="mr" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffd600"/><stop offset="100%" stop-color="#f57f17"/></linearGradient></defs><g transform="translate(50 45)"><rect x="-22" y="-26" width="16" height="30" fill="url(#mb)" transform="rotate(-25)"/><rect x="6" y="-26" width="16" height="30" fill="url(#mb)" transform="rotate(25)"/><rect x="-10" y="-32" width="16" height="30" fill="url(#mb)" transform="rotate(-8)"/><rect x="0" y="-32" width="16" height="30" fill="url(#mb)" transform="rotate(8)"/></g><path d="M35 68 Q50 55 65 68 L60 78 L40 78 Z" fill="url(#mr)"/><circle cx="50" cy="68" r="4" fill="#ffeb3b"/></svg>`,
    dog: `<svg viewBox="0 0 100 100"><defs><radialGradient id="dgb" cx="40%" cy="35%" r="70%"><stop offset="0%" stop-color="#ffb74d"/><stop offset="70%" stop-color="#e65100"/><stop offset="100%" stop-color="#bf360c"/></radialGradient></defs><circle cx="50" cy="52" r="28" fill="url(#dgb)"/><ellipse cx="50" cy="66" rx="18" ry="12" fill="#ffe0b2"/><path d="M24 26 Q50 12 76 26 Q72 36 66 34 Q50 28 34 34 Q28 36 24 26 Z" fill="#1565c0"/><ellipse cx="40" cy="50" rx="4" ry="5" fill="#fff"/><ellipse cx="60" cy="50" rx="4" ry="5" fill="#fff"/><circle cx="41" cy="51" r="2.5" fill="#1a1a1a"/><circle cx="61" cy="51" r="2.5" fill="#1a1a1a"/><ellipse cx="50" cy="62" rx="4" ry="3" fill="#1a1a1a"/></svg>`,
    ramen: `<svg viewBox="0 0 100 100"><defs><linearGradient id="rbow" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ef5350"/><stop offset="100%" stop-color="#8e0000"/></linearGradient></defs><path d="M50 30 Q30 34 30 56 Q30 78 50 80 Q70 78 70 56 Q70 34 50 30 Z" fill="#4e342e"/><ellipse cx="50" cy="42" rx="20" ry="5" fill="#ffb74d"/><path d="M50 52 Q34 52 34 66 Q34 80 50 80 Q66 80 66 66 Q66 52 50 52 Z" fill="url(#rbow)"/><path d="M60 20 L30 40" stroke="#8d6e63" stroke-width="2"/><path d="M64 22 L34 42" stroke="#6d4c41" stroke-width="2"/></svg>`,
    flamingo: `<svg viewBox="0 0 100 100"><defs><radialGradient id="flb" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#ffb3d9"/><stop offset="60%" stop-color="#ff4fb0"/><stop offset="100%" stop-color="#c2185b"/></radialGradient></defs><ellipse cx="50" cy="60" rx="34" ry="24" fill="url(#flb)"/><path d="M50 42 Q40 30 44 18 Q52 20 56 30 Q56 40 50 42 Z" fill="url(#flb)"/><ellipse cx="44" cy="22" rx="5" ry="4" fill="url(#flb)"/><circle cx="45" cy="20" r="1.2" fill="#1a1a1a"/></svg>`,
    lantern: `<svg viewBox="0 0 100 100"><defs><linearGradient id="lnb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8d6e63"/><stop offset="100%" stop-color="#3e2723"/></linearGradient><radialGradient id="lng" cx="50%" cy="50%" r="60%"><stop offset="0%" stop-color="#fff59d"/><stop offset="60%" stop-color="#ffb300"/><stop offset="100%" stop-color="#e65100" stop-opacity="0.3"/></radialGradient></defs><rect x="32" y="22" width="36" height="6" rx="2" fill="#5d4037"/><rect x="30" y="28" width="40" height="52" fill="url(#lnb)"/><rect x="36" y="34" width="28" height="40" rx="2" fill="url(#lng)"/><circle cx="50" cy="52" r="4" fill="#fff59d"/><rect x="32" y="80" width="36" height="6" rx="2" fill="#5d4037"/></svg>`,
    poop: `<svg viewBox="0 0 100 100"><defs><radialGradient id="ppb" cx="40%" cy="35%" r="70%"><stop offset="0%" stop-color="#a1887f"/><stop offset="60%" stop-color="#6d4c41"/><stop offset="100%" stop-color="#3e2723"/></radialGradient></defs><ellipse cx="50" cy="80" rx="36" ry="12" fill="url(#ppb)"/><path d="M20 80 Q20 62 50 62 Q80 62 80 80 Z" fill="url(#ppb)"/><ellipse cx="50" cy="60" rx="28" ry="12" fill="#6d4c41"/><path d="M28 58 Q28 44 50 44 Q72 44 72 58 Z" fill="#795548"/><ellipse cx="50" cy="44" rx="20" ry="9" fill="#8d6e63"/><ellipse cx="42" cy="55" rx="4" ry="5" fill="#fff"/><ellipse cx="58" cy="55" rx="4" ry="5" fill="#fff"/><circle cx="43" cy="56" r="2.2" fill="#1a1a1a"/><circle cx="59" cy="56" r="2.2" fill="#1a1a1a"/><path d="M44 64 Q50 68 56 64" stroke="#1a1a1a" stroke-width="1.5" fill="none"/></svg>`,
  };
  return SVGS[iconKey] || SVGS['gift'];
}

function openBottomSheet(title) {
  const t = $('#sheet-title'); if (t) t.textContent = title;
  const b = $('#sheet-body'); if (b) b.innerHTML = '';
  const overlay = $('#profile-bottom-sheet');
  if (overlay) overlay.classList.add('active');
}
function closeBottomSheet() {
  const overlay = $('#profile-bottom-sheet');
  if (overlay) overlay.classList.remove('active');
}

// ============ API С ТОКЕНОМ (ГЛАВНЫЙ ФИКС) ============
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.sessionToken) headers['Authorization'] = 'Bearer ' + state.sessionToken;
  const res = await fetch(path, { headers, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && state.sessionToken) {
      forceLogout('Сессия истекла. Войдите заново.');
    }
    throw new Error(data.detail || 'Ошибка запроса');
  }
  return data;
}

async function apiAuth(path, opts = {}) {
  return api(path, opts);
}

async function resizeImage(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; } else { w = Math.round(w * maxSize / h); h = maxSize; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject; img.src = reader.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

async function resizeImageLarge(file, maxSize = 900) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; } else { w = Math.round(w * maxSize / h); h = maxSize; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject; img.src = reader.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

let confirmCallback = null;
function showConfirm(title, text, onConfirm) {
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  confirmCallback = onConfirm;
  $('#modal-confirm').hidden = false;
}
$('#btn-confirm-yes').addEventListener('click', () => {
  $('#modal-confirm').hidden = true;
  if (confirmCallback) confirmCallback();
  confirmCallback = null;
});
$('#btn-confirm-no').addEventListener('click', () => {
  $('#modal-confirm').hidden = true;
  confirmCallback = null;
});

function chatsKey() { return 'delta_chats_' + state.user.username; }
function loadChatsFromLS() { try { state.chats = JSON.parse(localStorage.getItem(chatsKey()) || '[]'); } catch { state.chats = []; } }
function saveChatsToLS() { localStorage.setItem(chatsKey(), JSON.stringify(state.chats)); }

function showFrozenInfo() {
  if (!state.user || !state.user.is_frozen) return;
  const until = state.user.frozen_until || 0;
  const now = Date.now() / 1000;
  const days = Math.max(0, Math.ceil((until - now) / 86400));
  const dateStr = new Date(until * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  $('#sub-details-title').textContent = '❄️ Аккаунт заморожен';
  $('#sub-details-text').textContent = `Ваш аккаунт заморожен. Осталось ${days} дн. (разморозится ${dateStr}). Вы можете просматривать чаты и профили, но не можете писать или менять данные.`;
  $('#modal-sub-details').hidden = false;
}

async function forceLogout(reason) {
  try {
    if (state.sessionToken) {
      await fetch('/api/logout?token=' + encodeURIComponent(state.sessionToken), { method: 'POST' }).catch(() => {});
    }
  } catch {}
  if (state.user) clearTokenFor(state.user.username);
  localStorage.removeItem(LAST_LOGIN_KEY);
  if (state.socket) { try { state.socket.close(); } catch {} }
  if (state.personalSocket) { try { state.personalSocket.close(); } catch {} }
  stopPolling();
  state.socket = null; state.personalSocket = null; state.currentPeer = null;
  state.user = null; state.chats = []; state.sessionToken = null;
  showScreen('screen-auth');
  $('#auth-back').hidden = state.savedAccounts.length === 0;
  if (reason) toast(reason);
}

function loadSavedAccounts() {
  try { state.savedAccounts = JSON.parse(localStorage.getItem('delta_saved_accounts') || '[]'); }
  catch { state.savedAccounts = []; }
}
function saveSavedAccounts() {
  localStorage.setItem('delta_saved_accounts', JSON.stringify(state.savedAccounts));
}
function getAccountLimit() {
  let limit = 3;
  for (const acc of state.savedAccounts) {
    if (acc.subscription && acc.subscription.expires_at > Date.now() / 1000) {
      if (acc.subscription.type === 'up+') return 10;
      if (acc.subscription.type === 'up') limit = Math.max(limit, 5);
    }
  }
  return limit;
}
function rememberAccount(user, login, password) {
  const existing = state.savedAccounts.find(a => a.login === login);
  const payload = { login, password, username: user.username, avatar: user.avatar, firstname: user.firstname, lastname: user.lastname, subscription: user.subscription };
  if (existing) Object.assign(existing, payload);
  else {
    if (state.savedAccounts.length >= getAccountLimit()) return;
    state.savedAccounts.push(payload);
  }
  saveSavedAccounts();
  if (state.user) renderAccountsList();
}
function renderAccountsList() {
  const cont = $('#accounts-list'); if (!cont) return;
  cont.innerHTML = '';
  if (!state.user) return;
  if (state.savedAccounts.length === 0) return;
  state.savedAccounts.forEach(acc => {
    const isCurrent = state.user && acc.username === state.user.username;
    const el = document.createElement('div');
    el.className = 'account-item' + (isCurrent ? ' active' : '');
    el.innerHTML = `<div class="account-avatar"></div>
      <div class="account-info"><div class="account-name"></div><div class="account-username">@${acc.username}</div></div>
      ${isCurrent ? '<span class="account-current-badge">✓</span>' : '<button class="account-delete" title="Убрать из списка">✕</button>'}`;
    renderAvatar(el.querySelector('.account-avatar'), { avatar: acc.avatar, firstname: acc.firstname, username: acc.username });
    el.querySelector('.account-name').textContent = `${acc.firstname || ''} ${acc.lastname || ''}`.trim() || acc.username;
    el.onclick = (e) => {
      if (isCurrent) return;
      if (e.target.closest('.account-delete')) return;
      switchToAccount(acc);
    };
    const delBtn = el.querySelector('.account-delete');
    if (delBtn) delBtn.onclick = (e) => {
      e.stopPropagation();
      state.savedAccounts = state.savedAccounts.filter(a => a.login !== acc.login);
      saveSavedAccounts(); renderAccountsList(); toast('Аккаунт убран из списка');
    };
    cont.appendChild(el);
  });
}
async function switchToAccount(acc) {
  try {
    const res = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ login: acc.login, password: acc.password, device_info: detectDevice() })
    });
    if (res.status === 'need_cloud') {
      toast('Требуется облачный пароль');
      state.authFromAddAccount = true;
      $('#auth-back').hidden = false;
      $('#login-login').value = acc.login;
      $('#login-password').value = acc.password || '';
      showScreen('screen-auth');
      $('#login-extra-fields').hidden = false;
      $('#login-cloud-password').hidden = false;
      $('#login-cloud-password').focus();
      return;
    }
    state.user = res.user;
    state.sessionToken = res.session_token || null;
    if (state.sessionToken) saveTokenFor(state.user.username, state.sessionToken);
    state.profileBg = res.user.profile_bg || 'default';
    state.wallpaper = res.user.wallpaper || null;
    localStorage.setItem(LAST_LOGIN_KEY, acc.login);
    rememberAccount(res.user, acc.login, acc.password);
    enterMessenger();
    toast(`Переключено на @${res.user.username}`);
  } catch (err) { toast(err.message); }
}
function showAuthForAddAccount() {
  const limit = getAccountLimit();
  if (state.savedAccounts.length >= limit) { toast(`Достигнут лимит: ${limit} аккаунтов.`); return; }
  state.authFromAddAccount = true;
  $('#auth-back').hidden = false;
  $('#login-login').value = ''; $('#login-password').value = '';
  $('#login-extra-fields').hidden = true; $('#login-cloud-password').hidden = true;
  showScreen('screen-auth');
}

$('#link-to-register').addEventListener('click', (e) => { e.preventDefault(); showScreen('screen-register'); });
$('#reg-back').addEventListener('click', () => showScreen('screen-auth'));
$('#profile-back').addEventListener('click', () => showScreen('screen-register'));
$('#username-back').addEventListener('click', () => showScreen('screen-profile'));

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const login = $('#login-login').value.trim();
  const password = $('#login-password').value;
  const cloud = $('#login-cloud-password').value;
  if (!login || !password) return toast('Заполните все поля');
  try {
    const res = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ login, password, cloud_password: cloud || null, device_info: detectDevice() })
    });
    if (res.status === 'need_cloud') {
      $('#login-extra-fields').hidden = false;
      $('#login-cloud-password').hidden = false;
      $('#login-cloud-password').focus();
      return toast('Введите облачный пароль');
    }
    state.user = res.user;
    state.sessionToken = res.session_token || null;
    if (state.sessionToken) saveTokenFor(state.user.username, state.sessionToken);
    state.profileBg = state.user.profile_bg || 'default';
    state.wallpaper = state.user.wallpaper || null;
    localStorage.setItem(LAST_LOGIN_KEY, login);
    rememberAccount(res.user, login, password);
    state.authFromAddAccount = false;
    $('#auth-back').hidden = true;
    $('#login-extra-fields').hidden = true; $('#login-cloud-password').hidden = true;
    enterMessenger();
  } catch (err) { toast(err.message); }
});

$('#form-register').addEventListener('submit', (e) => {
  e.preventDefault();
  const login = $('#reg-login').value.trim();
  const p1 = $('#reg-password').value; const p2 = $('#reg-password2').value;
  if (!login || !p1 || !p2) return toast('Заполните все поля');
  if (login.length < 3) return toast('Логин минимум 3 символа');
  if (p1.length < 6) return toast('Пароль минимум 6 символов');
  if (p1 !== p2) return toast('Пароли не совпадают');
  state.temp = { login, password: p1, avatar: null, firstname: '', lastname: '', bio: '', username: '', birthday: '' };
  showScreen('screen-profile');
});

$('#btn-upload-avatar').addEventListener('click', () => $('#input-avatar').click());
$('#input-avatar').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const dataUrl = await resizeImage(file, 256); state.temp.avatar = dataUrl;
    const preview = $('#avatar-preview'); preview.style.backgroundImage = `url(${dataUrl})`; preview.textContent = '';
  } catch { toast('Не удалось обработать изображение'); }
});
$('#profile-bio').addEventListener('input', (e) => { $('#bio-count').textContent = e.target.value.length; });
$('#profile-next').addEventListener('click', () => {
  const fn = $('#profile-firstname').value.trim(); const ln = $('#profile-lastname').value.trim();
  const bio = $('#profile-bio').value.trim(); const birthday = $('#profile-birthday').value;
  if (!fn) return toast('Введите имя');
  state.temp.firstname = fn; state.temp.lastname = ln; state.temp.bio = bio; state.temp.birthday = birthday;
  showScreen('screen-username');
});
$('#username-input').addEventListener('input', (e) => {
  const val = e.target.value; const ok = /^[a-z0-9_]{4,32}$/i.test(val);
  const hint = $('#username-hint');
  hint.textContent = ok ? 'Отлично! Имя подходит' : 'Минимум 4 символа: латиница, цифры и _';
  hint.className = 'hint ' + (ok ? 'ok' : '');
});
$('#username-next').addEventListener('click', async () => {
  const val = $('#username-input').value.trim();
  if (!/^[a-z0-9_]{4,32}$/i.test(val)) return toast('Некорректное имя пользователя');
  state.temp.username = val;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|Mobi|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  state.temp.device_info = isMobile ? 'мобильного телефона' : 'компьютера';
  try {
    const user = await api('/api/register', { method: 'POST', body: JSON.stringify(state.temp) });
    state.user = user;
    state.sessionToken = user.session_token || null;
    if (state.sessionToken) saveTokenFor(state.user.username, state.sessionToken);
    state.profileBg = user.profile_bg || 'default';
    state.wallpaper = user.wallpaper || null;
    localStorage.setItem(LAST_LOGIN_KEY, state.temp.login);
    rememberAccount(user, state.temp.login, state.temp.password);
    state.authFromAddAccount = false;
    $('#auth-back').hidden = true;
    toast('Аккаунт создан'); enterMessenger();
  } catch (err) { toast(err.message); }
});

$('#btn-add-account').addEventListener('click', showAuthForAddAccount);
$('#auth-back').addEventListener('click', () => {
  state.authFromAddAccount = false;
  $('#auth-back').hidden = true;
  $('#login-login').value = ''; $('#login-password').value = '';
  $('#login-extra-fields').hidden = true; $('#login-cloud-password').hidden = true;
  if (state.user) showScreen('screen-main');
});

function startPolling() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  if (state.pingTimer) clearInterval(state.pingTimer);
  state.refreshTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (state.user) refreshChatsFromServer();
  }, 20000);
  state.pingTimer = setInterval(() => {
    if (!state.personalSocket || state.personalSocket.readyState !== WebSocket.OPEN) return;
    try { state.personalSocket.send(JSON.stringify({ action: 'ping' })); } catch {}
  }, 25000);
}
function stopPolling() {
  if (state.refreshTimer) { clearInterval(state.refreshTimer); state.refreshTimer = null; }
  if (state.pingTimer) { clearInterval(state.pingTimer); state.pingTimer = null; }
  if (state.peerStatusTimer) { clearInterval(state.peerStatusTimer); state.peerStatusTimer = null; }
}

function enterMessenger() {
  if (state.socket) { try { state.socket.close(); } catch {} state.socket = null; }
  if (state.personalSocket) { try { state.personalSocket.close(); } catch {} state.personalSocket = null; }
  if (state.peerStatusTimer) { clearInterval(state.peerStatusTimer); state.peerStatusTimer = null; }
  const chatArea = document.querySelector('.chat-area');
  if (chatArea) chatArea.classList.remove('visible');
  const chatView = $('#chat-view'); if (chatView) chatView.hidden = true;
  const emptyChat = $('#empty-chat'); if (emptyChat) emptyChat.style.display = 'flex';
  state.currentPeer = null;
  state.messages = [];
  showScreen('screen-main');
  loadChatsFromLS();
  renderOwnProfile();
  renderChats();
  applyLanguage();
  connectPersonalWS();
  refreshChatsFromServer();
  if (state.user.profile_bg_custom) applyCustomProfileBg(state.user.profile_bg_custom);
  else applyProfileBg(state.profileBg);
  applyWallpaperToChat();
  if (typeof bindProfileTagButtons === 'function') bindProfileTagButtons();
  startPolling();
  renderAccountsList();
  if (state.user.is_frozen) setTimeout(() => showFrozenInfo(), 500);
}
function renderOwnProfile() {
  const u = state.user;
  renderAvatar($('#tg-profile-avatar'), u);
  let html = `${u.firstname} ${u.lastname}`.trim();
  if (u.is_frozen) html += frozenIcon();
  if (u.is_verified && !u.is_frozen) html += verifyBadgeSvg(18);
  $('#tg-profile-name').innerHTML = html;
}

$('#btn-change-photo').addEventListener('click', () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  $('#input-change-avatar').click();
});
$('#input-change-avatar').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const dataUrl = await resizeImage(file, 256);
    const updated = await api('/api/users/avatar', { method: 'POST', body: JSON.stringify({ username: state.user.username, avatar: dataUrl }) });
    state.user = updated; renderOwnProfile(); toast('Фото обновлено');
  } catch (err) { toast(err.message); }
});

async function refreshMyUser() {
  try {
    const fresh = await api('/api/users/' + encodeURIComponent(state.user.username) + '?viewer=' + encodeURIComponent(state.user.username));
    state.user = fresh;
    state.profileBg = fresh.profile_bg || 'default';
    state.wallpaper = fresh.wallpaper || null;
  } catch {}
}

function renderAdditionalUsernamesInto(containerId, usernames, ownerUsername, viewerUsername) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (!usernames || usernames.length === 0) { container.style.display = 'none'; return; }
  container.style.display = 'flex';
  usernames.forEach(item => {
    const pill = document.createElement('button');
    pill.className = 'additional-username-pill';
    pill.type = 'button';
    pill.textContent = '@' + item.username;
    pill.title = 'Коллекционный юзернейм';
    pill.onclick = () => showUsernameInfoModal(item.username, item.purchased_at, ownerUsername, viewerUsername);
    container.appendChild(pill);
  });
}

function showUsernameInfoModal(username, purchasedAt, ownerUsername, viewerUsername) {
  $('#username-info-title').textContent = '@' + username;
  $('#username-info-desc').textContent = 'Это коллекционный юзернейм';
  const dateStr = purchasedAt ? new Date(purchasedAt * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const owner = ownerUsername ? `@${ownerUsername}` : '—';
  $('#username-info-details').innerHTML =
    `<div class="username-info-row"><span class="username-info-label">Владелец</span><span class="username-info-value">${escapeHtml(owner)}</span></div>` +
    `<div class="username-info-row"><span class="username-info-label">Дата покупки</span><span class="username-info-value">${escapeHtml(dateStr)}</span></div>`;
  $('#modal-username-info').hidden = false;
}

async function renderMyProfile() {
  await refreshMyUser();
  const u = state.user;
  renderAvatar($('#my-profile-avatar'), u);
  let nameHtml = `${u.firstname} ${u.lastname}`.trim() || u.username;
  if (u.is_frozen) nameHtml += frozenIcon();
  if (u.is_verified && !u.is_frozen) nameHtml += verifyBadgeSvg(20);
  $('#my-profile-name').innerHTML = nameHtml;
  $('#my-profile-username').textContent = '@' + u.username;
  $('#my-profile-user-id').textContent = u.user_id || '—';
  $('#my-profile-phone').textContent = u.phone || 'Не установлен';
  $('#my-profile-birthday').textContent = formatBirthday(u.birthday);
  $('#my-profile-bio').textContent = u.bio || 'Добавить описание';
  $('#my-profile-verified-note').hidden = !u.is_verified || u.is_frozen;

  renderAdditionalUsernamesInto('my-profile-additional-usernames', u.additional_usernames || [], u.username, u.username);

  const myStarsCountEl = document.getElementById('my-stars-badge-count');
  if (myStarsCountEl) myStarsCountEl.textContent = u.stars || 0;
  const myStarsBtn = document.getElementById('my-stars-badge-btn');
  if (myStarsBtn) myStarsBtn.style.display = '';

  const chRow = $('#my-profile-primary-channel-row');
  if (u.primary_channel_id) {
    try {
      const ch = await api('/api/channels/' + encodeURIComponent(u.primary_channel_id) + '?viewer=' + encodeURIComponent(state.user.username));
      const av = $('#my-primary-channel-avatar');
      if (ch.avatar) { av.style.backgroundImage = `url(${ch.avatar})`; av.textContent = ''; av.innerHTML = ''; }
      else { av.style.backgroundImage = ''; av.innerHTML = '<svg viewBox="0 0 24 24" width="60%" height="60%" fill="#fff"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>'; }
      $('#my-primary-channel-name').textContent = ch.name || ch.username;
      $('#my-primary-channel-subs').textContent = `${ch.subscribers_count || 0} ${pluralSubs(ch.subscribers_count || 0)}`;
      chRow.hidden = false;
      $('#my-profile-primary-channel').onclick = () => { showScreen('screen-main'); openChat(ch); };
    } catch { chRow.hidden = true; }
  } else chRow.hidden = true;

  const statusEl = $('.my-profile-status');
  if (statusEl) {
    if (u.is_frozen) {
      const dateStr = new Date((u.frozen_until || 0) * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
      statusEl.textContent = '❄️ Заморожен до ' + dateStr;
      statusEl.style.color = 'var(--danger)';
    } else { statusEl.textContent = 'в сети'; statusEl.style.color = ''; }
  }

  renderSubscriptionInfo('my-profile', u);
  showScreen('screen-my-profile');
  if (u.profile_bg_custom) applyCustomProfileBg(u.profile_bg_custom);
  else applyProfileBg(state.profileBg);
  if (typeof bindProfileTagButtons === 'function') bindProfileTagButtons();

  const myGiftsPanel = document.getElementById('my-profile-tab-gifts');
  if (myGiftsPanel) { myGiftsPanel.dataset.loaded = '0'; myGiftsPanel.dataset.owner = ''; }
  if (typeof setMyProfileTab === 'function') setMyProfileTab('gifts');
  if (typeof loadMyProfileGiftsPanel === 'function') loadMyProfileGiftsPanel();
}
$('#my-profile-back').addEventListener('click', () => showScreen('screen-main'));
$$('.tg-settings-item').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const action = btn.dataset.action;
    if (action === 'my-profile') renderMyProfile();
  });
});

function renderSubscriptionInfo(prefix, u) {
  const subInfo = $('#' + prefix + '-sub-info');
  const subBadge = $('#' + prefix + '-sub-badge');
  const subText = $('#' + prefix + '-sub-text');
  if (u.subscription && u.subscription.expires_at > Date.now() / 1000 && !u.is_frozen) {
    subInfo.hidden = false;
    const isUpPlus = u.subscription.type === 'up+';
    subBadge.textContent = isUpPlus ? '★' : '✓';
    subBadge.style.background = isUpPlus ? 'linear-gradient(135deg, #FF9500, #FF3B30)' : 'var(--accent)';
    subText.textContent = `Пользователь является обладателем ${isUpPlus ? 'Delta UP+' : 'Delta UP'}`;
    subBadge.onclick = () => {
      const exp = formatDate(u.subscription.expires_at);
      $('#sub-details-title').textContent = isUpPlus ? 'Delta UP+' : 'Delta UP';
      $('#sub-details-text').textContent = `Этот пользователь является обладателем подписки ${isUpPlus ? 'Delta UP+' : 'Delta UP'}. Подписка активна до ${exp}.`;
      $('#modal-sub-details').hidden = false;
    };
  } else subInfo.hidden = true;
}
$('#btn-close-sub-details').addEventListener('click', () => $('#modal-sub-details').hidden = true);
$('#btn-close-username-info')?.addEventListener('click', () => $('#modal-username-info').hidden = true);
$('#btn-ok-username-info')?.addEventListener('click', () => $('#modal-username-info').hidden = true);

$('#my-profile-edit-btn').addEventListener('click', async () => {
  await refreshMyUser();
  if (state.user.is_frozen) { showFrozenInfo(); return; }
  const u = state.user;
  renderAvatar($('#edit-profile-avatar'), u);
  $('#edit-profile-firstname').value = u.firstname || '';
  $('#edit-profile-lastname').value = u.lastname || '';
  $('#edit-profile-bio').value = u.bio || '';
  $('#edit-profile-birthday').value = u.birthday || '';
  $('#edit-profile-username-val').textContent = '@' + u.username;
  await updatePrimaryChannelLabel();
  showScreen('screen-edit-profile');
});
$('#edit-profile-cancel').addEventListener('click', () => showScreen('screen-my-profile'));

async function updatePrimaryChannelLabel() {
  const valEl = $('#edit-profile-channel-val');
  if (!valEl) return;
  if (state.user.primary_channel_id) {
    try { const ch = await api('/api/channels/' + encodeURIComponent(state.user.primary_channel_id) + '?viewer=' + encodeURIComponent(state.user.username)); valEl.textContent = ch.name || ch.username; }
    catch { valEl.textContent = 'Не выбран'; }
  } else valEl.textContent = 'Не выбран';
}

$('#btn-edit-primary-channel').addEventListener('click', async () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  try {
    const channels = await api('/api/users/' + encodeURIComponent(state.user.username) + '/owned_channels');
    const list = $('#primary-channel-list');
    list.innerHTML = '';
    if (channels.length === 0) { list.innerHTML = '<div class="ch-search-status">У вас нет каналов</div>'; }
    else {
      const noneRow = document.createElement('div');
      noneRow.className = 'add-sub-row';
      noneRow.innerHTML = '<div class="add-sub-row-info"><div class="subscriber-name">Не выбран</div></div>';
      noneRow.onclick = async () => {
        try {
          const updated = await api('/api/users/set_primary_channel', { method: 'POST', body: JSON.stringify({ username: state.user.username, channel_id: null }) });
          state.user = updated;
          $('#edit-profile-channel-val').textContent = 'Не выбран';
          $('#modal-select-primary-channel').hidden = true;
          toast('Канал убран');
        } catch (err) { toast(err.message); }
      };
      list.appendChild(noneRow);
      channels.forEach(ch => {
        const row = document.createElement('div');
        row.className = 'add-sub-row';
        const av = document.createElement('div'); av.className = 'subscriber-avatar';
        if (ch.avatar) { av.style.backgroundImage = `url(${ch.avatar})`; }
        else av.innerHTML = '<svg viewBox="0 0 24 24" width="60%" height="60%" fill="#fff"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
        const info = document.createElement('div'); info.className = 'add-sub-row-info';
        info.innerHTML = `<div class="subscriber-name">${escapeHtml(ch.name || ch.username)}</div><div class="subscriber-username">@${ch.username}</div>`;
        row.appendChild(av); row.appendChild(info);
        if (state.user.primary_channel_id === ch.channel_id) {
          const lbl = document.createElement('span'); lbl.className = 'add-sub-row-already-label'; lbl.textContent = 'выбран';
          row.appendChild(lbl);
        }
        row.onclick = async () => {
          try {
            const updated = await api('/api/users/set_primary_channel', { method: 'POST', body: JSON.stringify({ username: state.user.username, channel_id: ch.channel_id }) });
            state.user = updated;
            $('#edit-profile-channel-val').textContent = ch.name || ch.username;
            $('#modal-select-primary-channel').hidden = true;
            toast('Канал установлен');
          } catch (err) { toast(err.message); }
        };
        list.appendChild(row);
      });
    }
    $('#modal-select-primary-channel').hidden = false;
  } catch (err) { toast(err.message); }
});
$('#btn-close-primary-channel').addEventListener('click', () => $('#modal-select-primary-channel').hidden = true);

$('#btn-edit-change-photo').addEventListener('click', () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  $('#input-edit-avatar').click();
});
$('#input-edit-avatar').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const dataUrl = await resizeImage(file, 256);
    const updated = await api('/api/users/avatar', { method: 'POST', body: JSON.stringify({ username: state.user.username, avatar: dataUrl }) });
    state.user = updated; renderAvatar($('#edit-profile-avatar'), state.user);
    renderOwnProfile(); renderMyProfile(); toast('Фото обновлено');
  } catch (err) { toast(err.message); }
});

$('#edit-profile-save').addEventListener('click', async () => {
  if (state.user.is_frozen) return showFrozenInfo();
  const fn = $('#edit-profile-firstname').value.trim(); const ln = $('#edit-profile-lastname').value.trim();
  const bio = $('#edit-profile-bio').value.trim(); const birthday = $('#edit-profile-birthday').value;
  if (!fn) return toast('Введите имя');
  if (bio.length > 70) return toast('Описание максимум 70 символов');
  try {
    const updated = await api('/api/users/update', { method: 'POST', body: JSON.stringify({ username: state.user.username, firstname: fn, lastname: ln, bio: bio, birthday: birthday }) });
    state.user = updated; renderOwnProfile(); renderMyProfile(); showScreen('screen-my-profile'); toast('Профиль обновлен');
  } catch (err) { toast(err.message); }
});

$('#btn-edit-phone').addEventListener('click', () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  toast('Добавим скоро');
});

$('#btn-personalization').addEventListener('click', () => {
  if (state.user.is_frozen) return showFrozenInfo();
  state.tempProfileBg = state.profileBg;
  state.tempProfileBgCustom = state.user.profile_bg_custom || null;
  const preview = document.getElementById('personalization-preview');
  if (preview) {
    preview.classList.remove(...ALL_BG);
    preview.classList.add('bg-' + state.tempProfileBg);
    if (state.tempProfileBgCustom) {
      preview.style.backgroundImage = `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 40px, var(--bg) 100%), url(${state.tempProfileBgCustom})`;
      preview.style.backgroundSize = 'cover';
      preview.style.backgroundPosition = 'center top';
    } else {
      preview.style.backgroundImage = '';
    }
  }
  const previewAvatar = $('#preview-avatar');
  renderAvatar(previewAvatar, state.user);
  $('#preview-name').textContent = state.user.firstname || state.user.username;
  const customLabel = document.getElementById('personalization-custom-label');
  if (customLabel) customLabel.textContent = state.tempProfileBgCustom ? 'Свой фон загружен' : 'Загрузить свой фон';
  updatePersonalizationChecks();
  showScreen('screen-personalization');
});
$('#personalization-back').addEventListener('click', () => { showScreen('screen-edit-profile'); });
$$('.personalization-color-row').forEach(row => {
  row.addEventListener('click', () => {
    state.tempProfileBg = row.dataset.color;
    state.tempProfileBgCustom = null;
    const preview = document.getElementById('personalization-preview');
    if (preview) {
      preview.classList.remove(...ALL_BG);
      preview.classList.add('bg-' + state.tempProfileBg);
      preview.style.backgroundImage = '';
    }
    const customLabel = document.getElementById('personalization-custom-label');
    if (customLabel) customLabel.textContent = 'Загрузить свой фон';
    updatePersonalizationChecks();
  });
});

$('#btn-upload-custom-bg')?.addEventListener('click', () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  const sub = state.user.subscription;
  const hasUpPlus = sub && sub.type === 'up+' && sub.expires_at > Date.now() / 1000;
  if (!hasUpPlus) { $('#modal-up-plus-required').hidden = false; return; }
  $('#input-custom-bg').click();
});
$('#input-custom-bg')?.addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const dataUrl = await resizeImageLarge(file, 1280);
    state.tempProfileBgCustom = dataUrl;
    state.tempProfileBg = 'default';
    const preview = document.getElementById('personalization-preview');
    if (preview) {
      preview.classList.remove(...ALL_BG);
      preview.classList.add('bg-default');
      preview.style.backgroundImage = `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 40px, var(--bg) 100%), url(${dataUrl})`;
      preview.style.backgroundSize = 'cover';
      preview.style.backgroundPosition = 'center top';
    }
    const customLabel = document.getElementById('personalization-custom-label');
    if (customLabel) customLabel.textContent = 'Свой фон загружен';
    toast('Фон загружен. Не забудьте сохранить.');
  } catch { toast('Не удалось обработать изображение'); }
});
$('#btn-close-up-plus-required')?.addEventListener('click', () => $('#modal-up-plus-required').hidden = true);
$('#btn-go-to-up-from-plus')?.addEventListener('click', () => {
  $('#modal-up-plus-required').hidden = true;
  showScreen('screen-delta-up');
  renderDeltaUp();
});

$('#btn-save-personalization').addEventListener('click', async () => {
  if (state.user.is_frozen) return showFrozenInfo();
  if (state.tempProfileBgCustom) {
    const sub = state.user.subscription;
    const hasUpPlus = sub && sub.type === 'up+' && sub.expires_at > Date.now() / 1000;
    if (!hasUpPlus) { $('#modal-up-plus-required').hidden = false; return; }
    try {
      const updated = await api('/api/users/profile_bg_custom', {
        method: 'POST',
        body: JSON.stringify({ username: state.user.username, image: state.tempProfileBgCustom })
      });
      state.user = updated;
      applyCustomProfileBg(updated.profile_bg_custom);
      showScreen('screen-edit-profile');
      toast('Свой фон профиля установлен');
    } catch (err) { toast(err.message); }
    return;
  }
  if (state.tempProfileBg !== 'default' && (!state.user.subscription || state.user.subscription.expires_at < Date.now() / 1000)) {
    $('#modal-up-required').hidden = false; return;
  }
  try {
    await api('/api/users/profile_bg_custom', {
      method: 'POST',
      body: JSON.stringify({ username: state.user.username, image: null })
    });
    const updated2 = await api('/api/users/profile_bg', {
      method: 'POST',
      body: JSON.stringify({ username: state.user.username, color: state.tempProfileBg })
    });
    state.user = updated2;
    state.profileBg = updated2.profile_bg || 'default';
    applyProfileBg(state.profileBg);
    showScreen('screen-edit-profile');
    toast('Фон профиля обновлён');
  } catch (err) { toast(err.message); }
});
$('#btn-go-to-up').addEventListener('click', () => { $('#modal-up-required').hidden = true; showScreen('screen-delta-up'); renderDeltaUp(); });
$('#btn-close-up-required').addEventListener('click', () => $('#modal-up-required').hidden = true);

$('#btn-appearance').addEventListener('click', () => {
  updateAppearanceChecks();
  const preview = document.getElementById('wallpaper-preview');
  if (preview) {
    const wp = state.wallpaper || (state.user && state.user.wallpaper);
    if (wp) { preview.style.backgroundImage = `url(${wp})`; preview.textContent = ''; }
    else { preview.style.backgroundImage = ''; preview.innerHTML = '<span class="wallpaper-placeholder">Обои не установлены</span>'; }
  }
  showScreen('screen-appearance');
});
$('#appearance-back').addEventListener('click', () => showScreen('screen-main'));
$$('.appearance-theme-row').forEach(row => row.addEventListener('click', () => { applyTheme(row.dataset.theme); toast('Тема изменена'); }));
$$('.appearance-font-row').forEach(row => row.addEventListener('click', () => { applyFontSize(row.dataset.size); toast('Размер шрифта изменен'); }));

$('#btn-change-wallpaper')?.addEventListener('click', () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  $('#input-wallpaper').click();
});
$('#input-wallpaper')?.addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const dataUrl = await resizeImageLarge(file, 1600);
    const updated = await api('/api/users/wallpaper', {
      method: 'POST',
      body: JSON.stringify({ username: state.user.username, image: dataUrl })
    });
    state.user = updated;
    state.wallpaper = updated.wallpaper;
    applyWallpaperToChat();
    const preview = document.getElementById('wallpaper-preview');
    if (preview) { preview.style.backgroundImage = `url(${dataUrl})`; preview.textContent = ''; }
    toast('Обои установлены');
  } catch (err) { toast(err.message); }
});
$('#btn-reset-wallpaper')?.addEventListener('click', async () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  try {
    const updated = await api('/api/users/wallpaper', {
      method: 'POST',
      body: JSON.stringify({ username: state.user.username, image: null })
    });
    state.user = updated;
    state.wallpaper = null;
    applyWallpaperToChat();
    const preview = document.getElementById('wallpaper-preview');
    if (preview) { preview.style.backgroundImage = ''; preview.innerHTML = '<span class="wallpaper-placeholder">Обои не установлены</span>'; }
    toast('Обои сброшены');
  } catch (err) { toast(err.message); }
});

$('#btn-edit-username').addEventListener('click', async () => {
  if (state.user.is_frozen) return showFrozenInfo();
  $('#input-edit-username').value = state.user.username;
  await renderUsernameCollection();
  showScreen('screen-edit-username');
});
$('#edit-username-back').addEventListener('click', () => showScreen('screen-edit-profile'));
$('#edit-username-save').addEventListener('click', async () => {
  if (state.user.is_frozen) return showFrozenInfo();
  const newUsername = $('#input-edit-username').value.trim().toLowerCase();
  if (!/^[a-z0-9_]{4,32}$/i.test(newUsername)) return toast('Некорректное имя');
  if (newUsername === state.user.username) return showScreen('screen-edit-profile');
  try {
    const updated = await api('/api/users/change_username', {
      method: 'POST',
      body: JSON.stringify({ old_username: state.user.username, new_username: newUsername })
    });
    state.user = updated;
    if (state.sessionToken) clearTokenFor(state.user.username);
    await refreshChatsFromServer(); renderMyProfile(); renderOwnProfile();
    showScreen('screen-edit-profile'); toast('Имя изменено. Войдите заново.');
    setTimeout(() => forceLogout('Имя изменено, войдите заново с новым @username'), 1500);
  } catch (err) { toast(err.message); }
});

async function renderUsernameCollection() {
  const container = document.getElementById('username-collection-list');
  if (!container) return;
  container.innerHTML = '<div class="sheet-empty">Загрузка...</div>';
  try {
    const fresh = await api('/api/users/' + encodeURIComponent(state.user.username) + '?viewer=' + encodeURIComponent(state.user.username));
    state.user = fresh;
    const owned = fresh.owned_usernames || [];
    container.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'username-collection-header';
    header.innerHTML = `<span>Купленные юзернеймы</span><span class="username-collection-count">${owned.length}</span>`;
    container.appendChild(header);
    if (owned.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sheet-empty';
      empty.textContent = 'У вас нет купленных юзернеймов. Приобрести можно у @nftbot.';
      container.appendChild(empty); return;
    }
    const appliedCount = owned.filter(x => x.is_applied).length;
    const hint = document.createElement('div');
    hint.className = 'username-collection-hint';
    hint.textContent = `Применено: ${appliedCount} / 10. Нажмите — применить или снять.`;
    container.appendChild(hint);
    owned.forEach(item => {
      const row = document.createElement('div');
      row.className = 'username-collection-row' + (item.is_applied ? ' applied' : '');
      const left = document.createElement('div');
      left.className = 'username-collection-left';
      left.innerHTML = `<div class="username-collection-name">@${escapeHtml(item.username)}</div><div class="username-collection-date">Куплен ${new Date((item.purchased_at || 0) * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>`;
      row.appendChild(left);
      const check = document.createElement('div');
      check.className = 'username-collection-check';
      check.innerHTML = item.is_applied
        ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="#3390ec"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
        : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>';
      row.appendChild(check);
      row.onclick = async () => {
        if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
        try {
          const updated = await api('/api/users/toggle_additional_username', {
            method: 'POST',
            body: JSON.stringify({ username: state.user.username, target_username: item.username, apply: !item.is_applied })
          });
          state.user = updated;
          await renderUsernameCollection();
          toast(item.is_applied ? `@${item.username} снят` : `@${item.username} применён`);
        } catch (err) { toast(err.message); }
      };
      container.appendChild(row);
    });
  } catch (err) { container.innerHTML = `<div class="sheet-empty">${err.message}</div>`; }
}

function renderChats() {
  const list = $('#chat-list'); list.innerHTML = '';
  $('#chat-list-empty').style.display = state.chats.length ? 'none' : 'block';
  const sorted = [...state.chats].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1; if (!a.pinned && b.pinned) return 1;
    return (b.lastMessage?.ts || 0) - (a.lastMessage?.ts || 0);
  });
  sorted.forEach(c => list.appendChild(makeChatItem(c.peer, false, c)));
}

function makeChatItem(peer, fromSearch, chatData) {
  const el = document.createElement('div'); el.className = 'chat-item';
  const avWrap = document.createElement('div'); avWrap.className = 'chat-avatar-wrap';
  const av = document.createElement('div'); av.className = 'chat-avatar'; renderAvatar(av, peer); avWrap.appendChild(av);
  const unread = chatData?.unread || 0;
  if (unread > 0 && !fromSearch) {
    const badge = document.createElement('div'); badge.className = 'chat-badge';
    badge.textContent = unread > 99 ? '99+' : unread; avWrap.appendChild(badge);
  }
  el.appendChild(avWrap);
  const info = document.createElement('div'); info.className = 'chat-info';
  const row = document.createElement('div'); row.className = 'chat-row';
  const nameWrap = document.createElement('div'); nameWrap.style.display = 'flex'; nameWrap.style.alignItems = 'center'; nameWrap.style.gap = '4px';
  const name = document.createElement('div'); name.className = 'chat-name' + (unread > 0 && !fromSearch ? ' unread' : '');
  let nameHtml = displayName(peer);
  if (peer.is_channel) { nameHtml += '<span class="search-result-channel-badge" style="margin-left:6px;">КАНАЛ</span>'; }
  else {
    if (isPeerFrozenForMe(peer)) nameHtml += frozenIcon();
    if (peer.is_verified && !isPeerFrozenForMe(peer)) nameHtml += verifyBadgeSvg(14);
  }
  name.innerHTML = nameHtml;
  nameWrap.appendChild(name);
  if (chatData?.pinned && !fromSearch) {
    const pinIcon = document.createElement('div'); pinIcon.className = 'chat-status-icons';
    pinIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>'; nameWrap.appendChild(pinIcon);
  }
  if (chatData?.muted && !fromSearch) {
    const muteIcon = document.createElement('div'); muteIcon.className = 'chat-status-icons';
    muteIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 18.69L7.84 6.14 5.27 3.49 4 4.76l2.8 2.8v.01c-.52.99-.8 2.16-.8 3.42v5l-2 2v1h13.73l2 2L21 19.72l-1-1.03zM12 22c1.11 0 2-.89 2-2h-4c0 1.11.89 2 2 2z"/></svg>'; nameWrap.appendChild(muteIcon);
  }
  row.appendChild(nameWrap);
  if (chatData?.lastMessage && !fromSearch) {
    const time = document.createElement('div'); time.className = 'chat-time';
    time.textContent = formatTime(chatData.lastMessage.ts); row.appendChild(time);
  }
  info.appendChild(row);
  if (chatData?.lastMessage && !fromSearch) {
    const preview = document.createElement('div'); preview.className = 'chat-preview' + (unread > 0 ? ' unread' : '');
    const lastMsg = chatData.lastMessage;
    if (lastMsg.gift) {
      const giftName = state.GIFTS[lastMsg.gift.gift_id]?.name || 'подарок';
      const isMine = lastMsg.gift.from === state.user.username;
      preview.textContent = isMine ? `🎁 Вы подарили: ${giftName}` : `🎁 Вам подарили: ${giftName}`;
    } else if (peer.is_channel) preview.textContent = lastMsg.text || 'Нет постов';
    else { const prefix = lastMsg.author === state.user.username ? 'Вы: ' : ''; preview.textContent = prefix + lastMsg.text; }
    info.appendChild(preview);
  } else if (peer.is_channel) {
    const sub = document.createElement('div'); sub.className = 'chat-username';
    sub.textContent = (peer.subscribers_count || 0) + ' ' + pluralSubs(peer.subscribers_count || 0);
    info.appendChild(sub);
  } else if (!peer.is_saved) {
    const uname = document.createElement('div'); uname.className = 'chat-username';
    uname.textContent = '@' + peer.username; info.appendChild(uname);
  }
  el.appendChild(info);
  el.addEventListener('click', () => {
    if (fromSearch) {
      $('#search-input').value = ''; $$('.tab-panel').forEach(p => p.classList.remove('active'));
      $$('.tab').forEach(t => t.classList.remove('active')); $('#panel-chats').classList.add('active');
      $('.tab[data-tab="chats"]').classList.add('active');
    }
    openChat(peer);
  });
  if (!fromSearch) {
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault(); state.contextTargetChat = chatData;
      const ctx = $('#chat-context-menu'); ctx.hidden = false;
      const menuWidth = 260; const menuHeight = 280; let x = e.clientX; let y = e.clientY;
      if (x + menuWidth > window.innerWidth) x -= menuWidth;
      if (y + menuHeight > window.innerHeight) y -= menuHeight;
      ctx.style.left = x + 'px'; ctx.style.top = y + 'px';
      const pinBtn = ctx.querySelector('[data-action="pin"] span'); pinBtn.textContent = chatData.pinned ? 'Открепить' : 'Закрепить';
      const muteBtn = ctx.querySelector('[data-action="mute"] span'); muteBtn.textContent = chatData.muted ? 'Включить уведомления' : 'Выключить уведомления';
      const delBtn = ctx.querySelector('[data-action="delete"] span');
      if (chatData.peer && chatData.peer.is_channel) delBtn.textContent = 'Покинуть канал';
      else delBtn.textContent = 'Удалить чат';
    });
    bindLongPress(el, () => {
      state.contextTargetChat = chatData;
      const ctx = $('#chat-context-menu');
      ctx.hidden = false;
      ctx.style.left = '50%';
      ctx.style.top = '50%';
      ctx.style.transform = 'translate(-50%, -50%)';
      const pinBtn = ctx.querySelector('[data-action="pin"] span');
      if (pinBtn) pinBtn.textContent = chatData.pinned ? 'Открепить' : 'Закрепить';
      const muteBtn = ctx.querySelector('[data-action="mute"] span');
      if (muteBtn) muteBtn.textContent = chatData.muted ? 'Включить уведомления' : 'Выключить уведомления';
      const delBtn = ctx.querySelector('[data-action="delete"] span');
      if (delBtn) {
        if (chatData.peer && chatData.peer.is_channel) delBtn.textContent = 'Покинуть канал';
        else delBtn.textContent = 'Удалить чат';
      }
    });
  }
  return el;
}

$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.remove('active')); $$('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active'); $('#panel-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'profile') { $('#sidebar-header').style.display = 'none'; } else { $('#sidebar-header').style.display = 'flex'; }
  });
});

let searchTimer = null;
$('#search-input').addEventListener('input', (e) => {
  clearTimeout(searchTimer); const q = e.target.value.trim();
  if (!q) {
    $$('.tab-panel').forEach(p => p.classList.remove('active')); $$('.tab').forEach(t => t.classList.remove('active'));
    $('#panel-chats').classList.add('active'); $('.tab[data-tab="chats"]').classList.add('active'); return;
  }
  $$('.tab-panel').forEach(p => p.classList.remove('active')); $('#panel-search').classList.add('active');
  searchTimer = setTimeout(() => doSearch(q), 250);
});
async function doSearch(q) {
  try {
    const results = await api('/api/users/search?q=' + encodeURIComponent(q) + '&viewer=' + state.user.username);
    const filtered = results.filter(u => !(u.username === state.user.username && !u.is_channel));
    renderSearchResults(filtered, q);
  } catch {}
}
function renderSearchResults(results, query) {
  const box = $('#search-results'); box.innerHTML = '';
  if (results.length === 0) { box.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔎</div><p>Никого не найдено</p></div>'; return; }
  const exact = results.filter(r => (r.username || '').toLowerCase() === query.toLowerCase());
  const similar = results.filter(r => (r.username || '').toLowerCase() !== query.toLowerCase());
  exact.forEach(u => box.appendChild(makeChatItem(u, true)));
  if (similar.length > 0) {
    if (exact.length > 0) { const sep = document.createElement('div'); sep.className = 'search-separator'; sep.textContent = 'Похожие'; box.appendChild(sep); }
    similar.forEach(u => box.appendChild(makeChatItem(u, true)));
  }
}

$('#btn-saved-messages').addEventListener('click', () => {
  const savedPeer = { username: 'saved', firstname: 'Избранное', lastname: '', avatar: null, is_saved: true, bio: '', phone: '', last_seen: '' };
  openChat(savedPeer);
});

function roomFor(a, b) { return [a.toLowerCase(), b.toLowerCase()].sort().join('_'); }
function roomForPeer(peer) {
  if (peer && peer.is_channel) return 'channel_' + peer.channel_id;
  return roomFor(state.user.username, peer.username);
}

function updateChatHeader() {
  if (!state.currentPeer) return;
  const peer = state.currentPeer;
  let nameHtml = displayName(peer);
  if (peer.is_channel) { if (peer.is_verified) nameHtml += verifyBadgeSvg(18); }
  else {
    if (isPeerFrozenForMe(peer)) nameHtml += frozenIcon();
    if (peer.is_verified && !isPeerFrozenForMe(peer)) nameHtml += verifyBadgeSvg(18);
  }
  $('#chat-header-name').innerHTML = nameHtml;
  if (peer.is_channel) $('#chat-header-status').textContent = `${peer.subscribers_count || 0} ${pluralSubs(peer.subscribers_count || 0)}`;
  else if (peer.is_saved || peer.is_deleted) $('#chat-header-status').textContent = '';
  else if (isPeerFrozenForMe(peer)) $('#chat-header-status').textContent = '❄️ Заморожен';
  else $('#chat-header-status').textContent = formatStatus(peer);
  renderAvatar($('#chat-header-avatar'), peer);
  $('#chat-empty-name').textContent = displayName(peer);
}

function updateFirstTimeBanner() {
  const banner = $('#first-time-banner');
  if (!banner) return;
  banner.hidden = true;
  const peer = state.currentPeer;
  if (!peer || peer.is_channel || peer.is_saved || peer.is_bot || peer.is_deleted) return;
  if (isPeerFrozenForMe(peer)) return;
  if (state.user.contacts && state.user.contacts[peer.username]) return;
  if (state.user.blocked && state.user.blocked.includes(peer.username)) return;
  const hasFromPeer = state.messages.some(m => m.author === peer.username && !m.gift);
  const hasFromMe = state.messages.some(m => m.author === state.user.username);
  if (hasFromPeer && !hasFromMe) banner.hidden = false;
}

$('#btn-first-time-block')?.addEventListener('click', () => {
  if (!state.currentPeer) return;
  state.currentViewingUser = state.currentPeer;
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  $('#modal-block').hidden = false;
});
$('#btn-first-time-add')?.addEventListener('click', () => {
  if (!state.currentPeer) return;
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  state.currentViewingUser = state.currentPeer;
  $('#modal-contact-title').textContent = 'Добавить контакт';
  $('#contact-firstname').value = state.currentPeer.firstname || '';
  $('#contact-lastname').value = state.currentPeer.lastname || '';
  $('#btn-delete-contact').hidden = true;
  $('#modal-contact').hidden = false;
});

function updateChatInputState() {
  if (!state.currentPeer) return;
  const peer = state.currentPeer;
  $('#chat-subscribe-prompt').hidden = true;
  $('#chat-input-disabled').hidden = true;
  const nftStartWrap = $('#chat-nftbot-start-wrap');
  if (nftStartWrap) nftStartWrap.hidden = true;

  if (peer.username && peer.username.toLowerCase() === 'nftbot' && !peer.is_channel) {
    if (state.messages.length === 0) {
      $('#chat-input-area').hidden = true;
      $('#chat-blocked-overlay').hidden = true;
      $('#chat-input-disabled').hidden = true;
      if (nftStartWrap) nftStartWrap.hidden = false;
      return;
    }
    if (state.user.is_frozen) {
      $('#chat-input-area').hidden = true;
      $('#chat-blocked-overlay').hidden = false;
      $('#btn-chat-unblock').textContent = '❄️ Аккаунт заморожен';
      $('#btn-chat-unblock').classList.add('frozen-btn');
      return;
    }
    $('#chat-input-area').hidden = false;
    $('#chat-blocked-overlay').hidden = true;
    $('#message-input').placeholder = 'Написать сообщение...';
    return;
  }

  if (peer.is_channel) {
    $('#chat-input-area').hidden = true;
    $('#chat-blocked-overlay').hidden = true;
    const isOwner = (peer.owner || '').toLowerCase() === state.user.username.toLowerCase();
    const isAdmin = (peer.admins || []).map(a => a.toLowerCase()).includes(state.user.username.toLowerCase());
    const isSub = peer.is_subscribed_for_viewer || (peer.subscribers || []).map(s => s.toLowerCase()).includes(state.user.username.toLowerCase());
    if (state.user.is_frozen) {
      $('#chat-input-disabled').hidden = false;
      $('#chat-input-disabled').textContent = '❄️ Аккаунт заморожен';
      return;
    }
    if (isOwner || isAdmin) {
      $('#chat-input-area').hidden = false;
      $('#message-input').placeholder = 'Опубликовать пост...';
    } else if (!isSub) {
      $('#chat-subscribe-prompt').hidden = false;
    } else {
      $('#chat-input-disabled').hidden = false;
      $('#chat-input-disabled').textContent = 'Вы не можете опубликовать пост';
    }
    return;
  }

  $('#message-input').placeholder = 'Написать сообщение...';
  const isBlockedByMe = (state.user.blocked || []).includes(peer.username);
  if (state.user.is_frozen) {
    $('#chat-input-area').hidden = true;
    $('#chat-blocked-overlay').hidden = false;
    $('#btn-chat-unblock').textContent = '❄️ Аккаунт заморожен';
    $('#btn-chat-unblock').classList.add('frozen-btn');
  } else if (peer.is_deleted) {
    $('#chat-input-area').hidden = true;
    $('#chat-blocked-overlay').hidden = true;
    $('#btn-chat-unblock').classList.remove('frozen-btn');
  } else if (isBlockedByMe && !peer.is_saved) {
    $('#chat-input-area').hidden = true;
    $('#chat-blocked-overlay').hidden = false;
    $('#btn-chat-unblock').textContent = 'Разблокировать';
    $('#btn-chat-unblock').classList.remove('frozen-btn');
  } else {
    $('#chat-input-area').hidden = false;
    $('#chat-blocked-overlay').hidden = true;
    $('#btn-chat-unblock').textContent = 'Разблокировать';
    $('#btn-chat-unblock').classList.remove('frozen-btn');
  }
}

document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'chat-nftbot-start') {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return toast('Соединение не установлено');
    if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
    const tempId = 'temp_' + Date.now();
    state.socket.send(JSON.stringify({ action: "send", text: "/start", temp_id: tempId }));
    const msg = { id: tempId, author: state.user.username, text: '/start', ts: Math.floor(Date.now() / 1000), edited: false, pinned: false, reply_to: null, read: false };
    renderMessage(msg);
    const el = $(`.message[data-id="${tempId}"]`); if (el) el.setAttribute('data-temp-id', tempId);
    if (!state.chats.find(c => c.peer.username === state.currentPeer.username)) {
      state.chats.push({ peer: state.currentPeer, lastMessage: { author: state.user.username, text: '/start', ts: Math.floor(Date.now() / 1000) }, unread: 0, pinned: false, muted: false });
    }
    saveChatsToLS(); renderChats();
    const wrap = $('#chat-nftbot-start-wrap'); if (wrap) wrap.hidden = true;
    $('#chat-input-area').hidden = false;
    $('#message-input').focus();
  }
});

async function openChat(peer) {
  state.currentPeer = peer;
  const room = roomForPeer(peer);
  const chatEntry = state.chats.find(c => {
    if (peer.is_channel) return c.peer.channel_id === peer.channel_id;
    return c.peer.username === peer.username;
  });
  if (chatEntry) { chatEntry.unread = 0; }
  saveChatsToLS(); renderChats();
  api('/api/mark-read', { method: 'POST', body: JSON.stringify({ username: state.user.username, room }) }).catch(() => {});
  try { state.user = await api('/api/users/' + encodeURIComponent(state.user.username) + '?viewer=' + encodeURIComponent(state.user.username)); } catch {}
  $('#empty-chat').style.display = 'none'; $('#chat-view').hidden = false; $('.chat-area').classList.add('visible');
  updateChatHeader();
  updateChatInputState();
  let history = [];
  try {
    if (peer.is_channel) history = await api('/api/channels/' + encodeURIComponent(peer.channel_id) + '/messages?viewer=' + encodeURIComponent(state.user.username));
    else {
      const qs = `?viewer=${encodeURIComponent(state.user.username)}&peer=${encodeURIComponent(peer.username)}`;
      history = await api('/api/messages/' + encodeURIComponent(room) + qs);
    }
  } catch {}
  state.messages = history; renderHistory(history); updatePinnedBar();
  updateChatInputState();
  updateFirstTimeBanner();
  if (state.socket) { try { state.socket.close(); } catch {} state.socket = null; }
  connectWS(room);
  if (state.peerStatusTimer) clearInterval(state.peerStatusTimer);
  state.peerStatusTimer = setInterval(async () => {
    if (!state.currentPeer || state.currentPeer.is_saved) return;
    if (document.visibilityState !== 'visible') return;
    try {
      if (state.currentPeer.is_channel) {
        const fresh = await api('/api/channels/' + encodeURIComponent(state.currentPeer.channel_id) + '?viewer=' + encodeURIComponent(state.user.username));
        state.currentPeer = fresh; updateChatHeader(); updateChatInputState();
      } else {
        const u = await api(`/api/users/${encodeURIComponent(state.currentPeer.username)}?viewer=${state.user.username}`);
        state.currentPeer = u; updateChatHeader();
      }
    } catch {}
  }, 15000);
}

function updatePinnedBar() {
  const pinned = state.messages.find(m => m.pinned); const bar = $('#pinned-bar');
  if (pinned) { bar.hidden = false; $('#pinned-bar-text').textContent = pinned.text; } else { bar.hidden = true; }
}

function renderHistory(history) {
  const box = $('#messages'); box.innerHTML = '';
  const isChannel = state.currentPeer && state.currentPeer.is_channel;
  if (history.length === 0) {
    box.hidden = true;
    $('#chat-empty-state').style.display = isChannel ? 'none' : 'flex';
    return;
  }
  box.hidden = false; $('#chat-empty-state').style.display = 'none';
  history.forEach(renderMessage); box.scrollTop = box.scrollHeight;
}

function renderMessage(msg) {
  const box = $('#messages');

  if (msg.gift) {
    let el = box.querySelector(`[data-id="${msg.id}"]`);
    if (el) { el.innerHTML = ''; } else { el = document.createElement('div'); el.dataset.id = msg.id; box.appendChild(el); }
    el.className = 'message gift-message-center';
    const isMine = msg.gift.from === state.user.username;
    const title = isMine ? 'Вы подарили' : 'Вам подарили';
    const caption = msg.gift.message || '';
    el.innerHTML = `
      <div class="gift-msg-title">${title}</div>
      <div class="gift-msg-icon">${getGiftSvg(msg.gift.gift_id)}</div>
      ${caption ? `<div class="gift-msg-caption">${escapeHtml(caption)}</div>` : ''}
      <div class="msg-time" style="font-size:11px;color:var(--text-secondary);">${formatTime(msg.ts)}</div>`;
    box.hidden = false; $('#chat-empty-state').style.display = 'none'; box.scrollTop = box.scrollHeight;
    return;
  }

  const isChannel = state.currentPeer && state.currentPeer.is_channel;
  const own = msg.author === state.user.username;
  let el = box.querySelector(`[data-id="${msg.id}"]`);
  if (el) { el.innerHTML = ''; } else { el = document.createElement('div'); el.dataset.id = msg.id; box.appendChild(el); }
  el.className = 'message' + (own ? ' own' : '') + (isChannel ? ' channel-post' : '');

  if (isChannel) {
    const authorEl = document.createElement('div');
    authorEl.className = 'msg-author-header';
    authorEl.textContent = own ? 'Вы' : '@' + msg.author;
    el.appendChild(authorEl);
  } else if (msg.reply_to) {
    const replyDiv = document.createElement('div'); replyDiv.className = 'msg-reply-block';
    replyDiv.innerHTML = `<div class="msg-reply-author">Ответ</div><div class="msg-reply-text">${escapeHtml(msg.reply_to.text)}</div>`;
    el.appendChild(replyDiv);
  }
  if (isChannel && msg.reply_to) {
    const replyDiv = document.createElement('div'); replyDiv.className = 'msg-reply-block';
    replyDiv.innerHTML = `<div class="msg-reply-text">${escapeHtml(msg.reply_to.text)}</div>`;
    el.appendChild(replyDiv);
  }

  const t = document.createElement('div'); t.className = 'msg-text';
  t.innerHTML = linkifyMessage(msg.text);
  el.appendChild(t);

  if (msg.inline_button && !msg.inline_buttons) {
    const btn = document.createElement('button');
    btn.className = 'inline-btn';
    btn.textContent = msg.inline_button.text;
    btn.onclick = (e) => { e.stopPropagation(); handleInlineAction(msg.inline_button.action); };
    el.appendChild(btn);
  }
  if (msg.inline_buttons && Array.isArray(msg.inline_buttons) && msg.inline_buttons.length > 0) {
    const wrap = document.createElement('div');
    wrap.className = 'inline-buttons-wrap';
    msg.inline_buttons.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'inline-btn';
      btn.textContent = item.text;
      btn.onclick = (e) => { e.stopPropagation(); sendBotAction(msg.author, item.action); };
      wrap.appendChild(btn);
    });
    el.appendChild(wrap);
  }

  const footer = document.createElement('div'); footer.className = 'msg-footer';
  if (msg.pinned) {
    const pin = document.createElement('div'); pin.className = 'msg-pin-icon';
    pin.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>'; footer.appendChild(pin);
  }
  if (msg.edited) {
    const ed = document.createElement('div'); ed.className = 'msg-edited-icon';
    ed.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>'; footer.appendChild(ed);
  }
  if (own && !isChannel) {
    const check = document.createElement('div');
    check.className = 'msg-check';
    check.innerHTML = msg.read
      ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="#3390ec"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="14" height="14" fill="#999"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
    footer.appendChild(check);
  }
  const tm = document.createElement('span'); tm.className = 'msg-time'; tm.textContent = formatTime(msg.ts); footer.appendChild(tm);
  el.appendChild(footer); box.hidden = false; $('#chat-empty-state').style.display = 'none'; box.scrollTop = box.scrollHeight;

  el.oncontextmenu = (e) => {
    e.preventDefault(); e.stopPropagation(); state.contextTargetMsg = msg;
    const menu = $('#msg-context-menu'); menu.hidden = false;
    const isOwnerCh = isChannel && (state.currentPeer.owner || '').toLowerCase() === state.user.username.toLowerCase();
    const replyBtn = menu.querySelector('[data-action="reply"]');
    const editBtn = menu.querySelector('[data-action="edit"]');
    const pinBtn = menu.querySelector('[data-action="pin"]');
    const delBtn = menu.querySelector('[data-action="delete"]');

    if (isChannel) {
      if (replyBtn) replyBtn.style.display = 'none';
      if (editBtn) editBtn.style.display = isOwnerCh ? 'flex' : 'none';
      if (pinBtn) pinBtn.style.display = isOwnerCh ? 'flex' : 'none';
      if (delBtn) delBtn.style.display = isOwnerCh ? 'flex' : 'none';
    } else {
      if (replyBtn) replyBtn.style.display = 'flex';
      if (editBtn) editBtn.style.display = own ? 'flex' : 'none';
      if (pinBtn) pinBtn.style.display = 'flex';
      if (delBtn) delBtn.style.display = 'flex';
    }

    let x = e.clientX; let y = e.clientY; const w = 260, h = 350;
    if (x + w > window.innerWidth) x -= w; if (y + h > window.innerHeight) y -= h;
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
  };

  bindLongPress(el, () => {
    state.contextTargetMsg = msg;
    const menu = $('#msg-context-menu');
    menu.hidden = false;
    menu.style.left = '50%';
    menu.style.top = '50%';
    menu.style.transform = 'translate(-50%, -50%)';
    const isOwnerCh = isChannel && (state.currentPeer.owner || '').toLowerCase() === state.user.username.toLowerCase();
    const replyBtn = menu.querySelector('[data-action="reply"]');
    const editBtn = menu.querySelector('[data-action="edit"]');
    const pinBtn = menu.querySelector('[data-action="pin"]');
    const delBtn = menu.querySelector('[data-action="delete"]');
    if (isChannel) {
      if (replyBtn) replyBtn.style.display = 'none';
      if (editBtn) editBtn.style.display = isOwnerCh ? 'flex' : 'none';
      if (pinBtn) pinBtn.style.display = isOwnerCh ? 'flex' : 'none';
      if (delBtn) delBtn.style.display = isOwnerCh ? 'flex' : 'none';
    } else {
      if (replyBtn) replyBtn.style.display = 'flex';
      if (editBtn) editBtn.style.display = own ? 'flex' : 'none';
      if (pinBtn) pinBtn.style.display = 'flex';
      if (delBtn) delBtn.style.display = 'flex';
    }
  });
}

function sendBotAction(botAuthor, botAction) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return toast('Соединение не установлено');
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  try { state.socket.send(JSON.stringify({ action: 'bot_action', bot: botAuthor, bot_action: botAction })); } catch {}
}

function handleInlineAction(action) { if (action === 'open_admin_panel') openAdminPanel(); }

function connectWS(room) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const to = state.currentPeer ? (state.currentPeer.is_channel ? 'channel_' + state.currentPeer.channel_id : state.currentPeer.username) : '';
  const token = state.sessionToken || '';
  const url = `${proto}//${window.location.host}/ws/chat/${encodeURIComponent(room)}/${encodeURIComponent(state.user.username)}?to=${encodeURIComponent(to)}&token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(url); state.socket = ws;
  ws.onopen = () => { updateChatHeader(); };
  ws.onerror = () => {};
  ws.onclose = (e) => {
    if (e.code === 4001) { forceLogout('Сессия истекла. Войдите заново.'); return; }
  };
  ws.onmessage = (event) => {
    let data; try { data = JSON.parse(event.data); } catch { return; }
    if (data.type === 'error') {
      const el = document.querySelector(`[data-temp-id="${data.temp_id}"]`);
      if (el) { const err = document.createElement('div'); err.className = 'msg-error'; err.textContent = data.text; el.appendChild(err); }
      else toast(data.text);
    } else if (data.type === 'new') {
      const msg = data.message;
      if (data.temp_id) { const tempEl = document.querySelector(`[data-temp-id="${data.temp_id}"]`); if (tempEl) tempEl.remove(); }
      if (!state.messages.find(m => m.id === msg.id)) state.messages.push(msg);
      renderMessage(msg);
      updateFirstTimeBanner();
      if (msg.author !== state.user.username && state.currentPeer && !msg.gift) {
        const roomNow = roomForPeer(state.currentPeer);
        api('/api/mark-read', { method: 'POST', body: JSON.stringify({ username: state.user.username, room: roomNow }) }).catch(() => {});
      }
      const chatEntry = state.chats.find(c => {
        if (!state.currentPeer) return false;
        if (state.currentPeer.is_channel) return c.peer.channel_id === state.currentPeer.channel_id;
        return c.peer.username === state.currentPeer.username;
      });
      if (chatEntry && !msg.inline_button && !msg.inline_buttons) {
        const lm = { author: msg.author, text: msg.text, ts: msg.ts };
        if (msg.gift) lm.gift = msg.gift;
        chatEntry.lastMessage = lm;
        saveChatsToLS(); renderChats();
      }
      updateChatInputState();
    } else if (data.type === 'edit') {
      const msg = state.messages.find(m => m.id === data.id);
      if (msg) { msg.text = data.text; msg.edited = true; renderMessage(msg); }
    } else if (data.type === 'delete') {
      state.messages = state.messages.filter(m => m.id !== data.id);
      const el = $(`.message[data-id="${data.id}"]`); if (el) el.remove();
    } else if (data.type === 'pin') {
      state.messages.forEach(m => m.pinned = (m.id === data.id));
      state.messages.forEach(m => renderMessage(m)); updatePinnedBar();
    } else if (data.type === 'typing') {
      if (data.from && data.from !== state.user.username && !state.currentPeer?.is_channel) showTypingIndicator();
    } else if (data.type === 'read') {
      if (data.by && data.by !== state.user.username && !state.currentPeer?.is_channel) {
        const ts = data.ts || Math.floor(Date.now() / 1000);
        let updated = false;
        state.messages.forEach(m => { if (m.author === state.user.username && !m.read && m.ts <= ts) { m.read = true; updated = true; } });
        if (updated) state.messages.filter(m => m.author === state.user.username).forEach(m => renderMessage(m));
      }
    }
  };
}

function showTypingIndicator() {
  if (!state.currentPeer || state.currentPeer.is_channel) return;
  $('#chat-header-status').textContent = 'печатает...';
  if (state.typingTimer) clearTimeout(state.typingTimer);
  state.typingTimer = setTimeout(() => { updateChatHeader(); }, 3000);
}

function connectPersonalWS() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = state.sessionToken || '';
  const url = `${proto}//${window.location.host}/ws/user/${encodeURIComponent(state.user.username)}?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(url); state.personalSocket = ws;
  ws.onmessage = (event) => {
    let msg; try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.type === 'new_message') handleIncomingNotification(msg);
  };
  ws.onclose = (e) => {
    if (e.code === 4001) { forceLogout('Сессия истекла или недействительна. Войдите заново.'); return; }
    if (state.user) setTimeout(() => { if (state.user) connectPersonalWS(); }, 3000);
  };
}

function handleIncomingNotification(msg) {
  const fromUser = msg.from_user; const room = msg.room;
  const currentRoom = state.currentPeer ? roomForPeer(state.currentPeer) : null;
  if (currentRoom === room) return;
  let chatKey = fromUser.is_channel ? 'ch:' + fromUser.channel_id : 'u:' + fromUser.username;
  let chat = state.chats.find(c => c.peer.is_channel ? ('ch:' + c.peer.channel_id === chatKey) : ('u:' + c.peer.username === chatKey));
  if (!chat) { chat = { peer: fromUser, lastMessage: null, unread: 0, pinned: false, muted: false }; state.chats.push(chat); }
  else chat.peer = { ...chat.peer, ...fromUser };
  chat.lastMessage = { author: fromUser.username || ('channel_' + fromUser.channel_id), text: msg.text, ts: msg.ts };
  if (!chat.muted) chat.unread = (chat.unread || 0) + 1;
  saveChatsToLS(); renderChats();
}

async function refreshChatsFromServer() {
  try {
    const [serverChats, freshMe] = await Promise.all([
      api('/api/users/' + encodeURIComponent(state.user.username) + '/chats'),
      api('/api/users/' + encodeURIComponent(state.user.username) + '?viewer=' + encodeURIComponent(state.user.username)).catch(() => null),
    ]);
    if (freshMe) { state.user = freshMe; state.wallpaper = freshMe.wallpaper || null; }
    const merged = serverChats.map(sc => {
      let local = sc.peer.is_channel ? state.chats.find(c => c.peer.channel_id === sc.peer.channel_id) : state.chats.find(c => c.peer.username === sc.peer.username);
      return { peer: sc.peer, lastMessage: sc.last_message, unread: sc.unread, pinned: local ? local.pinned : false, muted: local ? local.muted : false };
    });
    state.chats = merged; saveChatsToLS(); renderChats();
    if (state.currentPeer && !state.currentPeer.is_saved) {
      const fresh = merged.find(c => {
        if (state.currentPeer.is_channel) return c.peer.channel_id === state.currentPeer.channel_id;
        return c.peer.username === state.currentPeer.username;
      });
      if (fresh) { state.currentPeer = fresh.peer; updateChatHeader(); updateChatInputState(); }
    }
  } catch {}
}

function sendMessage() {
  if (state.user.is_frozen) return showFrozenInfo();
  const input = $('#message-input'); const text = input.value.trim(); if (!text) return;
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return toast('Соединение не установлено');
  if (state.currentPeer?.is_channel) {
    const isOwner = (state.currentPeer.owner || '').toLowerCase() === state.user.username.toLowerCase();
    const isAdmin = (state.currentPeer.admins || []).map(a => a.toLowerCase()).includes(state.user.username.toLowerCase());
    if (!isOwner && !isAdmin) return toast('Вы не можете публиковать в этом канале');
  }
  if (state.editingMsg) {
    state.socket.send(JSON.stringify({ action: "edit", id: state.editingMsg.id, text: text })); cancelAction();
  } else {
    const tempId = 'temp_' + Date.now();
    state.socket.send(JSON.stringify({ action: "send", text: text, temp_id: tempId, reply_to: state.replyingTo ? { id: state.replyingTo.id, text: state.replyingTo.text } : null }));
    const msg = { id: tempId, author: state.user.username, text: text, ts: Math.floor(Date.now() / 1000), edited: false, pinned: false, reply_to: state.replyingTo, read: false };
    if (state.currentPeer?.is_channel) msg.is_channel_post = true;
    renderMessage(msg); const el = $(`.message[data-id="${tempId}"]`); if (el) el.setAttribute('data-temp-id', tempId);
    let chatEntry = state.chats.find(c => {
      if (!state.currentPeer) return false;
      if (state.currentPeer.is_channel) return c.peer.channel_id === state.currentPeer.channel_id;
      return c.peer.username === state.currentPeer.username;
    });
    if (!chatEntry) { chatEntry = { peer: state.currentPeer, lastMessage: null, unread: 0, pinned: false, muted: false }; state.chats.push(chatEntry); }
    chatEntry.lastMessage = { author: state.user.username, text: text, ts: Math.floor(Date.now() / 1000) };
    saveChatsToLS(); renderChats(); cancelAction();
    updateFirstTimeBanner();
  }
  input.value = ''; input.focus();
}

$('#btn-send').addEventListener('click', sendMessage);
$('#message-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
$('#message-input').addEventListener('input', () => {
  if (state.user.is_frozen) return;
  if (state.currentPeer?.is_channel) return;
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
  const val = $('#message-input').value.trim(); if (!val) return;
  const now = Date.now(); if (now - state.typingLastSent < 2000) return;
  state.typingLastSent = now;
  try { state.socket.send(JSON.stringify({ action: 'typing' })); } catch {}
});
$('#btn-attach').addEventListener('click', () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  toast('Отправка файлов появится позже');
});

$('#chat-header').addEventListener('click', async (e) => {
  if (e.target.closest('#btn-mobile-back')) return;
  if (!state.currentPeer || state.currentPeer.is_saved) return;
  try {
    if (state.currentPeer.is_channel) {
      const ch = await api('/api/channels/' + encodeURIComponent(state.currentPeer.channel_id) + '?viewer=' + encodeURIComponent(state.user.username));
      showChannelView(ch);
      return;
    }
    const u = await api(`/api/users/${encodeURIComponent(state.currentPeer.username)}?viewer=${state.user.username}`);
    showUserView(u);
  } catch (err) { toast(err.message); }
});

async function showUserView(u) {
  state._viewingUser = u; state.currentViewingUser = u;
  const uvChRow = $('#user-view-primary-channel-row');
  if (uvChRow) uvChRow.hidden = true;

  if (u.is_deleted) {
    $('#user-view-avatar').style.backgroundImage = '';
    $('#user-view-avatar').innerHTML = '<svg viewBox="0 0 24 24" width="50%" height="50%" fill="var(--text-secondary)"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
    $('#user-view-name').textContent = 'Удаленный аккаунт';
    $('#user-view-username-row').textContent = '—'; $('#user-view-bio').textContent = '—';
    $('#user-view-status-text').textContent = '';
    $('#user-profile-main-actions').hidden = true; $('#btn-edit-contact').hidden = true;
    $('#user-view-phone-row').hidden = true; $('.user-profile-tags').hidden = true;
    $('#user-view-sub-info').hidden = true; $('#user-view-verified-note').hidden = true;
    const b = document.getElementById('user-view-stars-badge-btn'); if (b) b.style.display = 'none';
    renderAdditionalUsernamesInto('user-view-additional-usernames', [], u.username, state.user.username);
    showScreen('screen-user-view'); applyUserViewBg('default'); return;
  }
  if (isPeerFrozenForMe(u)) {
    renderAvatar($('#user-view-avatar'), u);
    $('#user-view-name').innerHTML = 'Замороженный аккаунт' + frozenIcon();
    $('#user-view-username-row').textContent = '—'; $('#user-view-bio').textContent = '—';
    $('#user-view-status-text').textContent = '❄️ Заморожен'; $('#user-view-status-text').style.color = 'var(--accent)';
    $('#user-profile-main-actions').hidden = true; $('#btn-edit-contact').hidden = true;
    $('#user-view-phone-row').hidden = true; $('.user-profile-tags').hidden = true;
    $('#user-view-sub-info').hidden = true; $('#user-view-verified-note').hidden = true;
    const b = document.getElementById('user-view-stars-badge-btn'); if (b) b.style.display = 'none';
    renderAdditionalUsernamesInto('user-view-additional-usernames', [], u.username, state.user.username);
    showScreen('screen-user-view'); applyUserViewBg('default'); if (typeof bindProfileTagButtons === 'function') bindProfileTagButtons(); return;
  }
  if (u.is_blocked_by_target) {
    const b = document.getElementById('user-view-stars-badge-btn'); if (b) b.style.display = 'none';
    $('#user-view-avatar').style.backgroundImage = ''; $('#user-view-avatar').textContent = '';
    $('#user-view-name').textContent = '— —'; $('#user-view-username-row').textContent = '—';
    $('#user-view-bio').textContent = '—'; $('#user-view-status-text').textContent = 'Был(а) давно';
    $('#user-profile-main-actions').hidden = true; $('#btn-edit-contact').hidden = true;
    $('#user-view-phone-row').hidden = true; $('.user-profile-tags').hidden = true;
    $('#user-view-sub-info').hidden = true; $('#user-view-verified-note').hidden = true;
    renderAdditionalUsernamesInto('user-view-additional-usernames', [], u.username, state.user.username);
  } else {
    renderAvatar($('#user-view-avatar'), u);
    let nameHtml = displayName(u);
    if (u.is_verified) nameHtml += verifyBadgeSvg(22);
    $('#user-view-name').innerHTML = nameHtml;
    $('#user-view-username-row').textContent = '@' + u.username;
    $('#user-view-bio').textContent = u.bio || '—';
    $('#user-view-verified-note').hidden = !u.is_verified;
    renderAdditionalUsernamesInto('user-view-additional-usernames', u.additional_usernames || [], u.username, state.user.username);
    if (u.is_bot) {
      const b = document.getElementById('user-view-stars-badge-btn'); if (b) b.style.display = 'none';
      $('#user-view-status-text').textContent = 'БОТ'; $('#user-view-status-text').style.color = 'var(--accent)';
      $('#user-profile-main-actions').hidden = true; $('#btn-edit-contact').hidden = true; $('.user-profile-tags').hidden = true;
      $('#user-view-phone-row').hidden = false; $('#user-view-phone').textContent = u.phone || '—';
    } else {
      const nb = document.getElementById('user-view-stars-badge-btn'); const nc = document.getElementById('user-view-stars-badge-count');
      if (nb) nb.style.display = ''; if (nc) nc.textContent = u.stars || 0;
      $('#user-view-status-text').textContent = formatStatus(u); $('#user-view-status-text').style.color = 'var(--text-secondary)';
      $('#user-profile-main-actions').hidden = false; $('.user-profile-tags').hidden = false;
      $('#user-view-phone-row').hidden = (u.phone === 'Скрыт' || !u.phone); if (u.phone !== 'Скрыт') $('#user-view-phone').textContent = u.phone;
      const isContact = state.user.contacts && state.user.contacts[u.username];
      const isBlocked = state.user.blocked && state.user.blocked.includes(u.username);
      if (isContact) { $('#btn-edit-contact').hidden = false; $('#btn-add-contact').hidden = true; }
      else { $('#btn-edit-contact').hidden = true; $('#btn-add-contact').hidden = false; }
      const blockBtn = $('#btn-block-user');
      if (isBlocked) { blockBtn.textContent = 'Разблокировать'; blockBtn.classList.remove('danger-text'); blockBtn.style.color = 'var(--accent)'; }
      else { blockBtn.textContent = 'Заблокировать'; blockBtn.classList.add('danger-text'); blockBtn.style.color = ''; }
    }
    renderSubscriptionInfo('user-view', u);
  }
  showScreen('screen-user-view');
  if (u.profile_bg_custom) applyCustomProfileBg(u.profile_bg_custom);
  else applyUserViewBg(u.profile_bg || 'default');
  if (typeof bindProfileTagButtons === 'function') bindProfileTagButtons();

  if (!u.is_deleted && !isPeerFrozenForMe(u) && !u.is_blocked_by_target && !u.is_bot && u.primary_channel_id) {
    try {
      const ch = await api('/api/channels/' + encodeURIComponent(u.primary_channel_id) + '?viewer=' + encodeURIComponent(state.user.username));
      if (!state.currentViewingUser || state.currentViewingUser.username !== u.username) return;
      const av = $('#user-view-primary-channel-avatar');
      if (ch.avatar) { av.style.backgroundImage = `url(${ch.avatar})`; av.textContent = ''; av.innerHTML = ''; }
      else { av.style.backgroundImage = ''; av.innerHTML = '<svg viewBox="0 0 24 24" width="60%" height="60%" fill="#fff"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>'; }
      $('#user-view-primary-channel-name').textContent = ch.name || ch.username;
      $('#user-view-primary-channel-subs').textContent = `${ch.subscribers_count || 0} ${pluralSubs(ch.subscribers_count || 0)}`;
      uvChRow.hidden = false;
      $('#user-view-primary-channel').onclick = () => { showScreen('screen-main'); openChat(ch); };
    } catch {}

  }

  const uvGiftsPanel = document.getElementById('user-view-tab-gifts');
  if (uvGiftsPanel) { uvGiftsPanel.dataset.loaded = '0'; uvGiftsPanel.dataset.owner = ''; }
  if (typeof setUserViewTab === 'function') setUserViewTab('gifts');
  if (typeof loadUserViewGiftsPanel === 'function') loadUserViewGiftsPanel();
    // Перенос блока кнопок ниже описания
  const actionsEl = document.getElementById('user-profile-main-actions');
  const bioEl = document.getElementById('user-view-bio');
  if (actionsEl && bioEl && bioEl.parentNode && actionsEl.previousElementSibling !== bioEl) {
    bioEl.parentNode.insertBefore(actionsEl, bioEl.nextSibling);
  }
}
$('#user-view-back').addEventListener('click', () => showScreen('screen-main'));
// ===== КАНАЛЫ =====
function showChannelView(ch) {
  state.channelViewing = ch;
  renderAvatar($('#channel-view-avatar'), ch);
  let nameHtml = ch.name || ch.username;
  if (ch.is_verified) nameHtml += verifyBadgeSvg(22);
  $('#channel-view-name').innerHTML = nameHtml;
  $('#channel-view-username').textContent = '@' + ch.username;
  $('#channel-view-subscribers').textContent = `${ch.subscribers_count || 0} ${pluralSubs(ch.subscribers_count || 0)}`;
  $('#channel-view-bio').textContent = ch.description || '—';

  const isOwner = ch.is_owner_for_viewer || (ch.owner || '').toLowerCase() === state.user.username.toLowerCase();
  const isAdmin = ch.is_admin_for_viewer || (ch.admins || []).map(a => a.toLowerCase()).includes(state.user.username.toLowerCase());
  const isSub = ch.is_subscribed_for_viewer;

  $('#btn-edit-channel').hidden = !isOwner;
  const btnSub = $('#btn-channel-action');
  const btnAddSub = $('#btn-channel-add-subscriber');
  const btnInvite = $('#btn-channel-invite');
  const btnLeave = $('#btn-channel-leave');
  btnSub.style.display = 'none'; btnAddSub.style.display = 'none'; btnInvite.style.display = 'none'; btnLeave.style.display = 'none';

  if (isOwner || isAdmin) { btnAddSub.style.display = ''; btnInvite.style.display = ''; }
  else if (isSub) { btnLeave.style.display = ''; btnInvite.style.display = ''; }
  else { btnSub.style.display = ''; btnInvite.style.display = ''; }

  showScreen('screen-channel-view');
}
$('#channel-view-back').addEventListener('click', () => showScreen('screen-main'));

$('#btn-edit-channel').addEventListener('click', () => {
  if (!state.channelViewing) return;
  state.channelEditing = state.channelViewing;
  renderAvatar($('#edit-channel-avatar'), state.channelViewing);
  $('#edit-channel-name').value = state.channelViewing.name || '';
  $('#edit-channel-desc').value = state.channelViewing.description || '';
  $('#edit-channel-access-val').textContent = state.channelViewing.is_public ? 'Публичный' : 'Частный';
  $('#edit-channel-subs-count').textContent = state.channelViewing.subscribers_count || 0;
  showScreen('screen-edit-channel');
});
$('#edit-channel-cancel').addEventListener('click', () => showScreen('screen-channel-view'));

$('#btn-edit-channel-avatar').addEventListener('click', () => $('#input-edit-channel-avatar').click());
$('#input-edit-channel-avatar').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const dataUrl = await resizeImage(file, 256);
    state.channelEditing.avatar = dataUrl;
    renderAvatar($('#edit-channel-avatar'), { ...state.channelEditing, avatar: dataUrl });
  } catch { toast('Не удалось обработать изображение'); }
});

$('#edit-channel-save').addEventListener('click', async () => {
  const ch = state.channelEditing;
  if (!ch) return;
  const name = $('#edit-channel-name').value.trim();
  const desc = $('#edit-channel-desc').value.trim();
  if (!name) return toast('Введите название');
  try {
    const updated = await api('/api/channels/' + encodeURIComponent(ch.channel_id) + '/update', {
      method: 'POST',
      body: JSON.stringify({ channel_id: ch.channel_id, requester: state.user.username, name, description: desc, avatar: ch.avatar })
    });
    state.channelEditing = updated; state.channelViewing = updated;
    if (state.currentPeer && state.currentPeer.is_channel && state.currentPeer.channel_id === ch.channel_id) {
      state.currentPeer = updated; updateChatHeader();
    }
    toast('Канал сохранён'); showChannelView(updated);
  } catch (err) { toast(err.message); }
});

$('#btn-edit-channel-access').addEventListener('click', () => {
  const ch = state.channelEditing; if (!ch) return;
  state.channelAccessType = ch.is_public ? 'public' : 'private';
  updateChannelAccessUI(ch);
  $('#modal-channel-access').hidden = false;
});
function updateChannelAccessUI(ch) {
  $$('.ch-access-check').forEach(el => { el.hidden = (el.dataset.type !== state.channelAccessType); });
  const isPublic = state.channelAccessType === 'public';
  $('#ch-access-username-block').hidden = !isPublic;
  $('#ch-access-private-note').hidden = isPublic;
  if (isPublic) $('#ch-access-username').value = (ch && ch.username) || '';
}
$('#ch-access-public').addEventListener('click', () => { state.channelAccessType = 'public'; updateChannelAccessUI(state.channelEditing); });
$('#ch-access-private').addEventListener('click', () => { state.channelAccessType = 'private'; updateChannelAccessUI(state.channelEditing); });
$('#btn-close-channel-access').addEventListener('click', () => $('#modal-channel-access').hidden = true);
$('#btn-save-channel-access').addEventListener('click', async () => {
  const ch = state.channelEditing; if (!ch) return;
  const isPublic = state.channelAccessType === 'public';
  const username = isPublic ? $('#ch-access-username').value.trim().toLowerCase().replace(/^@/, '') : null;
  if (isPublic && !/^[a-z0-9_]{4,32}$/.test(username)) return toast('Некорректный username');
  try {
    const updated = await api('/api/channels/' + encodeURIComponent(ch.channel_id) + '/access', {
      method: 'POST',
      body: JSON.stringify({ channel_id: ch.channel_id, requester: state.user.username, is_public: isPublic, username })
    });
    state.channelEditing = updated; state.channelViewing = updated;
    $('#edit-channel-access-val').textContent = updated.is_public ? 'Публичный' : 'Частный';
    if (state.currentPeer && state.currentPeer.is_channel && state.currentPeer.channel_id === ch.channel_id) {
      state.currentPeer = updated; updateChatHeader();
    }
    $('#modal-channel-access').hidden = true;
    toast('Доступность обновлена');
  } catch (err) { toast(err.message); }
});

$('#btn-edit-channel-subs').addEventListener('click', async () => {
  const ch = state.channelEditing; if (!ch) return;
  const list = $('#channel-subscribers-list');
  list.innerHTML = '<div class="ch-search-status">Загрузка...</div>';
  $('#modal-channel-subscribers').hidden = false;
  try {
    const subs = await api('/api/channels/' + encodeURIComponent(ch.channel_id) + '/subscribers?viewer=' + encodeURIComponent(state.user.username));
    list.innerHTML = '';
    if (subs.length === 0) { list.innerHTML = '<div class="ch-search-status">Нет подписчиков</div>'; return; }
    subs.forEach(u => {
      const row = document.createElement('div'); row.className = 'subscriber-row';
      const av = document.createElement('div'); av.className = 'subscriber-avatar'; renderAvatar(av, u);
      const info = document.createElement('div'); info.className = 'subscriber-info';
      const nameEl = document.createElement('div'); nameEl.className = 'subscriber-name';
      nameEl.textContent = `${u.firstname || ''} ${u.lastname || ''}`.trim() || u.username;
      if (u.is_owner_of_channel) {
        const badge = document.createElement('span'); badge.className = 'subscriber-owner-badge'; badge.textContent = 'ВЛАДЕЛЕЦ';
        nameEl.appendChild(badge);
      }
      const unameEl = document.createElement('div'); unameEl.className = 'subscriber-username'; unameEl.textContent = '@' + u.username;
      info.appendChild(nameEl); info.appendChild(unameEl);
      row.appendChild(av); row.appendChild(info);
      list.appendChild(row);
    });
  } catch (err) { list.innerHTML = `<div class="ch-search-status">${err.message}</div>`; }
});
$('#btn-close-channel-subscribers').addEventListener('click', () => $('#modal-channel-subscribers').hidden = true);

$('#btn-channel-add-subscriber').addEventListener('click', async () => {
  const ch = state.channelViewing; if (!ch) return;
  $('#ch-add-sub-search').value = '';
  $('#modal-channel-add-subscriber').hidden = false;
  await renderAddSubList(ch, '');
});
$('#btn-close-channel-add-subscriber').addEventListener('click', () => $('#modal-channel-add-subscriber').hidden = true);

let addSubTimer = null;
$('#ch-add-sub-search').addEventListener('input', (e) => {
  const q = e.target.value.trim(); clearTimeout(addSubTimer);
  addSubTimer = setTimeout(() => renderAddSubList(state.channelViewing, q), 250);
});

async function renderAddSubList(ch, q) {
  if (!ch) return;
  const list = $('#ch-add-sub-list');
  list.innerHTML = '<div class="ch-search-status">Загрузка...</div>';
  try {
    let candidates = [];
    if (!q) {
      const map = new Map();
      (state.chats || []).forEach(c => {
        if (!c.peer.is_channel && !c.peer.is_saved && !c.peer.is_deleted && c.peer.username && c.peer.username !== state.user.username) map.set(c.peer.username, c.peer);
      });
      try {
        const contacts = await api('/api/users/' + state.user.username + '/contacts');
        contacts.forEach(c => { if (!map.has(c.username) && c.username !== state.user.username) map.set(c.username, c); });
      } catch {}
      candidates = Array.from(map.values());
      if (candidates.length === 0) { list.innerHTML = '<div class="ch-search-status">Нет чатов или контактов. Используйте поиск.</div>'; return; }
    } else {
      const res = await api('/api/users/search?q=' + encodeURIComponent(q) + '&viewer=' + state.user.username);
      candidates = res.filter(u => !u.is_channel && !u.is_deleted && u.username !== state.user.username);
    }
    list.innerHTML = '';
    const subscriberSet = new Set((ch.subscribers || []).map(s => s.toLowerCase()));
    if (subscriberSet.size === 0) subscriberSet.add((ch.owner || '').toLowerCase());
    const titleDiv = document.createElement('div'); titleDiv.className = 'ch-section-title';
    titleDiv.textContent = q ? 'Результаты поиска' : 'Из чатов и контактов';
    list.appendChild(titleDiv);
    if (candidates.length === 0) {
      const emp = document.createElement('div'); emp.className = 'ch-search-status'; emp.textContent = 'Никого не найдено';
      list.appendChild(emp); return;
    }
    candidates.forEach(u => {
      const already = subscriberSet.has(u.username.toLowerCase());
      const row = document.createElement('div');
      row.className = 'add-sub-row' + (already ? ' already' : '');
      const av = document.createElement('div'); av.className = 'subscriber-avatar'; renderAvatar(av, u);
      const info = document.createElement('div'); info.className = 'add-sub-row-info';
      const nameEl = document.createElement('div'); nameEl.className = 'subscriber-name';
      nameEl.textContent = `${u.firstname || ''} ${u.lastname || ''}`.trim() || u.username;
      const unameEl = document.createElement('div'); unameEl.className = 'subscriber-username'; unameEl.textContent = '@' + u.username;
      info.appendChild(nameEl); info.appendChild(unameEl);
      row.appendChild(av); row.appendChild(info);
      if (already) {
        const lbl = document.createElement('span'); lbl.className = 'add-sub-row-already-label'; lbl.textContent = 'уже в канале';
        row.appendChild(lbl);
      } else {
        const addBtn = document.createElement('button');
        addBtn.className = 'add-sub-row-add-btn'; addBtn.textContent = 'Добавить';
        addBtn.onclick = async (e) => {
          e.stopPropagation();
          try {
            const resp = await api('/api/channels/' + encodeURIComponent(ch.channel_id) + '/add_subscriber', {
              method: 'POST',
              body: JSON.stringify({ channel_id: ch.channel_id, requester: state.user.username, target_username: u.username })
            });
            if (resp.channel) {
              state.channelViewing = resp.channel;
              if (state.currentPeer && state.currentPeer.is_channel && state.currentPeer.channel_id === ch.channel_id) {
                state.currentPeer = resp.channel; updateChatHeader(); updateChatInputState();
              }
              $('#edit-channel-subs-count').textContent = resp.channel.subscribers_count || 0;
            }
            toast(`@${u.username} добавлен в канал`);
            await renderAddSubList(state.channelViewing, $('#ch-add-sub-search').value.trim());
          } catch (err) { toast(err.message); }
        };
        row.appendChild(addBtn);
      }
      list.appendChild(row);
    });
  } catch (err) { list.innerHTML = `<div class="ch-search-status">${err.message}</div>`; }
}

$('#btn-subscribe-in-chat').addEventListener('click', async () => {
  const ch = state.currentPeer; if (!ch || !ch.is_channel) return;
  try {
    const res = await api('/api/channels/' + encodeURIComponent(ch.channel_id) + '/subscribe', {
      method: 'POST', body: JSON.stringify({ channel_id: ch.channel_id, username: state.user.username })
    });
    if (res.channel) { state.currentPeer = res.channel; updateChatHeader(); updateChatInputState(); }
    await refreshChatsFromServer(); toast('Вы подписались на канал');
  } catch (err) { toast(err.message); }
});

$('#btn-channel-action').addEventListener('click', async () => {
  const ch = state.channelViewing; if (!ch) return;
  try {
    const res = await api('/api/channels/' + encodeURIComponent(ch.channel_id) + '/subscribe', {
      method: 'POST', body: JSON.stringify({ channel_id: ch.channel_id, username: state.user.username })
    });
    if (res.channel) { state.channelViewing = res.channel; showChannelView(res.channel); }
    await refreshChatsFromServer(); toast('Вы подписались на канал');
  } catch (err) { toast(err.message); }
});

$('#btn-channel-leave').addEventListener('click', () => {
  const ch = state.channelViewing; if (!ch) return;
  showConfirm('Покинуть канал?', 'Вы больше не будете получать посты этого канала.', async () => {
    try {
      await api('/api/channels/' + encodeURIComponent(ch.channel_id) + '/unsubscribe', {
        method: 'POST', body: JSON.stringify({ channel_id: ch.channel_id, username: state.user.username })
      });
      state.chats = state.chats.filter(c => !(c.peer.is_channel && c.peer.channel_id === ch.channel_id));
      saveChatsToLS(); renderChats();
      toast('Вы покинули канал');
      showScreen('screen-main');
    } catch (err) { toast(err.message); }
  });
});

$('#btn-channel-invite').addEventListener('click', () => {
  const ch = state.channelViewing; if (!ch) return;
  if (ch.is_public) {
    navigator.clipboard.writeText('@' + ch.username).then(() => toast('@' + ch.username + ' скопирован')).catch(() => toast('Ошибка копирования'));
  } else toast('Частный канал — добавьте подписчиков через «Добавить подписчика»');
});

$('#btn-delete-channel').addEventListener('click', () => {
  const ch = state.channelEditing; if (!ch) return;
  showConfirm('Удалить канал?', 'Канал и все посты будут удалены безвозвратно.', async () => {
    try {
      await api('/api/channels/' + encodeURIComponent(ch.channel_id) + '/delete', {
        method: 'POST', body: JSON.stringify({ channel_id: ch.channel_id, requester: state.user.username })
      });
      state.chats = state.chats.filter(c => !(c.peer.is_channel && c.peer.channel_id === ch.channel_id));
      saveChatsToLS(); renderChats();
      state.channelEditing = null; state.channelViewing = null;
      toast('Канал удалён'); showScreen('screen-main');
    } catch (err) { toast(err.message); }
  });
});

$('#btn-create-menu').addEventListener('click', () => $('#modal-create-menu').hidden = false);
$('#btn-close-create-menu').addEventListener('click', () => $('#modal-create-menu').hidden = true);
$('#btn-menu-create-channel').addEventListener('click', () => {
  $('#modal-create-menu').hidden = true;
  state.channelTemp = { name: '', description: '', avatar: null, is_public: true, username: '' };
  $('#create-ch-avatar-preview').style.backgroundImage = '';
  $('#create-ch-avatar-preview').textContent = '';
  $('#create-ch-name').value = ''; $('#create-ch-desc').value = '';
  showScreen('screen-create-channel-1');
});
$('#create-ch-1-back').addEventListener('click', () => showScreen('screen-main'));
$('#create-ch-2-back').addEventListener('click', () => showScreen('screen-create-channel-1'));
$('#btn-create-ch-avatar').addEventListener('click', () => $('#input-create-ch-avatar').click());
$('#input-create-ch-avatar').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const dataUrl = await resizeImage(file, 256);
    state.channelTemp.avatar = dataUrl;
    const prev = $('#create-ch-avatar-preview');
    prev.style.backgroundImage = `url(${dataUrl})`; prev.textContent = '';
  } catch { toast('Не удалось обработать изображение'); }
});
$('#btn-create-ch-step1').addEventListener('click', () => {
  const name = $('#create-ch-name').value.trim(); const desc = $('#create-ch-desc').value.trim();
  if (!name) return toast('Введите название канала');
  state.channelTemp.name = name; state.channelTemp.description = desc; state.channelTemp.is_public = true;
  $$('.create-type-check').forEach(el => { el.hidden = (el.dataset.type !== 'public'); });
  $$('.create-type-row').forEach(el => { el.classList.toggle('active', el.dataset.type === 'public'); });
  $('#create-ch-username-block').hidden = false;
  $('#create-ch-private-block').hidden = true;
  $('#create-ch-username').value = '';
  showScreen('screen-create-channel-2');
});
$$('.create-type-row').forEach(row => {
  row.addEventListener('click', () => {
    const type = row.dataset.type;
    state.channelTemp.is_public = (type === 'public');
    $$('.create-type-check').forEach(el => { el.hidden = (el.dataset.type !== type); });
    $$('.create-type-row').forEach(el => { el.classList.toggle('active', el.dataset.type === type); });
    $('#create-ch-username-block').hidden = (type !== 'public');
    $('#create-ch-private-block').hidden = (type !== 'private');
  });
});
$('#btn-create-ch-finish').addEventListener('click', async () => {
  const payload = {
    owner_username: state.user.username,
    name: state.channelTemp.name,
    description: state.channelTemp.description,
    avatar: state.channelTemp.avatar,
    is_public: state.channelTemp.is_public,
  };
  if (state.channelTemp.is_public) {
    const uname = $('#create-ch-username').value.trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{4,32}$/.test(uname)) return toast('Некорректный @username');
    payload.username = uname;
  }
  try {
    const ch = await api('/api/channels/create', { method: 'POST', body: JSON.stringify(payload) });
    toast('Канал создан');
    await refreshChatsFromServer();
    showChannelView(ch);
  } catch (err) { toast(err.message); }
});

// --- КОНТАКТЫ ---
$('#btn-contacts-list').addEventListener('click', async () => {
  showScreen('screen-contacts'); const list = $('#contacts-list');
  list.innerHTML = '<div style="text-align:center;padding:20px;">Загрузка...</div>';
  try {
    const contacts = await api('/api/users/' + state.user.username + '/contacts');
    list.innerHTML = '';
    if (contacts.length === 0) { list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);">Нет контактов</div>'; return; }
    contacts.forEach(c => {
      const el = document.createElement('div'); el.className = 'contact-item';
      const av = document.createElement('div'); av.className = 'contact-avatar'; renderAvatar(av, c); el.appendChild(av);
      const info = document.createElement('div'); info.className = 'contact-info';
      info.innerHTML = `<div class="contact-name">${displayName(c)}</div>`; el.appendChild(info);
      el.onclick = async () => {
        try { const u = await api(`/api/users/${encodeURIComponent(c.username)}?viewer=${state.user.username}`); state.currentPeer = u; showUserView(u); }
        catch (err) { toast(err.message); }
      };
      list.appendChild(el);
    });
  } catch (err) { toast(err.message); }
});
$('#contacts-back').addEventListener('click', () => showScreen('screen-main'));

const modalContact = $('#modal-contact');
$('#btn-add-contact').addEventListener('click', () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  $('#modal-contact-title').textContent = 'Добавить контакт';
  $('#contact-firstname').value = state.currentViewingUser.firstname; $('#contact-lastname').value = state.currentViewingUser.lastname;
  $('#btn-delete-contact').hidden = true; modalContact.hidden = false;
});
$('#btn-edit-contact').addEventListener('click', () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  const contact = state.user.contacts[state.currentViewingUser.username];
  $('#modal-contact-title').textContent = 'Изменить контакт';
  $('#contact-firstname').value = contact.firstname; $('#contact-lastname').value = contact.lastname;
  $('#btn-delete-contact').hidden = false; modalContact.hidden = false;
});
$('#btn-close-contact').addEventListener('click', () => modalContact.hidden = true);

$('#btn-save-contact').addEventListener('click', async () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  const fn = $('#contact-firstname').value.trim(); const ln = $('#contact-lastname').value.trim();
  if (!fn) return toast('Введите имя');
  try {
    await api('/api/users/contacts', { method: 'POST', body: JSON.stringify({ username: state.user.username, peer: state.currentViewingUser.username, firstname: fn, lastname: ln }) });
    if (!state.user.contacts) state.user.contacts = {};
    state.user.contacts[state.currentViewingUser.username] = { firstname: fn, lastname: ln };
    modalContact.hidden = true; toast('Контакт сохранен');
    showUserView(state.currentViewingUser); renderChats();
    if (state.currentPeer && state.currentPeer.username === state.currentViewingUser.username) {
      updateChatHeader();
      updateFirstTimeBanner();
    }
  } catch (err) { toast(err.message); }
});
$('#btn-delete-contact').addEventListener('click', async () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  try {
    await api('/api/users/contacts', { method: 'POST', body: JSON.stringify({ username: state.user.username, peer: state.currentViewingUser.username, firstname: '', lastname: '' }) });
    if (state.user.contacts) delete state.user.contacts[state.currentViewingUser.username];
    modalContact.hidden = true; toast('Контакт удален');
    showUserView(state.currentViewingUser); renderChats();
    if (state.currentPeer && state.currentPeer.username === state.currentViewingUser.username) updateChatHeader();
  } catch (err) { toast(err.message); }
});

// --- БЛОКИРОВКА ---
const modalBlock = $('#modal-block');
$('#btn-block-user').addEventListener('click', () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  const isBlocked = state.user.blocked && state.user.blocked.includes(state.currentViewingUser.username);
  if (isBlocked) unblockUser(); else modalBlock.hidden = false;
});
$('#btn-cancel-block').addEventListener('click', () => modalBlock.hidden = true);
$('#btn-confirm-block').addEventListener('click', async () => {
  try {
    const targetName = state.currentViewingUser.username;
    await api('/api/users/block', { method: 'POST', body: JSON.stringify({ username: state.user.username, peer: targetName, block: true }) });
    if (!state.user.blocked) state.user.blocked = [];
    state.user.blocked.push(targetName);
    modalBlock.hidden = true; toast('Пользователь заблокирован');
    if (state.currentViewingUser && state.currentViewingUser.username === targetName) showUserView(state.currentViewingUser);
    if (state.currentPeer && state.currentPeer.username === targetName) {
      $('#chat-input-area').hidden = true;
      $('#chat-blocked-overlay').hidden = false;
      updateFirstTimeBanner();
    }
  } catch (err) { toast(err.message); }
});
async function unblockUser() {
  try {
    await api('/api/users/block', { method: 'POST', body: JSON.stringify({ username: state.user.username, peer: state.currentViewingUser.username, block: false }) });
    if (state.user.blocked) state.user.blocked = state.user.blocked.filter(u => u !== state.currentViewingUser.username);
    toast('Пользователь разблокирован'); showUserView(state.currentViewingUser);
    if (state.currentPeer && state.currentPeer.username === state.currentViewingUser.username) {
      $('#chat-input-area').hidden = false;
      $('#chat-blocked-overlay').hidden = true;
      updateFirstTimeBanner();
    }
  } catch (err) { toast(err.message); }
}
$('#btn-chat-unblock').addEventListener('click', () => {
  if (state.user && state.user.is_frozen) { showFrozenInfo(); return; }
  if (state.currentPeer) { state.currentViewingUser = state.currentPeer; unblockUser(); }
});

// --- УСТРОЙСТВА / ПАПКИ / ЗВЁЗДЫ / ПОДАРКИ ---
$('#btn-devices').addEventListener('click', () => showScreen('screen-devices'));
$('#devices-back').addEventListener('click', () => showScreen('screen-main'));
$('#btn-end-sessions-devices')?.addEventListener('click', () => toast('Другие сеансы завершены'));
$('#btn-folders').addEventListener('click', () => { renderFolders(); showScreen('screen-folders'); });
$('#folders-back').addEventListener('click', () => showScreen('screen-main'));
function renderFolders() {
  state.folders = JSON.parse(localStorage.getItem('delta_folders_' + state.user.username) || '[]');
  const list = $('#folders-list'); list.innerHTML = '';
  if (state.folders.length === 0) { list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);">Нет папок. Нажмите + чтобы создать.</div>'; }
  else state.folders.forEach(f => {
    const el = document.createElement('div'); el.className = 'contact-item';
    el.innerHTML = `<div class="contact-avatar" style="background:#32ADE6;"><svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg></div><div class="contact-info"><div class="contact-name">${f.name}</div><div style="font-size:13px; color:var(--text-secondary);">${f.chats.length} чатов</div></div>`;
    list.appendChild(el);
  });
}
$('#btn-create-folder').addEventListener('click', () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  $('#folder-name-input').value = ''; const list = $('#folder-chat-list'); list.innerHTML = '';
  if (state.chats.length === 0) list.innerHTML = '<div style="font-size:14px;color:var(--text-secondary);">Нет чатов</div>';
  else state.chats.forEach(c => {
    const label = document.createElement('label'); label.style.display = 'flex'; label.style.alignItems = 'center'; label.style.gap = '8px'; label.style.cursor = 'pointer'; label.style.fontSize = '14px';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = c.peer.username || c.peer.channel_id; label.appendChild(cb);
    const name = document.createElement('span'); name.textContent = displayName(c.peer); label.appendChild(name);
    list.appendChild(label);
  });
  $('#modal-folder').hidden = false;
});
$('#btn-close-folder').addEventListener('click', () => $('#modal-folder').hidden = true);
$('#btn-save-folder').addEventListener('click', () => {
  const name = $('#folder-name-input').value.trim(); if (!name) return toast('Введите название');
  const selected = Array.from($('#folder-chat-list').querySelectorAll('input:checked')).map(cb => cb.value);
  state.folders.push({ name, chats: selected });
  localStorage.setItem('delta_folders_' + state.user.username, JSON.stringify(state.folders));
  $('#modal-folder').hidden = true; renderFolders(); toast('Папка создана');
});
$('#btn-notifications').addEventListener('click', () => toast('В разработке'));

$('#btn-my-stars').addEventListener('click', () => { $('#my-stars-balance').textContent = state.user.stars || 0; showScreen('screen-my-stars'); });
$('#my-stars-back').addEventListener('click', () => showScreen('screen-main'));
$('#btn-buy-stars').addEventListener('click', () => { if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен'); showScreen('screen-buy-stars'); });
$('#buy-stars-back').addEventListener('click', () => showScreen('screen-my-stars'));
$('#btn-confirm-buy-stars').addEventListener('click', () => toast('Покупка звёзд в разработке'));

$('#btn-send-gift').addEventListener('click', () => { if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен'); renderGiftRecipients(); showScreen('screen-send-gift'); });
$('#send-gift-back').addEventListener('click', () => showScreen('screen-main'));
$('#btn-go-to-gifts').addEventListener('click', () => { if (!state.giftSelected || state.giftSelected.size === 0) return toast('Выберите хотя бы одного получателя'); renderGiftGrid(); showScreen('screen-select-gift'); });
$('#select-gift-back').addEventListener('click', () => showScreen('screen-send-gift'));
$('#btn-close-gift-details').addEventListener('click', () => $('#modal-gift-details').hidden = true);
$('#btn-close-gift-view').addEventListener('click', () => $('#modal-gift-view').hidden = true);

async function renderGiftRecipients() {
  const list = $('#gift-recipients-list');
  list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);">Загрузка...</div>';
  const map = new Map();
  (state.chats || []).forEach(c => {
    if (c.peer && !c.peer.is_channel && c.peer.username && !c.peer.is_saved && !c.peer.is_deleted && !isPeerFrozenForMe(c.peer) && c.peer.username !== state.user.username) map.set(c.peer.username, c.peer);
  });
  try {
    const contacts = await api('/api/users/' + state.user.username + '/contacts');
    contacts.forEach(c => { if (!map.has(c.username) && c.username !== state.user.username && !c.is_deleted && !isPeerFrozenForMe(c)) map.set(c.username, c); });
  } catch {}
  state.giftRecipients = Array.from(map.values());
  state.giftSelected = new Set();
  list.innerHTML = '';
  if (state.giftRecipients.length === 0) { list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);">Нет доступных получателей.</div>'; return; }
  state.giftRecipients.forEach(u => {
    const el = document.createElement('div'); el.className = 'recipient-item'; el.dataset.username = u.username;
    el.innerHTML = `<div class="recipient-checkbox"><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div><div class="recipient-avatar"></div><div class="recipient-name"></div>`;
    renderAvatar(el.querySelector('.recipient-avatar'), u);
    el.querySelector('.recipient-name').textContent = displayName(u);
    el.onclick = () => {
      if (state.giftSelected.has(u.username)) { state.giftSelected.delete(u.username); el.classList.remove('selected'); }
      else { state.giftSelected.add(u.username); el.classList.add('selected'); }
    };
    list.appendChild(el);
  });
}
function renderGiftGrid() {
  const grid = $('#gift-grid'); grid.innerHTML = '';
  Object.entries(state.GIFTS).forEach(([id, g]) => {
    const card = document.createElement('div'); card.className = 'sheet-gift-card';
    card.innerHTML = `<div class="sheet-gift-svg">${getGiftSvg(g.icon)}</div><div class="sheet-gift-price"><svg viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z"/></svg>${g.price}</div>`;
    card.onclick = () => openGiftDetails(id); grid.appendChild(card);
  });
  $('#gift-screen-balance').textContent = state.user.stars || 0;
}
function openGiftDetails(giftId) {
  const g = state.GIFTS[giftId]; if (!g) return;
  state.selectedGiftId = giftId;
  const count = state.giftSelected.size; const total = g.price * count;
  $('#gift-modal-icon').innerHTML = `<div style="width:80px;height:80px;margin:0 auto;">${getGiftSvg(g.icon)}</div>`;
  $('#gift-modal-title').textContent = g.name;
  $('#gift-modal-price').textContent = `${g.price} ⭐ × ${count} = ${total} ⭐`;
  $('#gift-modal-message').value = ''; $('#gift-modal-anon').checked = false;
  $('#gift-total-price').textContent = `${total} ⭐`;
  $('#modal-gift-details').hidden = false;
}
$('#btn-gift-buy').addEventListener('click', async () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  const giftId = state.selectedGiftId; const g = state.GIFTS[giftId]; if (!g) return;
  const recipients = Array.from(state.giftSelected); if (recipients.length === 0) return toast('Выберите получателей');
  const message = $('#gift-modal-message').value.trim(); const anonymous = $('#gift-modal-anon').checked;
  const total = g.price * recipients.length;
  if ((state.user.stars || 0) < total) return toast(`Недостаточно звезд. Нужно ${total} ⭐, у вас ${state.user.stars || 0}`);
  try {
    const res = await api('/api/users/send_gift', { method: 'POST', body: JSON.stringify({ from_username: state.user.username, to_usernames: recipients, gift_id: giftId, message, anonymous }) });
    state.user.stars = res.balance;
    $('#gift-screen-balance').textContent = state.user.stars;
    $('#my-stars-balance').textContent = state.user.stars;
    $('#modal-gift-details').hidden = true;
    toast(`Отправлено ${res.count} подарк. на ${res.spent} ⭐`);
    state.giftSelected.clear(); $$('.recipient-item').forEach(el => el.classList.remove('selected'));
    showScreen('screen-main');
  } catch (err) { toast(err.message); }
});
function openGiftView(g) {
  $('#gift-view-icon').innerHTML = `<div style="width:80px;height:80px;margin:0 auto;">${getGiftSvg(g.gift_id)}</div>`;
  $('#gift-view-name').textContent = g.name;
  $('#gift-view-price').textContent = `${g.price} ⭐`;
  if (g.anonymous || !g.from) $('#gift-view-from').textContent = '🎭 Аноним';
  else if (g.from.is_deleted) $('#gift-view-from').textContent = 'Удаленный аккаунт';
  else $('#gift-view-from').textContent = displayName(g.from) + ` (@${g.from.username})`;
  $('#gift-view-message').textContent = g.message || '—';
  $('#gift-view-date').textContent = g.ts ? formatDate(g.ts) : '—';
  $('#modal-gift-view').hidden = false;
}

// ===== BOTTOM SHEET / TAGS =====
function bindProfileTagButtons() {
  $$('#screen-my-profile .my-tag').forEach(btn => {
    btn.onclick = () => {
      const tabName = btn.getAttribute('data-tag-tab');
      if (!tabName) return;
      if (tabName === 'gifts') { setMyProfileTab('gifts'); loadMyProfileGiftsPanel(); }
      else if (tabName === 'publications') { setMyProfileTab('publications'); }
    };
  });
  $$('#screen-user-view .my-tag').forEach(btn => {
    btn.onclick = () => {
      const tabName = btn.getAttribute('data-tag-tab');
      if (tabName === 'gifts') { setUserViewTab('gifts'); loadUserViewGiftsPanel(); }
      else if (tabName === 'publications') { setUserViewTab('publications'); }
      else if (tabName === 'media') { openBottomSheet('Медиа'); $('#sheet-body').innerHTML = '<div class="sheet-empty">В разработке</div>'; }
    };
  });
}
function setMyProfileTab(tabName) {
  const viewport = document.getElementById('my-profile-tabs-viewport');
  if (!viewport) return;
  viewport.classList.toggle('show-gifts', tabName === 'gifts');
  viewport.classList.toggle('show-publications', tabName === 'publications');
  $$('#screen-my-profile .my-tag').forEach(b => { b.classList.toggle('active', b.getAttribute('data-tag-tab') === tabName); });
}
function setUserViewTab(tabName) {
  const viewport = document.getElementById('user-view-tabs-viewport');
  if (!viewport) return;
  viewport.classList.toggle('show-gifts', tabName === 'gifts');
  viewport.classList.toggle('show-publications', tabName === 'publications');
  $$('#screen-user-view .my-tag').forEach(b => {
    const t = b.getAttribute('data-tag-tab');
    if (t === 'media') return;
    b.classList.toggle('active', t === tabName);
  });
}
async function renderGiftsInto(container, ownerUsername, viewerUsername) {
  if (!container) return;
  container.innerHTML = '<div class="sheet-empty">Загрузка...</div>';
  try {
    const gifts = await api('/api/users/' + encodeURIComponent(ownerUsername) + '/gifts?viewer=' + encodeURIComponent(viewerUsername));
    container.innerHTML = '';
    if (gifts.length === 0) { container.innerHTML = '<div class="sheet-empty">Подарков пока нет 🎁</div>'; return; }
    const grid = document.createElement('div');
    grid.className = 'sheet-gifts-grid';
    gifts.forEach(g => {
      const card = document.createElement('div');
      card.className = 'sheet-gift-card';
      card.innerHTML = `<div class="sheet-gift-svg">${getGiftSvg(g.gift_id)}</div><div class="sheet-gift-price"><svg viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z"/></svg>${g.price}</div>`;
      card.onclick = () => openGiftView(g);
      grid.appendChild(card);
    });
    container.appendChild(grid);
  } catch (err) { container.innerHTML = `<div class="sheet-empty">${err.message}</div>`; }
}
function loadMyProfileGiftsPanel() {
  const panel = document.getElementById('my-profile-tab-gifts');
  if (!panel) return;
  if (panel.dataset.loaded === '1' && panel.dataset.owner === state.user.username) return;
  panel.dataset.owner = state.user.username;
  panel.dataset.loaded = '0';
  renderGiftsInto(panel, state.user.username, state.user.username).then(() => {
    if (panel.dataset.owner === state.user.username) panel.dataset.loaded = '1';
  });
}
function loadUserViewGiftsPanel() {
  const panel = document.getElementById('user-view-tab-gifts');
  if (!panel) return;
  if (!state.currentViewingUser || state.currentViewingUser.is_deleted) {
    panel.innerHTML = '<div class="sheet-empty">Подарков пока нет 🎁</div>'; return;
  }
  const owner = state.currentViewingUser.username;
  if (panel.dataset.loaded === '1' && panel.dataset.owner === owner) return;
  panel.dataset.owner = owner;
  panel.dataset.loaded = '0';
  renderGiftsInto(panel, owner, state.user.username).then(() => {
    if (panel.dataset.owner === owner) panel.dataset.loaded = '1';
  });
}
const _sheetOverlay = $('#profile-bottom-sheet');
if (_sheetOverlay) {
  const _sheetCloseBtn = $('#sheet-close');
  if (_sheetCloseBtn) _sheetCloseBtn.addEventListener('click', closeBottomSheet);
  _sheetOverlay.addEventListener('click', (e) => { if (e.target === _sheetOverlay) closeBottomSheet(); });
}

// ===== ЯЗЫК / ПРИВАТНОСТЬ =====
$('#btn-language').addEventListener('click', () => { renderLanguages(); showScreen('screen-language'); });
$('#language-back').addEventListener('click', () => showScreen('screen-main'));
$('#btn-privacy').addEventListener('click', () => { showScreen('screen-privacy'); updatePrivacyUI(); });
$('#privacy-back').addEventListener('click', () => showScreen('screen-main'));
$('#btn-active-sites').addEventListener('click', () => toast('В разработке'));
$$('.privacy-toggle').forEach(el => {
  el.addEventListener('click', async () => {
    if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
    const key = el.dataset.key; const currentVal = state.user.privacy[key] || 'everyone';
    const nextIdx = (state.privacyStates.indexOf(currentVal) + 1) % 3; const nextVal = state.privacyStates[nextIdx];
    state.user.privacy[key] = nextVal; el.querySelector('.edit-row-value').textContent = state.privacyLabels[nextVal];
    try { await api('/api/users/privacy', { method: 'POST', body: JSON.stringify({ username: state.user.username, key, value: nextVal }) }); } catch (err) { toast(err.message); }
  });
});
function updatePrivacyUI() {
  $$('.privacy-toggle').forEach(el => {
    const key = el.dataset.key; const val = state.user.privacy[key] || 'everyone';
    el.querySelector('.edit-row-value').textContent = state.privacyLabels[val] || 'Все';
  });
}

// === СМЕНА ПАРОЛЯ ===
$('#btn-change-password')?.addEventListener('click', () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  $('#input-old-password').value = '';
  $('#input-new-password').value = '';
  $('#input-new-password2').value = '';
  $('#input-new-password-cloud').value = '';
  $('#input-new-password-cloud').hidden = !state.user.has_cloud;
  $('#modal-change-password').hidden = false;
});
$('#btn-cancel-change-password')?.addEventListener('click', () => $('#modal-change-password').hidden = true);
$('#btn-confirm-change-password')?.addEventListener('click', async () => {
  const oldP = $('#input-old-password').value;
  const newP = $('#input-new-password').value;
  const newP2 = $('#input-new-password2').value;
  const cloudP = $('#input-new-password-cloud').value;
  if (!oldP || !newP) return toast('Заполните пароли');
  if (newP !== newP2) return toast('Новые пароли не совпадают');
  if (newP.length < 6) return toast('Пароль минимум 6 символов');
  try {
    await api('/api/users/change_password', {
      method: 'POST',
      body: JSON.stringify({
        username: state.user.username,
        old_password: oldP,
        new_password: newP,
        cloud_password: cloudP || null,
        device_info: detectDevice()
      })
    });
    $('#modal-change-password').hidden = true;
    toast('Пароль изменён. Все сессии завершены. Войдите заново.');
    setTimeout(() => forceLogout('Пароль изменён, войдите заново'), 2000);
  } catch (err) { toast(err.message); }
});

$('#btn-end-sessions')?.addEventListener('click', () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  $('#input-end-sessions-password').value = '';
  $('#input-end-sessions-cloud').value = '';
  $('#input-end-sessions-cloud').hidden = !state.user.has_cloud;
  $('#modal-end-sessions').hidden = false;
});
$('#btn-cancel-end-sessions')?.addEventListener('click', () => $('#modal-end-sessions').hidden = true);
$('#btn-confirm-end-sessions')?.addEventListener('click', async () => {
  const pass = $('#input-end-sessions-password').value;
  const cloudP = $('#input-end-sessions-cloud').value;
  if (!pass) return toast('Введите пароль');
  try {
    await api('/api/logout_all', {
      method: 'POST',
      body: JSON.stringify({
        username: state.user.username,
        password: pass,
        cloud_password: cloudP || null
      })
    });
    $('#modal-end-sessions').hidden = true;
    toast('Все другие сессии завершены');
  } catch (err) { toast(err.message); }
});

$('#btn-cloud-pass').addEventListener('click', () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  $('#input-cloud-pass').value = ''; $('#input-cloud-pass2').value = '';
  $('#btn-remove-cloud').style.display = state.user.has_cloud ? 'block' : 'none';
  $('#modal-cloud-setup').hidden = false;
});
$('#btn-cancel-cloud').addEventListener('click', () => $('#modal-cloud-setup').hidden = true);
$('#btn-setup-cloud').addEventListener('click', async () => {
  const p1 = $('#input-cloud-pass').value; const p2 = $('#input-cloud-pass2').value;
  if (!p1 || p1 !== p2) return toast('Пароли не совпадают');
  if (p1.length < 6) return toast('Минимум 6 символов');
  try {
    await api('/api/users/set_password', {
      method: 'POST',
      body: JSON.stringify({ username: state.user.username, type: 'cloud', password: p1, device_info: detectDevice() })
    });
    state.user.has_cloud = true;
    $('#cloud-pass-val').textContent = 'Вкл';
    $('#modal-cloud-setup').hidden = true;
    toast('Облачный пароль установлен');
  } catch (err) { toast(err.message); }
});
$('#btn-remove-cloud').addEventListener('click', async () => {
  try {
    await api('/api/users/set_password', {
      method: 'POST',
      body: JSON.stringify({ username: state.user.username, type: 'cloud', password: null, device_info: detectDevice() })
    });
    state.user.has_cloud = false;
    $('#cloud-pass-val').textContent = 'Нет';
    $('#modal-cloud-setup').hidden = true;
    toast('Облачный пароль удален');
  } catch (err) { toast(err.message); }
});

// ===== DELTA UP =====
$('#btn-delta-up').addEventListener('click', () => { renderDeltaUp(); showScreen('screen-delta-up'); });
$('#delta-up-back').addEventListener('click', () => showScreen('screen-main'));
const upTariffs = { 'up': [{ months: 1, price: 59 }, { months: 3, price: 169 }, { months: 6, price: 359 }], 'up+': [{ months: 1, price: 159 }, { months: 3, price: 459 }, { months: 6, price: 1299 }] };
const upFeatures = { 'up': ['Изменение фона профиля'], 'up+': ['Изменение фона профиля', 'Свой фон профиля', 'Приоритетная поддержка (скоро)'] };
function renderDeltaUp() {
  $$('.up-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.type === state.upTab));
  const featuresList = $('#up-features'); featuresList.innerHTML = '';
  upFeatures[state.upTab].forEach(f => { featuresList.innerHTML += `<div class="up-feature-item"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg><span>${f}</span></div>`; });
  const pricingList = $('#up-pricing'); pricingList.innerHTML = ''; state.selectedTariff = null;
  upTariffs[state.upTab].forEach((t, idx) => {
    const card = document.createElement('div'); card.className = 'up-price-card'; card.style.animationDelay = (idx * 0.05) + 's';
    card.innerHTML = `<div class="up-price-months">${t.months} мес.</div><div class="up-price-val">${t.price} ₽</div>`;
    card.onclick = () => {
      state.selectedTariff = t;
      $$('.up-price-card').forEach(c => c.classList.remove('active')); card.classList.add('active');
      $('#btn-buy-subscription').disabled = false; $('#up-buy-price').textContent = `${t.price} ₽`;
    };
    pricingList.appendChild(card);
  });
  $('#btn-buy-subscription').disabled = true; $('#up-buy-price').textContent = '0 ₽';
  if (state.user.subscription && state.user.subscription.expires_at > Date.now() / 1000) {
    $('#up-status').hidden = false;
    const exp = formatDate(state.user.subscription.expires_at);
    const name = state.user.subscription.type === 'up+' ? 'Delta UP+' : 'Delta UP';
    $('#up-status').innerHTML = `<div class="up-status-title">Ваша подписка</div><div class="up-status-text">У вас активна подписка <b>${name}</b> до ${exp}</div>`;
  } else $('#up-status').hidden = true;
}
$$('.up-tab').forEach(tab => tab.addEventListener('click', () => { state.upTab = tab.dataset.type; renderDeltaUp(); }));
$('#btn-buy-subscription').addEventListener('click', async () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  if (!state.selectedTariff) return;
  try {
    const updated = await api('/api/users/subscribe', { method: 'POST', body: JSON.stringify({ username: state.user.username, type: state.upTab, months: state.selectedTariff.months }) });
    state.user = updated; toast('Подписка успешно оформлена!');
    renderDeltaUp(); renderMyProfile(); renderOwnProfile();
  } catch (err) { toast(err.message); }
});

$('#btn-delete-account').addEventListener('click', () => {
  $('#delete-account-password').value = ''; $('#delete-account-cloud-password').value = '';
  $('#delete-account-cloud-password').hidden = !state.user.has_cloud;
  $('#modal-delete-account').hidden = false;
});
$('#btn-cancel-delete-account').addEventListener('click', () => $('#modal-delete-account').hidden = true);
$('#btn-confirm-delete-account').addEventListener('click', async () => {
  const pass = $('#delete-account-password').value; const cloudPass = $('#delete-account-cloud-password').value;
  if (!pass) return toast('Введите пароль');
  try {
    await api('/api/users/delete_account', { method: 'POST', body: JSON.stringify({ username: state.user.username, password: pass, cloud_password: cloudPass || null }) });
    toast('Аккаунт удален');
    state.savedAccounts = state.savedAccounts.filter(a => a.username !== state.user.username);
    saveSavedAccounts();
    localStorage.removeItem(LAST_LOGIN_KEY);
    if (state.socket) { try { state.socket.close(); } catch {} }
    if (state.personalSocket) { try { state.personalSocket.close(); } catch {} }
    stopPolling();
    state.user = null; state.chats = []; state.messages = []; state.currentPeer = null;
    $('#modal-delete-account').hidden = true;
    showScreen('screen-auth');
    $('#auth-back').hidden = state.savedAccounts.length === 0;
  } catch (err) { toast(err.message); }
});

$('#btn-blacklist').addEventListener('click', async () => {
  showScreen('screen-blacklist'); const list = $('#blacklist-list');
  list.innerHTML = '<div style="text-align:center;padding:20px;">Загрузка...</div>';
  try {
    const blocked = await api('/api/users/' + state.user.username + '/blocked_users');
    list.innerHTML = '';
    if (blocked.length === 0) { list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);">Чёрный список пуст</div>'; return; }
    blocked.forEach(u => {
      const el = document.createElement('div'); el.className = 'blacklist-item';
      const av = document.createElement('div'); av.className = 'blacklist-avatar'; renderAvatar(av, u); el.appendChild(av);
      const info = document.createElement('div'); info.className = 'blacklist-info';
      info.innerHTML = `<div class="blacklist-name">${displayName(u)}</div>`; el.appendChild(info);
      const brick = document.createElement('button'); brick.className = 'btn-brick';
      brick.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"/></svg>';
      brick.onclick = () => {
        if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
        showConfirm('Разблокировать?', `Вы уверены, что хотите разблокировать ${displayName(u)}?`, async () => {
          try {
            await api('/api/users/block', { method: 'POST', body: JSON.stringify({ username: state.user.username, peer: u.username, block: false }) });
            el.remove(); toast('Пользователь разблокирован');
          } catch (err) { toast(err.message); }
        });
      };
      el.appendChild(brick); list.appendChild(el);
    });
  } catch (err) { toast(err.message); }
});
$('#blacklist-back').addEventListener('click', () => showScreen('screen-privacy'));

// ===== АДМИНКА =====
$('#admin-back').addEventListener('click', () => showScreen('screen-main'));
async function openAdminPanel() {
  state.adminTargetUser = null; state.adminFormType = null;
  showScreen('screen-admin');
  if (!state.adminPassword) { state.adminState = 'login'; renderAdminContent(); return; }
  state.adminState = 'login'; renderAdminContent();
  try {
    await api('/api/admin/verify_password', { method: 'POST', body: JSON.stringify({ password: state.adminPassword }) });
    state.adminState = 'menu'; renderAdminContent();
  } catch {
    state.adminPassword = null; localStorage.removeItem('delta_admin_pw');
    state.adminState = 'login'; renderAdminContent();
  }
}
function renderAdminContent() {
  const c = $('#admin-content');
  if (state.adminState === 'login') {
    c.innerHTML = `
      <div class="edit-group" style="margin-top:16px;">
        <div class="edit-input-row"><input type="password" id="admin-pw-input" placeholder="Пароль администратора"></div>
      </div>
      <div style="padding:16px;">
        <button class="btn-primary" id="admin-login-btn" style="width:100%;">Войти</button>
      </div>`;
    $('#admin-login-btn').onclick = async () => {
      const pw = $('#admin-pw-input').value; if (!pw) return toast('Введите пароль');
      try {
        await api('/api/admin/verify_password', { method: 'POST', body: JSON.stringify({ password: pw }) });
        state.adminPassword = pw; localStorage.setItem('delta_admin_pw', pw);
        state.adminState = 'menu'; renderAdminContent();
      } catch (err) { toast(err.message); }
    };
    return;
  }
  if (state.adminState === 'menu') {
    c.innerHTML = `
      <div class="edit-group" style="margin-top:16px;">
        <div class="edit-row" data-admin-action="up">
          <div class="edit-row-icon" style="background-color: #FF9500;"><svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></div>
          <div class="edit-row-text">Выдать Delta UP</div>
        </div>
        <div class="edit-row" data-admin-action="up+">
          <div class="edit-row-icon" style="background-color: #FF9500;"><svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></div>
          <div class="edit-row-text">Выдать Delta UP+</div>
        </div>
        <div class="edit-row" data-admin-action="stars">
          <div class="edit-row-icon" style="background-color: #FFD700;"><svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z"/></svg></div>
          <div class="edit-row-text">Выдать звезды</div>
        </div>
        <div class="edit-row" data-admin-action="phone">
          <div class="edit-row-icon" style="background-color: #34C759;"><svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg></div>
          <div class="edit-row-text">Изменить мобильный</div>
        </div>
        <div class="edit-row" data-admin-action="verify">
          <div class="edit-row-icon" style="background-color: #3390ec;"><svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div>
          <div class="edit-row-text">Выдать верификацию</div>
        </div>
        <div class="edit-row" data-admin-action="freeze">
          <div class="edit-row-icon" style="background-color: #1e88e5;"><svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M12 2l1.5 4.5L18 5l-2 4 4.5 1.5-4.5 1.5 2 4-4.5-1.5L12 19l-1.5-4.5L6 16l2-4L3.5 10.5 8 9 6 5l4.5 1.5z"/></svg></div>
          <div class="edit-row-text">Заморозить аккаунт</div>
        </div>
      </div>
      <div style="padding:16px;">
        <button class="btn-secondary" id="admin-logout-btn" style="width:100%;">Выйти из админки</button>
      </div>`;
    c.querySelectorAll('[data-admin-action]').forEach(el => {
      el.onclick = () => { state.adminFormType = el.dataset.adminAction; state.adminState = 'form'; state.adminTargetUser = null; renderAdminContent(); };
    });
    $('#admin-logout-btn').onclick = () => {
      state.adminPassword = null; localStorage.removeItem('delta_admin_pw');
      state.adminState = 'login'; renderAdminContent();
    };
    return;
  }
  if (state.adminState === 'form') {
    const isFreeze = state.adminFormType === 'freeze';
    if (!state.adminTargetUser) {
      const placeholder = isFreeze ? '@username' : 'ID (8 — юзер, 6 — канал)';
      c.innerHTML = `
        <div class="edit-group" style="margin-top:16px;">
          <div class="edit-input-row"><input type="text" id="admin-id-input" placeholder="${placeholder}" ${isFreeze ? '' : 'maxlength="8" inputmode="numeric"'}></div>
        </div>
        <div style="padding:16px;">
          <button class="btn-primary" id="admin-find-btn" style="width:100%;">Найти аккаунт</button>
          <button class="btn-secondary" id="admin-form-back" style="width:100%; margin-top:8px;">Назад</button>
        </div>`;
      $('#admin-find-btn').onclick = async () => {
        const val = $('#admin-id-input').value.trim();
        try {
          let u;
          if (isFreeze) { if (!val) return toast('Введите имя пользователя'); u = await api('/api/admin/find_user_by_name', { method: 'POST', body: JSON.stringify({ password: state.adminPassword, username: val }) }); }
          else { if (!/^\d{6,8}$/.test(val)) return toast('ID должен быть 6 или 8 цифр'); u = await api('/api/admin/find_user', { method: 'POST', body: JSON.stringify({ password: state.adminPassword, user_id: val }) }); }
          state.adminTargetUser = u; renderAdminContent();
        } catch (err) { toast(err.message); }
      };
      $('#admin-form-back').onclick = () => { state.adminState = 'menu'; state.adminFormType = null; renderAdminContent(); };
      return;
    }
    const u = state.adminTargetUser;
    const name = displayName(u);
    const type = state.adminFormType;
    const isChannel = u.is_channel === true;
    const idVal = isChannel ? u.channel_id : u.user_id;
    let formHtml = '';
    if (!isChannel && (type === 'up' || type === 'up+')) {
      formHtml = `<div class="edit-group" style="margin-top:16px;"><div class="edit-input-row"><input type="number" id="admin-days-input" placeholder="Количество дней (1-3650)" min="1" max="3650"></div></div><div style="padding:16px;"><button class="btn-primary" id="admin-grant-btn" style="width:100%;">Выдать</button><button class="btn-secondary" id="admin-form-back" style="width:100%; margin-top:8px;">Отмена</button></div>`;
    } else if (!isChannel && type === 'stars') {
      formHtml = `<div class="edit-group" style="margin-top:16px;"><div class="edit-input-row"><input type="number" id="admin-stars-input" placeholder="Количество звезд (1-1000000)" min="1" max="1000000"></div></div><div style="padding:16px;"><button class="btn-primary" id="admin-grant-stars-btn" style="width:100%;">Выдать</button><button class="btn-secondary" id="admin-form-back" style="width:100%; margin-top:8px;">Отмена</button></div>`;
    } else if (!isChannel && type === 'phone') {
      formHtml = `<div class="edit-group" style="margin-top:16px;"><div class="edit-input-row"><input type="text" id="admin-phone-input" placeholder="Новый мобильный (только цифры)" inputmode="numeric"></div></div><div style="padding:16px;"><button class="btn-primary" id="admin-save-phone-btn" style="width:100%;">Сохранить</button><button class="btn-secondary" id="admin-form-back" style="width:100%; margin-top:8px;">Отмена</button></div>`;
    } else if (type === 'verify') {
      formHtml = `<div style="padding:16px;"><button class="btn-primary" id="admin-grant-verify-btn" style="width:100%;">Выдать</button><button class="btn-secondary" id="admin-form-back" style="width:100%; margin-top:8px;">Отмена</button></div>`;
    } else if (!isChannel && type === 'freeze') {
      if (u.is_frozen) formHtml = `<div style="padding:16px; text-align:center; color:var(--accent); font-weight:600;">❄️ Заморожен до ${formatDate(u.frozen_until)}</div><div style="padding:0 16px 16px;"><button class="btn-primary" id="admin-unfreeze-btn" style="width:100%;">Разморозить</button><button class="btn-secondary" id="admin-form-back" style="width:100%; margin-top:8px;">Отмена</button></div>`;
      else formHtml = `<div class="edit-group" style="margin-top:16px;"><div class="edit-input-row"><input type="number" id="admin-days-input" placeholder="Количество дней (1-3650)" min="1" max="3650"></div></div><div style="padding:16px;"><button class="btn-primary" id="admin-freeze-btn" style="width:100%;">Заморозить</button><button class="btn-secondary" id="admin-form-back" style="width:100%; margin-top:8px;">Отмена</button></div>`;
    } else if (isChannel && (type === 'up' || type === 'up+' || type === 'stars' || type === 'phone' || type === 'freeze')) {
      formHtml = `<div style="padding:16px; text-align:center; color:var(--danger); font-weight:600;">Эта функция недоступна для каналов</div><div style="padding:0 16px 16px;"><button class="btn-secondary" id="admin-form-back" style="width:100%;">Назад</button></div>`;
    }
    const info = isChannel ? `
      <div class="edit-row"><div class="edit-row-text">Название</div><div class="edit-row-value">${u.name || u.username}</div></div>
      <div class="edit-row"><div class="edit-row-text">@username</div><div class="edit-row-value">@${u.username}</div></div>
      <div class="edit-row"><div class="edit-row-text">ID канала</div><div class="edit-row-value">${u.channel_id}</div></div>
      <div class="edit-row"><div class="edit-row-text">Владелец</div><div class="edit-row-value">@${u.owner || '—'}</div></div>
      <div class="edit-row"><div class="edit-row-text">Подписчики</div><div class="edit-row-value">${u.subscribers_count || 0}</div></div>
      <div class="edit-row"><div class="edit-row-text">Верификация</div><div class="edit-row-value">${u.is_verified ? 'Да' : 'Нет'}</div></div>` : `
      <div class="edit-row"><div class="edit-row-text">Имя</div><div class="edit-row-value">${name}${isPeerFrozenForMe(u) ? ' ❄️' : ''}</div></div>
      <div class="edit-row"><div class="edit-row-text">@username</div><div class="edit-row-value">@${u.username}</div></div>
      <div class="edit-row"><div class="edit-row-text">ID</div><div class="edit-row-value">${u.user_id || '—'}</div></div>
      <div class="edit-row"><div class="edit-row-text">Звезды</div><div class="edit-row-value">${u.stars || 0} ⭐</div></div>
      <div class="edit-row"><div class="edit-row-text">Подписка</div><div class="edit-row-value">${u.subscription ? ((u.subscription.type === 'up+' ? 'UP+' : 'UP') + ' до ' + formatDate(u.subscription.expires_at)) : 'Нет'}</div></div>
      <div class="edit-row"><div class="edit-row-text">Верификация</div><div class="edit-row-value">${u.is_verified ? 'Да' : 'Нет'}</div></div>
      <div class="edit-row"><div class="edit-row-text">Телефон</div><div class="edit-row-value">${u.phone || 'Не установлен'}</div></div>
      <div class="edit-row"><div class="edit-row-text">Заморозка</div><div class="edit-row-value">${u.is_frozen ? '❄️ до ' + formatDate(u.frozen_until) : 'Нет'}</div></div>`;
    c.innerHTML = `<div class="edit-group" style="margin-top:16px;">${info}</div>${formHtml}`;
    if ($('#admin-form-back')) $('#admin-form-back').onclick = () => { state.adminTargetUser = null; renderAdminContent(); };
    if (!$('#admin-form-back')) {
      const bb = document.createElement('button');
      bb.className = 'btn-secondary'; bb.id = 'admin-form-back-2';
      bb.style.cssText = 'margin:0 16px 16px; display:block; width:calc(100% - 32px);';
      bb.textContent = 'Назад';
      bb.onclick = () => { state.adminTargetUser = null; renderAdminContent(); };
      c.appendChild(bb);
    }
    if ((type === 'up' || type === 'up+') && !isChannel && $('#admin-grant-btn')) {
      $('#admin-grant-btn').onclick = async () => {
        const days = parseInt($('#admin-days-input').value, 10);
        if (!days || days < 1 || days > 3650) return toast('Дни: 1-3650');
        try { const updated = await api('/api/admin/grant_up', { method: 'POST', body: JSON.stringify({ password: state.adminPassword, user_id: idVal, type, days }) }); state.adminTargetUser = updated; toast('Подписка выдана!'); renderAdminContent(); }
        catch (err) { toast(err.message); }
      };
    } else if (type === 'stars' && !isChannel && $('#admin-grant-stars-btn')) {
      $('#admin-grant-stars-btn').onclick = async () => {
        const amount = parseInt($('#admin-stars-input').value, 10);
        if (!amount || amount < 1 || amount > 1000000) return toast('Количество: 1-1 000 000');
        try {
          const updated = await api('/api/admin/grant_stars', { method: 'POST', body: JSON.stringify({ password: state.adminPassword, user_id: idVal, amount }) });
          state.adminTargetUser = updated;
          toast(`✅ Выдано ${amount} ⭐`);
          renderAdminContent();
        } catch (err) { toast(err.message); }
      };
    } else if (type === 'phone' && !isChannel && $('#admin-save-phone-btn')) {
      $('#admin-save-phone-btn').onclick = async () => {
        const phone = $('#admin-phone-input').value.trim();
        if (!/^\d+$/.test(phone)) return toast('Только цифры');
        if (phone.length < 3) return toast('Минимум 3 цифры');
        try { const updated = await api('/api/admin/set_phone', { method: 'POST', body: JSON.stringify({ password: state.adminPassword, user_id: idVal, phone }) }); state.adminTargetUser = updated; toast('Телефон обновлён'); renderAdminContent(); }
        catch (err) { toast(err.message); }
      };
    } else if (type === 'verify' && $('#admin-grant-verify-btn')) {
      $('#admin-grant-verify-btn').onclick = async () => {
        try { const updated = await api('/api/admin/verify', { method: 'POST', body: JSON.stringify({ password: state.adminPassword, user_id: idVal }) }); state.adminTargetUser = updated; toast('Верификация выдана!'); renderAdminContent(); }
        catch (err) { toast(err.message); }
      };
    } else if (type === 'freeze' && !isChannel && $('#admin-freeze-btn')) {
      $('#admin-freeze-btn').onclick = async () => {
        const days = parseInt($('#admin-days-input').value, 10);
        if (!days || days < 1 || days > 3650) return toast('Дни: 1-3650');
        try { const updated = await api('/api/admin/freeze', { method: 'POST', body: JSON.stringify({ password: state.adminPassword, username: u.username, days }) }); state.adminTargetUser = updated; toast('❄️ Аккаунт заморожен!'); renderAdminContent(); }
        catch (err) { toast(err.message); }
      };
    } else if (type === 'freeze' && !isChannel && $('#admin-unfreeze-btn')) {
      $('#admin-unfreeze-btn').onclick = async () => {
        try { const updated = await api('/api/admin/unfreeze', { method: 'POST', body: JSON.stringify({ password: state.adminPassword, username: u.username }) }); state.adminTargetUser = updated; toast('Аккаунт разморожен'); renderAdminContent(); }
        catch (err) { toast(err.message); }
      };
    }
    return;
  }
}

// ===== КОНТЕКСТНЫЕ МЕНЮ =====
const textCtxMenu = $('#context-menu'); const chatCtxMenu = $('#chat-context-menu');
const msgCtxMenu = $('#msg-context-menu'); const msgDelMenu = $('#msg-delete-menu');
const myProfileCtxMenu = $('#my-profile-context-menu');
function hideAllMenus() {
  textCtxMenu.hidden = true; chatCtxMenu.hidden = true; msgCtxMenu.hidden = true; msgDelMenu.hidden = true; myProfileCtxMenu.hidden = true;
  [textCtxMenu, chatCtxMenu, msgCtxMenu, msgDelMenu, myProfileCtxMenu].forEach(m => { if (m) m.style.transform = ''; });
}
document.addEventListener('click', (e) => { if (!e.target.closest('.context-menu')) hideAllMenus(); });
['#user-view-bio', '#user-view-username-row'].forEach(selector => {
  const el = $(selector);
  if (el) el.addEventListener('contextmenu', (e) => {
    e.preventDefault(); hideAllMenus(); const text = e.target.textContent.trim();
    if (text === '—' || text === 'Без описания') return;
    state.copyText = text; textCtxMenu.hidden = false;
    textCtxMenu.style.left = Math.min(e.clientX, window.innerWidth - 160) + 'px';
    textCtxMenu.style.top = Math.min(e.clientY, window.innerHeight - 60) + 'px';
  });
});
$('#ctx-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(state.copyText); toast('Скопировано'); } catch (err) { toast('Ошибка копирования'); } hideAllMenus();
});
['#my-profile-bio', '#my-profile-username'].forEach(selector => {
  const el = $(selector);
  if (el) el.addEventListener('contextmenu', (e) => {
    e.preventDefault(); hideAllMenus(); const text = e.target.textContent.trim();
    if (text === '—' || text === 'Добавить описание') return;
    state.myProfileContextTarget = el.id === 'my-profile-bio' ? 'bio' : 'username';
    state.copyText = text; myProfileCtxMenu.hidden = false;
    myProfileCtxMenu.style.left = Math.min(e.clientX, window.innerWidth - 160) + 'px';
    myProfileCtxMenu.style.top = Math.min(e.clientY, window.innerHeight - 100) + 'px';
  });
});
$('#ctx-copy-my-profile').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(state.copyText); toast('Скопировано'); } catch (err) { toast('Ошибка копирования'); } hideAllMenus();
});
$('#ctx-edit-profile').addEventListener('click', () => {
  hideAllMenus();
  if (state.user.is_frozen) return showFrozenInfo();
  const target = state.myProfileContextTarget;
  if (target === 'bio') {
    const u = state.user;
    renderAvatar($('#edit-profile-avatar'), u);
    $('#edit-profile-firstname').value = u.firstname || ''; $('#edit-profile-lastname').value = u.lastname || '';
    $('#edit-profile-bio').value = u.bio || ''; $('#edit-profile-birthday').value = u.birthday || '';
    $('#edit-profile-username-val').textContent = '@' + u.username;
    showScreen('screen-edit-profile');
    setTimeout(() => { $('#edit-profile-bio').focus(); }, 100);
  } else if (target === 'username') {
    $('#input-edit-username').value = state.user.username;
    showScreen('screen-edit-username');
  }
});

chatCtxMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('button'); if (!btn) return;
  const action = btn.dataset.action; const chat = state.contextTargetChat; if (!chat) return;
  hideAllMenus();
  if (action === 'folder') toast('Папки появятся позже');
  else if (action === 'pin') { if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен'); chat.pinned = !chat.pinned; saveChatsToLS(); renderChats(); }
  else if (action === 'mute') { if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен'); chat.muted = !chat.muted; saveChatsToLS(); renderChats(); }
  else if (action === 'delete') {
    if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
    if (chat.peer && chat.peer.is_channel) {
      showConfirm('Покинуть канал?', 'Вы больше не будете получать посты канала.', async () => {
        try {
          await api('/api/channels/' + encodeURIComponent(chat.peer.channel_id) + '/unsubscribe', { method: 'POST', body: JSON.stringify({ channel_id: chat.peer.channel_id, username: state.user.username }) });
          state.chats = state.chats.filter(c => !(c.peer.is_channel && c.peer.channel_id === chat.peer.channel_id));
          saveChatsToLS(); renderChats(); toast('Вы покинули канал');
          if (state.currentPeer && state.currentPeer.is_channel && state.currentPeer.channel_id === chat.peer.channel_id) {
            $('#empty-chat').style.display = 'flex'; $('#chat-view').hidden = true; $('.chat-area').classList.remove('visible');
            if (state.socket) { state.socket.close(); state.socket = null; }
            if (state.peerStatusTimer) { clearInterval(state.peerStatusTimer); state.peerStatusTimer = null; }
            state.currentPeer = null;
          }
        } catch (err) { toast(err.message); }
      });
      return;
    }
    showConfirm('Удалить чат?', 'Вся история сообщений будет удалена безвозвратно.', async () => {
      const room = roomFor(state.user.username, chat.peer.username);
      try { await api('/api/messages/delete_chat', { method: 'POST', body: JSON.stringify({ username: state.user.username, room: room }) }); } catch {}
      state.chats = state.chats.filter(c => c.peer.username !== chat.peer.username);
      saveChatsToLS(); renderChats(); toast('Чат удален');
      if (state.currentPeer && state.currentPeer.username === chat.peer.username) {
        $('#empty-chat').style.display = 'flex'; $('#chat-view').hidden = true; $('.chat-area').classList.remove('visible');
        if (state.socket) { state.socket.close(); state.socket = null; }
        if (state.peerStatusTimer) { clearInterval(state.peerStatusTimer); state.peerStatusTimer = null; }
        state.currentPeer = null;
      }
    });
  }
});

msgCtxMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('button'); if (!btn) return;
  const action = btn.dataset.action; const msg = state.contextTargetMsg; if (!msg) return;
  if (action === 'delete') {
    if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
    if (state.currentPeer && state.currentPeer.is_channel) {
      hideAllMenus();
      if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
      state.socket.send(JSON.stringify({ action: "delete", id: msg.id, for_everyone: true }));
      return;
    }
    msgCtxMenu.hidden = true; msgDelMenu.hidden = false;
    msgDelMenu.style.left = msgCtxMenu.style.left; msgDelMenu.style.top = msgCtxMenu.style.top; return;
  }
  hideAllMenus();
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  if (action === 'reply') { state.replyingTo = msg; state.editingMsg = null; showActionBar('reply', msg); }
  else if (action === 'copy') { navigator.clipboard.writeText(msg.text).then(() => toast('Скопировано')); }
  else if (action === 'edit') { state.editingMsg = msg; state.replyingTo = null; showActionBar('edit', msg); $('#message-input').value = msg.text; $('#message-input').focus(); }
  else if (action === 'pin') { if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return; state.socket.send(JSON.stringify({ action: "pin", id: msg.id })); }
});
msgDelMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('button'); if (!btn) return;
  const action = btn.dataset.action; const msg = state.contextTargetMsg; if (!msg) return;
  hideAllMenus();
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
  if (action === 'delete-all') { state.socket.send(JSON.stringify({ action: "delete", id: msg.id, for_everyone: true })); }
  else if (action === 'delete-me') {
    state.messages = state.messages.filter(m => m.id !== msg.id);
    const el = $(`.message[data-id="${msg.id}"]`); if (el) el.remove();
  }
});
$('#btn-cancel-action').addEventListener('click', cancelAction);
$('#btn-unpin').addEventListener('click', () => {
  if (state.user.is_frozen) return toast('❄️ Аккаунт заморожен');
  const pinned = state.messages.find(m => m.pinned);
  if (pinned && state.socket && state.socket.readyState === WebSocket.OPEN) { state.socket.send(JSON.stringify({ action: "pin", id: null })); }
});
function showActionBar(type, msg) {
  const bar = $('#input-action-bar'); bar.hidden = false; $('#action-bar-text').textContent = msg.text;
  if (type === 'reply') { $('#action-bar-title').textContent = 'Ответ на сообщение'; $('#action-bar-icon').innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>'; }
  else { $('#action-bar-title').textContent = 'Редактирование'; $('#action-bar-icon').innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>'; }
}
function cancelAction() {
  state.replyingTo = null; state.editingMsg = null; $('#input-action-bar').hidden = true;
  if (state.editingMsg) $('#message-input').value = '';
  $('#btn-send').innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
}

$('#btn-logout').addEventListener('click', () => {
  if (state.user) {
    if (state.sessionToken) {
      fetch('/api/logout?token=' + encodeURIComponent(state.sessionToken), { method: 'POST' }).catch(() => {});
      clearTokenFor(state.user.username);
    }
    state.savedAccounts = state.savedAccounts.filter(a => a.username !== state.user.username);
    saveSavedAccounts();
  }
  localStorage.removeItem(LAST_LOGIN_KEY);
  if (state.socket) { try { state.socket.close(); } catch {} }
  if (state.personalSocket) { try { state.personalSocket.close(); } catch {} }
  stopPolling();
  state.socket = null; state.personalSocket = null; state.currentPeer = null;
  state.user = null; state.chats = []; state.sessionToken = null;
  showScreen('screen-auth');
  $('#auth-back').hidden = state.savedAccounts.length === 0;
});

const myStarsBtn = $('#my-stars-badge-btn');
if (myStarsBtn) {
  myStarsBtn.addEventListener('click', () => {
    const u = state.user; if (!u) return;
    const name = `${u.firstname || ''} ${u.lastname || ''}`.trim() || u.username;
    $('#stars-info-title').textContent = 'Звёзды';
    $('#stars-info-text').textContent = `На данный момент ${name} имеет ${u.stars || 0} звёзд`;
    $('#modal-stars-info').hidden = false;
  });
}
const userStarsBtn = $('#user-view-stars-badge-btn');
if (userStarsBtn) {
  userStarsBtn.addEventListener('click', () => {
    const u = state.currentViewingUser; if (!u) return;
    const name = `${u.firstname || ''} ${u.lastname || ''}`.trim() || u.username;
    $('#stars-info-title').textContent = 'Звёзды';
    $('#stars-info-text').textContent = `На данный момент ${name} имеет ${u.stars || 0} звёзд`;
    $('#modal-stars-info').hidden = false;
  });
}
const btnCloseStarsInfo = $('#btn-close-stars-info');
if (btnCloseStarsInfo) btnCloseStarsInfo.addEventListener('click', () => $('#modal-stars-info').hidden = true);
const btnOkStarsInfo = $('#btn-ok-stars-info');
if (btnOkStarsInfo) btnOkStarsInfo.addEventListener('click', () => $('#modal-stars-info').hidden = true);

const messagesContainer = $('#messages');
if (messagesContainer) {
  messagesContainer.addEventListener('click', async (e) => {
    const mention = e.target.closest('.msg-mention');
    if (!mention) return;
    e.preventDefault(); e.stopPropagation();
    const username = (mention.dataset.username || '').toLowerCase();
    if (!username || (state.user && username === state.user.username)) return;
    try {
      const u = await api(`/api/users/${encodeURIComponent(username)}?viewer=${encodeURIComponent(state.user.username)}`);
      if (u.is_deleted) return toast('Аккаунт удалён');
      openChat(u);
    } catch (err) { toast('Пользователь не найден'); }
  });
}

function initAppearance() {
  if (state.theme === 'dark') document.body.classList.add('dark-theme');
  document.body.classList.add('font-' + state.fontSize);
}

async function tryAutoLogin() {
  const lastLogin = localStorage.getItem(LAST_LOGIN_KEY);
  if (!lastLogin) return false;
  const acc = state.savedAccounts.find(a => a.login === lastLogin);
  if (!acc) return false;
  try {
    const res = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ login: acc.login, password: acc.password, silent: true, device_info: detectDevice() })
    });
    if (res.status === 'ok') {
      state.user = res.user;
      state.sessionToken = res.session_token || loadTokenFor(res.user.username);
      if (state.sessionToken) saveTokenFor(state.user.username, state.sessionToken);
      state.profileBg = res.user.profile_bg || 'default';
      state.wallpaper = res.user.wallpaper || null;
      enterMessenger();
      return true;
    }
  } catch {}
  return false;
}

(async () => {
  loadSavedAccounts();
  initAppearance();
  applyLanguage();
  const ok = await tryAutoLogin();
  if (!ok) {
    showScreen('screen-auth');
  }
})();
// ============================================================
// SWIPE RIGHT TO GO BACK (mobile, как в Telegram)
// ============================================================
(function initSwipeBack() {
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (!isTouch) return;

  // Настройки жеста
  const EDGE_START = 45;   // жест начинается только в первых 45px от левого края
  const MIN_DIST   = 70;   // минимум смещения, чтобы сработало
  const MAX_VERT   = 80;   // если по вертикали ушли дальше — отменяем (это скролл)
  const DRAG_DAMP  = 1.0;  // 1.0 = строго за пальцем, 0.6 = мягче

  // CSS: чтобы горизонталь на слоях была наша, а вертикаль — браузера
  const st = document.createElement('style');
  st.textContent = `
    body.delta-swipe-enabled #chat-view,
    body.delta-swipe-enabled .modal,
    body.delta-swipe-enabled [data-swipe-back] {
      touch-action: pan-y;
      overscroll-behavior-x: contain;
    }
  `;
  document.head.appendChild(st);
  document.body.classList.add('delta-swipe-enabled');

  function isVisible(el) {
    if (!el) return false;
    if (el.hidden) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    return el.offsetParent !== null || cs.position === 'fixed';
  }

  // Находим верхний слой, который можно закрыть свайпом
  function getActiveLayer() {
    // 1) Модалки (всё, у чего id начинается с modal- или класс .modal)
    const modals = Array.from(
      document.querySelectorAll('.modal, [id^="modal-"]')
    ).filter(isVisible);
    if (modals.length) {
      return { type: 'modal', el: modals[modals.length - 1] };
    }

    // 2) Открытый чат
    const chatView = document.querySelector('#chat-view');
    if (isVisible(chatView)) return { type: 'chat', el: chatView };

    // 3) Пользовательские экраны, если пометишь их атрибутом data-swipe-back
    const custom = Array.from(document.querySelectorAll('[data-swipe-back]'))
      .filter(isVisible);
    if (custom.length) return { type: 'custom', el: custom[custom.length - 1] };

    return null;
  }

  // Что делать на «отпустил за порогом»
  function triggerBack() {
    const layer = getActiveLayer();
    if (!layer) return false;

    if (layer.type === 'chat') {
      // Переиспользуем существующую логику кнопки «назад»
      const back = document.querySelector('#btn-mobile-back');
      if (back) { back.click(); return true; }
      return false;
    }

    if (layer.type === 'modal') {
      // Пытаемся найти кнопку закрытия/отмены внутри модалки
      const closeBtn = layer.el.querySelector(
        '[id^="btn-close"], [id^="btn-cancel"], [id^="btn-ok"], ' +
        '.modal-close, .btn-close, [data-close]'
      );
      if (closeBtn) { closeBtn.click(); return true; }
      // Фолбэк: спрятать как есть
      layer.el.style.display = 'none';
      layer.el.hidden = true;
      return true;
    }

    if (layer.type === 'custom') {
      layer.el.dispatchEvent(new CustomEvent('swipe-back', { bubbles: true }));
      return true;
    }
    return false;
  }

  let sx = 0, sy = 0, cx = 0;
  let tracking = false, axis = null;
  let swipeEl = null, origTransform = '';

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    // Стартуем только если палец близко к левому краю
    if (t.clientX > EDGE_START) return;

    const layer = getActiveLayer();
    if (!layer) return;

    sx = t.clientX;
    sy = t.clientY;
    cx = sx;
    tracking = true;
    axis = null;
    swipeEl = layer.el;
    origTransform = swipeEl.style.transform || '';
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!tracking || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;

    // Определяем ось (один раз)
    if (!axis) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        if (axis === 'v') {
          // Это вертикальный скролл — не мешаем
          tracking = false;
          if (swipeEl) { swipeEl.style.transition = ''; swipeEl.style.transform = origTransform; swipeEl = null; }
          return;
        }
      } else {
        return;
      }
    }

    if (axis !== 'h') return;

    // Свайп только вправо
    if (dx < 0) {
      tracking = false;
      if (swipeEl) { swipeEl.style.transform = origTransform; swipeEl = null; }
      return;
    }

    // Ушли слишком далеко вниз/вверх — считаем, что это был не свайп-назад
    if (Math.abs(dy) > MAX_VERT) {
      tracking = false;
      if (swipeEl) { swipeEl.style.transform = origTransform; swipeEl = null; }
      return;
    }

    cx = t.clientX;

    // Гасим возможный нативный edge-swipe (Safari/Chrome)
    if (e.cancelable) e.preventDefault();

    if (swipeEl) {
      swipeEl.style.transition = 'none';
      const shift = Math.max(0, dx) * DRAG_DAMP;
      swipeEl.style.transform = `translateX(${shift}px)`;
    }
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (!tracking) return;
    tracking = false;

    const dx = cx - sx;
    const shouldTrigger = dx >= MIN_DIST;

    if (swipeEl) {
      // Плавно возвращаем на место, а потом уже навигируем
      const el = swipeEl;
      swipeEl = null;
      el.style.transition = 'transform .2s ease';
      el.style.transform = origTransform;
      setTimeout(() => { el.style.transition = ''; }, 220);
    }

    if (shouldTrigger) triggerBack();
  }, { passive: true });

  document.addEventListener('touchcancel', () => {
    tracking = false;
    if (swipeEl) {
      swipeEl.style.transform = origTransform;
      swipeEl.style.transition = '';
      swipeEl = null;
    }
  }, { passive: true });
})();
// ============================================================
// УСТРОЙСТВА + QR-ВХОД
// ============================================================

// ---------- общие хелперы ----------
function _formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return isToday ? `сегодня в ${time}` : d.toLocaleDateString('ru-RU') + ' ' + time;
}
function _deviceIcon(deviceId) {
  const d = (deviceId || '').toLowerCase();
  if (d.includes('iphone') || d.includes('android') || d.includes('mobile') || d.includes('ios')) return '📱';
  if (d.includes('ipad') || d.includes('tablet')) return '📲';
  return '💻';
}

// ---------- список устройств ----------
async function loadDevices() {
  if (!state.user || !state.sessionToken) return;
  const list = document.getElementById('devices-list');
  if (!list) return;
  list.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">Загрузка...</div>';
  try {
    const res = await fetch(`/api/sessions/list?username=${encodeURIComponent(state.user.username)}`, {
      headers: { 'Authorization': `Bearer ${state.sessionToken}` }
    });
    if (!res.ok) throw new Error('fail');
    const sessions = await res.json();
    if (!sessions.length) {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">Нет активных устройств</div>';
      return;
    }
    list.innerHTML = sessions.map((s, i) => `
      <div class="device-item" style="display:flex;gap:12px;align-items:center;padding:12px;border-bottom:1px solid #eee;">
        <div style="font-size:28px;">${_deviceIcon(s.device_id)}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;">${s.is_current ? 'Это устройство' : 'Устройство ' + (i + 1)}</div>
          <div style="font-size:12px;color:#888;">${s.ip || 'IP неизвестен'}</div>
          <div style="font-size:12px;color:#888;">
            ${s.is_current ? 'Активно сейчас' : 'Было активно: ' + _formatDate(s.last_used)}
          </div>
        </div>
        ${s.is_current
          ? '<span style="font-size:11px;background:#e8f5e9;color:#2e7d32;padding:4px 8px;border-radius:6px;">текущее</span>'
          : `<button class="device-revoke" data-token="${s.session_token}" style="background:none;border:none;color:#e53935;font-size:20px;cursor:pointer;padding:8px;" title="Завершить">✕</button>`}
      </div>
    `).join('');
    list.querySelectorAll('.device-revoke').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Завершить сессию этого устройства?')) return;
        await revokeOneSession(btn.dataset.token);
      });
    });
  } catch (e) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#c33;">Не удалось загрузить устройства</div>';
  }
}

async function revokeOneSession(token) {
  try {
    const res = await fetch('/api/sessions/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.sessionToken}`
      },
      body: JSON.stringify({ username: state.user.username, session_token: token })
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert(e.detail || 'Не удалось завершить');
      return;
    }
    await loadDevices();
  } catch { alert('Ошибка соединения'); }
}

async function revokeAllOtherSessions() {
  if (!state.user || !state.sessionToken) return;
  if (!confirm('Завершить все другие сеансы? Все остальные устройства выйдут из аккаунта.')) return;
  try {
    const res = await fetch(`/api/sessions/revoke_others?username=${encodeURIComponent(state.user.username)}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${state.sessionToken}` }
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert(e.detail || 'Не удалось');
      return;
    }
    await loadDevices();
  } catch { alert('Ошибка соединения'); }
}

// ---------- модалка: показать QR (на экране логина) ----------
let _qrShowPoll = null;

async function openQRShowModal() {
  let modal = document.getElementById('modal-qr-show');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-qr-show';
    modal.className = 'modal';
    modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div class="modal-content" style="background:#fff;border-radius:16px;padding:20px;max-width:360px;width:90%;text-align:center;">
        <div style="font-weight:600;font-size:16px;margin-bottom:16px;">Подключить устройство</div>
        <div style="color:#666;font-size:14px;margin-bottom:16px;">
          Откройте раздел «Устройства» на другом устройстве и отсканируйте этот QR-код
        </div>
        <div id="qr-show-box" style="display:flex;justify-content:center;padding:12px;background:#fff;"></div>
        <div id="qr-show-status" style="color:#666;font-size:13px;margin-top:12px;">Ожидание сканирования...</div>
        <button id="btn-close-qr-show" style="margin-top:16px;width:100%;padding:12px;border:none;border-radius:10px;background:#eee;font-size:15px;cursor:pointer;">Назад</button>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('btn-close-qr-show').onclick = () => {
      clearInterval(_qrShowPoll);
      modal.style.display = 'none';
    };
  }
  modal.style.display = 'flex';

  try {
    const res = await fetch('/api/qr/request', { method: 'POST' });
    if (!res.ok) throw new Error('Не удалось создать QR');
    const data = await res.json();

    const box = document.getElementById('qr-show-box');
    box.innerHTML = '';
    if (window.QRCode) {
      new QRCode(box, { text: data.payload, width: 240, height: 240, correctLevel: QRCode.CorrectLevel.M });
    } else {
      box.textContent = 'QR-библиотека не загружена';
    }

    clearInterval(_qrShowPoll);
    _qrShowPoll = setInterval(async () => {
      try {
        const sr = await fetch(`/api/qr/poll?qr_token=${encodeURIComponent(data.qr_token)}`);
        const sj = await sr.json();
        const st = document.getElementById('qr-show-status');
        if (sj.status === 'connected') {
          clearInterval(_qrShowPoll);
          if (st) { st.textContent = '✅ Устройство подключено! Входим...'; st.style.color = '#2e7d32'; }
          state.user = sj.user;
          state.sessionToken = sj.session_token;
          saveTokenFor(sj.user.username, sj.session_token);
          try { localStorage.setItem(LAST_LOGIN_KEY, sj.user.username); } catch {}
          setTimeout(() => location.reload(), 800);
        } else if (sj.status === 'expired') {
          clearInterval(_qrShowPoll);
          if (st) { st.textContent = '⏱ QR истёк. Закройте и откройте снова.'; st.style.color = '#c33'; }
        } else if (sj.status === 'error') {
          clearInterval(_qrShowPoll);
          if (st) { st.textContent = '❌ ' + (sj.detail || 'Ошибка'); st.style.color = '#c33'; }
        } else {
          if (st) st.textContent = `Ожидание... осталось ${sj.expires_in || 0} сек.`;
        }
      } catch {}
    }, 2000);
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
}

// ---------- модалка: сканер QR (в разделе устройств) ----------
async function openQRScanner() {
  if (!state.user || !state.sessionToken) return alert('Войдите в аккаунт');
  let modal = document.getElementById('modal-qr-scan');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-qr-scan';
    modal.className = 'modal';
    modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="max-width:400px;width:92%;text-align:center;color:#fff;">
        <div style="font-size:16px;font-weight:600;margin-bottom:16px;">
          Отсканируй QR-код для подключения нового устройства
        </div>
        <div style="position:relative;width:100%;aspect-ratio:1/1;background:#000;border-radius:16px;overflow:hidden;">
          <video id="qr-scan-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;"></video>
          <div style="position:absolute;top:18%;left:18%;width:64%;height:64%;border:3px solid #4ade80;border-radius:20px;box-shadow:0 0 0 9999px rgba(0,0,0,.35);pointer-events:none;"></div>
        </div>
        <div id="qr-scan-status" style="margin-top:12px;font-size:14px;color:#ddd;">Направь камеру на QR-код</div>
        <button id="btn-close-qr-scan" style="margin-top:16px;width:100%;padding:12px;border:none;border-radius:10px;background:rgba(255,255,255,.15);color:#fff;font-size:15px;cursor:pointer;">Назад</button>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('btn-close-qr-scan').onclick = () => closeQRScanner();
  }
  modal.style.display = 'flex';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }
    });
    const video = document.getElementById('qr-scan-video');
    video.srcObject = stream;

    if (!window.jsQR) {
      document.getElementById('qr-scan-status').textContent = 'Сканер не загружен';
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let scanning = true;

    const tick = () => {
      if (!scanning) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(img.data, img.width, img.height);
        if (code && code.data) {
          scanning = false;
          stream.getTracks().forEach(t => t.stop());
          handleQRScanned(code.data);
          return;
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    modal._stopCamera = () => {
      scanning = false;
      stream.getTracks().forEach(t => t.stop());
    };
  } catch (e) {
    document.getElementById('qr-scan-status').textContent = 'Нет доступа к камере: ' + e.message;
  }
}

function closeQRScanner() {
  const modal = document.getElementById('modal-qr-scan');
  if (modal) {
    if (modal._stopCamera) modal._stopCamera();
    modal.style.display = 'none';
  }
}

async function handleQRScanned(text) {
  closeQRScanner();
  try {
    const res = await fetch('/api/qr/confirm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.sessionToken}`
      },
      body: JSON.stringify({
        qr_token: text,
        username: state.user.username,
        device_info: navigator.userAgent.slice(0, 80),
      })
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert(e.detail || 'QR недействителен');
      return;
    }
    alert('✅ Новое устройство подключено!');
    loadDevices();
  } catch { alert('Ошибка соединения'); }
}

// ---------- хук на кнопки ----------
document.addEventListener('DOMContentLoaded', () => {
  // 1) Кнопка "End other sessions" — быстрая отмена без пароля
  const btnEnd = document.getElementById('btn-end-sessions');
  if (btnEnd) {
    btnEnd.addEventListener('click', (e) => {
      // перехватываем только если пользователь уже видел модалку с паролем раньше
      // (если нужно оставить старую логику с паролем — удалите эти 3 строки)
      e.preventDefault();
      e.stopImmediatePropagation();
      revokeAllOtherSessions();
    }, true);
  }

  // 2) Кнопка QR на экране логина (создаём, если её нет)
  if (!document.getElementById('btn-qr-login')) {
    const authView = document.querySelector('#auth-view, #login-view, .auth-screen, #auth');
    if (authView) {
      const btn = document.createElement('button');
      btn.id = 'btn-qr-login';
      btn.title = 'Вход по QR-коду';
      btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1"/>
      </svg>`;
      btn.style.cssText = 'position:absolute;top:14px;right:14px;width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,.06);border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#333;z-index:10;';
      if (getComputedStyle(authView).position === 'static') authView.style.position = 'relative';
      authView.appendChild(btn);
      btn.addEventListener('click', openQRShowModal);
    }
  } else {
    document.getElementById('btn-qr-login').addEventListener('click', openQRShowModal);
  }

  // 3) Раздел "Устройства": добавить "Подключить устройство" + контейнер со списком
  const devBtn = document.getElementById('btn-connect-device');
  if (devBtn) devBtn.addEventListener('click', openQRScanner);

  const devicesView = document.querySelector('#devices-view, [data-view="devices"], #devices');
  if (devicesView && !document.getElementById('devices-list')) {
    // кнопка "Подключить устройство" (если её нет в HTML)
    if (!document.getElementById('btn-connect-device')) {
      const btn = document.createElement('button');
      btn.id = 'btn-connect-device';
      btn.textContent = 'Подключить устройство';
      btn.style.cssText = 'width:100%;padding:12px;margin:8px 0;border:none;border-radius:10px;background:#4a90e2;color:#fff;font-size:15px;cursor:pointer;';
      btn.addEventListener('click', openQRScanner);
      devicesView.appendChild(btn);
    }
    const list = document.createElement('div');
    list.id = 'devices-list';
    list.style.cssText = 'background:#fff;border-radius:12px;margin-top:12px;overflow:hidden;';
    devicesView.appendChild(list);
  }

  // 4) Автозагрузка при открытии раздела
  if (devicesView) {
    const obs = new MutationObserver(() => {
      if (devicesView.offsetParent !== null && state.user) loadDevices();
    });
    obs.observe(devicesView, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
  }
});
// Вынести кнопки "В контакты" / "Заблокировать" за пределы карточки профиля
(function separateActions() {
  // Стили для отдельного блока
  const style = document.createElement('style');
  style.textContent = `
    #user-profile-main-actions.profile-actions-standalone {
      display: flex !important;
      flex-direction: column !important;
      margin: 12px 16px !important;
      background: var(--bg-secondary, #f2f2f7) !important;
      border-radius: 12px !important;
      overflow: hidden !important;
      padding: 0 !important;
    }
    #user-profile-main-actions.profile-actions-standalone > button {
      width: 100% !important;
      padding: 14px 16px !important;
      border: none !important;
      background: transparent !important;
      text-align: left !important;
      font-size: 15px !important;
      cursor: pointer !important;
      color: var(--text, #000) !important;
      border-bottom: 1px solid rgba(0,0,0,.06) !important;
      border-radius: 0 !important;
      margin: 0 !important;
    }
    #user-profile-main-actions.profile-actions-standalone > button:last-child {
      border-bottom: none !important;
    }
    #user-profile-main-actions.profile-actions-standalone > button.danger-text,
    #user-profile-main-actions.profile-actions-standalone > button[style*="color"] {
      color: #e53935 !important;
    }
  `;
  document.head.appendChild(style);

  function moveOut() {
    const actions = document.getElementById('user-profile-main-actions');
    const bio = document.getElementById('user-view-bio');
    if (!actions || !bio) return;
    if (actions.classList.contains('profile-actions-standalone')) return;

    // Ищем "карточку" — ближайшего общего родителя bio и actions,
    // но НЕ сам screen-user-view (иначе bio напрямую в экране)
    let card = bio.parentNode;
    while (card && card !== document.body) {
      if (card.id === 'screen-user-view') return; // bio прямо в screen — уже отдельно
      if (card.contains(actions)) break;
      card = card.parentNode;
    }

    if (card && card.parentNode && card.id !== 'screen-user-view') {
      // Выносим actions ПОСЛЕ карточки в screen-user-view
      card.parentNode.insertBefore(actions, card.nextSibling);
      actions.classList.add('profile-actions-standalone');
      console.log('[separateActions] кнопки вынесены из карточки');
    }
  }

  // Пробуем сразу и на каждом изменении
  setInterval(moveOut, 300);
})();