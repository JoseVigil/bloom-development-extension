#!/usr/bin/env python3
"""fg_bench.py — benchmark de FunctionGemma vía API de chat de Ollama (sólo biblioteca estándar).

Mide, contra una instancia de Ollama ya iniciada:
  * carga fría (modelo descargado de memoria antes de empezar) y latencia fría,
  * latencia caliente repetida (mediana, p95, peor caso), tiempo de pared y duraciones de Ollama,
  * pico de RSS del servidor + procesos hijos (runner) y mínimo de MemAvailable,
  * confirmación de CPU (size_vram == 0 en /api/ps),
  * calidad contra casos etiquetados: herramienta, argumentos y abstención, por separado.

El modelo sólo PROPONE llamadas: ninguna función se ejecuta.
"""
import argparse, json, os, platform, re, statistics, sys, threading, time, unicodedata
import urllib.request, urllib.error

# ---------------------------------------------------------------- utilidades HTTP
def http_json(url, payload=None, timeout=600):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:2000]
        sys.exit(f"Ollama respondió HTTP {e.code} en {url}: {body}")

# ---------------------------------------------------------------- memoria
def meminfo_kb(key):
    with open("/proc/meminfo") as f:
        for line in f:
            if line.startswith(key + ":"):
                return int(line.split()[1])
    return None

def children_map():
    kids = {}
    for d in os.listdir("/proc"):
        if not d.isdigit():
            continue
        try:
            with open(f"/proc/{d}/stat") as f:
                s = f.read()
            ppid = int(s[s.rindex(")") + 2:].split()[1])
            kids.setdefault(ppid, []).append(int(d))
        except (OSError, ValueError):
            pass
    return kids

def tree_rss_kb(root_pid):
    kids = children_map()
    todo, seen, total = [root_pid], set(), 0
    while todo:
        p = todo.pop()
        if p in seen:
            continue
        seen.add(p)
        try:
            with open(f"/proc/{p}/status") as f:
                for line in f:
                    if line.startswith("VmRSS:"):
                        total += int(line.split()[1])
                        break
        except OSError:
            pass
        todo.extend(kids.get(p, []))
    return total, len(seen)

class MemSampler(threading.Thread):
    def __init__(self, pid, interval=0.1):
        super().__init__(daemon=True)
        self.pid, self.interval = pid, interval
        self.peak_rss_kb, self.peak_procs, self.min_avail_kb = 0, 0, None
        self._halt = threading.Event()
    def run(self):
        while not self._halt.is_set():
            if self.pid:
                rss, n = tree_rss_kb(self.pid)
                if rss > self.peak_rss_kb:
                    self.peak_rss_kb, self.peak_procs = rss, n
            a = meminfo_kb("MemAvailable")
            if a is not None and (self.min_avail_kb is None or a < self.min_avail_kb):
                self.min_avail_kb = a
            time.sleep(self.interval)
    def stop(self):
        self._halt.set(); self.join(timeout=2)

# ---------------------------------------------------------------- evaluación
def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().casefold()
    s = re.sub(r"[^\w\s]", " ", s)
    return " ".join(s.split())

def arg_match(expected, got, mode):
    if mode == "norm":
        return norm(expected) == norm(got)
    if mode == "int":
        try:
            return int(float(got)) == int(expected)
        except (TypeError, ValueError):
            return False
    return got == expected  # exact

def parse_calls(message):
    calls = []
    for tc in (message or {}).get("tool_calls") or []:
        fn = tc.get("function", {})
        args = fn.get("arguments", {})
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except json.JSONDecodeError:
                args = {"__unparsed__": args}
        calls.append({"name": fn.get("name"), "arguments": args})
    return calls

def score(case, calls, offered):
    exp = case["expected"]
    first = calls[0] if calls else None
    r = {"predicted_call": first is not None, "n_calls": len(calls),
         "invented_tool": bool(first and first["name"] not in offered)}
    if exp.get("abstain"):
        r["expected_call"] = False
        r["abstain_correct"] = first is None
        alts = exp.get("acceptable_alternatives", [])
        r["lenient_correct"] = r["abstain_correct"] or any(
            first and first["name"] == a["tool"] and all(
                arg_match(v, first["arguments"].get(k), a.get("match", {}).get(k, "exact"))
                for k, v in a["args"].items()) for a in alts)
    else:
        r["expected_call"] = True
        r["tool_correct"] = bool(first and first["name"] == exp["tool"])
        match = exp.get("match", {})
        if r["tool_correct"]:
            got = first["arguments"]
            r["args_correct"] = all(arg_match(v, got.get(k), match.get(k, "exact")) for k, v in exp["args"].items())
            r["arg_types_exact"] = all(type(got.get(k)) is type(v) for k, v in exp["args"].items())
            r["extra_args"] = sorted(set(got) - set(exp["args"]))
        else:
            r["args_correct"] = False
        r["lenient_correct"] = r["tool_correct"] and r["args_correct"]
    r["strict_correct"] = r.get("abstain_correct", False) if not r["expected_call"] else (r["tool_correct"] and r["args_correct"])
    return r

