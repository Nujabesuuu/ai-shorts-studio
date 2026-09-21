#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генератор Dify DSL для Day 4 — «Відео з бренд-буком» (Кейс A · Social Media).

Пряме продовження Day 3: на вході id готового сценарію з day3_content,
на виході — три 8-секундні відеосегменти Veo 3.1 зі спільними межовими
кадрами, субтитри VTT, підпис у голосі бренду і рядок у day4_videos
зі статусом pending_review (гейт затвердження людиною — в адмінці).

Ключові рішення:
  • RAG-порівняння вбудоване: перемикач use_rag на старті веде на два
    однакові LLM-директори — з Knowledge Retrieval і без. Один бриф,
    два прогони, скріншоти «до/після» готові.
  • Кадри N+1: граф РОЗГОРНУТО статично на 3 сегменти (4 кадри), бо
    ітерація Dify не вміє передавати згенерований файл між сусідніми
    елементами. Сегмент i бере кадр i як перший і кадр i+1 як останній —
    справжня неперервність на стиках.
  • Субтитри — детермінована code-нода: таймінги і войсовер уже лежать
    у сценарії Day 3, генерувати їх моделлю означало б платити токени
    за те, що обчислюється точно. (Окремо від відео-агентів — укр мова
    у відео-моделях ламається, як і домовлялися.)
  • Склейка в один mp4 — НЕ в Dify (він не вміє ffmpeg): кнопка
    «Склеїти» в адмінці ганяє ffmpeg локально. Флоу зберігає сегменти.

Запуск:  python3 dify/build_dsl_day4.py
Вихід:   dify/day4_video.yml         (з ключами Supabase/TG — імпортувати ЦЕЙ)
         dify/day4_video.public.yml  (без секретів — на здачу)
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import yaml

from build_dsl import (  # noqa: E402 — спільне джерело з Day 3
    FEATURES, MODEL_PROVIDER, MODEL_NAME, PLUGIN_GEMINI, PLUGIN_SUPABASE,
    ROWS_HELPER, SUPABASE_ICON, SUPABASE_KEY, SUPABASE_URL,
    PLACEHOLDER_CHAT_ID, TELEGRAM_CHAT_ID, TELEGRAM_TOKEN, DSL_VERSION,
    node, edge, out, cvar, get_rows_node, telegram_node, model,
)

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# Плагін відео. Ідентифікатор і схема параметрів звірені з Marketplace
# (langgenius/gemini_video 0.0.15) і GitHub dify-official-plugins.
PLUGIN_VIDEO = ("langgenius/gemini_video:0.0.15@b3ec36bc6abed7ab094afef25d8ec5"
                "26f51f8f07f8613d94485ee854963ec483")
VIDEO_MODEL = "veo-3.1-fast-generate-preview"  # fast: дешевше й швидше; якість — veo-3.1-generate-preview

# Кадри генерує ОКРЕМИЙ tool-плагін (nano banana), а не LLM-нода:
# редактор Dify не заносить `files` LLM-ноди у пул змінних (рантайм їх має,
# але чекліст публікації показує «неверная переменная» і блокує Publish).
# У tool-нод вихід files типізований — чекліст проходить.
PLUGIN_IMAGE = ("langgenius/gemini_image:0.1.9@947022663319cf0528fa3803f60fb1"
                "ef58c3703ffc9c3c6dca6538e291cf2c96")
IMAGE_MODEL = "gemini-2.5-flash-image"         # nano banana

N_SEG = 3          # 3 × 8 с = 24 с — «мінімум 3-4 агенти» з вашого ТЗ
SEG_SEC = 8

# Плейсхолдер: Knowledge Base не переноситься через DSL — її створюють в UI
# і вибирають у ноді після імпорту (крок 2 інструкції).
DATASET_PLACEHOLDER = "REPLACE-WITH-BRANDBOOK-DATASET-ID"


# ─────────────────────────────────────────────────────────────────────────────
# Python code-нод
# ─────────────────────────────────────────────────────────────────────────────

