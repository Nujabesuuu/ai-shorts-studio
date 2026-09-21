#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генератор Dify DSL для Day 3 — «Від демо до продакшну».

Один скрипт — два флоу зі спільного джерела:

  baseline  чесна перша робоча версія (3 виклики LLM на кожну одиницю ЗАВЖДИ,
            дамп усього контексту в промпт, критик переписує обʼєкт цілком)
  final     конвеєр + ітерація + умовний точковий ремонт
            (2 виклики LLM + 3-й лише для тих одиниць, які його справді потребують)

Спільне джерело потрібне саме для чесності порівняння: обидві конфігурації
читають ті самі таблиці, тим самим плагіном, тією самою моделлю. Різниця між
ними — рівно та, яку ми заявляємо в таблиці «до/після», і нічого крім неї.

Запуск:  python3 dify/build_dsl.py
Вихід:   dify/day3_baseline.yml         dify/day3_final.yml          (з ключами, gitignored)
         dify/day3_baseline.public.yml  dify/day3_final.public.yml   (без ключів, на здачу)
"""

import os
import yaml

# ─────────────────────────────────────────────────────────────────────────────
# Середовище. Значення звірені з робочим day2_app_v7_manual_5.yml, не вигадані.
# ─────────────────────────────────────────────────────────────────────────────

DSL_VERSION = "0.7.0"

PLUGIN_GEMINI = ("langgenius/gemini:0.9.5@fc6c7d17b0852db57e2958a4051b9c5c"
                 "517ba7934c43df8536c43b9ecbded514")
PLUGIN_SUPABASE = ("langgenius/supabase:0.1.5@c841812a6a53609af8fa16e0ce238399"
                   "b447ca797637d7d4cbdc57c8c1058275")
MODEL_PROVIDER = "langgenius/gemini/google"
MODEL_NAME = "gemini-3.5-flash-lite"

# Іконку плагіна Dify підставляє сам, але в експорті Day 2 вона присутня —
# тримаємо форму ноди ідентичною робочій, щоб не шукати різницю після імпорту.
SUPABASE_ICON = (
    "https://cloud.dify.ai/console/api/workspaces/current/plugin/icon"
    "?tenant_id=67bfc09d-1d97-4c21-b4e7-fbb1e72f685b"
    "&filename=6239d130d5b7cbd43ca28b8fc2c08cccbe1440495aae395a8b8c31f0a086c149.svg"
)

# Секрети не зберігаються в коді: див. dify/config.py (змінні середовища або
# ai-shorts-admin/.env.local).
#
# Запис у БД іде прямим викликом PostgREST, а не через LLM-агента (див. ноду
# «Запис у day3_content»). RLS вимкнено, тому publishable-ключа достатньо.
from config import (PLACEHOLDER_CHAT_ID, SUPABASE_KEY, SUPABASE_URL,
                    TELEGRAM_CHAT_ID, TELEGRAM_TOKEN)

OUT_DIR = os.path.dirname(os.path.abspath(__file__))


def model(temperature, max_tokens=None):
    """Конфіг моделі для llm-ноди. max_tokens ставимо лише там, де він — важіль."""
    params = {"temperature": temperature}
    if max_tokens is not None:
        params["max_tokens"] = max_tokens
    return {"completion_params": params, "mode": "chat",
            "name": MODEL_NAME, "provider": MODEL_PROVIDER}


# ─────────────────────────────────────────────────────────────────────────────
# Дрібні конструктори — щоб позиції й службові поля не роз'їжджалися вручну
# ─────────────────────────────────────────────────────────────────────────────

def node(nid, data, x, y, width=244, height=100, parent=None, extra=None):
    n = {
        "data": data,
        "height": height,
        "id": nid,
        "position": {"x": x, "y": y},
        "positionAbsolute": {"x": x, "y": y},
        "selected": False,
        "sourcePosition": "right",
        "targetPosition": "left",
        "type": "custom",
        "width": width,
        "zIndex": 0,
    }
    if parent:
        pid, px, py = parent
        n["parentId"] = pid
        n["positionAbsolute"] = {"x": px + x, "y": py + y}
        n["zIndex"] = 1001
    if extra:
        n.update(extra)
    return n


def edge(src, tgt, src_type, tgt_type, handle="source", iteration_id=None):
    data = {"isInIteration": bool(iteration_id), "isInLoop": False,
            "sourceType": src_type, "targetType": tgt_type}
    if iteration_id:
        data["iteration_id"] = iteration_id
    return {
        "data": data,
        "id": "%s-%s-%s-target" % (src, handle, tgt),
        "source": src,
        "sourceHandle": handle,
        "target": tgt,
        "targetHandle": "target",
        "type": "custom",
        "zIndex": 1001 if iteration_id else 0,
    }


def out(**kinds):
    """outputs code-ноди: name → {children: None, type: ...}"""
    return {k: {"children": None, "type": v} for k, v in kinds.items()}


def cvar(name, node_id, field, vtype):
    """Елемент variables code-ноди."""
    sel = [node_id] + (field if isinstance(field, list) else [field])
    return {"value_selector": sel, "value_type": vtype, "variable": name}


def get_rows_node(nid, title, desc, table, filter_value, limit, x, y):
    """
    tool-нода Supabase «Get Rows».

    paramSchemas дублює те, що плагін віддає сам — Dify зберігає його в DSL,
    і без нього імпортована нода приїжджає без полів. Скопійовано 1:1 зі
    структури робочого Day 2.
    """
    def schema(name, req, ptype, en, hint):
        return {
            "auto_generate": None, "default": None, "form": "llm",
            "human_description": {"en_US": en, "ja_JP": en, "pt_BR": en, "zh_Hans": en},
            "input_schema": None,
            "label": {"en_US": name.title(), "ja_JP": name.title(),
                      "pt_BR": name.title(), "zh_Hans": name.title()},
            "llm_description": hint, "max": None, "min": None, "multiple": False,
            "name": name, "options": [], "placeholder": None, "precision": None,
            "required": req, "scope": None, "template": None, "type": ptype,
        }

    data = {
        "default_value": [{"key": "text", "type": "string", "value": ""},
                          {"key": "json", "type": "array[object]", "value": "[]"}],
        "desc": desc,
        "error_strategy": "default-value",
        "is_team_authorization": True,
        "paramSchemas": [
            schema("table", True, "string", "The name of the table to query.",
                   "Provide the name of the table you want to query in Supabase."),
            schema("limit", False, "number", "Maximum number of rows to return.",
                   "Specify how many rows you want to retrieve. Default is 10."),
            schema("filter", False, "string", "Optional filter condition (e.g., 'status=active').",
                   "Provide a filter condition if needed. (e.g., 'status=active')"),
        ],
        "params": {"filter": "", "limit": "", "table": ""},
        "plugin_id": "langgenius/supabase",
        "plugin_unique_identifier": PLUGIN_SUPABASE,
        "provider_icon": SUPABASE_ICON,
        "provider_id": "langgenius/supabase/supabase",
        "provider_name": "langgenius/supabase/supabase",
        "provider_show_name": "Supabase",
        "provider_type": "builtin",
        "retry_config": {"max_retries": 2, "retry_enabled": True, "retry_interval": 1000},
        "selected": False,
        "title": title,
        "tool_configurations": {},
        "tool_description": "Get rows from a specified table in Supabase.",
        "tool_label": "Get Rows",
        "tool_name": "get_rows",
        "tool_node_version": "2",
        "tool_parameters": {
            "filter": {"type": "mixed", "value": filter_value},
            "limit": {"type": "constant", "value": limit},
            "table": {"type": "mixed", "value": table},
        },
        "type": "tool",
    }
    return node(nid, data, x, y, height=87, width=241)


def telegram_node(nid, title, desc, payload_ref, x, y):
    data = {
        "authorization": {"config": None, "type": "no-auth"},
        "body": {"data": [{"id": "tg-" + nid, "key": "", "type": "text",
                           "value": payload_ref}], "type": "json"},
        "default_value": [{"key": "body", "type": "string", "value": ""},
                          {"key": "status_code", "type": "number", "value": 0},
                          {"key": "headers", "type": "object", "value": "{}"}],
        "desc": desc,
        "error_strategy": "default-value",
        "headers": "Content-Type: application/json",
        "method": "post",
        "params": "",
        "retry_config": {"max_retries": 2, "retry_enabled": True, "retry_interval": 1000},
        "selected": False,
        "timeout": {"connect": 10, "read": 20, "write": 10},
        "title": title,
        "type": "http-request",
        "url": "https://api.telegram.org/bot{{#env.TELEGRAM_BOT_TOKEN#}}/sendMessage",
        "variables": [],
    }
    return node(nid, data, x, y, height=100)


# ─────────────────────────────────────────────────────────────────────────────
# Спільні шматки Python-коду для code-нод
# ─────────────────────────────────────────────────────────────────────────────

ROWS_HELPER = r'''
def _collect(src):
    """Розгортає обгортку {"data": [...]}, яку плагін іноді додає навколо рядків."""
    rows = []
    if isinstance(src, dict):
        src = [src]
    if not isinstance(src, list):
        return rows
    for el in src:
        if not isinstance(el, dict):
            continue
        data = el.get("data")
        if isinstance(data, list):
            rows.extend([r for r in data if isinstance(r, dict)])
        elif isinstance(data, dict):
            rows.append(data)
        elif el:
            rows.append(el)
    return rows


def _rows(js, txt):
    """
    Плагін Supabase віддає рядки то як [{...}], то як [{"data":[...]}],
    то лише текстом. Розбираємо всі три випадки — інакше флоу тихо
    працює на порожньому списку і ніхто цього не помічає.
    """
    import json
    rows = _collect(js)
    if not rows and isinstance(txt, str) and txt.strip().startswith(("[", "{")):
        try:
            rows = _collect(json.loads(txt))
        except Exception:
            rows = []
    return rows
'''

# Нормалізація ніші + тригramна схожість. Логіка перевірена на реальних нішах
# у Day 2: «кава»→кавʼярня, «фитнес»→Фітнес ловляться, «покемони» — ні.
NICHE_HELPER = r'''
import re

UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def _norm(s):
    return re.sub(r"[^0-9a-zа-яїієґё]+", "", str(s or "").lower())


def _tri(s):
    n = _norm(s)
    if len(n) < 3:
        return {n} if n else set()
    return {n[i:i + 3] for i in range(len(n) - 2)}


def _similarity(a, b):
    na, nb = _norm(a), _norm(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    if len(na) >= 4 and na in nb:
        return 1.0
    if len(nb) >= 4 and nb in na:
        return 1.0
    ta, tb = _tri(a), _tri(b)
    if not ta or not tb:
        return 0.0
    short = ta if len(ta) <= len(tb) else tb
    return len(ta & tb) / float(len(short))
'''


CODE_RESOLVE = NICHE_HELPER + ROWS_HELPER + r'''
NO_MATCH_UUID = "00000000-0000-0000-0000-000000000000"
MATCH_THRESHOLD = 0.5


def main(projects_json, projects_text, niche, platform):
    projects = [p for p in _rows(projects_json, projects_text)
                if p.get("id") and UUID_RE.match(str(p.get("id")))]
    available = sorted({str(p.get("niche") or "").strip()
                        for p in projects if p.get("niche")})

    typed = (niche or "").strip()
    best, best_score = None, 0.0
    for p in projects:
        sc = _similarity(typed, p.get("niche"))
        if sc > best_score:
            best, best_score = p, sc

    if typed and best is not None and best_score >= MATCH_THRESHOLD:
        pid = str(best["id"])
        filter_pid = pid
        resolved = str(best.get("niche") or typed)
        note = ("Ніша «%s» → проєкт «%s» (схожість %.2f)."
                % (typed, resolved, best_score))
        matched = "niche"
    else:
        # Ніші немає серед проєктів. Флоу НЕ падає: працюємо холодним стартом.
        # У фільтр іде неіснуючий uuid, щоб свідомо не підтягнути чужі дані,
        # а в рядки day3_content піде project_id = null (інакше впаде FK).
        pid = ""
        filter_pid = NO_MATCH_UUID
        resolved = typed or "не задана"
        note = ("Ніші «%s» немає серед проєктів%s. Холодний старт: "
                "контент буде збережено без привʼязки до проєкту."
                % (resolved, (" (є: " + ", ".join(available) + ")") if available else ""))
        matched = "cold_start"

    plat = (platform or "").strip() or "instagram"

    return {
        "project_id": pid,
        "has_project": "yes" if pid else "no",
        "niche": resolved,
        "platform": plat,
        # Плагін Supabase робить cond.split("=", 1) -> query.eq(key, value),
        # тому формат саме 'column=value', а НЕ PostgREST 'column=eq.value'.
        "row_filter": "project_id=" + filter_pid,
        "matched_by": matched,
        "resolve_note": note,
        "available_niches": ", ".join(available) if available else "—",
    }
'''


CODE_PREPARE = ROWS_HELPER + r'''
import json

# Холодний старт: кути подачі, а не готовий контент. Наповнення все одно
# генерує модель під конкретну нішу — це лише каркас, щоб флоу не падав
# на порожній базі.
COLD_ANGLES = [
    {"angle": "закулісся процесу", "why": "показати те, чого клієнт не бачить"},
    {"angle": "поширена помилка аудиторії", "why": "корисність + впізнаваність"},
    {"angle": "порівняння двох варіантів", "why": "готовий візуальний конфлікт"},
    {"angle": "історія одного клієнта", "why": "емоція і соціальний доказ"},
    {"angle": "розбір ціни або складу", "why": "чесність зчитується як довіра"},
]


def _clean(s, limit=400):
    return str(s or "").strip()[:limit]


def main(topics_json, topics_text, trends_json, trends_text,
         content_json, content_text, niche, platform, formats, n_items):
    topics = _rows(topics_json, topics_text)
    trends = _rows(trends_json, trends_text)
    existing = _rows(content_json, content_text)

    try:
        want = int(float(n_items))
    except Exception:
        want = 4
    want = max(1, min(want, 12))

    fmt_list = [f.strip().lower() for f in str(formats or "").split(",") if f.strip()]
    fmt_list = [f for f in fmt_list if f in ("reels", "carousel", "stories")]
    if not fmt_list:
        fmt_list = ["reels", "carousel", "stories"]

    # Антидубль: назви вже наявного контенту + вже покриті теми/тренди.
    banned = [str(r.get("title") or "").strip() for r in existing if r.get("title")]
    used_topics = {str(r.get("topic_id")) for r in existing if r.get("topic_id")}
    used_trends = {str(r.get("source_trend_id")) for r in existing if r.get("source_trend_id")}

    briefs = []

    # ── Джерело 1: затверджені теми Day 2 (основний шлях)
    fresh_topics = [t for t in topics
                    if str(t.get("id")) not in used_topics
                    and str(t.get("status") or "approved") in ("approved", "ready")]
    source = ""
    if fresh_topics:
        source = "day2_topics"
        for i, t in enumerate(fresh_topics[:want]):
            briefs.append({
                "idx": i,
                "source_kind": "day2_topics",
                "topic_id": str(t.get("id")) if t.get("id") else "",
                "trend_id": str(t.get("source_trend_id")) if t.get("source_trend_id") else "",
                "seed_title": _clean(t.get("title"), 140),
                "seed_body": _clean(t.get("text")),
                "seed_hook": "",
                "seed_format": "",
            })

    # ── Джерело 2: тренди Day 1 (резерв, коли Day 2 ще не проходив)
    if not briefs:
        fresh_trends = [t for t in trends if str(t.get("id")) not in used_trends]
        pool = fresh_trends or trends
        if pool:
            source = "day1_trends"
            for i, t in enumerate(pool[:want]):
                briefs.append({
                    "idx": i,
                    "source_kind": "day1_trends",
                    "topic_id": "",
                    "trend_id": str(t.get("id")) if t.get("id") else "",
                    "seed_title": _clean(t.get("title"), 140),
                    "seed_body": _clean(t.get("description")),
                    "seed_hook": _clean(t.get("hook_idea"), 200),
                    "seed_format": _clean(t.get("format"), 200),
                })

    # ── Джерело 3: холодний старт (ніші немає в базі взагалі)
    if not briefs:
        source = "cold_start"
        for i in range(want):
            a = COLD_ANGLES[i % len(COLD_ANGLES)]
            briefs.append({
                "idx": i,
                "source_kind": "cold_start",
                "topic_id": "",
                "trend_id": "",
                "seed_title": a["angle"],
                "seed_body": a["why"],
                "seed_hook": "",
                "seed_format": "",
            })

    # Формати роздаємо по колу — щоб один прогін давав різні типи публікацій,
    # а не чотири однакові Reels.
    for b in briefs:
        b["format"] = fmt_list[b["idx"] % len(fmt_list)]
        b["niche"] = niche
        b["platform"] = platform
        b["banned_titles"] = banned[:10]

    notice = ""
    if source == "cold_start":
        notice = ("У базі немає ні тем Day 2, ні трендів Day 1 для цієї ніші — "
                  "працюємо холодним стартом, привʼязки до джерела не буде.")
    elif source == "day1_trends":
        notice = ("Затверджених тем Day 2 для цієї ніші немає — "
                  "спираємось напряму на тренди Day 1.")

    return {
        "briefs": briefs,
        "count": len(briefs),
        "source": source,
        "notice": notice,
        "gate": "ok" if briefs else "empty",
        "debug": ("topics=%d trends=%d existing=%d -> briefs=%d src=%s"
                  % (len(topics), len(trends), len(existing), len(briefs), source)),
    }
'''


# Збірка однієї одиниці всередині ітерації: драфт + вердикт + (можливо) патч.
CODE_ASSEMBLE = r'''
def _obj(x):
    import json
    if isinstance(x, dict):
        return x
    if isinstance(x, str) and x.strip().startswith("{"):
        try:
            return json.loads(x)
        except Exception:
            return {}
    return {}


def main(draft, verdict, merged, brief):
    """
    merged — вихід variable-aggregator: або патч від ремонтника (має ключ
    "patch"), або вердикт критика (якщо ремонт не запускався). Наявність
    ключа "patch" і є ознакою того, що гілка ремонту відпрацювала.
    """
    d = dict(_obj(draft))
    v = _obj(verdict)
    m = _obj(merged)
    b = _obj(brief)

    repaired = False
    patch = m.get("patch")
    if isinstance(patch, dict) and patch:
        for k, val in patch.items():
            if val not in (None, "", [], {}):
                d[k] = val
        repaired = True

    scores = v.get("scores") or {}
    item = {
        "format": d.get("format") or b.get("format") or "reels",
        "title": d.get("title") or "",
        "hook": d.get("hook") or "",
        "hook_alt": d.get("hook_alt") or "",
        "script": d.get("script") or [],
        "onscreen_text": d.get("onscreen_text") or "",
        "caption": d.get("caption") or "",
        "hashtags": d.get("hashtags") or [],
        "cta": d.get("cta") or "",
        "duration_sec": d.get("duration_sec") or 0,
        "scores": scores,
        "verdict": v.get("verdict") or "pass",
        "repaired": repaired,
        "topic_id": b.get("topic_id") or "",
        "trend_id": b.get("trend_id") or "",
        "source_kind": b.get("source_kind") or "",
    }
    return {"item": item}
'''


# Зважений скоринг рубрики — детерміністично, поза моделлю.
CODE_SCORE = r'''
import json

WEIGHTS = {
    "traceability": 25,
    "production_ready": 25,
    "hook": 20,
    "format_fit": 15,
    "uniqueness": 15,
}
CRITERIA = list(WEIGHTS.keys())

# Стеля 95. Вище — лише коли evidence містить дослівну цитату з драфту.
# Це прямий фікс інфляції оцінок: у попередньому прогоні критик поставив
# 100/100/91/100, тобто рубрика не розрізняла нічого.
SOFT_CAP = 95
MIN_EVIDENCE_FOR_TOP = 24

READY_AT = 85
REVIEW_AT = 70


def _num(x, default=0.0):
    try:
        return float(x)
    except Exception:
        return default


def _score_of(entry):
    """scores[criterion] може бути {score, evidence} або просто числом."""
    if isinstance(entry, dict):
        return _num(entry.get("score")), str(entry.get("evidence") or "")
    return _num(entry), ""


MODEL_NAME = "{{MODEL_NAME}}"


def main(items, project_id, run_id, niche, platform, flow_version):
    rows = []
    per_criterion = {c: [] for c in CRITERIA}
    totals = []
    repaired_n = 0
    warnings = []

    for it in (items or []):
        if not isinstance(it, dict):
            continue
        inner = it.get("item") if isinstance(it.get("item"), dict) else it
        raw = inner.get("scores") or {}

        quality = {}
        weighted = 0.0
        for c in CRITERIA:
            sc, ev = _score_of(raw.get(c))
            sc = max(0.0, min(100.0, sc))
            if sc > SOFT_CAP and len(ev.strip()) < MIN_EVIDENCE_FOR_TOP:
                sc = SOFT_CAP
                warnings.append("%s: бал вище %d без доказу — зрізано"
                                % (c, SOFT_CAP))
            quality[c] = {"score": round(sc, 2), "evidence": ev[:400]}
            per_criterion[c].append(sc)
            weighted += sc * WEIGHTS[c]

        total = round(weighted / 100.0, 2)
        totals.append(total)

        if total >= READY_AT:
            status = "ready"
        elif total >= REVIEW_AT:
            status = "needs_review"
        else:
            status = "rejected"

        script = inner.get("script") or []
        if not isinstance(script, list):
            script = []
        if not script:
            warnings.append("порожній script у «%s»" % (inner.get("title") or "?"))

        tags = inner.get("hashtags") or []
        tags = ["#" + str(t).lstrip("#") for t in tags if str(t).strip()]

        fmt = str(inner.get("format") or "reels").lower()
        if fmt not in ("reels", "carousel", "stories"):
            fmt = "reels"

        dur = int(_num(inner.get("duration_sec"), 0))
        if dur and (dur < 3 or dur > 900):
            dur = max(3, min(dur, 900))

        if inner.get("repaired"):
            repaired_n += 1

        row = {
            "project_id": project_id or None,
            "topic_id": inner.get("topic_id") or None,
            "source_trend_id": inner.get("trend_id") or None,
            "run_id": run_id,
            "niche": niche,
            "platform": platform,
            "format": fmt,
            "title": str(inner.get("title") or "")[:200],
            "hook": inner.get("hook") or None,
            "hook_alt": inner.get("hook_alt") or None,
            "script": script,
            "onscreen_text": inner.get("onscreen_text") or None,
            "caption": inner.get("caption") or None,
            "hashtags": tags,
            "cta": inner.get("cta") or None,
            "duration_sec": dur or None,
            "quality": quality,
            "quality_score": total,
            "repaired": bool(inner.get("repaired")),
            "status": status,
            "model": MODEL_NAME,
            "flow_version": flow_version,
        }
        rows.append(row)

    avg = round(sum(totals) / len(totals), 2) if totals else 0.0
    by_crit = {c: round(sum(v) / len(v), 2) if v else 0.0
               for c, v in per_criterion.items()}

    return {
        "rows_json": json.dumps(rows, ensure_ascii=False),
        "count": len(rows),
        "gate": "ok" if rows else "empty",
        "avg_score": avg,
        "repaired_count": repaired_n,
        "by_criterion": json.dumps(by_crit, ensure_ascii=False),
        "warnings": " · ".join(sorted(set(warnings))[:6]) or "—",
    }
'''


CODE_VERIFY = ROWS_HELPER + r'''
import json


def _esc(v):
    """
    Екранування під parse_mode=HTML.

    Раніше звіт ішов у legacy Markdown і Telegram відповідав 400
    «can't parse entities»: у тексті є назви критеріїв format_fit,
    production_ready і поле run_id — непарні підкреслення відкривають
    курсив, який нема чим закрити. MarkdownV2 вимагав би екранувати
    півтора десятка символів; HTML — рівно три.
    """
    return (str(v).replace("&", "&amp;")
                  .replace("<", "&lt;")
                  .replace(">", "&gt;"))


def main(saved_json, saved_text, sent_json, run_id, avg_score, by_criterion,
         source, notice, flow_version):
    saved = _rows(saved_json, saved_text)
    try:
        sent = json.loads(sent_json) if isinstance(sent_json, str) else (sent_json or [])
    except Exception:
        sent = []

    saved_titles = {str(r.get("title") or "").strip() for r in saved}
    sent_titles = [str(r.get("title") or "").strip() for r in sent]
    missing = [t for t in sent_titles if t and t not in saved_titles]

    n_sent, n_saved = len(sent_titles), len(saved)
    ok = n_sent > 0 and not missing

    try:
        crit = json.loads(by_criterion) if isinstance(by_criterion, str) else (by_criterion or {})
    except Exception:
        crit = {}
    crit_line = " · ".join("%s %s" % (k, v) for k, v in sorted(crit.items())) or "—"

    # Плоский звіт — у вихід воркфлоу й в адмінку.
    plain = [
        "Day 3 · %s" % flow_version,
        "Джерело: %s" % (source or "—"),
        "Згенеровано: %d · збережено: %d" % (n_sent, n_saved),
        "Середній бал: %s" % avg_score,
        "По критеріях: %s" % crit_line,
        "run_id: %s" % run_id,
    ]
    # Розмічений — окремо, лише для Telegram.
    rich = [
        "<b>Day 3 · %s</b>" % _esc(flow_version),
        "Джерело: <code>%s</code>" % _esc(source or "—"),
        "Згенеровано: <b>%d</b> · збережено: <b>%d</b>" % (n_sent, n_saved),
        "Середній бал: <b>%s</b>" % _esc(avg_score),
        "По критеріях: %s" % _esc(crit_line),
        "run_id: <code>%s</code>" % _esc(run_id),
    ]
    if missing:
        joined = ", ".join(missing[:5])
        plain.append("⚠️ Не збереглося: " + joined)
        rich.append("⚠️ Не збереглося: " + _esc(joined))
    if notice:
        plain.append(notice)
        rich.append("<i>%s</i>" % _esc(notice))

    report = "\n".join(plain)

    payload = json.dumps({
        "chat_id": "{{CHAT_ID}}",
        "text": "\n".join(rich),
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }, ensure_ascii=False)

    return {
        "saved": n_saved,
        "sent": n_sent,
        "missing": ", ".join(missing) if missing else "—",
        "all_saved": "yes" if ok else "no",
        "report_md": report,
        "tg_payload": payload,
    }
'''


# ─────────────────────────────────────────────────────────────────────────────
# JSON-схеми типізованих hand-off'ів
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_ITEM = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "n": {"type": "number", "description": "Порядковий номер кадру або слайда, з 1"},
        "t_start": {"type": "number", "description": "Початок кадру в секундах; для carousel — 0"},
        "t_end": {"type": "number", "description": "Кінець кадру в секундах; для carousel — 0"},
        "visual": {"type": "string", "description": "Що конкретно в кадрі: предмет, дія, ракурс"},
        "voiceover": {"type": "string", "description": "Дослівна репліка або текст слайда"},
    },
    "required": ["n", "t_start", "t_end", "visual", "voiceover"],
}

DRAFT_PROPS = {
    "format": {"type": "string", "enum": ["reels", "carousel", "stories"],
               "description": "Формат публікації — беремо той, що заданий у брифі"},
    "title": {"type": "string", "maxLength": 90,
              "description": "Робоча назва одиниці контенту, без емодзі"},
    "hook": {"type": "string",
             "description": "Дослівна перша фраза або дія в перші 0-3 секунди, до 12 слів"},
    "hook_alt": {"type": "string",
                 "description": "Інший захід на ту саму ідею: інша емоція чи ракурс, не перефразування"},
    "script": {"type": "array", "minItems": 3, "maxItems": 8, "items": SCRIPT_ITEM,
               "description": "Кадри для reels/stories або слайди для carousel"},
    "onscreen_text": {"type": "string", "description": "Текст, що зʼявляється на екрані"},
    "caption": {"type": "string", "description": "Підпис під публікацією"},
    "hashtags": {"type": "array", "minItems": 3, "maxItems": 8, "items": {"type": "string"},
                 "description": "Хештеги з решіткою, релевантні ніші й місту"},
    "cta": {"type": "string", "description": "Заклик до дії у фіналі"},
    "duration_sec": {"type": "number", "description": "Тривалість у секундах; для carousel — 0"},
}

SCHEMA_DRAFT = {
    "type": "object",
    "additionalProperties": False,
    "properties": DRAFT_PROPS,
    "required": list(DRAFT_PROPS.keys()),
}

CRITERIA_DESC = {
    "traceability": "Чи справді контент про свій тренд або тему з брифа",
    "production_ready": "Чи можна знімати без додаткових питань",
    "hook": "Сила перших 0-3 секунд",
    "format_fit": "Відповідність заданому формату і платформі",
    "uniqueness": "Чи не дублює вже наявні заголовки проєкту",
}

SCHEMA_VERDICT = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "scores": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                c: {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "score": {"type": "number", "description": "0-100"},
                        "evidence": {"type": "string",
                                     "description": "Дослівна цитата з драфту, що обґрунтовує бал"},
                    },
                    "required": ["score", "evidence"],
                    "description": d,
                } for c, d in CRITERIA_DESC.items()
            },
            "required": list(CRITERIA_DESC.keys()),
        },
        "verdict": {"type": "string", "enum": ["pass", "repair", "reject"],
                    "description": "pass — усі критерії >= 75; repair — щось нижче 75 і лагодиться точково; reject — контент не про цю нішу"},
        "fix_list": {
            "type": "array", "maxItems": 4,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "field": {"type": "string",
                              "description": "Назва поля драфту: title|hook|hook_alt|script|onscreen_text|caption|hashtags|cta|duration_sec|format"},
                    "problem": {"type": "string", "description": "Що конкретно не так"},
                    "instruction": {"type": "string", "description": "Що зробити, одним реченням"},
                },
                "required": ["field", "problem", "instruction"],
            },
            "description": "Тільки для критеріїв нижче 75. Порожній масив, якщо verdict = pass",
        },
    },
    "required": ["scores", "verdict", "fix_list"],
}

SCHEMA_PATCH = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "patch": {
            "type": "object",
            "additionalProperties": False,
            "properties": DRAFT_PROPS,
            "description": "ЛИШЕ ті поля, що згадані у fix_list. Решту не повертати.",
        },
        "note": {"type": "string", "description": "Що саме змінено, одним реченням"},
    },
    "required": ["patch", "note"],
}


# ─────────────────────────────────────────────────────────────────────────────
# Промпти
# ─────────────────────────────────────────────────────────────────────────────

PROMPT_PRODUCER = """Ти — контент-продюсер, який готує готові до зйомки одиниці контенту \
для соцмереж конкретного бізнесу.