def pct(values, q):
    if not values:
        return None
    v = sorted(values)
    k = (len(v) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (k - lo)

def lat_stats(values):
    if not values:
        return {}
    return {"n": len(values), "median_ms": round(statistics.median(values), 1),
            "p95_ms": round(pct(values, 0.95), 1), "max_ms": round(max(values), 1),
            "min_ms": round(min(values), 1)}

# ---------------------------------------------------------------- principal
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--cases", required=True, help="archivo JSON de casos (un idioma por archivo)")
    ap.add_argument("--repeats", type=int, default=20, help="repeticiones calientes por caso")
    ap.add_argument("--server-pid", type=int, default=0)
    ap.add_argument("--results-root", required=True)
    ap.add_argument("--condition", default="carga_actual", help="etiqueta de condición de la máquina")
    ap.add_argument("--num-thread", type=int, default=0, help="0 = decide Ollama")
    ap.add_argument("--system", default=None, help="instrucción inicial opcional (FunctionGemma requiere la de activación)")
    ap.add_argument("--system-role", default="system", choices=["system", "developer"],
                    help="rol del mensaje de --system (la ficha de Google usa 'developer')")
    ap.add_argument("--activation", action="store_true",
                    help="usa la instrucción de activación de la ficha de Google como --system")
    ap.add_argument("--num-predict", type=int, default=256,
                    help="tope de tokens generados por solicitud (0 = sin tope); evita corridas hasta llenar el contexto")
    ap.add_argument("--stop", action="append", default=[], help="secuencia de corte (repetible)")
    args = ap.parse_args()
    if args.activation and not args.system:
        args.system = "You are a model that can do function calling with the following functions"

    suite = json.load(open(args.cases))
    lang = suite["language"]
    tools = suite["tools"]
    offered = {t["function"]["name"] for t in tools}
    ts = time.strftime("%Y%m%dT%H%M%S")
    variant = ("act-" + args.system_role if args.system else "sin-act") + (f"_np{args.num_predict}" if args.num_predict else "")
    out = os.path.join(args.results_root, f"fg_bench_{ts}_{lang}_{args.condition}_{variant}")
    os.makedirs(out, exist_ok=True)

    options = {"temperature": 0, "seed": 42, "num_gpu": 0}
    if args.num_predict:
        options["num_predict"] = args.num_predict
    if args.stop:
        options["stop"] = args.stop
    if args.num_thread:
        options["num_thread"] = args.num_thread

    env = {
        "timestamp": ts, "condition": args.condition, "language": lang, "cases_file": os.path.abspath(args.cases),
        "cases_sha_hint": suite.get("version"), "model": args.model, "url": args.url, "options": options,
        "repeats": args.repeats, "platform": platform.platform(), "python": sys.version.split()[0],
        "system_prompt": args.system, "system_role": args.system_role if args.system else None, "variant": variant,
        "ollama_version": http_json(args.url + "/api/version").get("version"),
        "loadavg_start": open("/proc/loadavg").read().split()[:3],
        "memavailable_kb_start": meminfo_kb("MemAvailable"),
    }
    tags = http_json(args.url + "/api/tags")
    env["model_tag"] = next((m for m in tags.get("models", []) if args.model in (m.get("name"), m.get("model"))), None)
    if not env["model_tag"]:
        sys.exit(f"el modelo {args.model} no está en la instancia; correr 'pull' primero")
    show = http_json(args.url + "/api/show", {"model": args.model})
    env["model_details"] = show.get("details")

    def chat(prompt, keep_alive="10m"):
        msgs = ([{"role": args.system_role, "content": args.system}] if args.system else []) + [{"role": "user", "content": prompt}]
        body = {"model": args.model, "messages": msgs, "tools": tools, "stream": False,
                "options": options, "keep_alive": keep_alive}
        t0 = time.perf_counter()
        resp = http_json(args.url + "/api/chat", body)
        wall = (time.perf_counter() - t0) * 1000
        return resp, wall

    # 1) descargar el modelo de memoria para una carga fría real
    http_json(args.url + "/api/generate", {"model": args.model, "keep_alive": 0})
    for _ in range(50):
        if not http_json(args.url + "/api/ps").get("models"):
            break
        time.sleep(0.2)
    idle_rss_kb, _ = tree_rss_kb(args.server_pid) if args.server_pid else (None, None)
    env["server_rss_kb_before_load"] = idle_rss_kb

    sampler = MemSampler(args.server_pid)
    sampler.start()
    raw = open(os.path.join(out, "raw.jsonl"), "w")

    def record(case, run_idx, phase, resp, wall):
        calls = parse_calls(resp.get("message"))
        sc = score(case, calls, offered)
        ns = lambda k: round(resp.get(k, 0) / 1e6, 2) if resp.get(k) is not None else None
        row = {"case": case["id"], "category": case["category"], "run": run_idx, "phase": phase,
               "prompt": case["prompt"], "expected": case["expected"],
               "response_content": (resp.get("message") or {}).get("content"),
               "tool_calls": calls, "score": sc, "wall_ms": round(wall, 1),
               "total_ms": ns("total_duration"), "load_ms": ns("load_duration"),
               "prompt_eval_ms": ns("prompt_eval_duration"), "eval_ms": ns("eval_duration"),
               "prompt_eval_count": resp.get("prompt_eval_count"), "eval_count": resp.get("eval_count"),
               "done_reason": resp.get("done_reason"),
               "loadavg": open("/proc/loadavg").read().split()[0]}
        raw.write(json.dumps(row, ensure_ascii=False) + "\n"); raw.flush()
        return row

    rows = []
    # 2) solicitud fría: primer caso, modelo descargado
    first = suite["cases"][0]
    resp, wall = chat(first["prompt"])
    cold = record(first, 0, "cold", resp, wall)
    ps = http_json(args.url + "/api/ps").get("models", [])
    env["api_ps_after_load"] = ps
    env["cpu_confirmed"] = bool(ps) and all(m.get("size_vram", 0) == 0 for m in ps)

    # 3) repeticiones calientes para todos los casos
    for case in suite["cases"]:
        for i in range(1, args.repeats + 1):
            resp, wall = chat(case["prompt"])
            rows.append(record(case, i, "warm", resp, wall))
            print(f"\r{case['id']:<28} {i:>3}/{args.repeats}", end="", flush=True)
    print()
    sampler.stop(); raw.close()

    # 4) resumen
    per_case = {}
    for r in rows:
        per_case.setdefault(r["case"], []).append(r)
    quality_rows, cons = [], []
    for cid, rs in per_case.items():
        ref = rs[0]  # primera corrida caliente (temperature 0)
        sig = lambda r: json.dumps(r["tool_calls"], sort_keys=True)
        consistency = sum(sig(r) == sig(ref) for r in rs) / len(rs)
        cons.append(consistency)
        quality_rows.append({"case": cid, "category": ref["category"], **ref["score"],
                             "consistency": round(consistency, 3),
                             "first_call": ref["tool_calls"][0] if ref["tool_calls"] else None})

    call_cases = [q for q in quality_rows if q["expected_call"]]
    abst_cases = [q for q in quality_rows if not q["expected_call"]]
    tp = sum(q["predicted_call"] for q in call_cases)
    fn = len(call_cases) - tp
    fp = sum(q["predicted_call"] for q in abst_cases)
    tn = len(abst_cases) - fp
    quality = {
        "cases": len(quality_rows),
        "tool_correct": f"{sum(q['tool_correct'] for q in call_cases)}/{len(call_cases)}",
        "args_correct": f"{sum(q['args_correct'] for q in call_cases)}/{len(call_cases)}",
        "abstention_correct": f"{tn}/{len(abst_cases)}",
        "call_vs_abstain": {"TP_llamada": tp, "FN_llamada_omitida": fn, "FP_llamada_indebida": fp, "TN_abstencion": tn},
        "invented_tool": sum(q["invented_tool"] for q in quality_rows),
        "args_correct_but_type_differs": sum(1 for q in call_cases if q["args_correct"] and not q.get("arg_types_exact", True)),
        "strict_correct": f"{sum(q['strict_correct'] for q in quality_rows)}/{len(quality_rows)}",
        "lenient_correct": f"{sum(q['lenient_correct'] for q in quality_rows)}/{len(quality_rows)}",
        "by_category": {},
        "min_consistency": min(cons) if cons else None,
    }
    for q in quality_rows:
        c = quality["by_category"].setdefault(q["category"], [0, 0])
        c[0] += q["strict_correct"]; c[1] += 1

    warm = [r for r in rows]
    summary = {
        "env": env,
        "cold": {"case": cold["case"], "wall_ms": cold["wall_ms"], "load_ms": cold["load_ms"],
                 "total_ms": cold["total_ms"], "correct": cold["score"]["strict_correct"]},
        "warm_latency_wall": lat_stats([r["wall_ms"] for r in warm]),
        "warm_latency_ollama_total": lat_stats([r["total_ms"] for r in warm if r["total_ms"] is not None]),
        "warm_load_ms_max": max((r["load_ms"] or 0) for r in warm) if warm else None,
        "warm_load_ms_median": statistics.median([r["load_ms"] or 0 for r in warm]) if warm else None,
        "truncated_by_length": sum(1 for r in warm if r.get("done_reason") == "length"),
        "eval_tokens_median": statistics.median([r["eval_count"] or 0 for r in warm]) if warm else None,
        "eval_tokens_per_s_median": statistics.median([r["eval_count"] / (r["eval_ms"] / 1000) for r in warm if r.get("eval_count") and r.get("eval_ms")]) if warm else None,
        "memory": {"server_rss_kb_before_load": idle_rss_kb,
                   "peak_tree_rss_kb": sampler.peak_rss_kb, "peak_tree_procs": sampler.peak_procs,
                   "memavailable_kb_start": env["memavailable_kb_start"],
                   "memavailable_kb_min": sampler.min_avail_kb},
        "loadavg_end": open("/proc/loadavg").read().split()[:3],
        "quality": quality,
        "per_case": quality_rows,
    }
    json.dump(summary, open(os.path.join(out, "summary.json"), "w"), indent=2, ensure_ascii=False)

    md = [f"# FunctionGemma — {args.model} — {lang} — {args.condition} — {variant}", "",
          f"- instrucción inicial: {repr(args.system)} (rol {args.system_role if args.system else '-'}); num_predict={args.num_predict}; stop={args.stop}",
          f"- cortadas por tope de tokens: {summary['truncated_by_length']}/{len(warm)}; tokens generados (mediana): {summary['eval_tokens_median']}; velocidad de generación (mediana): {round(summary['eval_tokens_per_s_median'] or 0, 1)} tok/s; load_ms informado (mediana): {summary['warm_load_ms_median']}",
          f"- Ollama {env['ollama_version']}, digest `{(env['model_tag'] or {}).get('digest')}`",
          f"- CPU confirmada (size_vram=0): **{env['cpu_confirmed']}**",
          f"- loadavg inicio/fin: {env['loadavg_start']} / {summary['loadavg_end']}",
          f"- Fría: pared {cold['wall_ms']} ms, carga {cold['load_ms']} ms",
          f"- Caliente pared: {summary['warm_latency_wall']}",
          f"- Caliente Ollama total: {summary['warm_latency_ollama_total']}",
          f"- RSS pico (servidor+hijos): {sampler.peak_rss_kb/1024:.0f} MiB; MemAvailable mín: {(sampler.min_avail_kb or 0)/1024:.0f} MiB",
          "", "## Calidad", "", "```", json.dumps(quality, indent=2, ensure_ascii=False), "```", "",
          "| caso | categoría | esperado | obtenido | estricto | consistencia |", "|---|---|---|---|---|---|"]
    for q in quality_rows:
        case = next(c for c in suite["cases"] if c["id"] == q["case"])
        exp = "abstención" if case["expected"].get("abstain") else f"{case['expected']['tool']}({json.dumps(case['expected']['args'], ensure_ascii=False)})"
        got = "abstención" if not q["first_call"] else f"{q['first_call']['name']}({json.dumps(q['first_call']['arguments'], ensure_ascii=False)})"
        md.append(f"| {q['case']} | {q['category']} | {exp} | {got} | {'✔' if q['strict_correct'] else '✘'} | {q['consistency']} |")
    open(os.path.join(out, "summary.md"), "w").write("\n".join(md) + "\n")
    print("\n".join(md[:11]))
    print(f"\nresultados: {out}")

if __name__ == "__main__":
    main()