CODE_PARSE = ROWS_HELPER + r'''
import json


def main(rows_json, rows_text, content_id):
    rows = _rows(rows_json, rows_text)
    row = rows[0] if rows else {}

    if not row.get("id"):
        return {"gate": "empty", "note": ("Сценарію з id=%s немає в day3_content. "
                "Перевірте, що id скопійовано зі сторінки контенту в адмінці.") % content_id,
                "title": "", "niche": "", "platform": "", "caption_seed": "",
                "brief": "", "kb_query": "", "cues_json": "[]",
                "project_id": "", "duration": 0}

    script = row.get("script") or []
    if isinstance(script, str):
        try:
            script = json.loads(script)
        except Exception:
            script = []
    frames = [f for f in script if isinstance(f, dict)]

    title = str(row.get("title") or "")
    niche = str(row.get("niche") or "")
    hook = str(row.get("hook") or "")

    # ── Розкладаємо кадри сценарію на 3 відеосегменти по порядку.
    n = 3
    buckets = [[] for _ in range(n)]
    if frames:
        per = max(1, -(-len(frames) // n))          # ceil
        for i, f in enumerate(frames):
            buckets[min(i // per, n - 1)].append(f)

    seg_lines = []
    for i, b in enumerate(buckets):
        parts = []
        for f in b:
            v = str(f.get("visual") or "").strip()
            vo = str(f.get("voiceover") or "").strip()
            if v:
                parts.append(v)
            if vo:
                parts.append("(голос: «%s»)" % vo)
        seg_lines.append("Сегмент %d: %s" % (i + 1, " · ".join(parts) or "за темою"))

    brief = "\n".join([
        "Тема: %s" % title,
        "Ніша: %s" % niche,
        "Хук: %s" % hook,
        "",
        "\n".join(seg_lines),
    ])

    # ── Субтитри: перемапуємо войсовер у сітку 3×8 с.
    # Таймінги оригіналу можуть бути 15–45 с; фінальне відео — рівно 24 с,
    # тому репліки кожного сегмента рівномірно ділять його 8 секунд.
    cues = []
    for i, b in enumerate(buckets):
        vos = [str(f.get("voiceover") or "").strip() for f in b]
        vos = [v for v in vos if v]
        if not vos:
            continue
        base = i * 8.0
        step = 8.0 / len(vos)
        for j, text in enumerate(vos):
            cues.append({"start": round(base + j * step, 2),
                         "end": round(base + (j + 1) * step - 0.05, 2),
                         "text": text})

    return {
        "gate": "ok",
        "note": "",
        "title": title,
        "niche": niche,
        "platform": str(row.get("platform") or "instagram"),
        "caption_seed": str(row.get("caption") or ""),
        "brief": brief,
        "kb_query": "%s %s тон бренду візуальний стиль палітра формат підписів" % (niche, title),
        "cues_json": json.dumps(cues, ensure_ascii=False),
        "project_id": str(row.get("project_id") or ""),
        "duration": 24,
    }
'''


CODE_COLLECT = r'''
import json
from datetime import datetime, timedelta, timezone

# У code-ноди НЕ можна заводити file-змінні: пісочниця серіалізує входи
# в JSON і падає з «Type is not JSON serializable: File». Тому відеофайли
# сюди не заходять: їх віддає end-нода (File → url вона вміє), а склеює
# і зберігає адмінка — один фінальний mp4.


def _vtt(cues):
    def ts(sec):
        m, s = divmod(max(0.0, float(sec)), 60.0)
        return "%02d:%06.3f" % (int(m), s)
    lines = ["WEBVTT", ""]
    for i, c in enumerate(cues, 1):
        lines += [str(i), "%s --> %s" % (ts(c["start"]), ts(c["end"])), c["text"], ""]
    return "\n".join(lines)


def main(plan, cues_json, title, niche, platform, caption_seed,
         content_id, project_id, use_rag, run_id):
    p = plan if isinstance(plan, dict) else {}
    try:
        cues = json.loads(cues_json) if isinstance(cues_json, str) else (cues_json or [])
    except Exception:
        cues = []

    if not str(p.get("style_block") or "").strip():
        return {"row_json": "{}", "gate": "empty",
                "note": "Директор не повернув план — дивіться ноди «Директор…» у трасуванні.",
                "publish_at": "", "vtt": "", "caption_out": ""}

    segments = [{"n": i, "duration_sec": 8,
                 "prompt": str(p.get("seg_%d" % i) or "")[:500]} for i in (1, 2, 3)]

    # Scheduler & Publisher: наступний вільний вечірній слот, 18:00 Києва.
    kyiv = timezone(timedelta(hours=3))
    now = datetime.now(kyiv)
    slot = now.replace(hour=18, minute=0, second=0, microsecond=0)
    if slot <= now:
        slot += timedelta(days=1)

    row = {
        "content_id": content_id or None,
        "project_id": project_id or None,
        "run_id": run_id,
        "niche": niche,
        "title": title,
        "platform": platform,
        "use_rag": str(use_rag).strip().lower() == "true",
        "video_model": "veo-3.1",
        # rendering: адмінка забере сегменти з виходів прогону, склеїть
        # в один mp4 і сама підніме статус до pending_review.
        "status": "rendering",
        "caption": str(p.get("caption") or caption_seed)[:2000],
        "brand_alignment": str(p.get("brand_alignment") or "")[:2000],
        "missing_from_brandbook": str(p.get("missing_from_brandbook") or "")[:1000],
        "frames": [],
        "segments": segments,
        "video_url": None,
        "subtitles_vtt": _vtt(cues),
        "publish_at": slot.isoformat(),
    }

    return {
        "row_json": json.dumps(row, ensure_ascii=False),
        "gate": "ok",
        "note": "",
        "publish_at": slot.strftime("%d.%m %H:%M"),
        "vtt": row["subtitles_vtt"],
        "caption_out": row["caption"],
    }
'''