ВХІД: один бриф — тема або тренд, ніша, платформа і ЗАДАНИЙ формат.

ЖОРСТКІ ПРАВИЛА
1. Формат бери РІВНО той, що вказано в брифі полем «ФОРМАТ (обовʼязковий)».
   Не підміняй його і НЕ згадуй назву іншого формату в title чи caption —
   матеріали Дня 1 могли пропонувати інший формат, вони тут не головні.
2. Структура за форматом:
   • reels — 3-6 кадрів, таймкоди без розривів, сумарно 15-45 с, duration_sec = сумі;
   • stories — 3-5 екранів по 5-7 с, таймкоди в межах кожного екрана, duration_sec = сумі;
   • carousel — 6-8 слайдів, t_start = t_end = 0, duration_sec = 0,
     visual = що на слайді, voiceover = текст слайда.
3. Кожен кадр конкретний: «крупний план портафільтра з темпером» — так,
   «показуємо атмосферу» — ні. voiceover — дослівна репліка, а не опис репліки.
4. hook — дослівна перша фраза або дія, до 12 слів, з конкретикою.
   hook_alt — принципово інший захід: інша емоція чи ракурс, не перефразування.
5. Спирайся ТІЛЬКИ на переданий бриф. Не змішуй його з іншими темами.
6. Не вигадуй фактів про бізнес: цін, імен, нагород, цифр продажів, адрес.
   Формулюй як ідею контенту, а не як твердження про заклад.
