#!/usr/bin/env python3
"""fg_raw_bench.py — FunctionGemma con su PLANTILLA OFICIAL, sin la plantilla de Ollama.

Objetivo: separar "el modelo no sabe" de "Ollama le arma mal el prompt".
  1. Extrae `tokenizer.chat_template` (Jinja) del propio archivo GGUF del modelo.
  2. Arma el prompt exacto con esa plantilla: mensaje `developer` de activación + herramientas + usuario.
  3. Lo envía a /api/generate con raw=true (Ollama no aplica su plantilla) y cortes en los
     tokens de fin de llamada/turno.
  4. Interpreta `<start_function_call>call:NOMBRE{arg:<escape>valor<escape>,...}` y puntúa
     con los mismos criterios que fg_bench.py (herramienta, argumentos, abstención).
Guarda la plantilla extraída y el prompt del primer caso para poder revisarlos.
Requiere jinja2 (python3 -c "import jinja2"). Ninguna función se ejecuta.
"""
import argparse, glob, json, os, re, struct, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fg_bench as fb  # reutiliza puntuación, estadísticas y HTTP

ACTIVATION = "You are a model that can do function calling with the following functions"

# ------------------------------------------------------------ GGUF: leer una clave de metadatos
_SCALAR = {0: "<B", 1: "<b", 2: "<H", 3: "<h", 4: "<I", 5: "<i", 6: "<f", 7: "<?", 10: "<Q", 11: "<q", 12: "<d"}

def _read_str(f):
    (n,) = struct.unpack("<Q", f.read(8))
    return f.read(n).decode("utf-8", errors="replace")

def _read_val(f, t, keep):
    if t in _SCALAR:
        fmt = _SCALAR[t]; return struct.unpack(fmt, f.read(struct.calcsize(fmt)))[0]
    if t == 8:
        if keep:
            return _read_str(f)
        (n,) = struct.unpack("<Q", f.read(8)); f.seek(n, 1); return None
    if t == 9:
        (et,) = struct.unpack("<I", f.read(4)); (cnt,) = struct.unpack("<Q", f.read(8))
        if et in _SCALAR:
            f.seek(struct.calcsize(_SCALAR[et]) * cnt, 1); return None
        for _ in range(cnt):
            _read_val(f, et, False)
        return None
    raise ValueError(f"tipo GGUF desconocido {t}")

def gguf_keys(path):
    """Lista (clave, tipo) de todos los metadatos; para diagnóstico."""
    keys = []
    with open(path, "rb") as f:
        f.read(4); f.read(4); _t, kvs = struct.unpack("<QQ", f.read(16))
        for _ in range(kvs):
            key = _read_str(f); (t,) = struct.unpack("<I", f.read(4)); _read_val(f, t, False); keys.append((key, t))
    return keys

def gguf_get_lib(path, wanted):
    """Alternativa con el paquete oficial `gguf` de llama.cpp, si está instalado."""
    try:
        import gguf
    except ImportError:
        return {}
    r = gguf.GGUFReader(path); out = {}
    for k in wanted:
        fld = r.fields.get(k)
        if fld is None:
            continue
        try:
            out[k] = fld.contents()
        except Exception:
            out[k] = bytes(fld.parts[fld.data[0]]).decode("utf-8", "replace")
    return out

def gguf_get(path, wanted):
    out = {}
    with open(path, "rb") as f:
        if f.read(4) != b"GGUF":
            raise ValueError("no es un archivo GGUF")
        (ver,) = struct.unpack("<I", f.read(4))
        _tensors, kvs = struct.unpack("<QQ", f.read(16))
        for _ in range(kvs):
            key = _read_str(f); (t,) = struct.unpack("<I", f.read(4))
            v = _read_val(f, t, key in wanted)
            if key in wanted:
                out[key] = v
                if len(out) == len(wanted):
                    break
    return out

def find_model_blob(models_dir, model):
    name, tag = (model.split(":", 1) + ["latest"])[:2]
    mf = os.path.join(models_dir, "manifests", "registry.ollama.ai", "library", name, tag)
    man = json.load(open(mf))
    layer = next(l for l in man["layers"] if l["mediaType"].endswith(".model"))
    return os.path.join(models_dir, "blobs", layer["digest"].replace(":", "-"))

# ------------------------------------------------------------ plantilla Jinja estilo Hugging Face
def make_renderer(template):
    import jinja2
    from jinja2.sandbox import ImmutableSandboxedEnvironment
    env = ImmutableSandboxedEnvironment(trim_blocks=True, lstrip_blocks=True, extensions=["jinja2.ext.loopcontrols"])
    def raise_exception(msg):
        raise jinja2.exceptions.TemplateError(msg)
    env.filters["tojson"] = lambda x, indent=None, ensure_ascii=False: json.dumps(x, indent=indent, ensure_ascii=ensure_ascii)
    env.globals["raise_exception"] = raise_exception
    env.globals["strftime_now"] = lambda fmt: time.strftime(fmt)
    tpl = env.from_string(template)
    return lambda messages, tools: tpl.render(messages=messages, tools=tools, add_generation_prompt=True,
                                              bos_token="<bos>", eos_token="<eos>")

