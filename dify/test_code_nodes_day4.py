#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Локальний прогін Python-нод із day4_video.yml — на рядку, за формою
ідентичному справжньому day3_content.

Запуск: python3 dify/test_code_nodes_day4.py
"""

import json
import os
import sys
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))

SCENARIO = {
    "id": "b570469c-4416-450c-86ee-a98b927d5995",
    "project_id": "65b0053c-c5a0-46f1-9e38-3b6e8c59e51b",
    "title": "Кастомізація напою в кадрі",
    "niche": "спешелті-кав'ярня в Києві",
    "platform": "instagram",
    "hook": "Твоя кава — це конструктор",
    "caption": "Обери молоко, сироп і міцність — збери свою каву. #кавакиїв",
    "script": [
        {"n": 1, "t_start": 0, "t_end": 4, "visual": "рука тягне важіль кавомашини",
         "voiceover": "Твоя кава — це конструктор"},
        {"n": 2, "t_start": 4, "t_end": 9, "visual": "три види молока в ряд",
         "voiceover": "Овсяне, кокосове чи класика"},
        {"n": 3, "t_start": 9, "t_end": 14, "visual": "сироп ллється в чашку",
         "voiceover": "Додай сироп на свій смак"},
        {"n": 4, "t_start": 14, "t_end": 19, "visual": "бариста подає чашку",
         "voiceover": "Збери свою каву за 10 секунд"},
        {"n": 5, "t_start": 19, "t_end": 24, "visual": "клієнт усміхається з чашкою",
         "voiceover": "Чекаємо тебе сьогодні"},
        {"n": 6, "t_start": 24, "t_end": 29, "visual": "логотип-фінал без тексту",
         "voiceover": ""},
    ],
}

PLAN = {"style_block": "warm cafe light, teal-cream palette",
        "negative_prompt": "text, captions, watermark",
        "caption": "Збери свою каву ☕ #кавакиїв",
        "brand_alignment": "застосовано палітру і тон",
        "missing_from_brandbook": "—",
        "frame_0": "hand on lever", "frame_1": "milk row", "frame_2": "syrup pour",
        "frame_3": "smiling customer",
        "seg_1": "camera pans", "seg_2": "pour motion", "seg_3": "handoff smile"}

FILE = lambda n: [{"dify_model_identity": "__dify__file__", "url": "https://d/%s.mp4" % n,
                   "filename": "%s.mp4" % n}]

PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print("  %s %s%s" % ("✓" if cond else "✗", name, ("  — " + detail) if detail else ""))


def main():
    doc = yaml.safe_load(open(os.path.join(HERE, "day4_video.yml"), encoding="utf-8"))
    codes = {n["data"]["title"]: n["data"]["code"]
             for n in doc["workflow"]["graph"]["nodes"] if n["data"].get("type") == "code"}

    def run(_node_title, **kw):
        ns = {}
        exec(codes[_node_title], ns)
        return ns["main"](**kw)

    print("\n[1] Розбір сценарію")
    p = run("Розбір сценарію", rows_json=[SCENARIO], rows_text="",
            content_id=SCENARIO["id"])
    check("сценарій знайдено", p["gate"] == "ok")
    check("бриф містить 3 сегменти", p["brief"].count("Сегмент") == 3)
    check("кадри розкладено по сегментах", "конструктор" in p["brief"] and "сьогодні" in p["brief"])
    cues = json.loads(p["cues_json"])
    check("субтитри перемапано в 24 с", cues and cues[-1]["end"] <= 24.0,
          "останній кий: %s" % (cues[-1] if cues else "—"))
    check("порожній войсовер не став субтитром", all(c["text"] for c in cues))
    check("project_id прокинуто", p["project_id"] == SCENARIO["project_id"])

    p2 = run("Розбір сценарію", rows_json=[], rows_text="", content_id="deadbeef")
    check("неіснуючий id → gate=empty з поясненням", p2["gate"] == "empty" and "deadbeef" in p2["note"])

    print("\n[2] Збірка відео")
    # File-змінні в code-ноди не заходять (пісочниця їх не серіалізує) —
    # збірка працює лише з планом і метаданими, файли віддає end-нода.
    kw = dict(plan=PLAN, cues_json=p["cues_json"], title=p["title"], niche=p["niche"],
              platform=p["platform"], caption_seed=p["caption_seed"],
              content_id=SCENARIO["id"], project_id=p["project_id"],
              use_rag="true", run_id="run-1")
    c = run("Збірка відео", **kw)
    row = json.loads(c["row_json"])
    check("3 сегменти-плани зібрано", len(row["segments"]) == 3)
    check("у сегментах немає file-полів", all("dify_url" not in s for s in row["segments"]))
    check("статус rendering (склейка за адмінкою)", row["status"] == "rendering")
    check("use_rag → boolean", row["use_rag"] is True)
    check("VTT валідний", c["vtt"].startswith("WEBVTT") and "-->" in c["vtt"])
    check("слот публікації 18:00 Києва", "T18:00:00" in row["publish_at"])
    check("підпис узято з плану директора", row["caption"].startswith("Збери свою каву"))
    check("gate ok", c["gate"] == "ok")

    c2 = run("Збірка відео", **dict(kw, plan={}, use_rag="false"))
    check("порожній план → gate=empty з поясненням",
          c2["gate"] == "empty" and "Директор" in c2["note"])

    print("\n[3] Перевірка запису")
    v = run("Перевірка запису", saved_json=[{"id": "x"}], saved_text="",
            run_id="run_1", note="", use_rag="true",
            missing_bb="формат хештегів", publish_at="23.08 18:00",
            title="Кастомізація напою")
    payload = json.loads(v["tg_payload"])
    check("payload HTML", payload["parse_mode"] == "HTML")
    check("прогалини бренд-буку в звіті", "хештегів" in payload["text"])
    check("run_id з підкресленням не ламає розмітку", "run_1" in payload["text"])
    check("db_ok=yes", v["db_ok"] == "yes")

    v2 = run("Перевірка запису", saved_json=[], saved_text="", run_id="r",
             note="", use_rag="false",
             missing_bb="прогін без RAG", publish_at="х", title="т")
    check("незаписаний рядок видно (db_ok=no)", v2["db_ok"] == "no")
    check("режим без RAG підписано", "без RAG" in v2["report_md"])

    print("\n%d passed, %d failed" % (len(PASS), len(FAIL)))
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