7. Якщо в брифі є список «НЕ ПОВТОРЮЙ» — жоден заголовок і жоден кут подачі
   не має його дублювати.
8. Мова — українська. Без емодзі в title.

ФОРМАТ ВІДПОВІДІ — строго JSON за наданою схемою, без пояснень навколо."""

PROMPT_CRITIC = """Ти — незалежний редактор. Ти НЕ переписуєш контент і НЕ генеруєш новий. \
Ти ставиш бали за рубрикою і, якщо треба, даєш точкові інструкції на виправлення.

РУБРИКА — 5 критеріїв, кожен 0-100.

1. traceability — чи справді контент про свій тренд/тему з брифа.
   Стеля 60, якщо в evidence немає дослівної цитати з драфту, яка це доводить.
2. production_ready — чи можна знімати без додаткових питань.
   Стеля 60, якщо хоч в одному кадрі немає таймкоду, візуалу або войсоверу.
3. hook — сила перших 0-3 секунд.
   Стеля 55, якщо хук — загальна фраза без конкретики
   («смачна кава», «неймовірна атмосфера»).
4. format_fit — відповідність заданому формату і платформі.
   Стеля 50, якщо кількість кадрів/слайдів або тривалість не в межах формату
   (reels 3-6 кадрів 15-45 с · stories 3-5 екранів · carousel 6-8 слайдів).