CODE_VERIFY4 = ROWS_HELPER + r'''
import json


def _esc(v):
    return (str(v).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def main(saved_json, saved_text, run_id, note, use_rag, missing_bb,
         publish_at, title):
    saved = _rows(saved_json, saved_text)
    ok = len(saved) > 0

    mode = " · RAG" if str(use_rag).lower() == "true" else " · без RAG"
    plain = [
        "Day 4 · відео%s" % mode,
        "Сценарій: %s" % title,
        "Рендер сегментів завершено; склейка в один mp4 — в адмінці.",
        "Рядок у day4_videos: %s" % ("так" if ok else "НІ"),
        "Черга публікації: %s (Київ)" % publish_at,
        "run_id: %s" % run_id,
    ]
    rich = [
        "<b>Day 4 · відео%s</b>" % mode,
        "Сценарій: %s" % _esc(title),
        "Рендер сегментів завершено; склейка в один mp4 — в адмінці.",
        "Рядок у day4_videos: <b>%s</b>" % ("так" if ok else "НІ"),
        "Черга публікації: <b>%s</b> (Київ)" % _esc(publish_at),
        "run_id: <code>%s</code>" % _esc(run_id),
    ]
    if note:
        plain.append("⚠️ " + note); rich.append("⚠️ " + _esc(note))
    if missing_bb and missing_bb.strip() not in ("", "—"):
        plain.append("Бренд-буку бракувало: " + missing_bb)
        rich.append("<i>Бренд-буку бракувало: %s</i>" % _esc(missing_bb))
    plain.append("Затвердити: адмінка → Відео · Day 4")
    rich.append("Затвердити: адмінка → Відео · Day 4")

    payload = json.dumps({"chat_id": "{{CHAT_ID}}", "text": "\n".join(rich),
                          "parse_mode": "HTML", "disable_web_page_preview": True},
                         ensure_ascii=False)
    return {"report_md": "\n".join(plain), "tg_payload": payload,
            "saved": len(saved), "db_ok": "yes" if ok else "no"}
'''


# ─────────────────────────────────────────────────────────────────────────────
# Структурований план від директора.
# Поля пласкі (frame_0…seg_3), бо посилання {{#node.field#}} не вміють
# індексувати масиви — а нам треба роздати кадри конкретним нодам.
# ─────────────────────────────────────────────────────────────────────────────

def plan_props():
    props = {
        "style_block": {"type": "string", "description":
            "Єдиний візуальний стиль для ВСІХ кадрів: палітра, світло, "
            "оточення, типаж людей. З бренд-буку, якщо він у контексті."},
        "negative_prompt": {"type": "string", "description":
            "Чого не має бути в кадрі (з do/don't бренд-буку + завжди: text, "
            "captions, watermark, logos)"},
        "caption": {"type": "string", "description":
            "Підпис до публікації в голосі бренду, з хештегами. Українською."},
        "brand_alignment": {"type": "string", "description":
            "Які правила бренд-буку застосовано і де саме (2-3 речення)"},
        "missing_from_brandbook": {"type": "string", "description":
            "Чого бракувало в бренд-буці для впевненого рішення. «—» якщо все є. "
            "НЕ вигадуй відсутні правила."},
    }
    for i in range(N_SEG + 1):
        props["frame_%d" % i] = {"type": "string", "description":
            "Кадр-межа №%d: самодостатній опис статичного кадру для генератора "
            "зображень. Вертикаль 9:16. Кадр %d — %s." % (
                i, i,
                "перший кадр відео" if i == 0 else
                ("фінальний кадр відео" if i == N_SEG else
                 "стик сегментів %d і %d — ОДИН спільний кадр" % (i, i + 1)))}
    for i in range(1, N_SEG + 1):
        props["seg_%d" % i] = {"type": "string", "description":
            "Промпт руху для відеосегмента %d (8 с): що відбувається від кадру "
            "%d до кадру %d. Без тексту на екрані, без розбірливої мови — лише "
            "амбієнтний звук." % (i, i - 1, i)}
    return props


PLAN_SCHEMA = {"type": "object", "additionalProperties": False,
               "properties": plan_props(), "required": list(plan_props().keys())}

PROMPT_DIRECTOR_COMMON = """Ти — візуальний директор коротких вертикальних відео (Reels 9:16).

ВХІД: сценарій з трьома сегментами. Твоє завдання — план зйомки:
- style_block: один спільний стиль для всіх кадрів;
- 4 кадри-межі (frame_0…frame_3): frame_1 і frame_2 — це СПІЛЬНІ кадри
  на стиках сегментів, опиши їх так, щоб кінець одного відео і початок
  наступного були тим самим зображенням;
- 3 промпти руху (seg_1…seg_3), кожен веде з кадру i-1 у кадр i;
- caption: підпис до публікації.

ПРАВИЛА
1. Кожен frame_* — самодостатній опис для генератора зображень: обʼєкт,
   дія, ракурс, світло. Без «як у попередньому кадрі» — генератор не бачить
   інших кадрів, повторюй ключові деталі дослівно.
2. У seg_* — БЕЗ написів на екрані і без розбірливої мови (укр озвучка
   відео-моделлю ламається; субтитри додаються окремо).
3. Узгодженість: той самий герой, та сама локація, той самий одяг у всіх
   7 полях. Повторюй ці деталі в кожному полі.
4. Мова полів caption/brand_alignment/missing — українська; frame_*/seg_*
   пиши англійською (генератори картинок і відео розуміють її краще).

ФОРМАТ — строго JSON за схемою."""

