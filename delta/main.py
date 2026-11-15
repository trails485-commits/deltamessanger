import json
import os
import hashlib
import secrets
import time
import glob
import random
from datetime import datetime, timedelta
from typing import Optional, Dict, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:
    from pywebpush import webpush, WebPushException
    _PUSH_AVAILABLE = True
except ImportError:
    _PUSH_AVAILABLE = False

app = FastAPI()

DATA_DIR = "/data"
USERS_FILE = os.path.join(DATA_DIR, "users.json")
CHANNELS_FILE = os.path.join(DATA_DIR, "channels.json")
MESSAGES_DIR = os.path.join(DATA_DIR, "messages")
READS_DIR = os.path.join(DATA_DIR, "reads")

for d in (DATA_DIR, MESSAGES_DIR, READS_DIR):
    os.makedirs(d, exist_ok=True)

# ============ PUSH CONFIG ============
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "").replace("\\n", "\n")
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:admin@example.com")
PUSH_SUBS_FILE = os.path.join(DATA_DIR, "push_subs.json")


def load_push_subs():
    if os.path.exists(PUSH_SUBS_FILE):
        try:
            with open(PUSH_SUBS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_push_subs(subs):
    with open(PUSH_SUBS_FILE, "w", encoding="utf-8") as f:
        json.dump(subs, f, ensure_ascii=False)


def send_push_to_user_sync(username, title, body, extra_data=None):
    if not _PUSH_AVAILABLE or not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        return
    subs = load_push_subs().get(username.lower(), [])
    if not subs:
        return
    payload = json.dumps({"title": title, "body": body, "data": extra_data or {}})
    dead = []
    for sub in subs:
        try:
            webpush(
                subscription_info=sub,
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_SUBJECT}
            )
        except WebPushException as e:
            print(f"[push] fail {username}: {e}")
            if e.response is not None and e.response.status_code in (404, 410):
                dead.append(sub.get("endpoint"))
        except Exception as e:
            print(f"[push] error {username}: {e}")
    if dead:
        all_subs = load_push_subs()
        all_subs[username.lower()] = [s for s in all_subs.get(username.lower(), []) if s.get("endpoint") not in dead]
        save_push_subs(all_subs)


async def send_push_to_user(username, title, body, extra_data=None):
    import asyncio
    try:
        await asyncio.to_thread(send_push_to_user_sync, username, title, body, extra_data)
    except Exception as e:
        print(f"[push] thread error: {e}")


# ============ BASE CONFIG ============
STARTER_STARS = 0
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
NFT_PRICE = 100
ONLINE_THRESHOLD = 40
SESSION_TTL = 60 * 60 * 24 * 30
RATE_LIMIT_MAX = 5
RATE_LIMIT_WINDOW = 900
TWO_FA_TTL = 300
BG_COLORS = {"default", "black", "green", "pink", "blue", "purple", "orange"}
GIFTS_CATALOG = {
    "heart": {"name": "Сердечко", "price": 15, "icon": "heart"},
    "bear": {"name": "Мишка", "price": 15, "icon": "bear"},
    "gift": {"name": "Подарок", "price": 25, "icon": "gift"},
    "rose": {"name": "Роза", "price": 25, "icon": "rose"},
    "cake": {"name": "Тортик", "price": 50, "icon": "cake"},
    "rocket": {"name": "Ракета", "price": 50, "icon": "rocket"},
    "champagne": {"name": "Шампанское", "price": 50, "icon": "champagne"},
    "trophy": {"name": "Кубок", "price": 100, "icon": "trophy"},
    "diamond": {"name": "Алмаз", "price": 100, "icon": "diamond"},
    "ring": {"name": "Кольцо", "price": 150, "icon": "ring"},
    "crown": {"name": "Корона", "price": 300, "icon": "crown"},
    "liberty": {"name": "Статуя Свободы", "price": 480, "icon": "liberty"},
    "money": {"name": "Денежный букет", "price": 518, "icon": "money"},
    "dog": {"name": "Пёс", "price": 518, "icon": "dog"},
    "ramen": {"name": "Рамен", "price": 463, "icon": "ramen"},
    "flamingo": {"name": "Фламинго", "price": 498, "icon": "flamingo"},
    "lantern": {"name": "Фонарь", "price": 518, "icon": "lantern"},
    "poop": {"name": "Какашка", "price": 500, "icon": "poop"},
}


def load_users():
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_users(users):
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2)


def load_channels():
    if os.path.exists(CHANNELS_FILE):
        try:
            with open(CHANNELS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_channels(channels):
    with open(CHANNELS_FILE, "w", encoding="utf-8") as f:
        json.dump(channels, f, ensure_ascii=False, indent=2)


def touch_user(username):
    if not username:
        return
    users = load_users()
    uname = username.lower()
    if uname in users:
        users[uname]["last_seen"] = int(time.time())
        save_users(users)


def hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_hex(16)
    iterations = 200000
    dk = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), iterations)
    return f"pbkdf2${iterations}${salt}${dk.hex()}"


def verify_password(password, stored):
    try:
        if stored.startswith("pbkdf2$"):
            parts = stored.split("$")
            if len(parts) != 4:
                return False
            _, iter_str, salt, expected_hex = parts
            iterations = int(iter_str)
            dk = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), iterations)
            return secrets.compare_digest(dk.hex(), expected_hex)
        else:
            salt, h = stored.split("$")
            calc = hashlib.sha256((salt + password).encode()).hexdigest()
            return secrets.compare_digest(calc, h)
    except (ValueError, Exception):
        return False


def room_name(a, b):
    return "_".join(sorted([a.lower(), b.lower()]))


def channel_room(channel_id):
    return f"channel_{channel_id}"


def gen_user_id(existing_ids):
    while True:
        nid = str(random.randint(10000000, 99999999))
        if nid not in existing_ids:
            return nid


def gen_channel_id(existing_ids):
    while True:
        nid = str(random.randint(100000, 999999))
        if nid not in existing_ids:
            return nid


def is_frozen(u):
    return u.get("frozen_until", 0) > time.time()


def ensure_not_frozen(u):
    if is_frozen(u):
        raise HTTPException(status_code=403, detail="❄️ Аккаунт заморожен. Действия недоступны.")


def wipe_user_data(u):
    """Стереть все данные аккаунта и превратить его в «Удаленный аккаунт»."""
    u["is_deleted"] = True
    u["firstname"] = "Удаленный"
    u["lastname"] = "аккаунт"
    u["bio"] = ""
    u["birthday"] = ""
    u["avatar"] = None
    u["phone"] = ""
    u["contacts"] = {}
    u["blocked"] = []
    u["privacy"] = {}
    u["cloud_password"] = None
    u["subscription"] = None
    u["is_verified"] = False
    u["gifts"] = []
    u["stars"] = 0
    u["last_seen"] = 0
    u["frozen_until"] = 0
    u["primary_channel_id"] = None
    u["additional_usernames"] = []
    u["nftbot_state"] = {}
    u["profile_bg_custom"] = None
    u["wallpaper"] = None
    u["login_history"] = []
    u["trusted_devices"] = []
    u["password"] = hash_password(secrets.token_hex(32))
    u["login"] = f"deleted_{u.get('user_id', secrets.token_hex(4))}"


def make_device_id(device_info, ip):
    raw = f"{device_info}|{ip}".lower()
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def get_client_ip(request):
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real
    if request.client:
        return request.client.host
    return "unknown"


# ============ SESSION MANAGER ============
_sessions: Dict[str, dict] = {}


def create_session(username, device_id, ip):
    token = secrets.token_hex(32)
    _sessions[token] = {
        "username": username.lower(),
        "device_id": device_id,
        "ip": ip,
        "created_at": time.time(),
        "last_used": time.time(),
    }
    return token


def verify_session(token):
    if not token:
        return None
    rec = _sessions.get(token)
    if not rec:
        return None
    if time.time() - rec["created_at"] > SESSION_TTL:
        _sessions.pop(token, None)
        return None
    rec["last_used"] = time.time()
    return rec


def revoke_session(token):
    _sessions.pop(token, None)


def revoke_all_sessions(username, keep_token=None):
    uname = username.lower()
    to_remove = []
    for tok, rec in _sessions.items():
        if rec["username"] == uname and tok != keep_token:
            to_remove.append(tok)
    for tok in to_remove:
        _sessions.pop(tok, None)


# ============ AUTH HELPERS ============
def _get_token_from_request(request):
    token = request.headers.get("authorization", "").replace("Bearer ", "").strip()
    if not token:
        token = request.query_params.get("token", "").strip()
    return token


def require_auth(request, claimed_username):
    token = _get_token_from_request(request)
    sess = verify_session(token)
    if not sess:
        raise HTTPException(status_code=401, detail="Недействительная сессия. Войдите заново.")
    if sess.get("username") != (claimed_username or "").lower():
        raise HTTPException(status_code=403, detail="Нет доступа к этому ресурсу")
    return sess


def require_any_auth(request):
    token = _get_token_from_request(request)
    sess = verify_session(token)
    if not sess:
        raise HTTPException(status_code=401, detail="Недействительная сессия. Войдите заново.")
    return sess


def require_admin(password):
    if not ADMIN_PASSWORD:
        raise HTTPException(status_code=503, detail="Админка отключена (ADMIN_PASSWORD не задан)")
    if not verify_admin(password):
        raise HTTPException(status_code=401, detail="Неверный пароль")


# ============ RATE LIMIT ============
_login_attempts: Dict[str, List[float]] = {}


def _cleanup_attempts(key):
    now = time.time()
    arr = _login_attempts.get(key, [])
    arr = [t for t in arr if now - t < RATE_LIMIT_WINDOW]
    if arr:
        _login_attempts[key] = arr
    elif key in _login_attempts:
        del _login_attempts[key]


def check_rate_limit(key):
    _cleanup_attempts(key)
    return len(_login_attempts.get(key, [])) < RATE_LIMIT_MAX


def register_failed_attempt(key):
    _login_attempts.setdefault(key, []).append(time.time())


def reset_rate_limit(key):
    if key in _login_attempts:
        del _login_attempts[key]


# ============ 2FA ============
_pending_2fa: Dict[str, dict] = {}


def _cleanup_2fa():
    now = time.time()
    for k in list(_pending_2fa.keys()):
        if now - _pending_2fa[k].get("ts", 0) > TWO_FA_TTL:
            del _pending_2fa[k]


def create_2fa_code(uname, device_id):
    _cleanup_2fa()
    code = f"{secrets.randbelow(1000000):06d}"
    _pending_2fa[uname] = {"code": code, "device_id": device_id, "ts": time.time()}
    return code


def verify_2fa_code(uname, code, device_id):
    _cleanup_2fa()
    rec = _pending_2fa.get(uname)
    if not rec:
        return False
    if rec.get("device_id") != device_id:
        return False
    if time.time() - rec.get("ts", 0) > TWO_FA_TTL:
        return False
    if not secrets.compare_digest(rec.get("code", ""), code):
        return False
    del _pending_2fa[uname]
    return True


# ============ MESSAGES / READS ============
def load_messages(room):
    path = os.path.join(MESSAGES_DIR, f"{room}.json")
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            msgs = json.load(f)
        changed = False
        for m in msgs:
            if "id" not in m:
                m["id"] = str(int(m.get("ts", 0) * 1000)) + "_" + m.get("author", "x")
                m.setdefault("edited", False)
                m.setdefault("pinned", False)
                m.setdefault("reply_to", None)
                changed = True
        if changed:
            with open(path, "w", encoding="utf-8") as fw:
                json.dump(msgs, fw, ensure_ascii=False, indent=2)
        return msgs
    except Exception:
        return []


def save_messages(room, messages):
    with open(os.path.join(MESSAGES_DIR, f"{room}.json"), "w", encoding="utf-8") as f:
        json.dump(messages, f, ensure_ascii=False, indent=2)