5. uniqueness — чи не дублює заголовки зі списку «НЕ ПОВТОРЮЙ».
   Стеля 40 при збігу кута подачі, навіть якщо формулювання інше.

ЯК СТАВИТИ БАЛИ
• За замовчуванням стеля 95. Бал 96-100 дозволений ЛИШЕ тоді, коли evidence
  містить дослівну цитату з драфту, яка беззаперечно доводить критерій.
• evidence — це цитата з драфту, а не переказ твоєї думки. Без цитати бал ріжеться.
• Сумніваєшся — став нижче. Завищений бал тут коштує дорожче, ніж занижений:
  поганий контент піде в зйомку.
• Не став усім критеріям однаковий бал. Якщо всі пʼять збіглися — перевір ще раз.

ВЕРДИКТ
• pass — усі пʼять критеріїв >= 75.
• repair — хоч один < 75, але це лагодиться зміною окремих полів.
• reject — контент не про цю нішу або не про цей бриф взагалі.

fix_list заповнюй ТІЛЬКИ для критеріїв нижче 75, максимум 4 пункти,
і в полі field вказуй точну назву поля драфту.

ФОРМАТ ВІДПОВІДІ — строго JSON за наданою схемою."""

PROMPT_REPAIR = """Ти — редактор точкових правок. Тобі дають драфт і список виправлень.

ПРАВИЛА
1. Повертай у patch ЛИШЕ ті поля, які згадані у fix_list. Жодного поля більше.
2. Не переписуй контент цілком і не «покращуй» те, про що не просили.
3. Виправлене поле має усувати саме ту проблему, що описана в fix_list.
4. Якщо правиш script — повертай масив кадрів ПОВНІСТЮ, зі збереженням
   таймкодів і нумерації, бо це поле замінюється цілком.