PROMPT_DIRECTOR_RAG = PROMPT_DIRECTOR_COMMON + """

БРЕНД-БУК: у контексті — витяги з бренд-буку (палітра, тон, do/don't,
формат підписів). Застосовуй їх у style_block, negative_prompt і caption,
а в brand_alignment процитуй, ЩО саме застосував. Якщо потрібного правила
в контексті немає — НЕ вигадуй: лишайся в нейтрально-безпечних межах і
запиши прогалину в missing_from_brandbook."""

PROMPT_DIRECTOR_PLAIN = PROMPT_DIRECTOR_COMMON + """

Бренд-бук НЕ підключено (порівняльний прогін без RAG). Працюй як типовий
генератор без знань про бренд. У brand_alignment запиши «бренд-бук не
підключався», у missing_from_brandbook — «прогін без RAG»."""


# ─────────────────────────────────────────────────────────────────────────────
# Ідентифікатори нод
# ─────────────────────────────────────────────────────────────────────────────

N_START = "1788000000001"
N_GET = "1788000000002"
N_PARSE = "1788000000003"
N_IF_OK = "1788000000004"
N_IF_RAG = "1788000000005"
N_KB = "1788000000006"
N_DIR_RAG = "1788000000007"
N_DIR_PLAIN = "1788000000008"
N_AGG = "1788000000009"
N_IMG = ["178800000001%d" % i for i in range(4)]          # 0..3
N_PICK = ["178800000002%d" % i for i in range(4)]
N_VID = ["178800000003%d" % i for i in range(1, 4)]       # 1..3
N_COLLECT = "1788000000040"
N_IF_SAVE = "1788000000041"
N_INSERT = "1788000000042"
N_GET_VER = "1788000000043"
N_VERIFY = "1788000000044"
N_TG = "1788000000045"
N_END_OK = "1788000000046"
N_END_EMPTY = "1788000000047"
N_END_FAIL = "1788000000048"

Y = 480


def video_tool_node(nid, idx, model_ref, x, y):
    """
    Tool-нода gemini_video_general. Усі параметри плагіна мають form: form,
    тому живуть у tool_configurations (типізовано, tool_node_version 2).
    Кадри: image = межа idx-1, last_frame = межа idx.
    """
    data = {
        "default_value": [{"key": "text", "type": "string", "value": ""},
                          {"key": "files", "type": "array[file]", "value": []},
                          {"key": "json", "type": "array[object]", "value": "[]"}],
        "desc": "Veo 3.1 · сегмент %d: з кадру %d у кадр %d, 8 с, 9:16." % (idx, idx - 1, idx),
        "error_strategy": "default-value",
        "is_team_authorization": True,
        "plugin_id": "langgenius/gemini_video",
        "plugin_unique_identifier": PLUGIN_VIDEO,
        # Дзеркало констант у params: старий шлях, яким редактор читає
        # form-параметри. Тримаємо обидва, щоб «Model обовʼязкова» не
        # спалахувала залежно від версії редактора.
        "params": {"model": model_ref, "aspect_ratio": "9:16",
                   "resolution": "720p", "duration_seconds": "8"},
        "provider_id": "langgenius/gemini_video/gemini_video",
        "provider_name": "langgenius/gemini_video/gemini_video",
        "provider_show_name": "Gemini Video",
        "provider_type": "builtin",
        # 429 від Veo — це вікно «запитів на хвилину»: коротка пауза його не
        # чистить, тому чекаємо довше і пробуємо двічі.
        "retry_config": {"max_retries": 2, "retry_enabled": True, "retry_interval": 5000},
        "selected": False,
        "title": "V%d · Veo сегмент %d" % (idx, idx),
        "tool_configurations": {
            "model": {"type": "constant", "value": model_ref},
            "prompt": {"type": "mixed",
                       "value": "{{#%s.output.seg_%d#}}" % (N_AGG, idx)},
            "negative_prompt": {"type": "mixed",
                                "value": "{{#%s.output.negative_prompt#}}" % N_AGG},
            "image": {"type": "variable", "value": [N_PICK[idx - 1], "first_record"]},
            "last_frame": {"type": "variable", "value": [N_PICK[idx], "first_record"]},
            "aspect_ratio": {"type": "constant", "value": "9:16"},
            "resolution": {"type": "constant", "value": "720p"},
            "duration_seconds": {"type": "constant", "value": "8"},
        },
        "tool_description": "gemini video generation support for Veo 3.1",
        "tool_label": "Gemini Video Generation",
        "tool_name": "gemini_video_general",
        "tool_node_version": "2",
        "tool_parameters": {},
        "type": "tool",
    }
    return node(nid, data, x, y, height=120, width=244)