# ------------------------------------------------------------ interpretar la salida
CALL_RE = re.compile(r"<start_function_call>\s*call:([A-Za-z0-9_\-\.]+)\{(.*?)\}\s*(?:<end_function_call>|$)", re.S)

def parse_args(body):
    args, i = {}, 0
    while i < len(body):
        m = re.match(r"\s*,?\s*([A-Za-z0-9_]+)\s*:", body[i:])
        if not m:
            break
        key = m.group(1); i += m.end()
        if body.startswith("<escape>", i):
            j = body.find("<escape>", i + 8)
            val = body[i + 8: j if j >= 0 else len(body)]
            i = (j + 8) if j >= 0 else len(body)
        else:
            m2 = re.match(r"([^,}]*)", body[i:]); raw = m2.group(1).strip(); i += m2.end()
            try:
                val = json.loads(raw)
            except ValueError:
                val = raw
        args[key] = val
    return args

def parse_calls(text):
    calls = []
    for m in CALL_RE.finditer(text or ""):
        calls.append({"name": m.group(1), "arguments": parse_args(m.group(2))})
    return calls

# ------------------------------------------------------------ principal
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--models-dir", required=True, help="OLLAMA_MODELS de la instancia")
    ap.add_argument("--cases", required=True)
    ap.add_argument("--repeats", type=int, default=3)
    ap.add_argument("--num-predict", type=int, default=128)
    ap.add_argument("--no-activation", action="store_true", help="omitir el mensaje developer de activación")
    ap.add_argument("--keep-bos", action="store_true",
                    help="conservar <bos> de la plantilla (por defecto se quita: el GGUF declara add_bos_token y el servidor lo agrega)")
    ap.add_argument("--results-root", required=True)
    ap.add_argument("--condition", default="carga_actual")
    a = ap.parse_args()

    try:
        import jinja2  # noqa: F401
    except ImportError:
        sys.exit("falta jinja2: instalar python3-jinja2 (apt) o usar un venv con 'pip install jinja2'")

    suite = json.load(open(a.cases)); lang = suite["language"]; tools = suite["tools"]
    offered = {t["function"]["name"] for t in tools}
    ts = time.strftime("%Y%m%dT%H%M%S")
    variant = ("raw-sin-act" if a.no_activation else "raw-act") + f"_np{a.num_predict}"
    out = os.path.join(a.results_root, f"fg_raw_{ts}_{lang}_{a.condition}_{variant}")
    os.makedirs(out, exist_ok=True)

    blob = find_model_blob(a.models_dir, a.model)
    meta = gguf_get(blob, {"tokenizer.chat_template", "tokenizer.ggml.add_bos_token"})
    template = meta.get("tokenizer.chat_template")
    if not template:
        meta.update(gguf_get_lib(blob, {"tokenizer.chat_template", "tokenizer.ggml.add_bos_token"}))
        template = meta.get("tokenizer.chat_template")
    if not template:
        try:
            keys = gguf_keys(blob)
            open(os.path.join(out, "gguf_keys.txt"), "w").write("\n".join(f"{k}\t{t}" for k, t in keys))
            diag = f"{len(keys)} claves; relacionadas: {[k for k, _ in keys if 'template' in k or 'chat' in k]}"
        except Exception as e:
            diag = f"error leyendo claves: {e!r}"
        sys.exit(f"no se encontró tokenizer.chat_template en {blob} ({diag}); lista completa en {out}/gguf_keys.txt")
    open(os.path.join(out, "chat_template.jinja"), "w").write(template)
    render = make_renderer(template)

    def build(prompt):
        msgs = ([] if a.no_activation else [{"role": "developer", "content": ACTIVATION}]) + [{"role": "user", "content": prompt}]
        p = render(msgs, tools)
        if not a.keep_bos and p.startswith("<bos>"):
            p = p[len("<bos>"):]
        return p

    first_prompt = build(suite["cases"][0]["prompt"])
    open(os.path.join(out, "prompt_ejemplo.txt"), "w").write(first_prompt)

    options = {"temperature": 0, "seed": 42, "num_gpu": 0, "num_predict": a.num_predict,
               "stop": ["<end_function_call>", "<start_function_response>", "<end_of_turn>"]}

    def gen(prompt):
        body = {"model": a.model, "prompt": prompt, "raw": True, "stream": False, "options": options, "keep_alive": "10m"}
        t0 = time.perf_counter(); resp = fb.http_json(a.url + "/api/generate", body)
        return resp, (time.perf_counter() - t0) * 1000

    env = {"timestamp": ts, "variant": variant, "model": a.model, "blob": blob, "options": options,
           "ollama_version": fb.http_json(a.url + "/api/version").get("version"),
           "loadavg_start": open("/proc/loadavg").read().split()[:3], "activation": not a.no_activation,
           "gguf_add_bos_token": meta.get("tokenizer.ggml.add_bos_token"), "keep_bos": a.keep_bos}

    raw = open(os.path.join(out, "raw.jsonl"), "w"); rows = []
    for case in suite["cases"]:
        p = build(case["prompt"])
        for i in range(1, a.repeats + 1):
            resp, wall = gen(p)
            text = resp.get("response", "")
            # el corte quita <end_function_call>; se repone para interpretar
            calls = parse_calls(text + ("<end_function_call>" if "<start_function_call>" in text else ""))
            sc = fb.score(case, calls, offered)
            row = {"case": case["id"], "category": case["category"], "run": i, "prompt": case["prompt"],
                   "expected": case["expected"], "text": text, "tool_calls": calls, "score": sc,
                   "wall_ms": round(wall, 1), "total_ms": round(resp.get("total_duration", 0) / 1e6, 1),
                   "eval_count": resp.get("eval_count"), "done_reason": resp.get("done_reason")}
            raw.write(json.dumps(row, ensure_ascii=False) + "\n"); raw.flush(); rows.append(row)
            print(f"\r{case['id']:<28} {i:>3}/{a.repeats}", end="", flush=True)
    print(); raw.close()

    per = {}
    for r in rows:
        per.setdefault(r["case"], []).append(r)
    q_rows = []
    for cid, rs in per.items():
        ref = rs[0]; sig = lambda r: json.dumps(r["tool_calls"], sort_keys=True)
        q_rows.append({"case": cid, "category": ref["category"], **ref["score"],
                       "consistency": round(sum(sig(r) == sig(ref) for r in rs) / len(rs), 3),
                       "first_call": ref["tool_calls"][0] if ref["tool_calls"] else None, "text": ref["text"][:160]})
    calls_c = [q for q in q_rows if q["expected_call"]]; abst_c = [q for q in q_rows if not q["expected_call"]]
    tp = sum(q["predicted_call"] for q in calls_c); fp = sum(q["predicted_call"] for q in abst_c)
    quality = {"tool_correct": f"{sum(q['tool_correct'] for q in calls_c)}/{len(calls_c)}",
               "args_correct": f"{sum(q['args_correct'] for q in calls_c)}/{len(calls_c)}",
               "abstention_correct": f"{len(abst_c) - fp}/{len(abst_c)}",
               "call_vs_abstain": {"TP": tp, "FN": len(calls_c) - tp, "FP": fp, "TN": len(abst_c) - fp},
               "invented_tool": sum(q["invented_tool"] for q in q_rows),
               "strict_correct": f"{sum(q['strict_correct'] for q in q_rows)}/{len(q_rows)}"}
    summary = {"env": env, "latency_wall": fb.lat_stats([r["wall_ms"] for r in rows]),
               "truncated": sum(r["done_reason"] == "length" for r in rows), "quality": quality, "per_case": q_rows,
               "loadavg_end": open("/proc/loadavg").read().split()[:3]}
    json.dump(summary, open(os.path.join(out, "summary.json"), "w"), indent=2, ensure_ascii=False)
    md = [f"# FunctionGemma RAW (plantilla oficial) — {lang} — {variant}", "",
          f"- latencia pared: {summary['latency_wall']}; cortadas por tope: {summary['truncated']}/{len(rows)}",
          f"- calidad: {json.dumps(quality, ensure_ascii=False)}", "",
          "| caso | esperado | obtenido | ✔ |", "|---|---|---|---|"]
    for qr in q_rows:
        c = next(x for x in suite["cases"] if x["id"] == qr["case"])
        exp = "abstención" if c["expected"].get("abstain") else f"{c['expected']['tool']}({json.dumps(c['expected']['args'], ensure_ascii=False)})"
        got = "abstención" if not qr["first_call"] else f"{qr['first_call']['name']}({json.dumps(qr['first_call']['arguments'], ensure_ascii=False)})"
        md.append(f"| {qr['case']} | {exp} | {got} | {'✔' if qr['strict_correct'] else '✘'} |")
    open(os.path.join(out, "summary.md"), "w").write("\n".join(md) + "\n")
    print("\n".join(md)); print(f"\nresultados: {out}")

if __name__ == "__main__":
    main()