5. Мова — українська.

ФОРМАТ ВІДПОВІДІ — строго JSON за наданою схемою."""

# Baseline навмисно робить усе однією нодою: генерує і сам себе перевіряє.
# Саме цей «самоконтроль» ми потім і зрізаємо на користь незалежного критика.
PROMPT_PRODUCER_BASELINE = PROMPT_PRODUCER + """

САМОПЕРЕВІРКА: перш ніж віддати відповідь, перечитай свій драфт і переконайся,
що він відповідає брифу, формату й ніші. Опиши в полі self_check, що ти перевірив
і що виправив у процесі."""

PROMPT_CRITIC_BASELINE = """Ти — редактор. Тобі дають бриф і драфт одиниці контенту.

Оціни драфт за пʼятьма критеріями (traceability, production_ready, hook,
format_fit, uniqueness), кожен 0-100, і ПОВЕРНИ ВИПРАВЛЕНУ ВЕРСІЮ ДРАФТУ
ЦІЛКОМ — усі поля, навіть ті, які не змінював.

ФОРМАТ ВІДПОВІДІ — строго JSON за наданою схемою."""

PROMPT_POLISH_BASELINE = """Ти — фінальний коректор. Тобі дають готову одиницю контенту.

Причеши формулювання, вирівняй тон, прибери канцелярит і повтори.
Поверни обʼєкт ЦІЛКОМ, усі поля, навіть незмінені.

ФОРМАТ ВІДПОВІДІ — строго JSON за наданою схемою."""


# ─────────────────────────────────────────────────────────────────────────────
# Шаблони брифа
# ─────────────────────────────────────────────────────────────────────────────

# final: у промпт летить рівно один бриф і нічого зайвого.
TEMPLATE_COMPACT = """### Бриф
Ніша: {{ arg1.niche }}
Платформа: {{ arg1.platform }}
ФОРМАТ (обовʼязковий): {{ arg1.format }}
Джерело: {{ arg1.source_kind }}

Тема: {{ arg1.seed_title }}
{% if arg1.seed_body %}Контекст: {{ arg1.seed_body }}
{% endif %}{% if arg1.seed_hook %}Хук із Дня 1: "{{ arg1.seed_hook }}"
{% endif %}{% if arg1.seed_format %}Підказка стилю зйомки з Дня 1: {{ arg1.seed_format }}
(це підказка ПРО ПОДАЧУ. Якщо в ній згадано інший формат чи хронометраж —
ігноруй їх: формат задано вище і він головніший.)
{% endif %}{% if arg1.banned_titles %}
НЕ ПОВТОРЮЙ ці заголовки:
{% for t in arg1.banned_titles %}- {{ t }}
{% endfor %}{% endif %}{% if arg1.source_kind == 'cold_start' %}
УВАГА: тем і трендів у базі немає. Головний предмет — сама ніша
«{{ arg1.niche }}»: її аудиторія, лексика, реалії. Кут подачі
«{{ arg1.seed_title }}» — лише каркас.
{% endif %}"""

# baseline: у промпт летить весь контекст «про всяк випадок» — саме те, що
# потім зріжемо на iter 1.
TEMPLATE_DUMP = """### Матеріали проєкту (повний контекст)
Ніша: {{ arg1.niche }}
Платформа: {{ arg1.platform }}
Формат: {{ arg1.format }}

Опрацьовуємо тему: {{ arg1.seed_title }}
Контекст теми: {{ arg1.seed_body }}
Хук: {{ arg1.seed_hook }}
Підказка формату: {{ arg1.seed_format }}

--- УСІ ТЕМИ DAY 2 У ПРОЄКТІ ---
{{ arg2 }}

--- УСІ ТРЕНДИ DAY 1 У ПРОЄКТІ ---
{{ arg3 }}

--- УЖЕ ЗГЕНЕРОВАНИЙ КОНТЕНТ ПРОЄКТУ ---
{{ arg4 }}

