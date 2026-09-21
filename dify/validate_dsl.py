#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Валідатор Dify DSL.

Ловить саме ті помилки, через які імпорт падає мовчки або флоу приїжджає
з порожніми полями:

  • посилання {{#node.field#}} на неіснуючу ноду або неіснуюче поле
  • value_selector у нікуди
  • ребро на видалену ноду
  • iteration без width/height усередині data (перша причина провалу імпорту)
  • тип змінної start поза дозволеним переліком
  • hand-off без structured_output
  • секрет, який поїхав у публічний артефакт

Запуск: python3 dify/validate_dsl.py
"""

import glob
import os
import re
import sys
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
SECRET_RE = re.compile(r"\d{8,12}:AA[\w-]{30,}")
REF_RE = re.compile(r"\{\{#([a-zA-Z0-9_.]+)#\}\}")

START_VAR_TYPES = {"text-input", "paragraph", "number", "select"}
ITER_ERROR_MODES = {"terminated", "continue-on-error", "remove-abnormal-output"}

# Поля, які нода реально віддає наступним нодам.
STATIC_OUTPUTS = {
    "llm": {"text", "reasoning_content", "usage", "finish_reason",
            "structured_output", "files"},
    "tool": {"text", "json", "files"},
    "agent": {"text", "json", "files", "usage"},
    "http-request": {"body", "status_code", "headers", "files"},
    "template-transform": {"output"},
    "variable-aggregator": {"output"},
    "iteration": {"output", "item", "index"},
    "knowledge-retrieval": {"result"},
    "list-operator": {"result", "first_record", "last_record"},
    "question-classifier": {"class_name", "class_id", "usage"},
    "document-extractor": {"text"},
}

SYS_VARS = {"query", "files", "user_id", "app_id", "workflow_id",
            "workflow_run_id", "conversation_id", "dialogue_count"}


class Report:
    def __init__(self, name):
        self.name = name
        self.errors = []
        self.warnings = []

    def err(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)


def outputs_of(node):
    """Множина полів, на які можна послатися у цієї ноди."""
    data = node["data"]
    ntype = data.get("type")
    if ntype == "start":
        return {v["variable"] for v in data.get("variables", [])}
    if ntype == "code":
        return set(data.get("outputs", {}).keys())
    if ntype == "parameter-extractor":
        return ({p["name"] for p in data.get("parameters", [])}
                | {"__is_success", "__reason", "__usage"})
    if ntype == "human-input":
        return ({i["output_variable_name"] for i in data.get("inputs", [])}
                | {"__action_id", "__rendered_content"})
    return set(STATIC_OUTPUTS.get(ntype, set()))


def check_ref(rep, where, node_id, field, by_id):
    """node_id.field — чи існує таке."""
    if node_id == "env":
        return
    if node_id == "sys":
        if field and field.split(".")[0] not in SYS_VARS:
            rep.warn("%s: невідома системна змінна sys.%s" % (where, field))
        return
    if node_id not in by_id:
        rep.err("%s: посилання на неіснуючу ноду '%s'" % (where, node_id))
        return
    if not field:
        return
    head = field.split(".")[0]
    allowed = outputs_of(by_id[node_id])
    if head not in allowed:
        rep.err("%s: нода '%s' (%s) не віддає поле '%s'. Є: %s"
                % (where, by_id[node_id]["data"].get("title") or node_id,
                   by_id[node_id]["data"].get("type"), head,
                   ", ".join(sorted(allowed)) or "—"))


def walk_strings(obj, path=""):
    if isinstance(obj, str):
        yield path, obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield from walk_strings(v, "%s.%s" % (path, k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk_strings(v, "%s[%d]" % (path, i))


def walk_selectors(obj, path=""):
    """Знаходить усі value_selector / variable_selector / *_selector списки."""
    if isinstance(obj, dict):
        # tool_configurations/tool_parameters: {"type": "variable", "value": [node, field]}
        if obj.get("type") == "variable" and isinstance(obj.get("value"), list) \
                and obj["value"] and isinstance(obj["value"][0], str):
            yield path + ".value", obj["value"]
        for k, v in obj.items():
            p = "%s.%s" % (path, k)
            if k.endswith("selector") and isinstance(v, list) and v and isinstance(v[0], str):
                yield p, v
            elif k == "variables" and isinstance(v, list):
                for i, item in enumerate(v):
                    if isinstance(item, list) and item and isinstance(item[0], str):
                        yield "%s[%d]" % (p, i), item
                    else:
                        yield from walk_selectors(item, "%s[%d]" % (p, i))
            else:
                yield from walk_selectors(v, p)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk_selectors(v, "%s[%d]" % (path, i))


def validate(path):
    rep = Report(os.path.basename(path))
    with open(path, encoding="utf-8") as f:
        doc = yaml.safe_load(f)

    if doc.get("kind") != "app":
        rep.err("kind != app")
    if not doc.get("version"):
        rep.err("немає version")

    wf = doc.get("workflow") or {}
    graph = wf.get("graph") or {}
    nodes = graph.get("nodes") or []
    edges = graph.get("edges") or []

    if "viewport" not in graph:
        rep.warn("viewport не всередині graph")

    by_id = {}
    for n in nodes:
        nid = n.get("id")
        if nid in by_id:
            rep.err("дубльований id ноди: %s" % nid)
        by_id[nid] = n

    types = [n["data"].get("type") for n in nodes]
    n_start = types.count("start") + sum(1 for t in types if str(t).startswith("trigger-"))
    if n_start != 1:
        rep.err("вхідних нод має бути рівно 1, знайдено %d" % n_start)
    mode = (doc.get("app") or {}).get("mode")
    if mode == "workflow" and types.count("end") < 1:
        rep.err("mode=workflow, але немає жодної end-ноди")

    # ── ребра
    for e in edges:
        for side in ("source", "target"):
            if e.get(side) not in by_id:
                rep.err("ребро %s: %s='%s' не існує" % (e.get("id"), side, e.get(side)))
        src = by_id.get(e.get("source"))
        if src and src["data"].get("type") == "if-else":
            if e.get("sourceHandle") not in ("true", "false"):
                rep.err("ребро з if-else '%s' має sourceHandle='%s' замість true/false"
                        % (e.get("source"), e.get("sourceHandle")))

    # ноди без вхідного ребра (крім входу й службових)
    targets = {e.get("target") for e in edges}
    sources = {e.get("source") for e in edges}
    # Остання нода всередині ітерації навмисно не має вихідного ребра:
    # її забирає output_selector самої ітерації.
    for n in nodes:
        if n["data"].get("type") == "iteration":
            sel = n["data"].get("output_selector") or []
            if sel:
                sources.add(sel[0])
    for n in nodes:
        t = n["data"].get("type")
        if t in ("start", "iteration-start") or str(t).startswith("trigger-"):
            continue
        if n["id"] not in targets:
            rep.err("нода '%s' (%s) недосяжна — жодного вхідного ребра"
                    % (n["data"].get("title") or n["id"], t))
        if t != "end" and n["id"] not in sources:
            rep.warn("нода '%s' (%s) нікуди не веде"
                     % (n["data"].get("title") or n["id"], t))

    # ── посилання {{#...#}}
    for n in nodes:
        title = n["data"].get("title") or n["id"]
        for path_, s in walk_strings(n["data"], title):
            for ref in REF_RE.findall(s):
                parts = ref.split(".", 1)
                check_ref(rep, path_, parts[0], parts[1] if len(parts) > 1 else "", by_id)

    # ── value_selector
    for n in nodes:
        title = n["data"].get("title") or n["id"]
        for path_, sel in walk_selectors(n["data"], title):
            check_ref(rep, path_, sel[0], ".".join(sel[1:]), by_id)

    # ── start
    for n in nodes:
        if n["data"].get("type") != "start":
            continue
        for v in n["data"].get("variables", []):
            if v.get("type") not in START_VAR_TYPES:
                rep.err("start: змінна '%s' має тип '%s' (дозволено: %s)"
                        % (v.get("variable"), v.get("type"), ", ".join(sorted(START_VAR_TYPES))))
            if v.get("type") == "select" and not v.get("options"):
                rep.err("start: select-змінна '%s' без options" % v.get("variable"))

    # ── iteration
    for n in nodes:
        d = n["data"]
        if d.get("type") != "iteration":
            continue
        title = d.get("title") or n["id"]
        for key in ("width", "height"):
            if key not in d:
                rep.err("iteration '%s': немає data.%s — імпорт впаде" % (title, key))
            if key not in n:
                rep.err("iteration '%s': немає %s на рівні ноди" % (title, key))
        if d.get("error_handle_mode") not in ITER_ERROR_MODES:
            rep.err("iteration '%s': error_handle_mode='%s' поза переліком"
                    % (title, d.get("error_handle_mode")))
        if d.get("start_node_id") not in by_id:
            rep.err("iteration '%s': start_node_id вказує в нікуди" % title)
        inner = [m for m in nodes if m.get("parentId") == n["id"]]
        if not inner:
            rep.err("iteration '%s': всередині немає жодної ноди" % title)
        for m in inner:
            if m["data"].get("iteration_id") != n["id"] and \
                    m["data"].get("type") != "iteration-start":
                rep.err("нода '%s' всередині ітерації без iteration_id"
                        % (m["data"].get("title") or m["id"]))
        # чи вміщає рамка внутрішні ноди
        need_w = max((m["position"]["x"] + m.get("width", 244) for m in inner), default=0)
        if need_w > d.get("width", 0):
            rep.warn("iteration '%s': внутрішні ноди виходять за рамку (%d > %d)"
                     % (title, need_w, d.get("width", 0)))

    # ── hand-off'и: кожен llm, на structured_output якого хтось посилається,
    #    мусить мати structured_output_enabled
    referenced_so = set()
    for n in nodes:
        for _, s in walk_strings(n["data"]):
            for ref in REF_RE.findall(s):
                p = ref.split(".")
                if len(p) > 1 and p[1] == "structured_output":
                    referenced_so.add(p[0])
        for _, sel in walk_selectors(n["data"]):
            if len(sel) > 1 and sel[1] == "structured_output":
                referenced_so.add(sel[0])
    for nid in referenced_so:
        d = by_id.get(nid, {}).get("data", {})
        if not d.get("structured_output_enabled"):
            rep.err("нода '%s' віддає structured_output, але прапорець вимкнено"
                    % (d.get("title") or nid))
        if not (d.get("structured_output") or {}).get("schema"):
            rep.err("нода '%s': structured_output без схеми" % (d.get("title") or nid))

    # ── llm без промпту
    for n in nodes:
        d = n["data"]
        if d.get("type") != "llm":
            continue
        tmpl = d.get("prompt_template") or []
        if not tmpl or not any((t.get("text") or "").strip() for t in tmpl):
            rep.err("llm '%s': порожній prompt_template" % (d.get("title") or n["id"]))
        if not (d.get("model") or {}).get("name"):
            rep.err("llm '%s': не задана модель" % (d.get("title") or n["id"]))

    # ── секрети
    raw = open(path, encoding="utf-8").read()
    hit = SECRET_RE.search(raw)
    if path.endswith(".public.yml"):
        if hit:
            rep.err("у публічному артефакті знайдено секрет: %s…" % hit.group(0)[:14])
    else:
        if not hit:
            rep.warn("у приватному файлі немає токена — нотифікації не підуть")

    return rep, len(nodes), len(edges), referenced_so


def main():
    paths = sorted(glob.glob(os.path.join(HERE, "*.yml")))
    if not paths:
        print("немає .yml — спершу запусти build_dsl.py")
        return 1

    failed = False
    for p in paths:
        rep, n, e, so = validate(p)
        mark = "FAIL" if rep.errors else ("warn" if rep.warnings else " ok ")
        print("[%s] %-34s nodes=%-3d edges=%-3d structured hand-offs=%d"
              % (mark, rep.name, n, e, len(so)))
        for m in rep.errors:
            print("       ✗ %s" % m)
            failed = True
        for m in rep.warnings:
            print("       ! %s" % m)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
