# -*- coding: utf-8 -*-
"""
Секрети для генераторів DSL. У репозиторії їх немає — тільки тут читаються.

Порядок пошуку значення:
  1. змінна середовища;
  2. рядок у ai-shorts-admin/.env.local (той самий файл, що й для адмінки).

    TELEGRAM_BOT_TOKEN   токен бота від @BotFather
    TELEGRAM_CHAT_ID     id чату для звітів про прогін
    SUPABASE_URL         або NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_KEY         або NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

Якщо чогось немає, значення порожнє: приватний .yml збереться, але прогони не
зможуть писати в Supabase / слати в Telegram, поки ключі не впишуть у Dify Studio
(Environment Variables). Публічні *.public.yml завжди без значень.
"""

import os

_ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         "..", "ai-shorts-admin", ".env.local")

# Підставляється в code-ноди публічних DSL замість реального chat id.
PLACEHOLDER_CHAT_ID = "YOUR_TELEGRAM_CHAT_ID"


def _read_env_file():
    values = {}
    try:
        with open(_ENV_FILE, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                values[key.strip()] = val.strip().strip("'\"")
    except OSError:
        pass
    return values


_FILE = _read_env_file()


def _get(*names):
    for name in names:
        val = os.environ.get(name) or _FILE.get(name)
        if val:
            return val
    return ""


TELEGRAM_TOKEN = _get("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = _get("TELEGRAM_CHAT_ID")
SUPABASE_URL = _get("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = _get("SUPABASE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