Використай ці матеріали, щоб зрозуміти контекст ніші, і зроби одиницю
контенту на тему «{{ arg1.seed_title }}»."""


# ─────────────────────────────────────────────────────────────────────────────
# Каркас застосунку
# ─────────────────────────────────────────────────────────────────────────────

FEATURES = {
    "file_upload": {
        "allowed_file_extensions": [".JPG", ".JPEG", ".PNG", ".GIF", ".WEBP", ".SVG"],
        "allowed_file_types": ["image"],
        "allowed_file_upload_methods": ["local_file", "remote_url"],
        "enabled": False,
        "fileUploadConfig": {
            "attachment_image_file_size_limit": 2, "audio_file_size_limit": 50,
            "batch_count_limit": 5, "file_size_limit": 15, "file_upload_limit": 50,
            "image_file_batch_limit": 10, "image_file_size_limit": 10,
            "knowledge_file_size_limit": 15, "single_chunk_attachment_limit": 10,
            "video_file_size_limit": 100, "workflow_file_upload_limit": 10,
        },
        "image": {"enabled": False, "number_limits": 3,
                  "transfer_methods": ["local_file", "remote_url"]},
        "number_limits": 3,
    },
    "opening_statement": "",
    "retriever_resource": {"enabled": True},
    "sensitive_word_avoidance": {"enabled": False},
    "speech_to_text": {"enabled": False},
    "suggested_questions": [],
    "suggested_questions_after_answer": {"enabled": False},
    "text_to_speech": {"enabled": False, "language": "", "voice": ""},
}


def env_vars(with_secrets):
    return [
        {"description": "Токен бота від @BotFather. Порожній -> нотифікації просто не надсилаються.",
         "id": "e0b7c1a2-0000-4000-9000-000000000103",
         "name": "TELEGRAM_BOT_TOKEN",
         "selector": ["env", "TELEGRAM_BOT_TOKEN"],
         "value": TELEGRAM_TOKEN if with_secrets else "",
         "value_type": "string"},
        {"description": "ID чату, куди слати звіт про прогін.",
         "id": "e0b7c1a2-0000-4000-9000-000000000104",
         "name": "TELEGRAM_CHAT_ID",
         "selector": ["env", "TELEGRAM_CHAT_ID"],
         "value": TELEGRAM_CHAT_ID if with_secrets else "",
         "value_type": "string"},
        {"description": "URL проєкту Supabase, напр. https://xxxx.supabase.co (без / у кінці).",
         "id": "e0b7c1a2-0000-4000-9000-000000000105",
         "name": "SUPABASE_URL",
         "selector": ["env", "SUPABASE_URL"],
         "value": SUPABASE_URL if with_secrets else "",
         "value_type": "string"},
        {"description": "Publishable-ключ Supabase. RLS вимкнено, тому цього достатньо для вставки.",
         "id": "e0b7c1a2-0000-4000-9000-000000000106",
         "name": "SUPABASE_KEY",
         "selector": ["env", "SUPABASE_KEY"],
         "value": SUPABASE_KEY if with_secrets else "",
         "value_type": "string"},
    ]


def start_node(nid, x, y):
    data = {
        "selected": False,
        "title": "Start",
        "type": "start",
        "variables": [
            {"default": "спешелті-кав'ярня в Києві", "label": "Ніша — визначає, чиї теми й тренди беремо",
             "max_length": 120, "options": [], "required": False,
             "type": "text-input", "variable": "niche"},
            {"default": "instagram", "label": "Платформа",
             "max_length": 48, "options": ["instagram", "tiktok", "youtube"],
             "required": False, "type": "select", "variable": "platform"},
            {"default": "reels,carousel,stories", "label": "Формати через кому",
             "max_length": 64, "options": [], "required": False,
             "type": "text-input", "variable": "formats"},
            {"default": 4, "label": "Скільки одиниць контенту згенерувати",
             "max_length": 48, "options": [], "required": False,
             "type": "number", "variable": "n_items"},
            {"default": "final", "label": "Мітка прогону для бенчмарку",
             "max_length": 24, "options": ["baseline", "iter1", "iter2", "final"],
             "required": False, "type": "select", "variable": "flow_version"},
        ],
    }
    return node(nid, data, x, y, height=180, width=242)


# ─────────────────────────────────────────────────────────────────────────────
# Складання графа
# ─────────────────────────────────────────────────────────────────────────────

# Ідентифікатори нод. Тримаємо в одному місці, щоб посилання
# {{#id.field#}} і value_selector не розʼїхалися з реальними нодами.
N_START = "1787000000001"
N_GET_PROJECTS = "1787000000002"
N_RESOLVE = "1787000000003"
N_GET_TOPICS = "1787000000004"
N_GET_TRENDS = "1787000000005"
N_GET_CONTENT = "1787000000006"
N_PREPARE = "1787000000007"
N_ITER = "1787000000008"
N_ITER_START = "1787000000008start"
N_TEMPLATE = "1787000000009"
N_A1 = "1787000000010"
N_A2 = "1787000000011"
N_IF_REPAIR = "1787000000012"
N_A3 = "1787000000013"
N_AGG = "1787000000014"
N_ASSEMBLE = "1787000000015"
N_SCORE = "1787000000016"
N_IF_ROWS = "1787000000017"
N_WRITE = "1787000000018"
N_GET_SAVED = "1787000000019"
N_VERIFY = "1787000000020"
N_TG = "1787000000021"
N_END_OK = "1787000000022"
N_END_EMPTY = "1787000000023"
N_A3_BASE = "1787000000024"

ROW_Y = 480
ITER_X, ITER_Y = 2140, 300


def build(variant, with_secrets):
    """variant ∈ {'baseline', 'final'}"""
    final = variant == "final"
    nodes, edges = [], []

    # ── 1. Вхід
    nodes.append(start_node(N_START, 40, ROW_Y))

    # ── 2. Усі проєкти (без фільтра) — саме на них code-нода мапить нішу
    nodes.append(get_rows_node(
        N_GET_PROJECTS, "Get Rows (projects)",
        "Усі проєкти — щоб зіставити введену нішу з наявними.",
        "projects", "", 100, 340, ROW_Y))
    edges.append(edge(N_START, N_GET_PROJECTS, "start", "tool"))

    # ── 3. Ніша → проєкт
    nodes.append(node(N_RESOLVE, {
        "code": CODE_RESOLVE, "code_language": "python3",
        "desc": "Знаходить проєкт за нішею; якщо його немає — холодний старт без падіння.",
        "outputs": out(project_id="string", has_project="string", niche="string",
                       platform="string", row_filter="string", matched_by="string",
                       resolve_note="string", available_niches="string"),
        "selected": False, "title": "Ніша → проєкт", "type": "code",
        "variables": [
            cvar("projects_json", N_GET_PROJECTS, "json", "array[object]"),
            cvar("projects_text", N_GET_PROJECTS, "text", "string"),
            cvar("niche", N_START, "niche", "string"),
            cvar("platform", N_START, "platform", "string"),
        ],
    }, 640, ROW_Y, height=51, width=241))
    edges.append(edge(N_GET_PROJECTS, N_RESOLVE, "tool", "code"))

    # ── 4-6. Три джерела. Читаються послідовно: 0 токенів, а порядок гарантує,
    #        що фільтр уже обчислено нодою «Ніша → проєкт».
    ref_filter = "{{#%s.row_filter#}}" % N_RESOLVE
    nodes.append(get_rows_node(N_GET_TOPICS, "Get Rows (day2_topics)",
                               "Затверджені теми Дня 2 — первинне джерело брифів.",
                               "day2_topics", ref_filter, 100, 940, ROW_Y))
    edges.append(edge(N_RESOLVE, N_GET_TOPICS, "code", "tool"))

    nodes.append(get_rows_node(N_GET_TRENDS, "Get Rows (day1_trends)",
                               "Тренди Дня 1 — резервне джерело, якщо тем ще немає.",
                               "day1_trends", ref_filter, 100, 1240, ROW_Y))
    edges.append(edge(N_GET_TOPICS, N_GET_TRENDS, "tool", "tool"))

    nodes.append(get_rows_node(N_GET_CONTENT, "Get Rows (day3_content)",
                               "Уже згенерований контент — список «не повторюй» для критерію uniqueness.",
                               "day3_content", ref_filter, 100, 1540, ROW_Y))
    edges.append(edge(N_GET_TRENDS, N_GET_CONTENT, "tool", "tool"))

    # ── 7. Брифи
    nodes.append(node(N_PREPARE, {
        "code": CODE_PREPARE, "code_language": "python3",
        "desc": "Каскад джерел day2_topics → day1_trends → холодний старт, дедуп і роздача форматів.",
        "outputs": out(briefs="array[object]", count="number", source="string",
                       notice="string", gate="string", debug="string"),
        "selected": False, "title": "Prepare briefs", "type": "code",
        "variables": [
            cvar("topics_json", N_GET_TOPICS, "json", "array[object]"),
            cvar("topics_text", N_GET_TOPICS, "text", "string"),
            cvar("trends_json", N_GET_TRENDS, "json", "array[object]"),
            cvar("trends_text", N_GET_TRENDS, "text", "string"),
            cvar("content_json", N_GET_CONTENT, "json", "array[object]"),
            cvar("content_text", N_GET_CONTENT, "text", "string"),
            cvar("niche", N_RESOLVE, "niche", "string"),
            cvar("platform", N_RESOLVE, "platform", "string"),
            cvar("formats", N_START, "formats", "string"),
            cvar("n_items", N_START, "n_items", "number"),
        ],
    }, 1840, ROW_Y, height=51, width=241))
    edges.append(edge(N_GET_CONTENT, N_PREPARE, "tool", "code"))

    # ── 8. Ітерація
    iter_w = 2000 if final else 1500
    last_inner = N_ASSEMBLE if final else N_A3_BASE
    nodes.append(node(N_ITER, {
        "error_handle_mode": "remove-abnormal-output",
        "flatten_output": True,
        "height": 420,
        "is_parallel": True,
        "iterator_input_type": "array[object]",
        "iterator_selector": [N_PREPARE, "briefs"],
        "output_selector": [last_inner, "item" if final else "structured_output"],
        "output_type": "array[object]",
        "parallel_nums": 10,
        "selected": False,
        "start_node_id": N_ITER_START,
        "title": "Iteration · по брифах",
        "type": "iteration",
        "width": iter_w,
    }, ITER_X, ITER_Y, width=iter_w, height=420))
    edges.append(edge(N_PREPARE, N_ITER, "code", "iteration"))

    parent = (N_ITER, ITER_X, ITER_Y)
    nodes.append(node(N_ITER_START, {
        "desc": "", "isInIteration": True, "selected": False, "title": "", "type": "iteration-start",
    }, 24, 88, width=44, height=48, parent=parent,
        extra={"draggable": False, "selectable": False, "type": "custom-iteration-start"}))

    def inner(nid, data, x, y, h=100, w=244):
        data["isInIteration"] = True
        data["isInLoop"] = False
        data["iteration_id"] = N_ITER
        nodes.append(node(nid, data, x, y, width=w, height=h, parent=parent))

    # 8a. Бриф у текст
    inner(N_TEMPLATE, {
        "selected": False,
        "template": TEMPLATE_COMPACT if final else TEMPLATE_DUMP,
        "title": "Compact brief" if final else "Dump усього контексту",
        "type": "template-transform",
        "variables": ([{"value_selector": [N_ITER, "item"], "value_type": "object", "variable": "arg1"}]
                      if final else [
            {"value_selector": [N_ITER, "item"], "value_type": "object", "variable": "arg1"},
            {"value_selector": [N_GET_TOPICS, "text"], "value_type": "string", "variable": "arg2"},
            {"value_selector": [N_GET_TRENDS, "text"], "value_type": "string", "variable": "arg3"},
            {"value_selector": [N_GET_CONTENT, "text"], "value_type": "string", "variable": "arg4"},
        ]),
    }, 100, 88, h=51, w=241)
    edges.append(edge(N_ITER_START, N_TEMPLATE, "iteration-start", "template-transform",
                      iteration_id=N_ITER))

    # 8b. A1 · Продюсер
    a1_schema = SCHEMA_DRAFT
    if not final:
        a1_schema = {
            "type": "object", "additionalProperties": False,
            "properties": dict(DRAFT_PROPS,
                               self_check={"type": "string",
                                           "description": "Що перевірив і що виправив у процесі"}),
            "required": list(DRAFT_PROPS.keys()) + ["self_check"],
        }
    inner(N_A1, {
        "context": {"enabled": False, "variable_selector": []},
        "model": model(0.85),
        "prompt_template": [
            {"id": "a1-sys", "role": "system",
             "text": PROMPT_PRODUCER if final else PROMPT_PRODUCER_BASELINE},
            {"id": "a1-usr", "role": "user", "text": "{{#%s.output#}}" % N_TEMPLATE},
        ],
        "retry_config": {"max_retries": 3, "retry_enabled": True, "retry_interval": 1000},
        "selected": False,
        "structured_output": {"schema": a1_schema},
        "structured_output_enabled": True,
        "title": "A1 · Продюсер",
        "type": "llm",
        "vision": {"enabled": False},
    }, 360, 88, h=87)
    edges.append(edge(N_TEMPLATE, N_A1, "template-transform", "llm", iteration_id=N_ITER))

    if final:
        # 8c. A2 · Критик — лише бали й fix_list, контенту не генерує
        inner(N_A2, {
            "context": {"enabled": False, "variable_selector": []},
            "model": model(0, max_tokens=1200),
            "prompt_template": [
                {"id": "a2-sys", "role": "system", "text": PROMPT_CRITIC},
                {"id": "a2-usr", "role": "user",
                 "text": ("БРИФ:\n{{#%s.output#}}\n\nДРАФТ (JSON):\n{{#%s.structured_output#}}"
                          % (N_TEMPLATE, N_A1))},
            ],
            "retry_config": {"max_retries": 3, "retry_enabled": True, "retry_interval": 1000},
            "selected": False,
            "structured_output": {"schema": SCHEMA_VERDICT},
            "structured_output_enabled": True,
            "title": "A2 · Критик",
            "type": "llm",
            "vision": {"enabled": False},
        }, 620, 88, h=87)
        edges.append(edge(N_A1, N_A2, "llm", "llm", iteration_id=N_ITER))

        # 8d. Гілка ремонту. Умова true = «треба лагодити»; якщо вердикт з якоїсь
        #     причини не зчитався, умова хибна → ремонт не запускається, контент
        #     усе одно доїжджає до бази. Деградація безпечна.
        inner(N_IF_REPAIR, {
            "cases": [{
                "case_id": "true",
                "conditions": [{
                    "comparison_operator": "is",
                    "id": "cond-repair-1",
                    "value": "repair",
                    "varType": "string",
                    "variable_selector": [N_A2, "structured_output", "verdict"],
                }],
                "id": "true",
                "logical_operator": "and",
            }],
            "desc": "Третій виклик LLM платиться лише тими одиницями, що його потребують.",
            "selected": False,
            "title": "Потрібен ремонт?",
            "type": "if-else",
        }, 880, 88, h=126)
        edges.append(edge(N_A2, N_IF_REPAIR, "llm", "if-else", iteration_id=N_ITER))

        # 8e. A3 · Ремонтник
        inner(N_A3, {
            "context": {"enabled": False, "variable_selector": []},
            "model": model(0.3, max_tokens=1500),
            "prompt_template": [
                {"id": "a3-sys", "role": "system", "text": PROMPT_REPAIR},
                {"id": "a3-usr", "role": "user",
                 "text": ("ДРАФТ (JSON):\n{{#%s.structured_output#}}\n\n"
                          "ЩО ВИПРАВИТИ:\n{{#%s.structured_output.fix_list#}}"
                          % (N_A1, N_A2))},
            ],
            "retry_config": {"max_retries": 2, "retry_enabled": True, "retry_interval": 1000},
            "selected": False,
            "structured_output": {"schema": SCHEMA_PATCH},
            "structured_output_enabled": True,
            "title": "A3 · Ремонтник",
            "type": "llm",
            "vision": {"enabled": False},
        }, 1140, 88, h=87)
        edges.append(edge(N_IF_REPAIR, N_A3, "if-else", "llm", handle="true", iteration_id=N_ITER))

        # 8f. Злиття гілок. Перша ненульова змінна виграє: якщо ремонт був —
        #     це патч, якщо ні — вердикт критика.
        inner(N_AGG, {
            # Єдиний тип ноди, якого немає у робочому Day 2, тому форму тримаємо
            # максимально канонічною: advanced_settings присутні в експортах Dify
            # навіть у вимкненому стані.
            "advanced_settings": {"group_enabled": False, "groups": []},
            "desc": "Перша ненульова змінна виграє: був ремонт — це патч, не було — вердикт критика.",
            "output_type": "object",
            "selected": False,
            "title": "Злиття гілок",
            "type": "variable-aggregator",
            "variables": [[N_A3, "structured_output"], [N_A2, "structured_output"]],
        }, 1400, 88, h=130)
        edges.append(edge(N_A3, N_AGG, "llm", "variable-aggregator", iteration_id=N_ITER))
        edges.append(edge(N_IF_REPAIR, N_AGG, "if-else", "variable-aggregator",
                          handle="false", iteration_id=N_ITER))

        # 8g. Збірка одиниці
        inner(N_ASSEMBLE, {
            "code": CODE_ASSEMBLE, "code_language": "python3",
            "desc": "Застосовує патч і зшиває драфт з балами. 0 токенів.",
            "outputs": out(item="object"),
            "selected": False, "title": "Assemble · одиниця", "type": "code",
            "variables": [
                cvar("draft", N_A1, "structured_output", "object"),
                cvar("verdict", N_A2, "structured_output", "object"),
                cvar("merged", N_AGG, "output", "object"),
                cvar("brief", N_ITER, "item", "object"),
            ],
        }, 1660, 88, h=51, w=241)
        edges.append(edge(N_AGG, N_ASSEMBLE, "variable-aggregator", "code", iteration_id=N_ITER))
    else:
        # baseline: критик переписує обʼєкт цілком, далі ще нода-коректор.
        base_schema = {
            "type": "object", "additionalProperties": False,
            "properties": dict(
                DRAFT_PROPS,
                scores={
                    "type": "object", "additionalProperties": False,
                    "properties": {c: {"type": "number", "description": d}
                                   for c, d in CRITERIA_DESC.items()},
                    "required": list(CRITERIA_DESC.keys()),
                }),
            "required": list(DRAFT_PROPS.keys()) + ["scores"],
        }
        inner(N_A2, {
            "context": {"enabled": False, "variable_selector": []},
            "model": model(0.4),
            "prompt_template": [
                {"id": "a2-sys", "role": "system", "text": PROMPT_CRITIC_BASELINE},
                {"id": "a2-usr", "role": "user",
                 "text": ("БРИФ:\n{{#%s.output#}}\n\nДРАФТ (JSON):\n{{#%s.structured_output#}}"
                          % (N_TEMPLATE, N_A1))},
            ],
            "retry_config": {"max_retries": 3, "retry_enabled": True, "retry_interval": 1000},
            "selected": False,
            "structured_output": {"schema": base_schema},
            "structured_output_enabled": True,
            "title": "A2 · Критик-переписувач",
            "type": "llm",
            "vision": {"enabled": False},
        }, 620, 88, h=87)
        edges.append(edge(N_A1, N_A2, "llm", "llm", iteration_id=N_ITER))

        inner(N_A3_BASE, {
            "context": {"enabled": False, "variable_selector": []},
            "model": model(0.4),
            "prompt_template": [
                {"id": "a3-sys", "role": "system", "text": PROMPT_POLISH_BASELINE},
                {"id": "a3-usr", "role": "user",
                 "text": "ОБʼЄКТ (JSON):\n{{#%s.structured_output#}}" % N_A2},
            ],
            "retry_config": {"max_retries": 3, "retry_enabled": True, "retry_interval": 1000},
            "selected": False,
            "structured_output": {"schema": base_schema},
            "structured_output_enabled": True,
            "title": "A3 · Коректор",
            "type": "llm",
            "vision": {"enabled": False},
        }, 880, 88, h=87)
        edges.append(edge(N_A2, N_A3_BASE, "llm", "llm", iteration_id=N_ITER))

    # ── 9. Скоринг і рядки
    nodes.append(node(N_SCORE, {
        "code": CODE_SCORE.replace("{{MODEL_NAME}}", MODEL_NAME),
        "code_language": "python3",
        "desc": "Зважена рубрика, зріз завищених балів без доказу, збірка рядків для БД.",
        "outputs": out(rows_json="string", count="number", gate="string",
                       avg_score="number", repaired_count="number",
                       by_criterion="string", warnings="string"),
        "selected": False, "title": "Merge · score · rows", "type": "code",
        "variables": [
            cvar("items", N_ITER, "output", "array[object]"),
            cvar("project_id", N_RESOLVE, "project_id", "string"),
            # run_id — це справжній id прогону Dify. Так рядок у БД злипається
            # з конкретним прогоном у Tracing, і перевірка нижче читає рівно
            # те, що записав саме цей запуск, а не сусідній.
            cvar("run_id", "sys", "workflow_run_id", "string"),
            cvar("niche", N_RESOLVE, "niche", "string"),
            cvar("platform", N_RESOLVE, "platform", "string"),
            cvar("flow_version", N_START, "flow_version", "string"),
        ],
    }, ITER_X + iter_w + 100, ROW_Y, height=51, width=241))
    edges.append(edge(N_ITER, N_SCORE, "iteration", "code"))

    x = ITER_X + iter_w + 400

    # ── 10. Гейт
    nodes.append(node(N_IF_ROWS, {
        "cases": [{"case_id": "true",
                   "conditions": [{"comparison_operator": "is", "id": "cond-rows-1",
                                   "value": "ok", "varType": "string",
                                   "variable_selector": [N_SCORE, "gate"]}],
                   "id": "true", "logical_operator": "and"}],
        "desc": "Не будимо агента запису, якщо генерувати не було з чого.",
        "selected": False, "title": "Є що зберігати?", "type": "if-else",
    }, x, ROW_Y, height=126))
    edges.append(edge(N_SCORE, N_IF_ROWS, "code", "if-else"))
    x += 300

    # ── 11. Запис у БД: прямий bulk-insert у PostgREST.
    #
    # Тут раніше стояв LLM-агент з інструментом Create a Row, і він мовчки
    # губив рядки: модель робила 2 виклики замість 4 і вважала роботу
    # зробленою. Вставка — операція детерміністична, судження моделі їй не
    # потрібне, тож нода не купувала жодної з трьох цінностей, зате платила
    # токенами за переписування всього масиву в аргументи викликів.
    # Один POST вставляє весь масив атомарно.
    #
    # Обмеження PostgREST: у масиві всі обʼєкти мусять мати ОДНАКОВИЙ набір
    # ключів, інакше PGRST102 «All object keys must match». Нода скорингу
    # будує кожен рядок з одного літерала, тому набір ключів однаковий.
    nodes.append(node(N_WRITE, {
        "authorization": {"config": None, "type": "no-auth"},
        "body": {"data": [{"id": "sb-insert", "key": "", "type": "text",
                           "value": "{{#%s.rows_json#}}" % N_SCORE}],
                 "type": "json"},
        "default_value": [{"key": "body", "type": "string", "value": ""},
                          {"key": "status_code", "type": "number", "value": 0},
                          {"key": "headers", "type": "object", "value": "{}"}],
        "desc": "Bulk-insert усього масиву одним викликом. 0 токенів, нічого не губиться.",
        "error_strategy": "default-value",
        "headers": ("apikey: {{#env.SUPABASE_KEY#}}\n"
                    "Authorization: Bearer {{#env.SUPABASE_KEY#}}\n"
                    "Content-Type: application/json\n"
                    "Prefer: return=representation"),
        "method": "post",
        "params": "",
        "retry_config": {"max_retries": 2, "retry_enabled": True, "retry_interval": 1000},
        "selected": False,
        "timeout": {"connect": 10, "read": 40, "write": 20},
        "title": "Запис у day3_content",
        "type": "http-request",
        "url": "{{#env.SUPABASE_URL#}}/rest/v1/day3_content",
        "variables": [],
    }, x, ROW_Y, height=120, width=241))
    edges.append(edge(N_IF_ROWS, N_WRITE, "if-else", "http-request", handle="true"))
    x += 300

    # ── 12-13. Незалежна перевірка запису
    nodes.append(get_rows_node(
        N_GET_SAVED, "Get Rows (перевірка запису)",
        "Читаємо назад те, що агент нібито записав.",
        "day3_content", "run_id={{#sys.workflow_run_id#}}", 50, x, ROW_Y))
    edges.append(edge(N_WRITE, N_GET_SAVED, "http-request", "tool"))
    x += 300

    verify_code = CODE_VERIFY.replace(
        "{{CHAT_ID}}", TELEGRAM_CHAT_ID if with_secrets else PLACEHOLDER_CHAT_ID)
    nodes.append(node(N_VERIFY, {
        "code": verify_code, "code_language": "python3",
        "desc": "Звіряє надіслане з реально збереженим і готує звіт у Telegram.",
        "outputs": out(saved="number", sent="number", missing="string",
                       all_saved="string", report_md="string", tg_payload="string"),
        "selected": False, "title": "Перевірка запису", "type": "code",
        "variables": [
            cvar("saved_json", N_GET_SAVED, "json", "array[object]"),
            cvar("saved_text", N_GET_SAVED, "text", "string"),
            cvar("sent_json", N_SCORE, "rows_json", "string"),
            cvar("run_id", "sys", "workflow_run_id", "string"),
            cvar("avg_score", N_SCORE, "avg_score", "number"),
            cvar("by_criterion", N_SCORE, "by_criterion", "string"),
            cvar("source", N_PREPARE, "source", "string"),
            cvar("notice", N_PREPARE, "notice", "string"),
            cvar("flow_version", N_START, "flow_version", "string"),
        ],
    }, x, ROW_Y, height=51, width=241))
    edges.append(edge(N_GET_SAVED, N_VERIFY, "tool", "code"))
    x += 300

    # ── 14. Telegram
    nodes.append(telegram_node(N_TG, "Telegram · звіт про прогін",
                               "Скільки згенеровано, скільки збережено, середній бал.",
                               "{{#%s.tg_payload#}}" % N_VERIFY, x, ROW_Y))
    edges.append(edge(N_VERIFY, N_TG, "code", "http-request"))
    x += 300

    # ── 15-16. Виходи
    nodes.append(node(N_END_OK, {
        "desc": "", "outputs": [
            {"value_selector": [N_VERIFY, "report_md"], "variable": "report"},
            {"value_selector": [N_SCORE, "count"], "variable": "generated"},
            {"value_selector": [N_VERIFY, "saved"], "variable": "saved"},
            {"value_selector": [N_VERIFY, "missing"], "variable": "missing"},
            {"value_selector": [N_SCORE, "avg_score"], "variable": "avg_quality"},
            {"value_selector": [N_SCORE, "by_criterion"], "variable": "by_criterion"},
            {"value_selector": [N_SCORE, "repaired_count"], "variable": "repaired"},
            {"value_selector": [N_SCORE, "warnings"], "variable": "warnings"},
            {"value_selector": [N_WRITE, "status_code"], "variable": "insert_status"},
            {"value_selector": [N_PREPARE, "source"], "variable": "source"},
            {"value_selector": [N_RESOLVE, "resolve_note"], "variable": "niche_resolution"},
        ],
        "selected": False, "title": "Готово · збережено", "type": "end",
    }, x, ROW_Y, height=200))
    edges.append(edge(N_TG, N_END_OK, "http-request", "end"))

    nodes.append(node(N_END_EMPTY, {
        "desc": "", "outputs": [
            {"value_selector": [N_PREPARE, "notice"], "variable": "notice"},
            {"value_selector": [N_PREPARE, "debug"], "variable": "debug"},
            {"value_selector": [N_RESOLVE, "resolve_note"], "variable": "niche_resolution"},
            {"value_selector": [N_RESOLVE, "available_niches"], "variable": "available_niches"},
        ],
        "selected": False, "title": "Нічого не згенеровано", "type": "end",
    }, ITER_X + iter_w + 700, ROW_Y + 320, height=150))
    edges.append(edge(N_IF_ROWS, N_END_EMPTY, "if-else", "end", handle="false"))

    if final:
        title = "Day3 · Продакшн-контент (маршрутизація → продюсер → критик → точковий ремонт → day3_content)"
        desc = ("Читає затверджені теми Дня 2 (з відкатом на тренди Дня 1 і холодний старт), "
                "генерує готові до публікації одиниці контенту під reels/carousel/stories, "
                "незалежно оцінює їх за рубрикою з пʼяти критеріїв, точково лагодить лише те, "
                "що не пройшло поріг, зважує бали детерміністично і зберігає в day3_content "
                "з перевіркою факту запису.")
        icon = "🎬"
    else:
        title = "Day3 · BASELINE (генератор → критик-переписувач → коректор)"
        desc = ("Перша робоча версія для точки відліку: повний дамп контексту в промпт, "
                "три виклики LLM на кожну одиницю завжди, критик переписує обʼєкт цілком. "
                "Існує лише щоб було з чим порівнювати фінал.")
        icon = "🧪"

    return {
        "app": {"description": desc, "icon": icon, "icon_background": "#FFEAD5",
                "icon_type": "emoji", "mode": "workflow", "name": title,
                "use_icon_as_answer_icon": False},
        "dependencies": [
            {"current_identifier": None, "type": "marketplace",
             "value": {"marketplace_plugin_unique_identifier": PLUGIN_GEMINI, "version": None}},
            {"current_identifier": None, "type": "marketplace",
             "value": {"marketplace_plugin_unique_identifier": PLUGIN_SUPABASE, "version": None}},
        ],
        "kind": "app",
        "version": DSL_VERSION,
        "workflow": {
            "conversation_variables": [],
            "environment_variables": env_vars(with_secrets),
            "features": FEATURES,
            "graph": {"edges": edges, "nodes": nodes,
                      "viewport": {"x": 0, "y": 0, "zoom": 0.45}},
            "rag_pipeline_variables": [],
        },
    }


def dump(obj, path):
    with open(path, "w", encoding="utf-8") as f:
        yaml.safe_dump(obj, f, allow_unicode=True, sort_keys=True,
                       default_flow_style=False, width=140)
    return path


def main():
    made = []
    for variant in ("baseline", "final"):
        made.append(dump(build(variant, True),
                         os.path.join(OUT_DIR, "day3_%s.yml" % variant)))
        made.append(dump(build(variant, False),
                         os.path.join(OUT_DIR, "day3_%s.public.yml" % variant)))
    for p in made:
        g = yaml.safe_load(open(p, encoding="utf-8"))
        n = len(g["workflow"]["graph"]["nodes"])
        e = len(g["workflow"]["graph"]["edges"])
        print("%-42s nodes=%-3d edges=%-3d" % (os.path.basename(p), n, e))


if __name__ == "__main__":
    main()
