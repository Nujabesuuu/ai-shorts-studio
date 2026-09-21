#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Локальний прогін Python-нод із зібраного DSL.

Сенс: code-ноди — єдине місце флоу, яке можна перевірити без Dify і без
токенів. Якщо каскад джерел, зріз завищених балів чи звірка запису зламані,
дешевше дізнатися це тут, а не з червоної ноди в Tracing.

Дані — справжні рядки з проєкту «спешелті-кав'ярня в Києві».

Запуск: python3 dify/test_code_nodes.py
"""

import json
import os
import sys
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
COFFEE_PROJECT = "65b0053c-c5a0-46f1-9e38-3b6e8c59e51b"

# Справжні рядки day1_trends цього проєкту (скорочені описи).
TRENDS = [
    {"id": "0a22ca51-fe38-4e59-859f-3bdd43eac98c", "project_id": COFFEE_PROJECT,
     "platform": "instagram", "title": "Кастомізація напою в кадрі",
     "description": "Клієнти дедалі частіше обирають напій «під себе» — молоко, сироп, міцність.",
     "hook_idea": "Твоя кава — це конструктор. Обирай молоко, сироп і міцність за 10 секунд",
     "format": "reels · 15–20с, швидкий монтаж на кожен вибір"},
    {"id": "c23bda4a-440f-4a27-9132-b0d9971393da", "project_id": COFFEE_PROJECT,
     "platform": "instagram", "title": "Декаф на видноті",
     "description": "Попит на декаф зростає — це вже не «кава без смаку».",
     "hook_idea": "Декаф — це не «кава без смаку»",
     "format": "reels · 20–30с, сліпий тест"},
    {"id": "358df956-2883-4d21-9c7c-fcae226104b1", "project_id": COFFEE_PROJECT,
     "platform": "instagram", "title": "Карусель кроків приготування",
     "description": "Карусель обходить Reels за переглядами і зберігають її у 9 разів частіше.",
     "hook_idea": "Ідеальний спешелті-лате за 6 кроків",
     "format": "карусель · 6–8 слайдів"},
    {"id": "43039c8c-718e-46ec-8e12-5a6dc2824bad", "project_id": COFFEE_PROJECT,
     "platform": "instagram", "title": "10 з 10 звичка бариста",
     "description": "Формат «10/10 звичка» вірусився в серпні 2026.",
     "hook_idea": "10 з 10 звичка для ідеальної кави вдома",
     "format": "reels · 15с, talking head"},
    {"id": "c7338889-a62c-410a-8d62-7e1004bbe305", "project_id": COFFEE_PROJECT,
     "platform": "instagram", "title": "Спеції та матча в меню",
     "description": "Меню 2026 зміщується до спецій і функціональних добавок.",
     "hook_idea": "Кориця, кардамон чи матча?",
     "format": "reels · 15–20с, макрозйомка"},
]

PROJECTS = [
    {"id": COFFEE_PROJECT, "niche": "спешелті-кав'ярня в Києві"},
    {"id": "8fdda028-f870-479e-be47-21a64922c6f9", "niche": "SaaS / IT-продукт"},
    {"id": "0441ee38-748f-42e5-85f7-6735a480050d", "niche": "Фітнес/спорт"},
    {"id": "c31d278b-a389-4a78-8220-45085ef8b6a3", "niche": "покемони"},
]


def load_code(path):
    doc = yaml.safe_load(open(path, encoding="utf-8"))
    return {n["data"]["title"]: n["data"]["code"]
            for n in doc["workflow"]["graph"]["nodes"]
            if n["data"].get("type") == "code"}


def run(code, **kwargs):
    ns = {}
    exec(code, ns)
    return ns["main"](**kwargs)


PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print("  %s %s%s" % ("✓" if cond else "✗", name, ("  — " + detail) if detail else ""))


def main():
    codes = load_code(os.path.join(HERE, "day3_final.yml"))

    print("\n[1] Ніша → проєкт")
    resolve = codes["Ніша → проєкт"]

    r = run(resolve, projects_json=PROJECTS, projects_text="",
            niche="спешелті-кав'ярня в Києві", platform="instagram")
    check("точна ніша знаходить проєкт", r["project_id"] == COFFEE_PROJECT, r["resolve_note"])
    check("фільтр у форматі плагіна (column=value)",
          r["row_filter"] == "project_id=" + COFFEE_PROJECT, r["row_filter"])

    r2 = run(resolve, projects_json=PROJECTS, projects_text="",
             niche="кава", platform="")
    check("нечітка «кава» → кав'ярня", r2["project_id"] == COFFEE_PROJECT, r2["resolve_note"])
    check("платформа за замовчуванням instagram", r2["platform"] == "instagram")

    r3 = run(resolve, projects_json=PROJECTS, projects_text="",
             niche="вязання гачком", platform="tiktok")
    check("невідома ніша не чіпляє чужий проєкт", r3["project_id"] == "", r3["matched_by"])
    check("холодний старт не падає", r3["matched_by"] == "cold_start")

    print("\n[2] Prepare briefs — каскад джерел")
    prep = codes["Prepare briefs"]

    b1 = run(prep, topics_json=[], topics_text="", trends_json=TRENDS, trends_text="",
             content_json=[], content_text="", niche="спешелті-кав'ярня в Києві",
             platform="instagram", formats="reels,carousel,stories", n_items=4)
    check("без тем Day 2 падаємо на тренди Day 1", b1["source"] == "day1_trends", b1["debug"])
    check("рівно 4 брифи", b1["count"] == 4)
    check("формати роздано по колу",
          [x["format"] for x in b1["briefs"]] == ["reels", "carousel", "stories", "reels"],
          str([x["format"] for x in b1["briefs"]]))
    check("trend_id проставлено в кожен бриф",
          all(x["trend_id"] for x in b1["briefs"]))

    topics = [{"id": "11111111-1111-4111-8111-111111111111",
               "source_trend_id": TRENDS[0]["id"], "title": "Конструктор кави",
               "text": "Показати кастомізацію", "status": "approved"}]
    b2 = run(prep, topics_json=topics, topics_text="", trends_json=TRENDS, trends_text="",
             content_json=[], content_text="", niche="спешелті-кав'ярня в Києві",
             platform="instagram", formats="reels", n_items=4)
    check("теми Day 2 мають пріоритет над трендами", b2["source"] == "day2_topics")
    check("topic_id прокинуто в бриф", b2["briefs"][0]["topic_id"] == topics[0]["id"])

    existing = [{"id": "x", "title": "Кастомізація напою в кадрі",
                 "source_trend_id": TRENDS[0]["id"]}]
    b3 = run(prep, topics_json=[], topics_text="", trends_json=TRENDS, trends_text="",
             content_json=existing, content_text="", niche="кав'ярня",
             platform="instagram", formats="reels", n_items=5)
    check("уже покритий тренд не береться вдруге",
          TRENDS[0]["id"] not in [x["trend_id"] for x in b3["briefs"]])
    check("наявні назви їдуть у список «не повторюй»",
          "Кастомізація напою в кадрі" in b3["briefs"][0]["banned_titles"])

    b4 = run(prep, topics_json=[], topics_text="", trends_json=[], trends_text="",
             content_json=[], content_text="", niche="вязання гачком",
             platform="tiktok", formats="", n_items=3)
    check("порожня база → холодний старт, а не падіння", b4["source"] == "cold_start")
    check("холодний старт усе одно дає брифи", b4["count"] == 3, b4["notice"])

    print("\n[3] Assemble — застосування патча")
    asm = codes["Assemble · одиниця"]
    draft = {"format": "reels", "title": "Старий заголовок", "hook": "Слабкий хук",
             "hook_alt": "б", "script": [{"n": 1, "t_start": 0, "t_end": 3,
                                          "visual": "в", "voiceover": "г"}],
             "onscreen_text": "д", "caption": "е", "hashtags": ["#кава"],
             "cta": "ж", "duration_sec": 20}
    verdict = {"scores": {"hook": {"score": 40, "evidence": "«Слабкий хук»"}},
               "verdict": "repair", "fix_list": [{"field": "hook", "problem": "загально",
                                                  "instruction": "додай конкретику"}]}
    brief = {"topic_id": "", "trend_id": TRENDS[0]["id"], "format": "reels",
             "source_kind": "day1_trends"}

    a1 = run(asm, draft=draft, verdict=verdict,
             merged={"patch": {"hook": "О 6:40 ранку тут ще нікого"}, "note": "n"},
             brief=brief)["item"]
    check("патч застосовано", a1["hook"] == "О 6:40 ранку тут ще нікого")
    check("непатчені поля не зачеплено", a1["title"] == "Старий заголовок")
    check("позначку ремонту виставлено", a1["repaired"] is True)
    check("trend_id підхоплено з брифа", a1["trend_id"] == TRENDS[0]["id"])

    a2 = run(asm, draft=draft, verdict={"scores": {}, "verdict": "pass", "fix_list": []},
             merged={"scores": {}, "verdict": "pass", "fix_list": []}, brief=brief)["item"]
    check("без ремонту драфт іде як є", a2["hook"] == "Слабкий хук")
    check("без ремонту прапорець false", a2["repaired"] is False)

    print("\n[4] Merge · score — рубрика і зріз інфляції")
    score = codes["Merge · score · rows"]
    crit = ["traceability", "production_ready", "hook", "format_fit", "uniqueness"]

    def item(scores, **over):
        base = {"format": "reels", "title": "Т", "hook": "Х", "hook_alt": "Х2",
                "script": [{"n": 1, "t_start": 0, "t_end": 5, "visual": "в", "voiceover": "г"}],
                "onscreen_text": "о", "caption": "к", "hashtags": ["кава", "#київ"],
                "cta": "ц", "duration_sec": 25, "scores": scores, "verdict": "pass",
                "repaired": False, "topic_id": "", "trend_id": TRENDS[0]["id"],
                "source_kind": "day1_trends"}
        base.update(over)
        return {"item": base}

    inflated = {c: {"score": 100, "evidence": "добре"} for c in crit}
    s1 = run(score, items=[item(inflated)], project_id=COFFEE_PROJECT,
             run_id="6f1c1d3e-0000-4000-8000-000000000001",
             niche="кав'ярня", platform="instagram", flow_version="final")
    rows = json.loads(s1["rows_json"])
    check("бал 100 без цитати зрізано до 95", rows[0]["quality_score"] == 95.0,
          str(rows[0]["quality_score"]))
    check("причину зрізу видно у warnings", "зрізано" in s1["warnings"])

    proven = {c: {"score": 100, "evidence": "цитата з драфту: «О 6:40 ранку тут ще нікого»"}
              for c in crit}
    s2 = run(score, items=[item(proven)], project_id=COFFEE_PROJECT,
             run_id="6f1c1d3e-0000-4000-8000-000000000002",
             niche="кав'ярня", platform="instagram", flow_version="final")
    check("бал 100 з цитатою лишається", json.loads(s2["rows_json"])[0]["quality_score"] == 100.0)

    mixed = {"traceability": {"score": 90, "evidence": "«цитата достатньої довжини тут»"},
             "production_ready": {"score": 80, "evidence": "«ще одна цитата достатня»"},
             "hook": {"score": 50, "evidence": "«слабко»"},
             "format_fit": {"score": 70, "evidence": "«ок»"},
             "uniqueness": {"score": 60, "evidence": "«ок»"}}
    s3 = run(score, items=[item(mixed)], project_id=COFFEE_PROJECT,
             run_id="6f1c1d3e-0000-4000-8000-000000000003",
             niche="кав'ярня", platform="instagram", flow_version="final")
    r3 = json.loads(s3["rows_json"])[0]
    expected = (90 * 25 + 80 * 25 + 50 * 20 + 70 * 15 + 60 * 15) / 100.0
    check("зважена сума рахується за вагами", r3["quality_score"] == round(expected, 2),
          "%s очікували %s" % (r3["quality_score"], round(expected, 2)))
    check("поріг 70-84 дає needs_review", r3["status"] == "needs_review", r3["status"])
    check("хештеги нормалізовано до #", r3["hashtags"] == ["#кава", "#київ"])
    check("модель проставлено", bool(r3["model"]))
    check("покритерійний зріз віддано", json.loads(s3["by_criterion"])["hook"] == 50.0)

    # baseline віддає плоскі числа замість {score, evidence} — не має падати
    s4 = run(score, items=[item({c: 80 for c in crit})], project_id="",
             run_id="6f1c1d3e-0000-4000-8000-000000000004",
             niche="х", platform="instagram", flow_version="baseline")
    r4 = json.loads(s4["rows_json"])[0]
    check("плоскі бали baseline теж рахуються", r4["quality_score"] == 80.0)
    check("порожній project_id → null, а не рядок", r4["project_id"] is None)

    s5 = run(score, items=[], project_id="", run_id="r", niche="х",
             platform="instagram", flow_version="final")
    check("порожній вхід не валить ноду", s5["gate"] == "empty" and s5["count"] == 0)

    print("\n[5] Перевірка запису")
    ver = codes["Перевірка запису"]
    sent = json.dumps([{"title": "А"}, {"title": "Б"}], ensure_ascii=False)

    v1 = run(ver, saved_json=[{"title": "А"}, {"title": "Б"}], saved_text="",
             sent_json=sent, run_id="rid", avg_score=88.5,
             by_criterion='{"hook": 80}', source="day1_trends", notice="",
             flow_version="final")
    check("усе збережено → all_saved=yes", v1["all_saved"] == "yes")
    check("payload — валідний JSON", isinstance(json.loads(v1["tg_payload"]), dict))

    v2 = run(ver, saved_json=[{"title": "А"}], saved_text="", sent_json=sent,
             run_id="rid", avg_score=70, by_criterion="{}", source="day1_trends",
             notice="", flow_version="final")
    check("недозапис виявлено", v2["all_saved"] == "no" and "Б" in v2["missing"])

    v3 = run(ver, saved_json=[], saved_text='[{"data":[{"title":"А"},{"title":"Б"}]}]',
             sent_json=sent, run_id="rid", avg_score=70, by_criterion="{}",
             source="day1_trends", notice="", flow_version="final")
    check("рядки у вигляді {data:[...]} теж розбираються", v3["saved"] == 2)

    # Регресія: Telegram відповідав 400 «can't parse entities», бо назви
    # критеріїв (format_fit, production_ready) і поле run_id містять непарні
    # підкреслення, а звіт ішов у legacy Markdown.
    crit = '{"format_fit": 43.33, "production_ready": 76.67, "hook": 75.0}'
    v4 = run(ver, saved_json=[{"title": "А"}], saved_text="",
             sent_json=json.dumps([{"title": "А"}]), run_id="rid_1",
             avg_score=77.08, by_criterion=crit, source="day1_trends",
             notice="Тем Day 2 немає — беремо тренди Day 1.", flow_version="final")
    payload = json.loads(v4["tg_payload"])
    check("parse_mode = HTML, а не Markdown", payload["parse_mode"] == "HTML")
    check("підкреслення в назвах критеріїв нікуди не діваються",
          "format_fit" in payload["text"] and "production_ready" in payload["text"])
    check("зірочок legacy-Markdown у тексті немає", "*" not in payload["text"])

    # Небезпечний рядок має опинитися саме в «не збереглося» — інакше він
    # просто не потрапляє в текст і тест нічого не перевіряє.
    v5 = run(ver, saved_json=[{"title": "Б"}], saved_text="",
             sent_json=json.dumps([{"title": "<b>злам</b> & «лапки»"}, {"title": "Б"}]),
             run_id="rid", avg_score=50, by_criterion="{}", source="day1_trends",
             notice="", flow_version="final")
    p5 = json.loads(v5["tg_payload"])
    check("чужі теги екрановано", "&lt;b&gt;" in p5["text"] or "<b>злам" not in p5["text"])
    check("амперсанд екрановано", "&amp;" in p5["text"])
    tags = [t for t in ("<b>", "</b>", "<i>", "</i>", "<code>", "</code>")]
    check("наші власні теги збалансовані",
          all(p5["text"].count(o) == p5["text"].count(c)
              for o, c in zip(tags[::2], tags[1::2])))

    check("плоский звіт лишається без розмітки", "<" not in v4["report_md"])

    print("\n%d passed, %d failed" % (len(PASS), len(FAIL)))
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
