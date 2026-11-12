"""Bundle the front end into ONE html file that needs no server (analysis runs in the browser).

    python tools/build_standalone.py

Writes dist/crewcompass-standalone.html (open by double-click) and dist/crewcompass-artifact.html
(page body only, for hosts that supply their own <html> skeleton). No npm needed: a small module
bundler turns each ES module into a function with its own scope.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FE = ROOT / "frontend"
# standalone: js/api_local.js is registered under the name js/api.js, so every page gets the in-browser engine

IMPORT = re.compile(r'^import\s+(?:\*\s+as\s+(\w+)|\{([^}]*)\})\s+from\s+"([^"]+)";?\s*$', re.M)
DYN = re.compile(r'import\("\./(pages/[\w]+\.js)"\)')


def resolve(frm: str, spec: str) -> str:
    parts = (Path(frm).parent / spec).parts
    out = []
    for p in parts:
        if p == "..":
            out.pop()
        elif p != ".":
            out.append(p)
    return "/".join(out)


def transform(rel: str, src: str) -> str:
    def imp(m):
        star, names, spec = m.groups()
        target = resolve(rel, spec)
        if star:
            return f'const {star} = __req("{target}");'
        items = [x.strip() for x in names.split(",") if x.strip()]
        items = [re.sub(r"\s+as\s+", ": ", x) for x in items]
        return f'const {{{", ".join(items)}}} = __req("{target}");'

    src = IMPORT.sub(imp, src)
    src = DYN.sub(lambda m: f'Promise.resolve(__req("js/{m.group(1)}"))', src)
    exported = []

    def exp(m):
        exported.append(m.group(2))
        return m.group(1) + m.group(2)

    if any("=>" not in ln and re.match(r"export\s+(?:const|let)\s+\w+\s*=[^;(]*,\s*\w+\s*=", ln) for ln in src.splitlines()):
        raise SystemExit(f"{rel}: write one export per declaration (the bundler exports only the first name)")
    src = re.sub(r"^(export\s+(?:async\s+)?(?:function\s+|const\s+|let\s+))(\w+)", lambda m: (exported.append(m.group(2)) or m.group(1).replace("export ", "") + m.group(2)), src, flags=re.M)

    def exp_list(m):
        exported.extend(x.strip() for x in m.group(1).split(",") if x.strip())
        return ""

    src = re.sub(r"^export\s*\{([^}]*)\};?\s*$", exp_list, src, flags=re.M)
    tail = "\n".join(f"exports.{n} = {n};" for n in dict.fromkeys(exported))
    return f'__def("{rel}", function (exports, __req) {{\n{src}\n{tail}\n}});'


def build():
    mods = {}
    for p in sorted((FE / "js").rglob("*.js")):
        rel = p.relative_to(FE).as_posix()
        if rel == "js/api.js":
            continue                      # replaced by api_local.js in the bundle
        mods[rel] = p.read_text(encoding="utf-8")
    # the local api is registered under the name the pages import
    mods["js/api.js"] = mods.pop("js/api_local.js")
    code = []
    for rel, src in mods.items():
        t = transform(rel, src)
        code.append(t)
    runtime = ("var __defs = {}, __cache = {};\n"
               "function __def(n, f) { __defs[n] = f; }\n"
               "function __req(n) { if (__cache[n]) return __cache[n]; var f = __defs[n]; if (!f) throw new Error('missing module ' + n);"
               " var ex = __cache[n] = {}; f(ex, __req); return ex; }\n")
    css = "\n".join((FE / "css" / f).read_text(encoding="utf-8") for f in ("theme.css", "layout.css", "components.css"))
    icon = (FE / "icon.svg").read_text(encoding="utf-8")
    js = "window.__STANDALONE__ = true;\n" + runtime + "\n".join(code) + '\n__req("js/main.js");\n'
    assert "import(" not in js.replace("Promise.resolve", ""), "unbundled import left"
    fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">'
    body = f'<div id="root"><p style="padding:40px;font-family:sans-serif;color:#b8c4d6">Loading CrewCompass…</p></div>\n<script>\n{js}</script>'
    full = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
            "<meta name=\"theme-color\" content=\"#070d19\">\n<title>CrewCompass</title>\n"
            f"<link rel=\"icon\" href=\"data:image/svg+xml,{__import__('urllib.parse').parse.quote(icon)}\">\n{fonts}\n<style>\n{css}\n</style>\n</head>\n<body>\n{body}\n</body>\n</html>\n")
    art = f"<title>CrewCompass</title>\n{fonts}\n<style>\n{css}\n</style>\n{body.replace('window.__STANDALONE__ = true;', 'window.__STANDALONE__ = true; window.__NO_DOWNLOAD__ = true;')}\n"
    out = ROOT / "dist"
    out.mkdir(exist_ok=True)
    (out / "crewcompass-standalone.html").write_text(full, encoding="utf-8")
    (out / "crewcompass-artifact.html").write_text(art, encoding="utf-8")
    print({k: f"{len(v) // 1024} KB" for k, v in {"standalone": full, "artifact": art}.items()}, len(mods), "modules")


if __name__ == "__main__":
    build()
