
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
        "chat_id": "{{CHAT_ID}}",  # підставляє build_dsl.py з TELEGRAM_CHAT_ID
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
