#!/usr/bin/env python3
"""laya_bench.py — benchmark de un checkpoint de Laya en CPU, en un único proceso.

Registra por separado: import, carga del checkpoint, primera inferencia (fría) y
repeticiones calientes; pico de RSS (ru_maxrss) y RSS por etapa; revisión exacta del
checkpoint en la caché de Hugging Face; y calidad contra casos etiquetados con
aciertos, falsos positivos y falsos negativos por clase.

La API usada (laya.load / agent.predict(state, questions)) es la del SDK documentado.
Si la forma del resultado no se reconoce, el caso se cuenta como "sin interpretar",
no como error de clasificación, y la respuesta cruda queda en raw.jsonl.
"""
import argparse, glob, json, os, platform, resource, statistics, sys, time

def rss_kb():
    with open("/proc/self/status") as f:
        for line in f:
            if line.startswith("VmRSS:"):
                return int(line.split()[1])

def peak_kb():
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss

def pct(v, q):
    v = sorted(v); k = (len(v) - 1) * q; lo = int(k); hi = min(lo + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (k - lo)

def lat(v):
    return {} if not v else {"n": len(v), "median_ms": round(statistics.median(v), 1),
                             "p95_ms": round(pct(v, .95), 1), "max_ms": round(max(v), 1), "min_ms": round(min(v), 1)}

ANSWER_KEYS = ("answer", "value", "choice", "label", "prediction", "result")
PROB_KEYS = ("probabilities", "probs", "scores", "distribution", "confidence")

def to_plain(x, depth=0):
    if depth > 4:
        return repr(x)
    if isinstance(x, (str, int, float, bool)) or x is None:
        return x
    if isinstance(x, dict):
        return {str(k): to_plain(v, depth + 1) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [to_plain(v, depth + 1) for v in x]
    for attr in ("model_dump", "dict", "to_dict"):
        if hasattr(x, attr):
            try:
                return to_plain(getattr(x, attr)(), depth + 1)
            except Exception:
                pass
    if hasattr(x, "__dict__"):
        return {k: to_plain(v, depth + 1) for k, v in vars(x).items() if not k.startswith("_")}
    return repr(x)

def extract(plain, key, labels):
    """Devuelve (respuesta, probabilidades) para la pregunta `key`, o (None, None)."""
    node = plain
    for container in ("answers", "predictions", "outputs", "results"):
        if isinstance(node, dict) and container in node and isinstance(node[container], dict):
            node = node[container]; break
    if not isinstance(node, dict) or key not in node:
        return None, None
    v = node[key]
    probs = None
    if isinstance(v, dict):
        probs = next((v[k] for k in PROB_KEYS if k in v), None)
        v = next((v[k] for k in ANSWER_KEYS if k in v), None)
    if isinstance(v, str) and v in labels:
        return v, probs
    return None, probs

def hf_revision(repo):
    root = os.path.join(os.environ.get("HF_HOME", ""), "hub", "models--" + repo.replace("/", "--"))
    refs = {}
    for p in glob.glob(os.path.join(root, "refs", "*")):
        refs[os.path.basename(p)] = open(p).read().strip()
    snaps = sorted(os.path.basename(p) for p in glob.glob(os.path.join(root, "snapshots", "*")))
    files = {}
    for s in snaps:
        for p in glob.glob(os.path.join(root, "snapshots", s, "**", "*"), recursive=True):
            if os.path.isfile(p):
                files[os.path.relpath(p, os.path.join(root, "snapshots", s))] = os.path.getsize(os.path.realpath(p))
    return {"cache_dir": root, "refs": refs, "snapshots": snaps, "files_bytes": files}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default="convaiinnovations/laya")
    ap.add_argument("--load-kwargs", default="{}", help='JSON extra para laya.load, p. ej. {"revision": "..."}')
    ap.add_argument("--checkpoint-label", default="421M-en")
    ap.add_argument("--cases", required=True)
    ap.add_argument("--repeats", type=int, default=20)
    ap.add_argument("--results-root", required=True)
    ap.add_argument("--condition", default="carga_actual")
    ap.add_argument("--threads", type=int, default=0, help="torch.set_num_threads (0 = por defecto)")
    ap.add_argument("--hf-mode", default="desconocido", choices=["descarga", "offline", "desconocido"],
                    help="descarga: la carga incluye bajar pesos (no válida como medición)")
    a = ap.parse_args()

    suite = json.load(open(a.cases))
    lang = suite["language"]
    ts = time.strftime("%Y%m%dT%H%M%S")
    out = os.path.join(a.results_root, f"laya_bench_{ts}_{a.checkpoint_label}_{lang}_{a.condition}")
    os.makedirs(out, exist_ok=True)
    stages = {"rss_kb_start": rss_kb()}

    t0 = time.perf_counter()
    import torch, laya
    stages["import_s"] = round(time.perf_counter() - t0, 3)
    stages["rss_kb_after_import"] = rss_kb()
    if a.threads:
        torch.set_num_threads(a.threads)

    env = {"timestamp": ts, "condition": a.condition, "language": lang, "cases_file": os.path.abspath(a.cases),
           "cases_version": suite.get("version"), "repo": a.repo, "load_kwargs": json.loads(a.load_kwargs),
           "checkpoint_label": a.checkpoint_label, "laya_version": getattr(laya, "__version__", None),
           "torch_version": torch.__version__, "torch_threads": torch.get_num_threads(),
           "cuda_available": torch.cuda.is_available(), "python": sys.version.split()[0],
           "platform": platform.platform(), "loadavg_start": open("/proc/loadavg").read().split()[:3],
           "repeats": a.repeats, "hf_mode": a.hf_mode,
           "hf_hub_offline_env": os.environ.get("HF_HUB_OFFLINE"),
           "load_time_valid": a.hf_mode == "offline"}

    t0 = time.perf_counter()
    # La ficha documenta device= en el Router; si laya.load no lo acepta, se carga sin él.
    # En ambos casos torch es la variante +cpu (sin CUDA), así que la inferencia es por CPU.
    try:
        agent = laya.load(a.repo, device="cpu", **env["load_kwargs"])
        env["load_device_arg"] = "cpu"
    except TypeError as e:
        if "device" not in str(e):
            raise
        agent = laya.load(a.repo, **env["load_kwargs"])
        env["load_device_arg"] = f"no aceptado por laya.load ({e}); torch sin CUDA"
    stages["load_s"] = round(time.perf_counter() - t0, 3)
    stages["rss_kb_after_load"] = rss_kb()
    env["checkpoint"] = hf_revision(a.repo)
    try:
        env["model_device"] = str(next(agent.model.parameters()).device)  # si el objeto lo expone
    except Exception:
        env["model_device"] = "no expuesto por el SDK (se pidió device='cpu')"

    raw = open(os.path.join(out, "raw.jsonl"), "w")
    rows = []
    def run(suite_i, case, run_idx, phase):
        s = suite["suites"][suite_i]
        t = time.perf_counter()
        res = agent.predict({"message": case["message"]}, s["questions"])
        ms = (time.perf_counter() - t) * 1000
        plain = to_plain(res)
        key = next(iter(s["questions"]))
        labels = list(s["questions"][key]["criteria"])
        ans, probs = extract(plain, key, labels)
        routing = plain.get("routing") if isinstance(plain, dict) else None
        row = {"suite": s["name"], "case": case["id"], "run": run_idx, "phase": phase, "message": case["message"],
               "routing": routing,
               "expected": case["expected"], "answer": ans, "probabilities": probs, "parsed": ans is not None,
               "correct": ans == case["expected"], "wall_ms": round(ms, 1), "raw": plain,
               "loadavg": open("/proc/loadavg").read().split()[0]}
        raw.write(json.dumps(row, ensure_ascii=False, default=repr) + "\n"); raw.flush()
        return row

    cold = run(0, suite["suites"][0]["cases"][0], 0, "cold")
    stages["rss_kb_after_first_predict"] = rss_kb()
    for si, s in enumerate(suite["suites"]):
        for c in s["cases"]:
            for i in range(1, a.repeats + 1):
                rows.append(run(si, c, i, "warm"))
                print(f"\r{s['name']}:{c['id']:<24} {i:>3}/{a.repeats}", end="", flush=True)
    print()
    raw.close()
    stages["peak_rss_kb_ru_maxrss"] = peak_kb()

    quality = {}
    per_case = []
    for s in suite["suites"]:
        key = next(iter(s["questions"])); labels = list(s["questions"][key]["criteria"])
        first = {}
        for r in rows:
            if r["suite"] == s["name"]:
                first.setdefault(r["case"], []).append(r)
        conf = {e: {p: 0 for p in labels + ["sin_interpretar"]} for e in labels}
        for cid, rs in first.items():
            ref = rs[0]
            consistency = sum(r["answer"] == ref["answer"] for r in rs) / len(rs)
            pred = ref["answer"] if ref["parsed"] else "sin_interpretar"
            conf[ref["expected"]][pred] += 1
            per_case.append({"suite": s["name"], "case": cid, "expected": ref["expected"], "answer": ref["answer"],
                             "correct": ref["correct"], "probabilities": ref["probabilities"], "consistency": round(consistency, 3)})
        per_class = {}
        for l in labels:
            tp = conf[l][l]
            fn = sum(conf[l].values()) - tp
            fp = sum(conf[e][l] for e in labels if e != l)
            per_class[l] = {"TP": tp, "FP": fp, "FN": fn,
                            "precision": round(tp / (tp + fp), 3) if tp + fp else None,
                            "recall": round(tp / (tp + fn), 3) if tp + fn else None}
        n = len(first)
        quality[s["name"]] = {"cases": n, "correct": sum(c["correct"] for c in per_case if c["suite"] == s["name"]),
                              "unparsed": sum(conf[e]["sin_interpretar"] for e in labels),
                              "per_class": per_class, "confusion": conf}

    summary = {"env": env, "stages": stages,
               "cold_first_predict_ms": cold["wall_ms"], "cold_correct": cold["correct"],
               "warm_latency": lat([r["wall_ms"] for r in rows]),
               "warm_latency_by_suite": {s["name"]: lat([r["wall_ms"] for r in rows if r["suite"] == s["name"]]) for s in suite["suites"]},
               "loadavg_end": open("/proc/loadavg").read().split()[:3],
               "routing_seen": sorted({json.dumps(r["routing"], sort_keys=True) for r in rows + [cold]}),
               "quality": quality, "per_case": per_case}
    json.dump(summary, open(os.path.join(out, "summary.json"), "w"), indent=2, ensure_ascii=False, default=repr)

    md = [f"# Laya — {a.checkpoint_label} — {lang} — {a.condition}", "",
          f"- laya {env['laya_version']}, torch {env['torch_version']} ({env['torch_threads']} hilos), cuda disponible: {env['cuda_available']}",
          f"- checkpoint: {a.repo} {env['load_kwargs']} refs={env['checkpoint']['refs']} snapshots={env['checkpoint']['snapshots']}",
          f"- enrutamiento observado: {summary['routing_seen']} | device en load: {env['load_device_arg']}",
          f"- modo HF: **{a.hf_mode}**" + ("" if a.hf_mode == "offline" else " — la carga incluye descarga: NO es una medición válida"),
          f"- import {stages['import_s']} s, carga {stages['load_s']} s, primera inferencia {cold['wall_ms']} ms",
          f"- caliente: {summary['warm_latency']}",
          f"- RSS: tras import {stages['rss_kb_after_import']/1024:.0f} MiB, tras carga {stages['rss_kb_after_load']/1024:.0f} MiB, pico {stages['peak_rss_kb_ru_maxrss']/1024:.0f} MiB",
          f"- loadavg inicio/fin: {env['loadavg_start']} / {summary['loadavg_end']}", ""]
    for name, q in quality.items():
        md += [f"## {name}: {q['correct']}/{q['cases']} correctos, {q['unparsed']} sin interpretar", "",
               "| clase | TP | FP | FN | precisión | recall |", "|---|---|---|---|---|---|"]
        md += [f"| {l} | {v['TP']} | {v['FP']} | {v['FN']} | {v['precision']} | {v['recall']} |" for l, v in q["per_class"].items()]
        md += [""]
    md += ["| suite | caso | esperado | obtenido | ✔ | consistencia | probabilidades |", "|---|---|---|---|---|---|---|"]
    md += [f"| {c['suite']} | {c['case']} | {c['expected']} | {c['answer']} | {'✔' if c['correct'] else '✘'} | {c['consistency']} | {json.dumps(c['probabilities'], ensure_ascii=False, default=repr)[:80] if c['probabilities'] is not None else ''} |" for c in per_case]
    open(os.path.join(out, "summary.md"), "w").write("\n".join(md) + "\n")
    print("\n".join(md[:10]))
    print(f"\nresultados: {out}")

if __name__ == "__main__":
    main()