def load_reads(username):
    path = os.path.join(READS_DIR, f"{username.lower()}.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_reads(username, data):
    with open(os.path.join(READS_DIR, f"{username.lower()}.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


# ============ BOT SETUP ============
def ensure_bot():
    users = load_users()
    changed = False
    existing_ids = {u.get("user_id") for u in users.values() if u.get("user_id")}
    if "deltahelperbot" not in users:
        users["deltahelperbot"] = {
            "login": "deltahelperbot", "password": hash_password(secrets.token_hex(16)),
            "firstname": "DeltaHelper", "lastname": "", "bio": "Помощник в Delta.",
            "username": "deltahelperbot", "avatar": None, "registered_at": int(time.time()),
            "birthday": "", "contacts": {}, "blocked": [], "is_bot": True, "phone": "+1 100",
            "privacy": {}, "cloud_password": None, "subscription": None, "stars": 0,
            "profile_bg": "default", "profile_bg_custom": None, "wallpaper": None, "gifts": [],
            "is_verified": False, "is_deleted": False, "last_seen": 0, "frozen_until": 0,
            "primary_channel_id": None, "additional_usernames": [], "nftbot_state": {},
            "login_history": [], "trusted_devices": [],
            "user_id": gen_user_id(existing_ids)
        }
        existing_ids.add(users["deltahelperbot"]["user_id"])
        changed = True
    if "nftbot" not in users:
        users["nftbot"] = {
            "login": "nftbot", "password": hash_password(secrets.token_hex(16)),
            "firstname": "NFT - товары", "lastname": "", "bio": "Магазин NFT юзернеймов.",
            "username": "nftbot", "avatar": None, "registered_at": int(time.time()),
            "birthday": "", "contacts": {}, "blocked": [], "is_bot": True, "phone": "+1 200",
            "privacy": {}, "cloud_password": None, "subscription": None, "stars": 0,
            "profile_bg": "default", "profile_bg_custom": None, "wallpaper": None, "gifts": [],
            "is_verified": False, "is_deleted": False, "last_seen": 0, "frozen_until": 0,
            "primary_channel_id": None, "additional_usernames": [], "nftbot_state": {},
            "login_history": [], "trusted_devices": [],
            "user_id": gen_user_id(existing_ids)
        }
        existing_ids.add(users["nftbot"]["user_id"])
        changed = True
    if "saved" not in users:
        users["saved"] = {
            "login": "saved", "password": hash_password(secrets.token_hex(16)),
            "firstname": "Избранное", "lastname": "", "bio": "", "username": "saved",
            "avatar": None, "registered_at": int(time.time()), "birthday": "",
            "contacts": {}, "blocked": [], "is_bot": True, "is_saved": True, "phone": "",
            "privacy": {}, "cloud_password": None, "subscription": None, "stars": 0,
            "profile_bg": "default", "profile_bg_custom": None, "wallpaper": None, "gifts": [],
            "is_verified": False, "is_deleted": False, "last_seen": 0, "frozen_until": 0,
            "primary_channel_id": None, "additional_usernames": [], "nftbot_state": {},
            "login_history": [], "trusted_devices": [],
            "user_id": gen_user_id(existing_ids)
        }
        existing_ids.add(users["saved"]["user_id"])
        changed = True
    for u in users.values():
        if "stars" not in u: u["stars"] = 0 if u.get("is_bot") else STARTER_STARS; changed = True
        if "profile_bg" not in u: u["profile_bg"] = "default"; changed = True
        if "profile_bg_custom" not in u: u["profile_bg_custom"] = None; changed = True
        if "wallpaper" not in u: u["wallpaper"] = None; changed = True
        if "gifts" not in u: u["gifts"] = []; changed = True
        if "is_verified" not in u: u["is_verified"] = False; changed = True
        if "is_deleted" not in u: u["is_deleted"] = False; changed = True
        if "last_seen" not in u: u["last_seen"] = 0; changed = True
        if "frozen_until" not in u: u["frozen_until"] = 0; changed = True
        if "primary_channel_id" not in u: u["primary_channel_id"] = None; changed = True
        if "additional_usernames" not in u: u["additional_usernames"] = []; changed = True
        if "nftbot_state" not in u: u["nftbot_state"] = {}; changed = True
        if "login_history" not in u: u["login_history"] = []; changed = True
        if "trusted_devices" not in u: u["trusted_devices"] = []; changed = True
        if "code_password" in u: del u["code_password"]; changed = True
        if u.get("username") == "nftbot" and u.get("phone") != "+1 200": u["phone"] = "+1 200"; changed = True
        if not u.get("user_id"):
            u["user_id"] = gen_user_id(existing_ids)
            existing_ids.add(u["user_id"])
            changed = True
    if changed:
        save_users(users)


ensure_bot()

DELETED_STUB = {
    "firstname": "Удаленный", "lastname": "аккаунт", "bio": "", "avatar": None,
    "phone": "", "birthday": "", "last_seen": "", "last_seen_ts": 0,
    "is_online": False, "is_deleted": True, "is_verified": False,
    "is_bot": False, "is_saved": False, "contacts": {}, "blocked": [],
    "privacy": {}, "has_cloud": False, "subscription": None, "stars": 0,
    "profile_bg": "default", "profile_bg_custom": None, "wallpaper": None,
    "gifts_count": 0, "registered_at": 0, "login": "", "is_frozen": False,
    "frozen_until": 0, "is_self_frozen": False, "is_channel": False,
    "primary_channel_id": None, "additional_usernames": [], "owned_usernames": [],
    "login_history": [], "trusted_devices_count": 0,
}


def public_user(u, viewer=None, light=False):
    if u.get("is_deleted"):
        out = dict(DELETED_STUB)
        out["username"] = u["username"]
        out["user_id"] = u.get("user_id", "")
        return out
    frozen = is_frozen(u)
    is_self = viewer and viewer.lower() == u["username"].lower()
    if frozen and not is_self:
        return {
            "username": u["username"], "login": "", "firstname": "Удаленный", "lastname": "аккаунт",
            "bio": "", "avatar": None, "registered_at": 0, "birthday": "", "contacts": {}, "blocked": [],
            "is_bot": False, "is_saved": False, "phone": "", "last_seen": "", "last_seen_ts": 0,
            "is_online": False, "privacy": {}, "has_cloud": False, "subscription": None, "stars": 0,
            "profile_bg": "default", "profile_bg_custom": None, "wallpaper": None, "gifts_count": 0,
            "user_id": "", "is_verified": False, "is_deleted": False, "is_frozen": True,
            "frozen_until": u.get("frozen_until", 0), "is_self_frozen": False, "is_channel": False,
            "primary_channel_id": None, "additional_usernames": [], "owned_usernames": [],
            "login_history": [], "trusted_devices_count": 0,
        }
    p = u.get("privacy", {})
    phone = u.get("phone", "")
    if p.get("phone") == "nobody": phone = "Скрыт"
    elif p.get("phone") == "contacts" and viewer and viewer not in u.get("contacts", {}): phone = "Скрыт"
    last_seen_ts = u.get("last_seen", 0)
    last_seen_str = "был(а) недавно"
    if p.get("last_seen") == "nobody": last_seen_str = "Был(а) давно"
    elif p.get("last_seen") == "contacts" and viewer and viewer not in u.get("contacts", {}): last_seen_str = "Был(а) давно"
    is_online = (time.time() - last_seen_ts) < ONLINE_THRESHOLD and not u.get("is_bot")
    bio = u.get("bio", "")
    if p.get("bio") == "nobody": bio = "—"
    elif p.get("bio") == "contacts" and viewer and viewer not in u.get("contacts", {}): bio = "—"
    avatar = u.get("avatar")
    if p.get("avatar") == "nobody": avatar = None
    elif p.get("avatar") == "contacts" and viewer and viewer not in u.get("contacts", {}): avatar = None
    return {
        "username": u["username"], "login": u.get("login", ""),
        "firstname": u["firstname"], "lastname": u.get("lastname", ""),
        "bio": bio, "avatar": avatar, "registered_at": u.get("registered_at", 0),
        "birthday": u.get("birthday", ""), "contacts": u.get("contacts", {}),
        "blocked": u.get("blocked", []), "is_bot": u.get("is_bot", False),
        "is_saved": u.get("is_saved", False), "phone": phone,
        "last_seen": last_seen_str, "last_seen_ts": last_seen_ts,
        "is_online": is_online, "privacy": p,
        "has_cloud": bool(u.get("cloud_password")),
        "subscription": u.get("subscription"),
        "stars": u.get("stars", 0),
        "profile_bg": u.get("profile_bg", "default"),
        "profile_bg_custom": None if light else u.get("profile_bg_custom"),
        "wallpaper": None if light else u.get("wallpaper"),
        "gifts_count": len(u.get("gifts", [])),
        "user_id": u.get("user_id", ""),
        "is_verified": u.get("is_verified", False),
        "is_deleted": False, "is_frozen": frozen,
        "frozen_until": u.get("frozen_until", 0),
        "is_self_frozen": frozen and is_self,
        "is_channel": False,
        "primary_channel_id": u.get("primary_channel_id"),
        "additional_usernames": [{"username": au.get("username", ""), "purchased_at": au.get("purchased_at", 0)} for au in u.get("additional_usernames", []) if au.get("is_applied")],
        "owned_usernames": ([{"username": au.get("username", ""), "purchased_at": au.get("purchased_at", 0), "is_applied": bool(au.get("is_applied"))} for au in u.get("additional_usernames", [])] if (viewer and viewer.lower() == u["username"].lower()) else []),
        "login_history": (u.get("login_history", [])[-20:] if (viewer and viewer.lower() == u["username"].lower()) else []),
        "trusted_devices_count": len(u.get("trusted_devices", [])),
    }


def public_channel(ch, viewer=None):
    if not ch:
        return None
    viewer_low = viewer.lower() if viewer else None
    is_owner = viewer_low and viewer_low == ch.get("owner", "").lower()
    is_admin = viewer_low and viewer_low in [a.lower() for a in ch.get("admins", [])]
    is_sub = viewer_low and viewer_low in ch.get("subscribers", [])
    return {
        "channel_id": ch["channel_id"],
        "username": ch.get("username") or f"channel_{ch['channel_id']}",
        "real_username": ch.get("username"),
        "name": ch.get("name", ""),
        "description": ch.get("description", ""),
        "avatar": ch.get("avatar"),
        "is_public": ch.get("is_public", True),
        "is_verified": ch.get("is_verified", False),
        "owner": ch.get("owner", ""),
        "admins": ch.get("admins", []),
        "subscribers_count": len(ch.get("subscribers", [])),
        "subscribers": ch.get("subscribers", []) if (is_owner or is_admin) else None,
        "created_at": ch.get("created_at", 0),
        "is_channel": True,
        "firstname": ch.get("name", ""),
        "lastname": "",
        "bio": ch.get("description", ""),
        "is_bot": False, "is_saved": False, "is_deleted": False, "is_frozen": False,
        "is_owner_for_viewer": bool(is_owner),
        "is_admin_for_viewer": bool(is_admin),
        "is_subscribed_for_viewer": bool(is_sub),
        "additional_usernames": [], "owned_usernames": [],
    }


def verify_admin(password):
    if not ADMIN_PASSWORD:
        return False
    return secrets.compare_digest(password, ADMIN_PASSWORD)


def find_user_by_id(users, user_id):
    for uname, u in users.items():
        if u.get("user_id") == user_id and not u.get("is_deleted"):
            return uname, u
    return None, None


def is_username_globally_available(uname, exclude_main_user=None):
    uname_low = (uname or "").lower()
    if not uname_low:
        return False
    users = load_users()
    for key, u in users.items():
        if exclude_main_user and key == exclude_main_user.lower():
            continue
        if u.get("is_deleted"):
            continue
        if (u.get("username") or "").lower() == uname_low:
            return False
        for au in u.get("additional_usernames", []):
            if (au.get("username") or "").lower() == uname_low:
                return False
    channels = load_channels()
    for ch in channels.values():
        if (ch.get("username") or "").lower() == uname_low:
            return False
    return True


def find_user_by_any_username(uname):
    uname_low = (uname or "").lower()
    if not uname_low:
        return None, None, None
    users = load_users()
    for key, u in users.items():
        if u.get("is_deleted"):
            continue
        if key == uname_low or (u.get("username") or "").lower() == uname_low:
            return key, u, u.get("username")
        for au in u.get("additional_usernames", []):
            if (au.get("username") or "").lower() == uname_low and au.get("is_applied"):
                return key, u, au.get("username")
    return None, None, None


async def nft_send_bot_message(room, text, inline_buttons=None):
    msgs = load_messages(room)
    msg = {"id": str(int(time.time() * 1000)) + "_bot", "author": "nftbot",
           "text": text, "ts": int(time.time()), "edited": False, "pinned": False, "reply_to": None}
    if inline_buttons:
        msg["inline_buttons"] = inline_buttons
    msgs.append(msg)
    save_messages(room, msgs)
    try:
        await manager.broadcast(json.dumps({"type": "new", "message": msg}, ensure_ascii=False), room)
    except Exception:
        pass
    return msg


async def handle_nftbot_message(sender, text, room):
    users = load_users()
    if sender not in users:
        return
    u = users[sender]
    st = u.get("nftbot_state", {}) or {}
    step = st.get("step", "idle")
    text_stripped = (text or "").strip()
    if text_stripped == "/start":
        u["nftbot_state"] = {"step": "idle"}
        save_users(users)
        await nft_send_bot_message(room, "Здравствуйте! Выберите услугу.",
            inline_buttons=[{"text": "Имя пользователя", "action": "nft_username_menu"}])
        return
    if step in ("confirming_my_account", "confirming_price"):
        await nft_send_bot_message(room, "Пожалуйста, используйте кнопки под сообщением.")
        return
    if step == "awaiting_username":
        desired = text_stripped.lstrip("@").lower()
        if not (4 <= len(desired) <= 32) or not all(c.isalnum() or c == '_' for c in desired):
            await nft_send_bot_message(room, "❌ Некорректный юзернейм. 4-32 символа, только a-z, 0-9, _")
            return
        if not is_username_globally_available(desired):
            u["nftbot_state"] = {"step": "idle"}
            save_users(users)
            await nft_send_bot_message(room, f"❌ Юзернейм @{desired} уже занят.")
            return
        u["nftbot_state"] = {"step": "confirming_my_account", "pending_username": desired}
        save_users(users)
        await nft_send_bot_message(room, f"✅ Юзернейм @{desired} свободен!\n\nНа какой аккаунт приобретаете?\nВаш ID: {u.get('user_id')}",
            inline_buttons=[{"text": f"Да, этот ({u.get('user_id')})", "action": "nft_use_my_id"}, {"text": "Нет, не этот", "action": "nft_other_id"}])
        return
    if step == "awaiting_account_id":
        target_id = text_stripped
        if not target_id.isdigit() or len(target_id) != 8:
            await nft_send_bot_message(room, "❌ ID должен быть 8-значным числом.")
            return
        found = False
        for key, tu in users.items():
            if (tu.get("user_id") or "") == target_id and not tu.get("is_deleted"):
                found = True
                break
        if not found:
            await nft_send_bot_message(room, f"❌ Аккаунт с ID {target_id} не найден.")
            return
        pending_uname = st.get("pending_username", "")
        u["nftbot_state"] = {"step": "confirming_price", "pending_username": pending_uname, "pending_account_id": target_id}
        save_users(users)
        await nft_send_bot_message(room, f"💰 Покупка @{pending_uname} для аккаунта {target_id}\nЦена: {NFT_PRICE} ⭐",
            inline_buttons=[{"text": "Оплатить", "action": "nft_pay"}, {"text": "Выйти", "action": "nft_cancel"}])
        return
    await nft_send_bot_message(room, "Нажмите /start чтобы начать.")


async def handle_nftbot_action(sender, bot_action, data, room):
    users = load_users()
    if sender not in users:
        return
    u = users[sender]
    st = u.get("nftbot_state", {}) or {}
    step = st.get("step", "idle")
    if bot_action == "nft_username_menu":
        u["nftbot_state"] = {"step": "awaiting_username"}
        save_users(users)
        await nft_send_bot_message(room, "Введите желаемый юзернейм без @:")
        return
    if bot_action == "nft_use_my_id":
        if step != "confirming_my_account":
            return
        pending = st.get("pending_username", "")
        my_id = u.get("user_id", "")
        u["nftbot_state"] = {"step": "confirming_price", "pending_username": pending, "pending_account_id": my_id}
        save_users(users)
        await nft_send_bot_message(room, f"💰 Покупка @{pending} для аккаунта {my_id}\nЦена: {NFT_PRICE} ⭐",
            inline_buttons=[{"text": "Оплатить", "action": "nft_pay"}, {"text": "Выйти", "action": "nft_cancel"}])
        return
    if bot_action == "nft_other_id":
        if step != "confirming_my_account":
            return
        u["nftbot_state"] = {"step": "awaiting_account_id", "pending_username": st.get("pending_username")}
        save_users(users)
        await nft_send_bot_message(room, "Введите ID аккаунта (8 цифр):")
        return
    if bot_action == "nft_pay":
        if step != "confirming_price":
            return
        pending = st.get("pending_username", "")
        target_id = st.get("pending_account_id", "")
        price = NFT_PRICE
        if (u.get("stars", 0) or 0) < price:
            u["nftbot_state"] = {"step": "idle"}
            save_users(users)
            await nft_send_bot_message(room, f"❌ Недостаточно звёзд. Нужно {price}, у вас {u.get('stars', 0)}.")
            return
        target_key = None
        for key, tu in users.items():
            if (tu.get("user_id") or "") == target_id and not tu.get("is_deleted"):
                target_key = key
                break
        if not target_key:
            u["nftbot_state"] = {"step": "idle"}
            save_users(users)
            await nft_send_bot_message(room, f"❌ Аккаунт с ID {target_id} не найден.")
            return
        if not is_username_globally_available(pending):
            u["nftbot_state"] = {"step": "idle"}
            save_users(users)
            await nft_send_bot_message(room, f"❌ Юзернейм @{pending} уже занят.")
            return
        u["stars"] = (u.get("stars", 0) or 0) - price
        users[target_key].setdefault("additional_usernames", []).append({
            "username": pending, "purchased_at": int(time.time()),
            "is_applied": False, "purchased_by": sender,
        })
        u["nftbot_state"] = {"step": "idle"}
        save_users(users)
        await nft_send_bot_message(room, f"✅ Вы приобрели @{pending} для аккаунта {target_id}!\nСписано: {price} ⭐")
        return
    if bot_action == "nft_cancel":
        u["nftbot_state"] = {"step": "idle"}
        save_users(users)
        await nft_send_bot_message(room, "Покупка отменена.")
        return


async def send_bot_login_notice(uname, text):
    users = load_users()
    if "deltahelperbot" not in users:
        return
    room = room_name(uname, "deltahelperbot")
    msgs = load_messages(room)
    bot_msg = {"id": str(int(time.time() * 1000)) + "_bot", "author": "deltahelperbot",
               "text": text, "ts": int(time.time()), "edited": False, "pinned": False, "reply_to": None}
    msgs.append(bot_msg)
    save_messages(room, msgs)
    try:
        await manager.broadcast(json.dumps({"type": "new", "message": bot_msg}, ensure_ascii=False), room)
    except Exception:
        pass
    try:
        await personal_manager.notify(uname, {
            "type": "new_message", "room": room,
            "from_user": public_user(users["deltahelperbot"], viewer=uname),
            "text": text, "ts": bot_msg["ts"],
        })
    except Exception:
        pass


# ============ MODELS ============
class RegisterIn(BaseModel):
    login: str
    password: str
    firstname: str
    lastname: str = ""
    bio: str = ""
    username: str
    avatar: Optional[str] = None
    birthday: Optional[str] = ""
    device_info: Optional[str] = "устройства"


class LoginIn(BaseModel):
    login: str
    password: str
    cloud_password: Optional[str] = None
    device_info: Optional[str] = "неизвестного устройства"
    device_id: Optional[str] = None
    silent: Optional[bool] = False
    two_fa_code: Optional[str] = None


class MarkReadIn(BaseModel):
    username: str
    room: str


class UpdateAvatarIn(BaseModel):
    username: str
    avatar: str


class UpdateProfileIn(BaseModel):
    username: str
    firstname: str
    lastname: str
    bio: str
    birthday: str


class ChangeUsernameIn(BaseModel):
    old_username: str
    new_username: str


class ContactIn(BaseModel):
    username: str
    peer: str
    firstname: str
    lastname: str


class BlockIn(BaseModel):
    username: str
    peer: str
    block: bool


class PrivacyIn(BaseModel):
    username: str
    key: str
    value: str


class PasswordSetupIn(BaseModel):
    username: str
    type: str
    password: Optional[str] = None
    code: Optional[str] = None
    device_info: Optional[str] = "неизвестного устройства"


class ChangePasswordIn(BaseModel):
    username: str
    old_password: str
    new_password: str
    cloud_password: Optional[str] = None
    device_info: Optional[str] = "неизвестного устройства"


class EndSessionsIn(BaseModel):
    username: str
    password: str
    cloud_password: Optional[str] = None


class DeleteChatIn(BaseModel):
    username: str
    room: str


class DeleteAccountIn(BaseModel):
    username: str
    password: str
    cloud_password: Optional[str] = None


class SubscribeIn(BaseModel):
    username: str
    type: str
    months: int


class ProfileBgIn(BaseModel):
    username: str
    color: str


class ImageIn(BaseModel):
    username: str
    image: Optional[str] = None


class SendGiftIn(BaseModel):
    from_username: str
    to_usernames: List[str]
    gift_id: str
    message: Optional[str] = ""
    anonymous: bool = False


class AdminAuthIn(BaseModel):
    password: str


class AdminFindUserIn(BaseModel):
    password: str
    user_id: str


class AdminFindByNameIn(BaseModel):
    password: str
    username: str


class AdminGrantUpIn(BaseModel):
    password: str
    user_id: str
    type: str
    days: int


class AdminGrantStarsIn(BaseModel):
    password: str
    user_id: str
    amount: int


class AdminSetPhoneIn(BaseModel):
    password: str
    user_id: str
    phone: str


class AdminVerifyIn(BaseModel):
    password: str
    user_id: str


class AdminFreezeIn(BaseModel):
    password: str
    username: str
    days: int


class AdminUnfreezeIn(BaseModel):
    password: str
    username: str


class AdminBlockIn(BaseModel):
    password: str
    username: str


class ChannelCreateIn(BaseModel):
    owner_username: str
    name: str
    description: str = ""
    avatar: Optional[str] = None
    is_public: bool = True
    username: Optional[str] = None


class ChannelUpdateIn(BaseModel):
    channel_id: str
    requester: str
    name: Optional[str] = None
    description: Optional[str] = None
    avatar: Optional[str] = None


class ChannelAccessIn(BaseModel):
    channel_id: str
    requester: str
    is_public: bool
    username: Optional[str] = None


class ChannelSubscribeIn(BaseModel):
    channel_id: str
    username: str


class ChannelAddSubscriberIn(BaseModel):
    channel_id: str
    requester: str
    target_username: str


class ChannelDeleteIn(BaseModel):
    channel_id: str
    requester: str


class SetPrimaryChannelIn(BaseModel):
    username: str
    channel_id: Optional[str] = None


class ToggleAdditionalUsernameIn(BaseModel):
    username: str
    target_username: str
    apply: bool


# ============ ADMIN ============
_admin_attempts: Dict[str, List[float]] = {}


def check_admin_rate(ip):
    now = time.time()
    arr = _admin_attempts.get(ip, [])
    arr = [t for t in arr if now - t < 900]
    if arr:
        _admin_attempts[ip] = arr
    else:
        _admin_attempts.pop(ip, None)
    return len(arr) < 5


def register_admin_fail(ip):
    _admin_attempts.setdefault(ip, []).append(time.time())


@app.post("/api/admin/verify_password")
async def admin_verify_password(data: AdminAuthIn, request: Request):
    ip = get_client_ip(request)
    if not check_admin_rate(ip):
        raise HTTPException(status_code=429, detail="Слишком много попыток. Подождите 15 минут.")
    require_admin(data.password)
    return {"ok": True}


@app.post("/api/admin/find_user")
async def admin_find_user(data: AdminFindUserIn):
    require_admin(data.password)
    id_val = data.user_id.strip()
    users = load_users()
    uname, u = find_user_by_id(users, id_val)
    if uname:
        return public_user(u, viewer=uname)
    channels = load_channels()
    ch = channels.get(id_val)
    if ch:
        return public_channel(ch, viewer=ch.get("owner"))
    raise HTTPException(status_code=404, detail="Аккаунт не найден")


@app.post("/api/admin/find_user_by_name")
async def admin_find_user_by_name(data: AdminFindByNameIn):
    require_admin(data.password)
    name = data.username.lower().strip().lstrip("@")
    users = load_users()
    if name in users and not users[name].get("is_deleted"):
        return public_user(users[name], viewer=name)
    key, u_any, _ = find_user_by_any_username(name)
    if key and u_any:
        return public_user(u_any, viewer=key)
    channels = load_channels()
    for ch in channels.values():
        if (ch.get("username") or "").lower() == name:
            return public_channel(ch, viewer=ch.get("owner"))
    raise HTTPException(status_code=404, detail="Аккаунт не найден")


@app.post("/api/admin/grant_up")
async def admin_grant_up(data: AdminGrantUpIn):
    require_admin(data.password)
    id_val = data.user_id.strip()
    if len(id_val) == 6:
        raise HTTPException(status_code=400, detail="Каналам нельзя выдать Delta UP")
    if data.type not in ("up", "up+"):
        raise HTTPException(status_code=400, detail="Неверный тип подписки")
    if data.days < 1 or data.days > 3650:
        raise HTTPException(status_code=400, detail="Дни: 1-3650")
    users = load_users()
    uname, u = find_user_by_id(users, id_val)
    if not uname:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
    now = datetime.now()
    cur = u.get("subscription")
    base = now
    if cur and cur.get("expires_at", 0) > now.timestamp():
        base = datetime.fromtimestamp(cur["expires_at"])
    u["subscription"] = {"type": data.type, "expires_at": (base + timedelta(days=data.days)).timestamp()}
    save_users(users)
    return public_user(u, viewer=uname)


@app.post("/api/admin/grant_stars")
async def admin_grant_stars(data: AdminGrantStarsIn):
    require_admin(data.password)
    if data.amount < 1 or data.amount > 1000000:
        raise HTTPException(status_code=400, detail="Количество: 1-1 000 000")
    id_val = data.user_id.strip()
    if len(id_val) == 6:
        raise HTTPException(status_code=400, detail="Каналам нельзя выдать звёзды")
    users = load_users()
    uname, u = find_user_by_id(users, id_val)
    if not uname:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
    u["stars"] = (u.get("stars", 0) or 0) + data.amount
    save_users(users)
    return public_user(u, viewer=uname)


@app.post("/api/admin/set_phone")
async def admin_set_phone(data: AdminSetPhoneIn):
    require_admin(data.password)
    id_val = data.user_id.strip()
    if len(id_val) == 6:
        raise HTTPException(status_code=400, detail="У канала нет мобильного")
    if not data.phone.isdigit():
        raise HTTPException(status_code=400, detail="Только цифры")
    if len(data.phone) < 3:
        raise HTTPException(status_code=400, detail="Минимум 3 цифры")
    users = load_users()
    uname, u = find_user_by_id(users, id_val)
    if not uname:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
    u["phone"] = data.phone
    save_users(users)
    return public_user(u, viewer=uname)


@app.post("/api/admin/verify")
async def admin_verify(data: AdminVerifyIn):
    require_admin(data.password)
    id_val = data.user_id.strip()
    if len(id_val) == 8:
        users = load_users()
        uname, u = find_user_by_id(users, id_val)
        if not uname:
            raise HTTPException(status_code=404, detail="Аккаунт не найден")
        u["is_verified"] = True
        save_users(users)
        return public_user(u, viewer=uname)
    elif len(id_val) == 6:
        channels = load_channels()
        ch = channels.get(id_val)
        if not ch:
            raise HTTPException(status_code=404, detail="Канал не найден")
        ch["is_verified"] = True
        save_channels(channels)
        return public_channel(ch, viewer=ch.get("owner"))
    else:
        raise HTTPException(status_code=400, detail="ID должен быть 8 (юзер) или 6 (канал)")


@app.post("/api/admin/freeze")
async def admin_freeze(data: AdminFreezeIn):
    require_admin(data.password)
    if data.days < 1 or data.days > 3650:
        raise HTTPException(status_code=400, detail="Дни: 1-3650")
    users = load_users()
    uname = data.username.lower().strip().lstrip("@")
    if uname not in users:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
    u = users[uname]
    if u.get("is_deleted"):
        raise HTTPException(status_code=400, detail="Аккаунт удален")
    base = max(time.time(), u.get("frozen_until", 0))
    u["frozen_until"] = base + data.days * 86400
    save_users(users)
    revoke_all_sessions(uname, keep_token=None)
    return public_user(u, viewer=uname)


@app.post("/api/admin/unfreeze")
async def admin_unfreeze(data: AdminUnfreezeIn):
    require_admin(data.password)
    users = load_users()
    uname = data.username.lower().strip().lstrip("@")
    if uname not in users:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
    users[uname]["frozen_until"] = 0
    save_users(users)
    return public_user(users[uname], viewer=uname)


@app.post("/api/admin/block")
async def admin_block(data: AdminBlockIn):
    require_admin(data.password)
    users = load_users()
    uname = data.username.lower().strip().lstrip("@")
    if uname not in users:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
    u = users[uname]
    if u.get("is_deleted"):
        raise HTTPException(status_code=400, detail="Аккаунт уже удален")
    if u.get("is_bot"):
        raise HTTPException(status_code=400, detail="Нельзя заблокировать бота")
    wipe_user_data(u)
    save_users(users)
    revoke_all_sessions(uname, keep_token=None)
    channels = load_channels()
    changed = False
    for ch in channels.values():
        if ch.get("owner") == uname:
            ch["owner"] = ""
            changed = True
        if uname in ch.get("subscribers", []):
            ch["subscribers"].remove(uname)
            changed = True
        if uname in ch.get("admins", []):
            ch["admins"].remove(uname)
            changed = True
    if changed:
        save_channels(channels)
    return public_user(u, viewer=uname)


# ============ CHANNELS ============
def _check_channel_access(ch, viewer):
    if not ch:
        return False
    viewer_low = (viewer or "").lower()
    is_owner = viewer_low == ch.get("owner", "").lower()
    is_admin = viewer_low in [a.lower() for a in ch.get("admins", [])]
    is_sub = viewer_low in [s.lower() for s in ch.get("subscribers", [])]
    is_public = ch.get("is_public", True)
    return is_owner or is_admin or is_sub or is_public


@app.post("/api/channels/create")
async def channel_create(data: ChannelCreateIn, request: Request):
    require_auth(request, data.owner_username)
    users = load_users()
    owner = data.owner_username.lower()
    if owner not in users:
        raise HTTPException(status_code=404, detail="Владелец не найден")
    ensure_not_frozen(users[owner])
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Введите название")
    if data.is_public:
        if not data.username:
            raise HTTPException(status_code=400, detail="Для публичного канала нужен @username")
        uname = data.username.strip().lower().lstrip("@")
        if not (4 <= len(uname) <= 32) or not all(c.isalnum() or c == '_' for c in uname):
            raise HTTPException(status_code=400, detail="Некорректный username")
        if not is_username_globally_available(uname):
            raise HTTPException(status_code=400, detail="@username занят")
    else:
        uname = None
    channels = load_channels()
    channel_id = gen_channel_id(set(channels.keys()))
    channels[channel_id] = {
        "channel_id": channel_id, "username": uname, "name": data.name.strip()[:64],
        "description": (data.description or "")[:255], "avatar": data.avatar, "owner": owner,
        "admins": [], "subscribers": [owner], "is_public": bool(data.is_public),
        "is_verified": False, "created_at": int(time.time()),
    }
    save_channels(channels)
    return public_channel(channels[channel_id], viewer=owner)


@app.get("/api/channels/{channel_id}")
async def channel_get(channel_id: str, viewer: Optional[str] = None):
    channels = load_channels()
    ch = channels.get(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Канал не найден")
    if not ch.get("is_public", True):
        if not viewer or not _check_channel_access(ch, viewer):
            raise HTTPException(status_code=403, detail="Канал приватный")
    return public_channel(ch, viewer=viewer)


@app.post("/api/channels/{channel_id}/update")
async def channel_update(channel_id: str, data: ChannelUpdateIn, request: Request):
    require_auth(request, data.requester)
    channels = load_channels()
    ch = channels.get(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Канал не найден")
    req = data.requester.lower()
    if req != ch.get("owner", "").lower() and req not in [a.lower() for a in ch.get("admins", [])]:
        raise HTTPException(status_code=403, detail="Только владелец или админ")
    users = load_users()
    if req in users:
        ensure_not_frozen(users[req])
    if data.name is not None: ch["name"] = data.name.strip()[:64]
    if data.description is not None: ch["description"] = data.description[:255]
    if data.avatar is not None: ch["avatar"] = data.avatar
    save_channels(channels)
    return public_channel(ch, viewer=req)


@app.post("/api/channels/{channel_id}/access")
async def channel_access(channel_id: str, data: ChannelAccessIn, request: Request):
    require_auth(request, data.requester)
    channels = load_channels()
    ch = channels.get(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Канал не найден")
    req = data.requester.lower()
    if req != ch.get("owner", "").lower():
        raise HTTPException(status_code=403, detail="Только владелец")
    users = load_users()
    if req in users:
        ensure_not_frozen(users[req])
    if data.is_public:
        if not data.username:
            raise HTTPException(status_code=400, detail="Для публичного канала нужен @username")
        uname = data.username.strip().lower().lstrip("@")
        if not (4 <= len(uname) <= 32) or not all(c.isalnum() or c == '_' for c in uname):
            raise HTTPException(status_code=400, detail="Некорректный username")
        if not is_username_globally_available(uname):
            raise HTTPException(status_code=400, detail="@username занят")
        ch["username"] = uname
        ch["is_public"] = True
    else:
        ch["is_public"] = False
        ch["username"] = None
    save_channels(channels)
    return public_channel(ch, viewer=req)


@app.post("/api/channels/{channel_id}/subscribe")
async def channel_subscribe(channel_id: str, data: ChannelSubscribeIn, request: Request):
    require_auth(request, data.username)
    channels = load_channels()
    ch = channels.get(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Канал не найден")
    if not ch.get("is_public", True):
        raise HTTPException(status_code=403, detail="Нельзя подписаться на приватный канал")
    uname = data.username.lower()
    users = load_users()
    if uname not in users:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    ensure_not_frozen(users[uname])
    if uname not in ch.get("subscribers", []):
        ch.setdefault("subscribers", []).append(uname)
        save_channels(channels)
    return {"ok": True, "channel": public_channel(ch, viewer=uname)}


@app.post("/api/channels/{channel_id}/unsubscribe")
async def channel_unsubscribe(channel_id: str, data: ChannelSubscribeIn, request: Request):
    require_auth(request, data.username)
    channels = load_channels()
    ch = channels.get(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Канал не найден")
    uname = data.username.lower()
    if uname == ch.get("owner", "").lower():
        raise HTTPException(status_code=400, detail="Владелец не может покинуть свой канал")
    if uname in ch.get("subscribers", []):
        ch["subscribers"].remove(uname)
        save_channels(channels)
    return {"ok": True}


@app.post("/api/channels/{channel_id}/add_subscriber")
async def channel_add_subscriber(channel_id: str, data: ChannelAddSubscriberIn, request: Request):
    require_auth(request, data.requester)
    channels = load_channels()
    ch = channels.get(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Канал не найден")
    req = data.requester.lower()
    if req != ch.get("owner", "").lower() and req not in [a.lower() for a in ch.get("admins", [])]:
        raise HTTPException(status_code=403, detail="Только владелец или админ")
    target = data.target_username.lower()
    users = load_users()
    if target not in users or users[target].get("is_deleted"):
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if target == ch.get("owner", "").lower():
        raise HTTPException(status_code=400, detail="Владелец уже в канале")
    if target in ch.get("subscribers", []):
        return {"ok": True, "already": True, "channel": public_channel(ch, viewer=req)}
    ch.setdefault("subscribers", []).append(target)
    save_channels(channels)
    return {"ok": True, "channel": public_channel(ch, viewer=req)}


@app.get("/api/channels/{channel_id}/subscribers")
async def channel_subscribers_list(channel_id: str, request: Request, viewer: str = ""):
    require_auth(request, viewer)
    channels = load_channels()
    ch = channels.get(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Канал не найден")
    viewer_low = viewer.lower()
    if viewer_low != ch.get("owner", "").lower() and viewer_low not in [a.lower() for a in ch.get("admins", [])]:
        raise HTTPException(status_code=403, detail="Только владелец или админ")
    users = load_users()
    result = []
    for sub in ch.get("subscribers", []):
        if sub in users:
            pu = public_user(users[sub], viewer=viewer_low, light=True)
            pu["is_owner_of_channel"] = (sub == ch.get("owner", "").lower())
            result.append(pu)
    result.sort(key=lambda x: (not x["is_owner_of_channel"], (x.get("firstname") or x["username"]).lower()))
    return result


@app.get("/api/channels/{channel_id}/messages")
async def channel_messages(channel_id: str, request: Request, viewer: Optional[str] = None):
    channels = load_channels()
    ch = channels.get(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Канал не найден")
    if not ch.get("is_public", True):
        if not viewer:
            raise HTTPException(status_code=403, detail="Требуется авторизация")
        require_auth(request, viewer)
        if not _check_channel_access(ch, viewer):
            raise HTTPException(status_code=403, detail="Нет доступа к каналу")
    return load_messages(channel_room(channel_id))


@app.post("/api/channels/{channel_id}/delete")
async def channel_delete(channel_id: str, data: ChannelDeleteIn, request: Request):
    require_auth(request, data.requester)
    channels = load_channels()
    ch = channels.get(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Канал не найден")
    if data.requester.lower() != ch.get("owner", "").lower():
        raise HTTPException(status_code=403, detail="Только владелец")
    users = load_users()
    changed_users = False
    for u in users.values():
        if u.get("primary_channel_id") == channel_id:
            u["primary_channel_id"] = None
            changed_users = True
    if changed_users:
        save_users(users)
    channels.pop(channel_id, None)
    save_channels(channels)
    path = os.path.join(MESSAGES_DIR, f"{channel_room(channel_id)}.json")
    if os.path.exists(path):
        try: os.remove(path)
        except Exception: pass
    return {"ok": True}


# ============ REGISTER / LOGIN / LOGOUT ============
@app.post("/api/register")
async def register(data: RegisterIn, request: Request):
    users = load_users()
    if any(u["login"] == data.login for u in users.values()):
        raise HTTPException(status_code=400, detail="Логин уже занят")
    uname = data.username.lower()
    # очищаем «мёртвые» username'ы заблокированных/удалённых аккаунтов, чтобы имя можно было занять заново
    stale_keys = [k for k, uu in users.items() if uu.get("is_deleted") and (k == uname or (uu.get("username") or "").lower() == uname)]
    for k in stale_keys:
        del users[k]
    if not is_username_globally_available(uname):
        raise HTTPException(status_code=400, detail="Имя пользователя уже занято")
    existing_ids = {u.get("user_id") for u in users.values() if u.get("user_id")}
    users[uname] = {
        "login": data.login, "password": hash_password(data.password),
        "firstname": data.firstname, "lastname": data.lastname,
        "bio": data.bio, "username": uname, "avatar": data.avatar,
        "registered_at": int(time.time()), "birthday": data.birthday or "",
        "contacts": {}, "blocked": [], "is_bot": False, "phone": "",
        "privacy": {"phone": "everyone", "last_seen": "everyone", "avatar": "everyone", "bio": "everyone", "birthday": "everyone"},
        "cloud_password": None, "subscription": None,
        "stars": STARTER_STARS, "profile_bg": "default", "profile_bg_custom": None,
        "wallpaper": None, "gifts": [],
        "is_verified": False, "is_deleted": False,
        "last_seen": int(time.time()), "frozen_until": 0,
        "primary_channel_id": None,
        "additional_usernames": [], "nftbot_state": {},
        "login_history": [], "trusted_devices": [],
        "user_id": gen_user_id(existing_ids),
    }
    save_users(users)
    room = room_name(uname, "deltahelperbot")
    msgs = load_messages(room)
    reg_time = time.strftime('%H:%M %d.%m.%Y')
    bot_text = f"Аккаунт зарегистрирован с {data.device_info} в {reg_time}. Спасибо что используете Delta!"
    msgs.append({"id": str(int(time.time() * 1000)), "author": "deltahelperbot",
                 "text": bot_text, "ts": int(time.time()),
                 "edited": False, "pinned": False, "reply_to": None})
    save_messages(room, msgs)
    ip = get_client_ip(request)
    device_id = make_device_id(data.device_info or "unknown", ip)
    token = create_session(uname, device_id, ip)
    resp = public_user(users[uname], viewer=uname)
    resp["session_token"] = token
    return resp


@app.post("/api/login")
async def login(data: LoginIn, request: Request):
    ip = get_client_ip(request)
    rate_key = f"{ip}:{data.login.lower()}"
    if not check_rate_limit(rate_key):
        raise HTTPException(status_code=429, detail="Слишком много попыток входа. Подождите 15 минут.")
    users = load_users()
    for u in users.values():
        if u.get("login") == data.login:
            if u.get("is_deleted"):
                register_failed_attempt(rate_key)
                raise HTTPException(status_code=404, detail="Пользователь не найден")
            if not verify_password(data.password, u["password"]):
                register_failed_attempt(rate_key)
                raise HTTPException(status_code=401, detail="Неверный пароль")
            if u.get("cloud_password"):
                if not data.cloud_password:
                    return {"status": "need_cloud"}
                if not verify_password(data.cloud_password, u["cloud_password"]):
                    register_failed_attempt(rate_key)
                    raise HTTPException(status_code=401, detail="Неверный облачный пароль")
            reset_rate_limit(rate_key)
            u["last_seen"] = int(time.time())
            device_info = data.device_info or "неизвестного устройства"
            device_id = data.device_id or make_device_id(device_info, ip)
            history = u.setdefault("login_history", [])
            history.append({"ts": int(time.time()), "device": device_info, "ip": ip})
            u["login_history"] = history[-50:]
            save_users(users)
            if not data.silent:
                ts_str = time.strftime('%H:%M %d.%m.%Y')
                bot_text = (f"🔔 Выполнен вход с {device_info} в {ts_str}. "
                            f"Если это были не вы — срочно смените пароль и завершите все сессии.")
                await send_bot_login_notice(u["username"].lower(), bot_text)
            token = create_session(u["username"].lower(), device_id, ip)
            return {"status": "ok", "user": public_user(u, viewer=u["username"]), "session_token": token}
    register_failed_attempt(rate_key)
    raise HTTPException(status_code=404, detail="Пользователь не найден")


@app.post("/api/logout")
async def logout(request: Request, token: str = ""):
    token2 = token or _get_token_from_request(request)
    if token2:
        revoke_session(token2)
    return {"ok": True}


@app.post("/api/logout_all")
async def logout_all(data: EndSessionsIn, request: Request):
    token = _get_token_from_request(request)
    require_auth(request, data.username)
    users = load_users()
    uname = data.username.lower()
    if uname not in users:
        raise HTTPException(status_code=404)
    u = users[uname]
    if not verify_password(data.password, u["password"]):
        raise HTTPException(status_code=401, detail="Неверный пароль")
    if u.get("cloud_password"):
        if not data.cloud_password:
            raise HTTPException(status_code=400, detail="Требуется облачный пароль")
        if not verify_password(data.cloud_password, u["cloud_password"]):
            raise HTTPException(status_code=401, detail="Неверный облачный пароль")
    revoke_all_sessions(uname, keep_token=token if token else None)
    save_users(users)
    return {"ok": True}


# ============ SESSIONS / DEVICES ============
class RevokeSessionIn(BaseModel):
    username: str
    session_token: str


@app.get("/api/sessions/list")
async def sessions_list(request: Request, username: str):
    require_auth(request, username)
    current_token = _get_token_from_request(request)
    uname = username.lower()
    result = []
    now = time.time()
    for tok, rec in list(_sessions.items()):
        if rec.get("username") != uname:
            continue
        if now - rec.get("created_at", 0) > SESSION_TTL:
            _sessions.pop(tok, None)
            continue
        result.append({
            "session_id": tok[:16],
            "session_token": tok,
            "device_id": rec.get("device_id", ""),
            "ip": rec.get("ip", ""),
            "created_at": rec.get("created_at", 0),
            "last_used": rec.get("last_used", 0),
            "is_current": tok == current_token,
        })
    result.sort(key=lambda x: (not x["is_current"], -x["last_used"]))
    return result


@app.post("/api/sessions/revoke")
async def sessions_revoke(data: RevokeSessionIn, request: Request):
    require_auth(request, data.username)
    current = _get_token_from_request(request)
    if data.session_token == current:
        raise HTTPException(status_code=400, detail="Нельзя завершить текущую сессию. Используйте «Выйти».")
    rec = _sessions.get(data.session_token)
    if not rec or rec.get("username") != data.username.lower():
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    _sessions.pop(data.session_token, None)
    return {"ok": True}


@app.post("/api/sessions/revoke_others")
async def sessions_revoke_others(request: Request, username: str = Query(...)):
    require_auth(request, username)
    current = _get_token_from_request(request)
    revoke_all_sessions(username, keep_token=current)
    return {"ok": True}


# ============ QR LOGIN ============
_qr_tokens: Dict[str, dict] = {}
QR_TTL = 120


def _cleanup_qr():
    now = time.time()
    for k in list(_qr_tokens.keys()):
        if now - _qr_tokens[k].get("created_at", 0) > QR_TTL * 2:
            del _qr_tokens[k]


@app.post("/api/qr/request")
async def qr_request(request: Request):
    _cleanup_qr()
    token = secrets.token_urlsafe(32)
    _qr_tokens[token] = {
        "created_at": time.time(),
        "ip": get_client_ip(request),
        "confirmed_by": None,
        "session_token": None,
    }
    return {"qr_token": token, "expires_in": QR_TTL, "payload": f"DELTA-LINK:{token}"}


@app.get("/api/qr/poll")
async def qr_poll(qr_token: str):
    _cleanup_qr()
    rec = _qr_tokens.get(qr_token)
    if not rec:
        return {"status": "expired"}
    if time.time() - rec["created_at"] > QR_TTL:
        _qr_tokens.pop(qr_token, None)
        return {"status": "expired"}
    if rec.get("session_token"):
        users = load_users()
        uname = rec.get("confirmed_by")
        sess_tok = rec["session_token"]
        _qr_tokens.pop(qr_token, None)
        if not uname or uname not in users:
            return {"status": "error", "detail": "Аккаунт не найден"}
        return {"status": "connected", "session_token": sess_tok, "user": public_user(users[uname], viewer=uname)}
    return {"status": "pending", "expires_in": int(QR_TTL - (time.time() - rec["created_at"]))}


class QRConfirmIn(BaseModel):
    qr_token: str
    username: str
    device_info: Optional[str] = "нового устройства"


@app.post("/api/qr/confirm")
async def qr_confirm(data: QRConfirmIn, request: Request):
    require_auth(request, data.username)
    _cleanup_qr()
    raw = (data.qr_token or "").strip()
    if raw.startswith("DELTA-LINK:"):
        raw = raw[len("DELTA-LINK:"):]
    rec = _qr_tokens.get(raw)
    if not rec:
        raise HTTPException(status_code=400, detail="QR недействителен или истёк")
    if time.time() - rec["created_at"] > QR_TTL:
        _qr_tokens.pop(raw, None)
        raise HTTPException(status_code=400, detail="QR истёк")
    if rec.get("confirmed_by"):
        raise HTTPException(status_code=400, detail="QR уже подтверждён другим устройством")
    uname = data.username.lower()
    users = load_users()
    if uname not in users or users[uname].get("is_deleted"):
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
    if is_frozen(users[uname]):
        raise HTTPException(status_code=403, detail="Аккаунт заморожен")
    new_ip = rec.get("ip") or "unknown"
    device_info = data.device_info or "нового устройства"
    device_id = make_device_id(device_info, new_ip)
    new_session_token = create_session(uname, device_id, new_ip)
    rec["confirmed_by"] = uname
    rec["session_token"] = new_session_token
    users[uname]["last_seen"] = int(time.time())
    history = users[uname].setdefault("login_history", [])
    history.append({"ts": int(time.time()), "device": device_info + " (QR-link)", "ip": new_ip})
    users[uname]["login_history"] = history[-50:]
    save_users(users)
    await send_bot_login_notice(uname, "🔔 Новое устройство подключено по QR-коду.")
    return {"ok": True}


# ============ PUSH SUBSCRIBE ============
class PushSubIn(BaseModel):
    username: str
    subscription: dict


@app.get("/api/push/vapid_public_key")
async def push_vapid_public_key():
    return {"key": VAPID_PUBLIC_KEY, "available": _PUSH_AVAILABLE and bool(VAPID_PUBLIC_KEY)}


@app.post("/api/push/subscribe")
async def push_subscribe(data: PushSubIn, request: Request):
    require_auth(request, data.username)
    if not _PUSH_AVAILABLE or not VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=503, detail="Push не настроен")
    uname = data.username.lower()
    subs = load_push_subs()
    subs.setdefault(uname, [])
    endpoint = data.subscription.get("endpoint", "")
    if not endpoint:
        raise HTTPException(status_code=400, detail="Нет endpoint")
    subs[uname] = [s for s in subs[uname] if s.get("endpoint") != endpoint]
    subs[uname].append(data.subscription)
    save_push_subs(subs)
    return {"ok": True}


# ============ SEARCH / GET USER ============
@app.get("/api/users/search")
async def search_users(request: Request, q: str = "", viewer: Optional[str] = None):
    require_any_auth(request)
    q = q.strip().lower()
    if not q:
        return []
    results = []
    users = load_users()
    for u in users.values():
        if u.get("is_saved") or u.get("is_deleted"):
            continue
        if is_frozen(u):
            continue
        hay = f"{u['username']} {u['firstname']} {u['lastname']}".lower()
        for au in u.get("additional_usernames", []):
            if au.get("is_applied"):
                hay += " " + (au.get("username") or "").lower()
        if q in hay:
            results.append(public_user(u, viewer=viewer, light=True))
    channels = load_channels()
    for ch in channels.values():
        uname = (ch.get("username") or "").lower()
        hay = f"{uname} {ch.get('name', '').lower()} {ch.get('description', '').lower()}"
        if q in hay:
            is_public = ch.get("is_public", True)
            is_owner = viewer and viewer.lower() == ch.get("owner", "").lower()
            if is_public or is_owner:
                results.append(public_channel(ch, viewer=viewer))
    def _is_exact(x):
        if (x.get("username") or "").lower() == q: return 0
        for au in x.get("additional_usernames", []):
            if (au.get("username") or "").lower() == q: return 0
        return 1
    results.sort(key=lambda x: (_is_exact(x), (x.get("username") or "").lower()))
    return results[:30]


@app.get("/api/users/{username}/chats")
async def get_user_chats(username: str, request: Request):
    require_auth(request, username)
    uname = username.lower()
    users = load_users()
    if uname not in users:
        raise HTTPException(status_code=404)
    reads = load_reads(uname)
    result = []
    for other_name, other_data in users.items():
        if other_name == uname:
            continue
        room = room_name(uname, other_name)
        path = os.path.join(MESSAGES_DIR, f"{room}.json")
        if not os.path.exists(path):
            continue
        msgs = load_messages(room)
        if not msgs:
            continue
        last = msgs[-1]
        read_ts = reads.get(room, 0)
        unread = sum(1 for m in msgs if m["ts"] > read_ts and m["author"] != uname)
        result.append({"room": room, "peer": public_user(other_data, viewer=uname, light=True),
                       "last_message": last, "unread": unread})
    channels = load_channels()
    for ch_id, ch in channels.items():
        if uname in ch.get("subscribers", []):
            room = channel_room(ch_id)
            msgs = load_messages(room)
            last = msgs[-1] if msgs else None
            read_ts = reads.get(room, 0)
            unread = sum(1 for m in msgs if m["ts"] > read_ts and m["author"] != uname) if msgs else 0
            result.append({"room": room, "peer": public_channel(ch, viewer=uname), "last_message": last, "unread": unread})
    result.sort(key=lambda r: (r["last_message"]["ts"] if r["last_message"] else 0), reverse=True)
    return result


@app.get("/api/users/{username}")
async def get_user(username: str, request: Request, viewer: Optional[str] = Query(None)):
    if viewer:
        require_auth(request, viewer)
    users = load_users()
    uname = username.lower()
    if uname not in users:
        key, u_any, _matched = find_user_by_any_username(uname)
        if key and u_any:
            return public_user(u_any, viewer=viewer)
        channels = load_channels()
        for ch in channels.values():
            if (ch.get("username") or "").lower() == uname:
                return public_channel(ch, viewer=viewer)
        raise HTTPException(status_code=404)
    u = users[uname]
    if u.get("is_deleted"):
        return public_user(u, viewer=viewer)
    if viewer:
        v = viewer.lower()
        if v in u.get("blocked", []):
            return {"username": uname, "login": "", "firstname": "—", "lastname": "—",
                    "bio": "—", "avatar": None, "registered_at": 0, "birthday": "",
                    "contacts": {}, "blocked": [], "is_bot": u.get("is_bot", False),
                    "is_saved": u.get("is_saved", False), "phone": "",
                    "is_blocked_by_target": True, "last_seen": "Был(а) давно",
                    "last_seen_ts": 0, "is_online": False,
                    "subscription": None, "stars": 0, "profile_bg": "default",
                    "profile_bg_custom": None, "wallpaper": None,
                    "gifts_count": 0, "user_id": "", "is_verified": False,
                    "is_deleted": False, "is_frozen": False,
                    "frozen_until": 0, "is_self_frozen": False,
                    "is_channel": False, "primary_channel_id": None,
                    "additional_usernames": [], "owned_usernames": [],
                    "login_history": [], "trusted_devices_count": 0}
    return public_user(u, viewer=viewer)


# ============ UPDATE PROFILE ============
@app.post("/api/users/avatar")
async def update_avatar(data: UpdateAvatarIn, request: Request):
    require_auth(request, data.username)
    users = load_users()
    uname = data.username.lower()
    if uname not in users or users[uname].get("is_deleted"):
        raise HTTPException(status_code=404)
    ensure_not_frozen(users[uname])
    users[uname]["avatar"] = data.avatar
    save_users(users)
    return public_user(users[uname], viewer=uname)


@app.post("/api/users/update")
async def update_profile(data: UpdateProfileIn, request: Request):
    require_auth(request, data.username)
    users = load_users()
    uname = data.username.lower()
    if uname not in users or users[uname].get("is_deleted"):
        raise HTTPException(status_code=404)
    ensure_not_frozen(users[uname])
    users[uname]["firstname"] = data.firstname
    users[uname]["lastname"] = data.lastname
    users[uname]["bio"] = data.bio
    users[uname]["birthday"] = data.birthday
    save_users(users)
    return public_user(users[uname], viewer=uname)


@app.post("/api/users/profile_bg")
async def set_profile_bg(data: ProfileBgIn, request: Request):
    require_auth(request, data.username)
    users = load_users()
    uname = data.username.lower()
    if uname not in users or users[uname].get("is_deleted"):
        raise HTTPException(status_code=404)
    ensure_not_frozen(users[uname])
    if data.color not in BG_COLORS:
        raise HTTPException(status_code=400, detail="Неизвестный цвет")
    u = users[uname]
    if data.color != "default":
        sub = u.get("subscription")
        if not sub or sub.get("expires_at", 0) < time.time():
            raise HTTPException(status_code=403, detail="Требуется подписка Delta UP")
    u["profile_bg"] = data.color
    save_users(users)
    return public_user(u, viewer=uname)


@app.post("/api/users/profile_bg_custom")
async def set_profile_bg_custom(data: ImageIn, request: Request):
    require_auth(request, data.username)
    users = load_users()
    uname = data.username.lower()
    if uname not in users or users[uname].get("is_deleted"):
        raise HTTPException(status_code=404)
    ensure_not_frozen(users[uname])
    u = users[uname]
    if data.image:
        sub = u.get("subscription")
        if not sub or sub.get("type") != "up+" or sub.get("expires_at", 0) < time.time():
            raise HTTPException(status_code=403, detail="Доступно только с подпиской Delta UP+")
    u["profile_bg_custom"] = data.image if data.image else None
    save_users(users)
    return public_user(u, viewer=uname)


@app.post("/api/users/wallpaper")
async def set_wallpaper(data: ImageIn, request: Request):
    require_auth(request, data.username)
    users = load_users()
    uname = data.username.lower()
    if uname not in users or users[uname].get("is_deleted"):
        raise HTTPException(status_code=404)
    ensure_not_frozen(users[uname])
    users[uname]["wallpaper"] = data.image if data.image else None
    save_users(users)
    return public_user(users[uname], viewer=uname)


@app.post("/api/users/set_primary_channel")
async def set_primary_channel(data: SetPrimaryChannelIn, request: Request):
    require_auth(request, data.username)
    users = load_users()
    uname = data.username.lower()
    if uname not in users:
        raise HTTPException(status_code=404)
    ensure_not_frozen(users[uname])
    if data.channel_id:
        channels = load_channels()
        ch = channels.get(data.channel_id)
        if not ch or ch.get("owner") != uname:
            raise HTTPException(status_code=403, detail="Вы не владелец этого канала")
        users[uname]["primary_channel_id"] = data.channel_id
    else:
        users[uname]["primary_channel_id"] = None
    save_users(users)
    return public_user(users[uname], viewer=uname)


@app.post("/api/users/toggle_additional_username")
async def toggle_additional_username(data: ToggleAdditionalUsernameIn, request: Request):
    require_auth(request, data.username)
    users = load_users()
    uname = data.username.lower()
    if uname not in users or users[uname].get("is_deleted"):
        raise HTTPException(status_code=404)
    ensure_not_frozen(users[uname])
    u = users[uname]
    target_low = (data.target_username or "").lower().lstrip("@")
    found = False
    for au in u.get("additional_usernames", []):
        if (au.get("username") or "").lower() == target_low:
            found = True
            if data.apply and not au.get("is_applied"):
                applied_count = sum(1 for x in u.get("additional_usernames", []) if x.get("is_applied"))
                if applied_count >= 10:
                    raise HTTPException(status_code=400, detail="Максимум 10 применённых юзернеймов")
                au["is_applied"] = True
            elif not data.apply:
                au["is_applied"] = False
            break
    if not found:
        raise HTTPException(status_code=404, detail="Юзернейм не найден в коллекции")
    save_users(users)
    return public_user(u, viewer=uname)


@app.get("/api/users/{username}/owned_channels")
async def get_owned_channels(username: str, request: Request):
    require_auth(request, username)
    users = load_users()
    uname = username.lower()
    if uname not in users:
        raise HTTPException(status_code=404)
    channels = load_channels()
    result = []
    for ch in channels.values():
        if ch.get("owner") == uname:
            result.append(public_channel(ch, viewer=uname))
    result.sort(key=lambda c: (c.get("name") or "").lower())
    return result


# ============ GIFTS ============
@app.get("/api/users/{username}/gifts")
async def get_user_gifts(username: str, request: Request, viewer: Optional[str] = None):
    require_any_auth(request)
    users = load_users()
    uname = username.lower()
    if uname not in users:
        raise HTTPException(status_code=404)
    gifts = users[uname].get("gifts", [])
    result = []
    for g in reversed(gifts):
        cat = GIFTS_CATALOG.get(g.get("gift_id", ""), {})
        item = {"id": g.get("id", ""), "gift_id": g.get("gift_id", ""),
                "name": cat.get("name", "Подарок"), "icon": cat.get("icon", "🎁"),
                "price": g.get("price", 0), "message": g.get("message", ""),
                "anonymous": g.get("anonymous", False), "ts": g.get("ts", 0), "from": None}
        frm = g.get("from")
        if frm and frm in users:
            item["from"] = public_user(users[frm], viewer=viewer)
        result.append(item)
    return result


@app.post("/api/users/send_gift")
async def send_gift(data: SendGiftIn, request: Request):
    require_auth(request, data.from_username)
    users = load_users()
    from_name = data.from_username.lower()
    if from_name not in users or users[from_name].get("is_deleted"):
        raise HTTPException(status_code=404, detail="Отправитель не найден")
    ensure_not_frozen(users[from_name])
    if data.gift_id not in GIFTS_CATALOG:
        raise HTTPException(status_code=400, detail="Неизвестный подарок")
    if not data.to_usernames:
        raise HTTPException(status_code=400, detail="Не выбраны получатели")
    gift = GIFTS_CATALOG[data.gift_id]
    recipients = []
    seen = set()
    for name in data.to_usernames:
        n = name.lower()
        if n in seen:
            continue
        if n == from_name:
            raise HTTPException(status_code=400, detail="Нельзя отправить подарок себе")
        if n == "saved":
            raise HTTPException(status_code=400, detail="Нельзя отправить в Избранное")
        if n not in users or users[n].get("is_deleted"):
            raise HTTPException(status_code=400, detail=f"Пользователь {n} не найден")
        seen.add(n)
        recipients.append(n)
    total = gift["price"] * len(recipients)
    sender = users[from_name]
    if sender.get("stars", 0) < total:
        raise HTTPException(status_code=400, detail=f"Недостаточно звезд. Нужно {total}, у вас {sender.get('stars', 0)}")
    sender["stars"] = sender.get("stars", 0) - total
    ts = int(time.time())
    pending_broadcasts = []
    pending_notifies = []
    for n in recipients:
        record = {"id": f"{ts}_{n}_{secrets.token_hex(3)}", "gift_id": data.gift_id,
                  "from": None if data.anonymous else from_name, "price": gift["price"],
                  "message": (data.message or "")[:70], "anonymous": bool(data.anonymous), "ts": ts}
        users[n].setdefault("gifts", []).append(record)
        if not data.anonymous:
            room = room_name(from_name, n)
            chat_msgs = load_messages(room)
            gift_msg = {"id": f"{ts}_{secrets.token_hex(4)}_gift", "author": "__gift__", "text": "",
                        "ts": ts, "edited": False, "pinned": False, "reply_to": None,
                        "gift": {"gift_id": data.gift_id, "from": from_name, "to": n,
                                 "message": (data.message or "")[:70], "price": gift["price"], "anonymous": False}}
            chat_msgs.append(gift_msg)
            save_messages(room, chat_msgs)
            pending_broadcasts.append((room, gift_msg))
            pending_notifies.append((n, room, gift_msg))
    save_users(users)
    for room, gm in pending_broadcasts:
        try:
            await manager.broadcast(json.dumps({"type": "new", "message": gm}, ensure_ascii=False), room)
        except Exception:
            pass
    for to_user, room, gm in pending_notifies:
        try:
            await personal_manager.notify(to_user, {
                "type": "new_message", "room": room,
                "from_user": public_user(sender, viewer=to_user),
                "text": f"🎁 Подарок: {gift['name']}", "ts": ts,
            })
        except Exception:
            pass
    return {"ok": True, "spent": total, "balance": sender["stars"], "count": len(recipients)}


# ============ CHANGE USERNAME / PASSWORD ============
@app.post("/api/users/change_username")
async def change_username(data: ChangeUsernameIn, request: Request):
    require_auth(request, data.old_username)
    users = load_users()
    old_uname = data.old_username.lower()
    new_uname = data.new_username.lower()
    if old_uname not in users or users[old_uname].get("is_deleted"):
        raise HTTPException(status_code=404)
    ensure_not_frozen(users[old_uname])
    if not (4 <= len(new_uname) <= 32) or not all(c.isalnum() or c == '_' for c in new_uname):
        raise HTTPException(status_code=400, detail="Некорректное имя")
    if new_uname in users:
        raise HTTPException(status_code=400, detail="Занято")
    if not is_username_globally_available(new_uname, exclude_main_user=old_uname):
        raise HTTPException(status_code=400, detail="Занято")
    user_data = users.pop(old_uname)
    user_data["username"] = new_uname
    users[new_uname] = user_data
    for filepath in glob.glob(os.path.join(MESSAGES_DIR, "*.json")):
        filename = os.path.basename(filepath)
        room = filename.replace(".json", "")
        if room.startswith("channel_"):
            continue
        if old_uname in room.split("_"):
            parts = room.split("_")
            new_parts = [new_uname if p == old_uname else p for p in parts]
            new_room = "_".join(new_parts)
            new_filepath = os.path.join(MESSAGES_DIR, f"{new_room}.json")
            msgs = load_messages(room)
            for m in msgs:
                if m["author"] == old_uname:
                    m["author"] = new_uname
            save_messages(new_room, msgs)
            os.remove(filepath)
    channels = load_channels()
    changed_ch = False
    for ch in channels.values():
        if ch.get("owner") == old_uname:
            ch["owner"] = new_uname
            changed_ch = True
        admins = ch.get("admins", [])
        if old_uname in admins:
            ch["admins"] = [new_uname if a == old_uname else a for a in admins]
            changed_ch = True
        subs = ch.get("subscribers", [])
        if old_uname in subs:
            ch["subscribers"] = [new_uname if s == old_uname else s for s in subs]
            changed_ch = True
    if changed_ch:
        save_channels(channels)
    save_users(users)
    revoke_all_sessions(old_uname, keep_token=None)
    return public_user(users[new_uname], viewer=new_uname)


@app.post("/api/users/change_password")
async def change_password(data: ChangePasswordIn, request: Request):
    ip = get_client_ip(request)
    rate_key = f"chpw:{ip}:{data.username.lower()}"
    if not check_rate_limit(rate_key):
        raise HTTPException(status_code=429, detail="Слишком много попыток. Подождите 15 минут.")
    users = load_users()
    uname = data.username.lower()
    if uname not in users or users[uname].get("is_deleted"):
        raise HTTPException(status_code=404)
    u = users[uname]
    if not verify_password(data.old_password, u["password"]):
        register_failed_attempt(rate_key)
        raise HTTPException(status_code=401, detail="Неверный текущий пароль")
    if u.get("cloud_password"):
        if not data.cloud_password:
            raise HTTPException(status_code=400, detail="Требуется облачный пароль")
        if not verify_password(data.cloud_password, u["cloud_password"]):
            register_failed_attempt(rate_key)
            raise HTTPException(status_code=401, detail="Неверный облачный пароль")
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Пароль минимум 6 символов")
    reset_rate_limit(rate_key)
    u["password"] = hash_password(data.new_password)
    device_info = data.device_info or "неизвестного устройства"
    device_id = make_device_id(device_info, ip)
    history = u.setdefault("login_history", [])
    history.append({"ts": int(time.time()), "device": f"{device_info} (смена пароля)", "ip": ip})
    u["login_history"] = history[-50:]
    save_users(users)
    revoke_all_sessions(uname, keep_token=None)
    ts_str = time.strftime('%H:%M %d.%m.%Y')
    await send_bot_login_notice(uname, f"🔐 Пароль был изменён с {device_info} в {ts_str}. Все сессии завершены.")
    return {"ok": True}


# ============ CONTACTS / BLOCK / PRIVACY ============
@app.post("/api/users/contacts")
async def manage_contact(data: ContactIn, request: Request):
    require_auth(request, data.username)
    users = load_users()
    uname = data.username.lower()
    peer = data.peer.lower()
    if uname not in users or peer not in users:
        raise HTTPException(status_code=404)
    ensure_not_frozen(users[uname])
    if "contacts" not in users[uname]:
        users[uname]["contacts"] = {}
    if data.firstname:
        users[uname]["contacts"][peer] = {"firstname": data.firstname, "lastname": data.lastname}
    else:
        users[uname]["contacts"].pop(peer, None)
    save_users(users)
    return {"ok": True}


@app.post("/api/users/block")
async def block_user(data: BlockIn, request: Request):
    require_auth(request, data.username)
    users = load_users()
    uname = data.username.lower()
    peer = data.peer.lower()
    if uname not in users or peer not in users:
        raise HTTPException(status_code=404)
    ensure_not_frozen(users[uname])
    if "blocked" not in users[uname]:
        users[uname]["blocked"] = []
    if data.block:
        if peer not in users[uname]["blocked"]:
            users[uname]["blocked"].append(peer)
    else:
        if peer in users[uname]["blocked"]:
            users[uname]["blocked"].remove(peer)
    save_users(users)
    return {"ok": True}


@app.post("/api/users/privacy")
async def update_privacy(data: PrivacyIn, request: Request):
    require_auth(request, data.username)
    users = load_users()
    uname = data.username.lower()
    if uname not in users:
        raise HTTPException(status_code=404)
    ensure_not_frozen(users[uname])
    if "privacy" not in users[uname]:
        users[uname]["privacy"] = {}
    users[uname]["privacy"][data.key] = data.value
    save_users(users)
    return {"ok": True}


@app.post("/api/users/set_password")
async def set_password(data: PasswordSetupIn, request: Request):
    require_auth(request, data.username)
    users = load_users()
    uname = data.username.lower()
    if uname not in users:
        raise HTTPException(status_code=404)
    ensure_not_frozen(users[uname])
    if data.type == "cloud":
        if data.password:
            users[uname]["cloud_password"] = hash_password(data.password)
            save_users(users)
            device = data.device_info or "неизвестного устройства"
            ts_str = time.strftime('%H:%M %d.%m.%Y')
            bot_text = (f"🔐 Облачный пароль был установлен с {device} в {ts_str}. "
                        f"Если это были не вы, срочно сбросьте сессии и измените облачный пароль.")
            await send_bot_login_notice(uname, bot_text)
        else:
            users[uname]["cloud_password"] = None
            save_users(users)
    return {"ok": True}


@app.post("/api/users/subscribe")
async def subscribe(data: SubscribeIn, request: Request):
    require_auth(request, data.username)
    users = load_users()
    uname = data.username.lower()
    if uname not in users:
        raise HTTPException(status_code=404)
    ensure_not_frozen(users[uname])
    now = datetime.now()
    current = users[uname].get("subscription")
    base = now
    if current and current.get("expires_at", 0) > now.timestamp():
        base = datetime.fromtimestamp(current["expires_at"])
    expiry = base + timedelta(days=30 * data.months)
    users[uname]["subscription"] = {"type": data.type, "expires_at": expiry.timestamp()}
    save_users(users)
    return public_user(users[uname], viewer=uname)


# ============ DELETE ACCOUNT ============
@app.post("/api/users/delete_account")
async def delete_account(data: DeleteAccountIn, request: Request):
    require_auth(request, data.username)
    users = load_users()
    uname = data.username.lower()
    if uname not in users:
        raise HTTPException(status_code=404)
    u = users[uname]
    if u.get("is_deleted"):
        raise HTTPException(status_code=400, detail="Аккаунт уже удален")
    if not verify_password(data.password, u["password"]):
        raise HTTPException(status_code=401, detail="Неверный пароль")
    if u.get("cloud_password"):
        if not data.cloud_password:
            raise HTTPException(status_code=400, detail="Требуется облачный пароль")
        if not verify_password(data.cloud_password, u["cloud_password"]):
            raise HTTPException(status_code=401, detail="Неверный облачный пароль")
    wipe_user_data(u)
    save_users(users)
    revoke_all_sessions(uname, keep_token=None)
    channels = load_channels()
    changed = False
    for ch in channels.values():
        if ch.get("owner") == uname:
            ch["owner"] = ""
            changed = True
        if uname in ch.get("subscribers", []):
            ch["subscribers"].remove(uname)
            changed = True
        if uname in ch.get("admins", []):
            ch["admins"].remove(uname)
            changed = True
    if changed:
        save_channels(channels)
    return {"ok": True}


@app.post("/api/messages/delete_chat")
async def delete_chat(data: DeleteChatIn, request: Request):
    require_auth(request, data.username)
    users = load_users()
    if data.username.lower() not in users:
        raise HTTPException(status_code=404)
    if data.room.startswith("channel_"):
        raise HTTPException(status_code=400, detail="Нельзя удалить чат канала")
    uname = data.username.lower()
    parts = data.room.split("_")
    if uname not in parts:
        raise HTTPException(status_code=403, detail="Вы не участник этого чата")
    path = os.path.join(MESSAGES_DIR, f"{data.room}.json")
    if os.path.exists(path):
        os.remove(path)
    return {"ok": True}


@app.get("/api/users/{username}/blocked_users")
async def get_blocked_users(username: str, request: Request):
    require_auth(request, username)
    users = load_users()
    uname = username.lower()
    if uname not in users:
        raise HTTPException(status_code=404)
    blocked_names = users[uname].get("blocked", [])
    return [public_user(users[b], viewer=uname, light=True) for b in blocked_names if b in users]


@app.get("/api/users/{username}/contacts")
async def get_contacts(username: str, request: Request):
    require_auth(request, username)
    users = load_users()
    uname = username.lower()
    if uname not in users:
        raise HTTPException(status_code=404)
    contacts = users[uname].get("contacts", {})
    result = []
    for c_name, c_data in contacts.items():
        if c_name in users:
            u = public_user(users[c_name], viewer=uname, light=True)
            u["custom_firstname"] = c_data.get("firstname")
            u["custom_lastname"] = c_data.get("lastname")
            result.append(u)
    result.sort(key=lambda x: (x.get("custom_firstname") or "").lower())
    return result


@app.post("/api/mark-read")
async def mark_read(data: MarkReadIn, request: Request):
    require_auth(request, data.username)
    reads = load_reads(data.username)
    reads[data.room] = int(time.time())
    save_reads(data.username, reads)
    touch_user(data.username)
    try:
        await manager.broadcast(json.dumps({"type": "read", "ts": int(time.time()), "by": data.username.lower()}, ensure_ascii=False), data.room)
    except Exception:
        pass
    return {"ok": True}


@app.get("/api/messages/{room}")
async def get_messages(room: str, request: Request, viewer: Optional[str] = None, peer: Optional[str] = None):
    require_any_auth(request)
    if viewer:
        sess = verify_session(_get_token_from_request(request))
        if not sess or sess.get("username") != viewer.lower():
            raise HTTPException(status_code=403, detail="Несоответствие пользователя")
        if not room.startswith("channel_"):
            parts = room.split("_")
            if viewer.lower() not in parts:
                raise HTTPException(status_code=403, detail="Нет доступа к этой переписке")
    msgs = load_messages(room)
    if viewer and peer:
        if room.startswith("channel_"):
            return msgs
        peer_reads = load_reads(peer)
        peer_read_ts = peer_reads.get(room, 0)
        vl = viewer.lower()
        for m in msgs:
            if m.get("author") == vl:
                m["read"] = m.get("ts", 0) <= peer_read_ts
    return msgs


# ============ WEBSOCKET ============
class ConnectionManager:
    def __init__(self):
        self.active = {}

    async def connect(self, ws, room):
        await ws.accept()
        self.active.setdefault(room, []).append(ws)

    def disconnect(self, ws, room):
        if room in self.active:
            try:
                self.active[room].remove(ws)
            except ValueError:
                pass

    async def broadcast(self, msg, room):
        for c in list(self.active.get(room, [])):
            try:
                await c.send_text(msg)
            except Exception:
                pass


manager = ConnectionManager()


class PersonalManager:
    def __init__(self):
        self.conns = {}

    async def connect(self, ws, user_id):
        await ws.accept()
        self.conns.setdefault(user_id.lower(), []).append(ws)

    def disconnect(self, ws, user_id):
        uid = user_id.lower()
        if uid in self.conns:
            try:
                self.conns[uid].remove(ws)
            except ValueError:
                pass

    async def notify(self, user_id, payload):
        msg = json.dumps(payload, ensure_ascii=False)
        for c in list(self.conns.get(user_id.lower(), [])):
            try:
                await c.send_text(msg)
            except Exception:
                pass


personal_manager = PersonalManager()


@app.websocket("/ws/user/{user_id}")
async def ws_user(websocket: WebSocket, user_id: str):
    token = websocket.query_params.get("token")
    sess = verify_session(token)
    if not sess or sess.get("username") != user_id.lower():
        await websocket.close(code=4001, reason="Unauthorized")
        return
    await personal_manager.connect(websocket, user_id)
    touch_user(user_id)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except Exception:
                continue
            if data.get("action") == "ping":
                touch_user(user_id)
    except WebSocketDisconnect:
        personal_manager.disconnect(websocket, user_id)
        touch_user(user_id)


@app.websocket("/ws/chat/{room}/{user_id}")
async def ws_endpoint(websocket: WebSocket, room: str, user_id: str, to: str = None):
    token = websocket.query_params.get("token")
    sess = verify_session(token)
    if not sess or sess.get("username") != user_id.lower():
        await websocket.close(code=4001, reason="Unauthorized")
        return
    if not room.startswith("channel_"):
        parts = room.split("_")
        if user_id.lower() not in parts:
            await websocket.close(code=4003, reason="Forbidden")
            return
    await manager.connect(websocket, room)
    touch_user(user_id)
    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                data = json.loads(raw_data)
            except Exception:
                continue
            action = data.get("action")
            if action in ("send", "edit", "delete", "pin", "typing"):
                _users = load_users()
                _sender = _users.get(user_id.lower(), {})
                if _sender.get("frozen_until", 0) > time.time():
                    if action == "typing":
                        continue
                    await websocket.send_text(json.dumps({"type": "error", "temp_id": data.get("temp_id"), "text": "❄️ Аккаунт заморожен"}, ensure_ascii=False))
                    continue
            if action == "bot_action":
                bot = (data.get("bot") or "").lower()
                if bot == "nftbot":
                    await handle_nftbot_action(user_id.lower(), data.get("bot_action"), data, room)
                continue
            if action == "typing":
                if to and to.startswith("channel_"):
                    continue
                try:
                    await manager.broadcast(json.dumps({"type": "typing", "from": user_id.lower()}, ensure_ascii=False), room)
                except Exception:
                    pass
                continue
            if action == "send":
                temp_id = data.get("temp_id")
                users = load_users()
                sender = users.get(user_id.lower(), {})
                text = data.get("text", "")
                if to and to.lower() == "nftbot":
                    if user_id.lower() in users:
                        users[user_id.lower()]["last_seen"] = int(time.time())
                        save_users(users)
                    msgs = load_messages(room)
                    new_msg = {"id": str(int(time.time() * 1000)), "author": user_id.lower(), "text": text,
                               "ts": int(time.time()), "edited": False, "pinned": False, "reply_to": data.get("reply_to")}
                    msgs.append(new_msg)
                    save_messages(room, msgs)
                    await manager.broadcast(json.dumps({"type": "new", "temp_id": temp_id, "message": new_msg}, ensure_ascii=False), room)
                    await handle_nftbot_message(user_id.lower(), text, room)
                    continue
                if to and to.startswith("channel_"):
                    ch_id = to[len("channel_"):]
                    channels = load_channels()
                    ch = channels.get(ch_id)
                    if not ch:
                        await websocket.send_text(json.dumps({"type": "error", "temp_id": temp_id, "text": "Канал не найден"}, ensure_ascii=False))
                        continue
                    is_owner_ch = user_id.lower() == ch.get("owner", "").lower()
                    is_admin_ch = user_id.lower() in [a.lower() for a in ch.get("admins", [])]
                    if not (is_owner_ch or is_admin_ch):
                        await websocket.send_text(json.dumps({"type": "error", "temp_id": temp_id, "text": "Вы не можете публиковать в этом канале"}, ensure_ascii=False))
                        continue
                    if user_id.lower() in users:
                        users[user_id.lower()]["last_seen"] = int(time.time())
                        save_users(users)
                    msgs = load_messages(room)
                    new_msg = {"id": str(int(time.time() * 1000)), "author": user_id.lower(), "text": text,
                               "ts": int(time.time()), "edited": False, "pinned": False,
                               "reply_to": data.get("reply_to"), "is_channel_post": True}
                    msgs.append(new_msg)
                    save_messages(room, msgs)
                    await manager.broadcast(json.dumps({"type": "new", "temp_id": temp_id, "message": new_msg}, ensure_ascii=False), room)
                    for sub in ch.get("subscribers", []):
                        if sub == user_id.lower():
                            continue
                        try:
                            await personal_manager.notify(sub, {
                                "type": "new_message", "room": room,
                                "from_user": public_channel(ch, viewer=sub),
                                "text": text, "ts": new_msg["ts"],
                            })
                            await send_push_to_user(
                                sub,
                                ch.get("name", "Канал"),
                                (text or "")[:120],
                                {"room": room}
                            )
                        except Exception:
                            pass
                    continue
                receiver = users.get(to.lower(), {}) if to else {}
                if sender.get("is_deleted"):
                    await websocket.send_text(json.dumps({"type": "error", "temp_id": temp_id, "text": "Аккаунт удален"}, ensure_ascii=False))
                    continue
                if to and to.lower() != 'saved' and user_id.lower() in receiver.get("blocked", []):
                    await websocket.send_text(json.dumps({"type": "error", "temp_id": temp_id, "text": "Не удалось доставить сообщение"}, ensure_ascii=False))
                    continue
                if to and to.lower() != 'saved' and to.lower() in sender.get("blocked", []):
                    await websocket.send_text(json.dumps({"type": "error", "temp_id": temp_id, "text": "Вы заблокировали этого пользователя."}, ensure_ascii=False))
                    continue
                if to and receiver.get("is_deleted"):
                    await websocket.send_text(json.dumps({"type": "error", "temp_id": temp_id, "text": "Аккаунт получателя удален"}, ensure_ascii=False))
                    continue
                is_admin_cmd = (to and to.lower() == "deltahelperbot" and text.strip() == "/adminpaneldelta")
                if user_id.lower() in users:
                    users[user_id.lower()]["last_seen"] = int(time.time())
                    save_users(users)
                msgs = load_messages(room)
                new_msg = {"id": str(int(time.time() * 1000)), "author": user_id.lower(), "text": text,
                           "ts": int(time.time()), "edited": False, "pinned": False, "reply_to": data.get("reply_to")}
                msgs.append(new_msg)
                bot_msg = None
                if is_admin_cmd:
                    bot_msg = {"id": str(int(time.time() * 1000)) + "_bot", "author": "deltahelperbot",
                               "text": "Для доступа к админ панели введите пароль", "ts": int(time.time()) + 1,
                               "edited": False, "pinned": False, "reply_to": None,
                               "inline_button": {"text": "Войти", "action": "open_admin_panel"}}
                    msgs.append(bot_msg)
                save_messages(room, msgs)
                await manager.broadcast(json.dumps({"type": "new", "temp_id": temp_id, "message": new_msg}, ensure_ascii=False), room)
                if bot_msg:
                    await manager.broadcast(json.dumps({"type": "new", "message": bot_msg}, ensure_ascii=False), room)
                if to and to.lower() != 'saved' and not is_admin_cmd:
                    await personal_manager.notify(to, {
                        "type": "new_message", "room": room,
                        "from_user": public_user(sender, viewer=to),
                        "text": new_msg["text"], "ts": new_msg["ts"],
                    })
                    sender_name = sender.get("firstname") or sender.get("username") or "Сообщение"
                    await send_push_to_user(
                        to,
                        sender_name,
                        (new_msg["text"] or "")[:120],
                        {"room": room, "from": user_id.lower()}
                    )
            elif action == "edit":
                if to and to.startswith("channel_"):
                    ch_id = to[len("channel_"):]
                    channels = load_channels()
                    ch = channels.get(ch_id)
                    if not ch:
                        continue
                    if user_id.lower() != ch.get("owner", "").lower() and user_id.lower() not in [a.lower() for a in ch.get("admins", [])]:
                        continue
                msg_id = data.get("id")
                new_text = data.get("text")
                msgs = load_messages(room)
                for m in msgs:
                    if m.get("id") == msg_id and m.get("author") == user_id.lower():
                        m["text"] = new_text
                        m["edited"] = True
                        break
                save_messages(room, msgs)
                await manager.broadcast(json.dumps({"type": "edit", "id": msg_id, "text": new_text}, ensure_ascii=False), room)
            elif action == "delete":
                if to and to.startswith("channel_"):
                    ch_id = to[len("channel_"):]
                    channels = load_channels()
                    ch = channels.get(ch_id)
                    if not ch:
                        continue
                    if user_id.lower() != ch.get("owner", "").lower() and user_id.lower() not in [a.lower() for a in ch.get("admins", [])]:
                        continue
                msg_id = data.get("id")
                if data.get("for_everyone", False):
                    msgs = [m for m in load_messages(room) if m.get("id") != msg_id]
                    save_messages(room, msgs)
                    await manager.broadcast(json.dumps({"type": "delete", "id": msg_id}, ensure_ascii=False), room)
                else:
                    await websocket.send_text(json.dumps({"type": "delete", "id": msg_id}, ensure_ascii=False))
            elif action == "pin":
                if to and to.startswith("channel_"):
                    ch_id = to[len("channel_"):]
                    channels = load_channels()
                    ch = channels.get(ch_id)
                    if not ch:
                        continue
                    if user_id.lower() != ch.get("owner", "").lower() and user_id.lower() not in [a.lower() for a in ch.get("admins", [])]:
                        continue
                msg_id = data.get("id")
                msgs = load_messages(room)
                for m in msgs:
                    m["pinned"] = (m.get("id") == msg_id)
                save_messages(room, msgs)
                await manager.broadcast(json.dumps({"type": "pin", "id": msg_id}, ensure_ascii=False), room)
    except WebSocketDisconnect:
        manager.disconnect(websocket, room)
        touch_user(user_id)


app.mount("/", StaticFiles(directory="static", html=True), name="static")