def build(with_secrets):
    nodes, edges = [], []

    # ── Start
    nodes.append(node(N_START, {
        "selected": False, "title": "Start", "type": "start",
        "variables": [
            {"default": "", "label": "ID сценарію з day3_content (колонка id)",
             "max_length": 48, "options": [], "required": True,
             "type": "text-input", "variable": "content_id"},
            {"default": "true", "label": "Використовувати бренд-бук (RAG)?",
             "max_length": 8, "options": ["true", "false"], "required": False,
             "type": "select", "variable": "use_rag"},
        ],
    }, 40, Y, height=140, width=242))

    # ── Сценарій із Day 3
    nodes.append(get_rows_node(
        N_GET, "Get Rows (day3_content)",
        "Сценарій Day 3 — вхідний матеріал відео.",
        "day3_content", "id={{#%s.content_id#}}" % N_START, 1, 340, Y))
    edges.append(edge(N_START, N_GET, "start", "tool"))

    nodes.append(node(N_PARSE, {
        "code": CODE_PARSE, "code_language": "python3",
        "desc": "Ділить сценарій на 3 сегменти, готує бриф, запит у бренд-бук і сирі субтитри.",
        "outputs": out(gate="string", note="string", title="string", niche="string",
                       platform="string", caption_seed="string", brief="string",
                       kb_query="string", cues_json="string", project_id="string",
                       duration="number"),
        "selected": False, "title": "Розбір сценарію", "type": "code",
        "variables": [
            cvar("rows_json", N_GET, "json", "array[object]"),
            cvar("rows_text", N_GET, "text", "string"),
            cvar("content_id", N_START, "content_id", "string"),
        ],
    }, 640, Y, height=51, width=241))
    edges.append(edge(N_GET, N_PARSE, "tool", "code"))

    nodes.append(node(N_IF_OK, {
        "cases": [{"case_id": "true", "id": "true", "logical_operator": "and",
                   "conditions": [{"comparison_operator": "is", "id": "c-ok",
                                   "value": "ok", "varType": "string",
                                   "variable_selector": [N_PARSE, "gate"]}]}],
        "desc": "Немає сценарію — виходимо з поясненням, не палимо Veo.",
        "selected": False, "title": "Сценарій знайдено?", "type": "if-else",
    }, 940, Y, height=126))
    edges.append(edge(N_PARSE, N_IF_OK, "code", "if-else"))

    nodes.append(node(N_END_EMPTY, {
        "desc": "", "outputs": [
            # Імена виходів мають бути унікальні МІЖ УСІМА end-нодами —
            # інакше чекліст публікації скаржиться на «повторювану змінну».
            {"value_selector": [N_PARSE, "note"], "variable": "empty_note"},
        ],
        "selected": False, "title": "Сценарію немає", "type": "end",
    }, 1240, Y + 320, height=110))
    edges.append(edge(N_IF_OK, N_END_EMPTY, "if-else", "end", handle="false"))

    # ── RAG-розвилка: два однакові директори, з контекстом і без
    nodes.append(node(N_IF_RAG, {
        "cases": [{"case_id": "true", "id": "true", "logical_operator": "and",
                   "conditions": [{"comparison_operator": "is", "id": "c-rag",
                                   "value": "true", "varType": "string",
                                   "variable_selector": [N_START, "use_rag"]}]}],
        "desc": "Порівняння за ТЗ: той самий бриф із бренд-буком і без.",
        "selected": False, "title": "З бренд-буком?", "type": "if-else",
    }, 1240, Y, height=126))
    edges.append(edge(N_IF_OK, N_IF_RAG, "if-else", "if-else", handle="true"))

    nodes.append(node(N_KB, {
        "dataset_ids": [DATASET_PLACEHOLDER],
        "desc": "ПІСЛЯ ІМПОРТУ: відкрийте цю ноду і виберіть свою Knowledge Base з бренд-буком.",
        "metadata_filtering_mode": "disabled",
        "multiple_retrieval_config": {"reranking_enable": False,
                                      "score_threshold": 0.35, "top_k": 6},
        "query_variable_selector": [N_PARSE, "kb_query"],
        "retrieval_mode": "multiple",
        "selected": False,
        "title": "Бренд-бук (Knowledge)",
        "type": "knowledge-retrieval",
    }, 1540, Y - 160, height=100))
    edges.append(edge(N_IF_RAG, N_KB, "if-else", "knowledge-retrieval", handle="true"))

    def director(nid, title, sys_prompt, with_context, x, y):
        data = {
            "context": {"enabled": with_context,
                        "variable_selector": [N_KB, "result"] if with_context else []},
            "model": model(0.7),
            "prompt_template": [
                {"id": nid + "-sys", "role": "system", "text": sys_prompt},
                {"id": nid + "-usr", "role": "user",
                 "text": "СЦЕНАРІЙ:\n{{#%s.brief#}}\n\nЧернетка підпису з Day 3:\n{{#%s.caption_seed#}}"
                         % (N_PARSE, N_PARSE)},
            ],
            "retry_config": {"max_retries": 3, "retry_enabled": True, "retry_interval": 1000},
            "selected": False,
            "structured_output": {"schema": PLAN_SCHEMA},
            "structured_output_enabled": True,
            "title": title, "type": "llm", "vision": {"enabled": False},
        }
        nodes.append(node(nid, data, x, y, height=97))

    director(N_DIR_RAG, "Директор · у голосі бренду", PROMPT_DIRECTOR_RAG, True, 1840, Y - 160)
    director(N_DIR_PLAIN, "Директор · без бренд-буку", PROMPT_DIRECTOR_PLAIN, False, 1840, Y + 120)
    edges.append(edge(N_KB, N_DIR_RAG, "knowledge-retrieval", "llm"))
    edges.append(edge(N_IF_RAG, N_DIR_PLAIN, "if-else", "llm", handle="false"))

    nodes.append(node(N_AGG, {
        "advanced_settings": {"group_enabled": False, "groups": []},
        "desc": "Виграє той директор, чия гілка виконувалась.",
        "output_type": "object",
        "selected": False, "title": "План відео", "type": "variable-aggregator",
        "variables": [[N_DIR_RAG, "structured_output"],
                      [N_DIR_PLAIN, "structured_output"]],
    }, 2140, Y, height=130))
    edges.append(edge(N_DIR_RAG, N_AGG, "llm", "variable-aggregator"))
    edges.append(edge(N_DIR_PLAIN, N_AGG, "llm", "variable-aggregator"))

    # ── 4 межові кадри: tool-нода gemini_image (nano banana)
    for i in range(4):
        img_prompt = ("Generate ONE vertical 9:16 photo-style image. No text, "
                      "no captions, no watermarks.\n\nStyle: "
                      "{{#%s.output.style_block#}}\n\nFrame: "
                      "{{#%s.output.frame_%d#}}") % (N_AGG, N_AGG, i)
        nodes.append(node(N_IMG[i], {
            "default_value": [{"key": "text", "type": "string", "value": ""},
                              {"key": "files", "type": "array[file]", "value": []},
                              {"key": "json", "type": "array[object]", "value": "[]"}],
            "desc": "Nano banana · межовий кадр %d, вертикаль 9:16." % i,
            "error_strategy": "default-value",
            "is_team_authorization": True,
            "params": {"model": IMAGE_MODEL},
            "plugin_id": "langgenius/gemini_image",
            "plugin_unique_identifier": PLUGIN_IMAGE,
            "provider_id": "langgenius/gemini_image/gemini_image",
            "provider_name": "langgenius/gemini_image/gemini_image",
            "provider_show_name": "Gemini Image",
            "provider_type": "builtin",
            "retry_config": {"max_retries": 2, "retry_enabled": True, "retry_interval": 5000},
            "selected": False,
            "title": "K%d · кадр-межа %d" % (i, i),
            "tool_configurations": {"model": {"type": "constant", "value": IMAGE_MODEL}},
            "tool_description": "Gemini Image Generation and Editing",
            "tool_label": "Image Generate",
            "tool_name": "image_generate",
            "tool_node_version": "2",
            "tool_parameters": {"prompt": {"type": "mixed", "value": img_prompt}},
            "type": "tool",
        }, 2440, Y - 300 + i * 200, height=110))
        edges.append(edge(N_AGG, N_IMG[i], "variable-aggregator", "tool"))
        if i > 0:
            # Ланцюг K0→K1→K2→K3 — не бʼємо хвилинний ліміт ключа.
            edges.append(edge(N_IMG[i - 1], N_IMG[i], "tool", "tool"))

        nodes.append(node(N_PICK[i], {
            "desc": "",
            "extract_by": {"enabled": True, "serial": "1"},
            "filter_by": {"enabled": False, "conditions": []},
            "limit": {"enabled": False, "size": 10},
            "order_by": {"enabled": False, "key": "", "value": "asc"},
            "selected": False,
            "title": "Файл кадру %d" % i,
            "type": "list-operator",
            # var_type/item_var_type — обовʼязкові для чеклиста редактора
            # (перевірено у web/nodes/list-operator/default.ts): без них
            # нода світиться «неверная переменная», хоч рантайм і працює.
            "var_type": "array[file]",
            "item_var_type": "file",
            "variable": [N_IMG[i], "files"],
        }, 2740, Y - 300 + i * 200, height=80, width=200))
        edges.append(edge(N_IMG[i], N_PICK[i], "tool", "list-operator"))

    # ── 3 відеосегменти: image = кадр i-1, last_frame = кадр i.
    # ПОСЛІДОВНО, а не паралельно: три одночасні виклики Veo пробивають
    # RPM-ліміт Google-ключа (перевірено живим 429 RESOURCE_EXHAUSTED на
    # Tier-квотах). Один сегмент і так рендериться хвилину-дві, тому
    # паралельність економила секунди, а коштувала цілим прогоном.
    for i in range(1, 4):
        nodes.append(video_tool_node(N_VID[i - 1], i, VIDEO_MODEL,
                                     3040, Y - 240 + (i - 1) * 220))
        edges.append(edge(N_PICK[i - 1], N_VID[i - 1], "list-operator", "tool"))
        edges.append(edge(N_PICK[i], N_VID[i - 1], "list-operator", "tool"))
        if i > 1:
            # ланцюжок V1 → V2 → V3: наступний Veo стартує лише після попереднього
            edges.append(edge(N_VID[i - 2], N_VID[i - 1], "tool", "tool"))

    # ── Збірка: рядок для БД + VTT + слот публікації
    nodes.append(node(N_COLLECT, {
        "code": CODE_COLLECT, "code_language": "python3",
        "desc": "Сегменти + кадри + субтитри + слот публікації → один рядок day4_videos.",
        "outputs": out(row_json="string", gate="string", note="string",
                       publish_at="string", vtt="string", caption_out="string"),
        "selected": False, "title": "Збірка відео", "type": "code",
        "variables": [
            cvar("plan", N_AGG, "output", "object"),
            cvar("cues_json", N_PARSE, "cues_json", "string"),
            cvar("title", N_PARSE, "title", "string"),
            cvar("niche", N_PARSE, "niche", "string"),
            cvar("platform", N_PARSE, "platform", "string"),
            cvar("caption_seed", N_PARSE, "caption_seed", "string"),
            cvar("content_id", N_START, "content_id", "string"),
            cvar("project_id", N_PARSE, "project_id", "string"),
            cvar("use_rag", N_START, "use_rag", "string"),
            cvar("run_id", "sys", "workflow_run_id", "string"),
        ],
    }, 3340, Y, height=51, width=241))
    for v in N_VID:
        edges.append(edge(v, N_COLLECT, "tool", "code"))

    nodes.append(node(N_IF_SAVE, {
        "cases": [{"case_id": "true", "id": "true", "logical_operator": "and",
                   "conditions": [{"comparison_operator": "is", "id": "c-save",
                                   "value": "ok", "varType": "string",
                                   "variable_selector": [N_COLLECT, "gate"]}]}],
        "desc": "Жоден сегмент не вийшов — у базу не пишемо.",
        "selected": False, "title": "Є що зберігати?", "type": "if-else",
    }, 3640, Y, height=126))
    edges.append(edge(N_COLLECT, N_IF_SAVE, "code", "if-else"))

    # Окремий кінець саме для «жоден сегмент не вийшов»: у ньому видно
    # note збірки (який сегмент упав) — а не оманливе «Сценарію немає».
    nodes.append(node(N_END_FAIL, {
        "desc": "", "outputs": [
            {"value_selector": [N_COLLECT, "note"], "variable": "fail_note"},
            {"value_selector": [N_AGG, "output", "missing_from_brandbook"],
             "variable": "fail_missing_from_brandbook"},
        ],
        "selected": False, "title": "Сегменти не згенерувалися", "type": "end",
    }, 3940, Y + 320, height=130))
    edges.append(edge(N_IF_SAVE, N_END_FAIL, "if-else", "end", handle="false"))

    nodes.append(node(N_INSERT, {
        "authorization": {"config": None, "type": "no-auth"},
        "body": {"data": [{"id": "sb-insert-d4", "key": "", "type": "text",
                           "value": "[{{#%s.row_json#}}]" % N_COLLECT}],
                 "type": "json"},
        "default_value": [{"key": "body", "type": "string", "value": ""},
                          {"key": "status_code", "type": "number", "value": 0},
                          {"key": "headers", "type": "object", "value": "{}"}],
        "desc": "Один рядок = одне відео. PostgREST bulk-insert, 0 токенів.",
        "error_strategy": "default-value",
        "headers": ("apikey: {{#env.SUPABASE_KEY#}}\n"
                    "Authorization: Bearer {{#env.SUPABASE_KEY#}}\n"
                    "Content-Type: application/json\n"
                    "Prefer: return=representation"),
        "method": "post", "params": "",
        "retry_config": {"max_retries": 2, "retry_enabled": True, "retry_interval": 1000},
        "selected": False,
        "timeout": {"connect": 10, "read": 40, "write": 20},
        "title": "Запис у day4_videos", "type": "http-request",
        "url": "{{#env.SUPABASE_URL#}}/rest/v1/day4_videos",
        "variables": [],
    }, 3940, Y, height=120, width=241))
    edges.append(edge(N_IF_SAVE, N_INSERT, "if-else", "http-request", handle="true"))

    nodes.append(get_rows_node(
        N_GET_VER, "Get Rows (перевірка запису)",
        "Читаємо назад рядок цього прогону.",
        "day4_videos", "run_id={{#sys.workflow_run_id#}}", 5, 4240, Y))
    edges.append(edge(N_INSERT, N_GET_VER, "http-request", "tool"))

    verify_code = CODE_VERIFY4.replace(
        "{{CHAT_ID}}", TELEGRAM_CHAT_ID if with_secrets else PLACEHOLDER_CHAT_ID)
    nodes.append(node(N_VERIFY, {
        "code": verify_code, "code_language": "python3",
        "desc": "Факт запису + звіт у Telegram (HTML — підкреслення в даних безпечні).",
        "outputs": out(report_md="string", tg_payload="string", saved="number",
                       db_ok="string"),
        "selected": False, "title": "Перевірка запису", "type": "code",
        "variables": [
            cvar("saved_json", N_GET_VER, "json", "array[object]"),
            cvar("saved_text", N_GET_VER, "text", "string"),
            cvar("run_id", "sys", "workflow_run_id", "string"),
            cvar("note", N_COLLECT, "note", "string"),
            cvar("use_rag", N_START, "use_rag", "string"),
            cvar("missing_bb", N_AGG, ["output", "missing_from_brandbook"], "string"),
            cvar("publish_at", N_COLLECT, "publish_at", "string"),
            cvar("title", N_PARSE, "title", "string"),
        ],
    }, 4540, Y, height=51, width=241))
    edges.append(edge(N_GET_VER, N_VERIFY, "tool", "code"))

    nodes.append(telegram_node(N_TG, "Telegram · звіт про відео",
                               "Скільки сегментів готово, куди стало в чергу, що бракувало бренд-буку.",
                               "{{#%s.tg_payload#}}" % N_VERIFY, 4840, Y))
    edges.append(edge(N_VERIFY, N_TG, "code", "http-request"))

    nodes.append(node(N_END_OK, {
        "desc": "", "outputs": [
            {"value_selector": [N_VERIFY, "report_md"], "variable": "report"},
            {"value_selector": [N_VID[0], "files"], "variable": "seg1_files"},
            {"value_selector": [N_VID[1], "files"], "variable": "seg2_files"},
            {"value_selector": [N_VID[2], "files"], "variable": "seg3_files"},
            {"value_selector": [N_COLLECT, "vtt"], "variable": "subtitles_vtt"},
            {"value_selector": [N_COLLECT, "caption_out"], "variable": "caption"},
            {"value_selector": [N_COLLECT, "publish_at"], "variable": "publish_at"},
            {"value_selector": [N_AGG, "output", "brand_alignment"], "variable": "brand_alignment"},
            {"value_selector": [N_AGG, "output", "missing_from_brandbook"], "variable": "missing_from_brandbook"},
            {"value_selector": [N_COLLECT, "row_json"], "variable": "row_json"},
        ],
        "selected": False, "title": "Готово · відео в черзі", "type": "end",
    }, 5140, Y, height=200))
    edges.append(edge(N_TG, N_END_OK, "http-request", "end"))

    def envv(name, desc, value, i):
        return {"description": desc, "id": "e0b7c1a2-0000-4000-9000-0000000002%02d" % i,
                "name": name, "selector": ["env", name],
                "value": value if with_secrets else "", "value_type": "string"}

    return {
        "app": {"description": ("Продовження Day 3: бере готовий сценарій із day3_content, "
                                "заземлює візуал і підпис на бренд-бук (RAG-перемикач для "
                                "порівняння), генерує 4 межові кадри nano banana і 3 сегменти "
                                "Veo 3.1 зі спільними кадрами на стиках, складає VTT-субтитри "
                                "окремо від відео, ставить у чергу публікації і чекає "
                                "затвердження людиною в адмінці."),
                "icon": "🎥", "icon_background": "#E0F2FE", "icon_type": "emoji",
                "mode": "workflow",
                "name": "Day4 · Відео з бренд-буком (сценарій → кадри → Veo ×3 → субтитри → черга)",
                "use_icon_as_answer_icon": False},
        "dependencies": [
            {"current_identifier": None, "type": "marketplace",
             "value": {"marketplace_plugin_unique_identifier": PLUGIN_GEMINI, "version": None}},
            {"current_identifier": None, "type": "marketplace",
             "value": {"marketplace_plugin_unique_identifier": PLUGIN_SUPABASE, "version": None}},
            {"current_identifier": None, "type": "marketplace",
             "value": {"marketplace_plugin_unique_identifier": PLUGIN_VIDEO, "version": None}},
            {"current_identifier": None, "type": "marketplace",
             "value": {"marketplace_plugin_unique_identifier": PLUGIN_IMAGE, "version": None}},
        ],
        "kind": "app",
        "version": DSL_VERSION,
        "workflow": {
            "conversation_variables": [],
            "environment_variables": [
                envv("TELEGRAM_BOT_TOKEN", "Токен бота від @BotFather.", TELEGRAM_TOKEN, 1),
                envv("TELEGRAM_CHAT_ID", "Чат для звітів.", TELEGRAM_CHAT_ID, 2),
                envv("SUPABASE_URL", "URL проєкту Supabase.", SUPABASE_URL, 3),
                envv("SUPABASE_KEY", "Publishable-ключ Supabase.", SUPABASE_KEY, 4),
            ],
            "features": FEATURES,
            "graph": {"edges": edges, "nodes": nodes,
                      "viewport": {"x": 0, "y": 0, "zoom": 0.35}},
            "rag_pipeline_variables": [],
        },
    }


def dump(obj, path):
    with open(path, "w", encoding="utf-8") as f:
        yaml.safe_dump(obj, f, allow_unicode=True, sort_keys=True,
                       default_flow_style=False, width=140)
    return path


def main():
    for secrets, name in ((True, "day4_video.yml"), (False, "day4_video.public.yml")):
        p = dump(build(secrets), os.path.join(OUT_DIR, name))
        g = yaml.safe_load(open(p, encoding="utf-8"))
        print("%-28s nodes=%-3d edges=%-3d" % (
            name, len(g["workflow"]["graph"]["nodes"]),
            len(g["workflow"]["graph"]["edges"])))


if __name__ == "__main__":
    main()
