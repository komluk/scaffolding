#!/usr/bin/env python3
"""refactor-guard core. Stdin: PreToolUse JSON. Stdout: optional PreToolUse JSON (deny or additionalContext).

Detects an Edit/MultiEdit/Write (or Bash `sed -i` / `perl -pi`, including file lists coming from
`xargs` / `$(...)`) that renames or removes an exported symbol, then checks the session transcript for an
earlier LSP findReferences (on a file defining the symbol) or graphify query (symbol named in its input).
If none: DENY (default) when an LSP server covers the language, else a non-blocking warning.
SCAFFOLDING_REFACTOR_GUARD=warn -> always warn only; =off -> disabled. Stdlib only; run with `python3 -I`.
"""
import glob, json, os, re, shlex, shutil, subprocess, sys, time

TAIL = 2 * 1024 * 1024
LSP_OPS = {"findReferences", "incomingCalls"}
GRAPH_OK = {"query_graph", "get_node", "get_neighbors", "get_community", "shortest_path", "get_pr_impact"}
CODE_EXT = {".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs", ".py", ".pyi", ".go", ".rs",
            ".cs", ".java", ".kt"}
TS = r"^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)"
PATTERNS = {
    "ts": [TS], "py": [r"^\s*(?:async\s+)?def\s+([A-Za-z]\w*)", r"^\s*class\s+([A-Za-z]\w*)"],
    "go": [r"^func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)", r"^type\s+([A-Z]\w*)", r"^(?:const|var)\s+([A-Z]\w*)"],
    "rs": [r"^\s*pub(?:\([^)]*\))?\s+(?:async\s+)?(?:unsafe\s+)?(?:fn|struct|enum|trait|type|const|static|mod)\s+(\w+)"],
    "cs": [r"^\s*public\s+(?:(?:static|sealed|abstract|partial|async|override|virtual)\s+)*(?:class|interface|enum|struct|record)\s+(\w+)"],
}
LANG = {".ts": "ts", ".tsx": "ts", ".js": "ts", ".jsx": "ts", ".mts": "ts", ".cts": "ts", ".mjs": "ts",
        ".cjs": "ts", ".py": "py", ".pyi": "py", ".go": "go", ".rs": "rs", ".cs": "cs", ".java": "cs", ".kt": "cs"}
TEST_RE = re.compile(r"(^|/)(tests?|__tests__|spec)/|\.(test|spec)\.|_test\.|(^|/)test_[^/]*$")


def symbols(text, ext):
    out = set()
    for pat in PATTERNS[LANG[ext]]:
        for m in re.finditer(pat, text or "", re.M):
            out.add(m.group(1))
    return out


def lsp_covers(ext):
    force = os.environ.get("REFACTOR_GUARD_LSP")
    if force in ("on", "off"):
        return force == "on"
    root = os.environ.get("CLAUDE_PLUGIN_ROOT") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
    try:
        servers = json.load(open(os.path.join(root, ".claude-plugin", "plugin.json"))).get("lspServers", {})
    except Exception:
        return False
    return any(ext in (s.get("extensionToLanguage") or {}) and shutil.which(s.get("command", ""))
               for s in servers.values())


def evidence(transcript, paths, sym):
    """True if an earlier LSP findReferences on one of `paths` (files defining sym) or graphify call naming `sym` exists."""
    try:
        with open(transcript, "rb") as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - TAIL))
            data = f.read().decode("utf-8", "ignore")
    except Exception:
        return False
    want = {os.path.realpath(p) for p in paths}
    word = re.compile(r"(?<![\w$])" + re.escape(sym) + r"(?![\w$])")
    for line in data.splitlines():
        if "findReferences" not in line and "incomingCalls" not in line and "mcp__graphify__" not in line:
            continue
        try:
            msg = (json.loads(line).get("message") or {}).get("content")
        except Exception:
            continue
        for b in msg if isinstance(msg, list) else []:
            if not (isinstance(b, dict) and b.get("type") == "tool_use"):
                continue
            name, inp = b.get("name", ""), b.get("input") or {}
            if name == "LSP" and inp.get("operation") in LSP_OPS:
                fp = str(inp.get("filePath", ""))
                if fp and os.path.realpath(fp) in want:
                    return True
            elif name.startswith("mcp__graphify__") and name[15:] in GRAPH_OK:
                if word.search(json.dumps(inp)):
                    return True
    return False


# `s<d>[anchors]OLD[anchors]<d>NEW<d>`; anchors: \\b \\< \\> ^ $ \\( \\)
SED_S = re.compile(r"(?<![\w\\])s([^\w\s\\])(?:\\[b<]|\^|\\\()*([A-Za-z_$][\w$]*)(?:\\[b>]|\$|\\\))*\1((?:(?!\1).)*)\1")
FILE_TOK = re.compile(r"^[\w./*?\[\]~@+-]+\.\w{1,6}$")
EXCL = ("node_modules", ".git", "dist", "build")
WS_BUDGET = 0.3


def ws_defs(ident, cwd, deadline):
    """Code files under cwd that export/define `ident`; None when the time budget is exceeded."""
    s = re.escape(ident)
    pat = (r"export[^;=(]*\b{s}\b|(def|class) +{s}\b|pub(\([^)]*\))? +(async +|unsafe +)?"
           r"(fn|struct|enum|trait|type|const|static|mod) +{s}\b|func +(\([^)]*\) *)?{s}\b|public .*\b{s}\b").format(s=s)
    cmd = ["grep", "-rlEI"] + ["--exclude-dir=" + e for e in EXCL] + \
          ["--include=*" + e for e in sorted(CODE_EXT)] + ["-e", pat, "."]
    left = deadline - time.monotonic()
    if left <= 0:
        return None
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=left)
    except Exception:
        return None
    out = []
    for rel in r.stdout.splitlines()[:40]:
        f = os.path.abspath(os.path.join(cwd, rel))
        if TEST_RE.search(f):
            continue
        try:
            if ident in symbols(open(f, errors="ignore").read(), os.path.splitext(f)[1]):
                out.append(f)
        except Exception:
            continue
    return out


def bash_targets(cmd, cwd):
    """((files...), symbol) pairs a `sed -i`/`perl -pi` command would rename or delete."""
    try:
        toks = shlex.split(cmd)
    except ValueError:
        toks = cmd.split()
    if not any(t in ("sed", "perl") for t in toks):
        return []
    if not any(re.fullmatch(r"-i\S*|--in-place\S*|-[a-zA-Z]*pi\S*", t) for t in toks):
        return []
    idents = set()
    for t in toks:
        for m in SED_S.finditer(t):
            if m.group(2) != m.group(3):
                idents.add(m.group(2))
        m = re.fullmatch(r"/\^?\s*\\?s*\\?b?(\w+)\\?b?.*/d", t)
        if m:
            idents.add(m.group(1))
    if not idents:
        return []
    operands = [t for t in toks if not t.startswith("-") and FILE_TOK.match(t)]
    files, noncode = [], False
    for t in operands:
        if os.path.splitext(t)[1] in CODE_EXT:
            files += [g for g in glob.glob(os.path.join(cwd, t)) if os.path.isfile(g)]
        else:
            noncode = True
    dyn = "xargs" in toks or "$(" in cmd or "`" in cmd
    pairs = []
    for f in files:
        try:
            text = open(f, errors="ignore").read()
        except Exception:
            continue
        for s in symbols(text, os.path.splitext(f)[1]) & idents:
            pairs.append(((f,), s))
    if dyn or (not files and not noncode):
        deadline = time.monotonic() + WS_BUDGET
        for ident in sorted(idents):
            defs = ws_defs(ident, cwd, deadline)
            if defs is None:
                break
            if defs:
                pairs.append((tuple(defs), ident))
    return pairs


def changed_symbols(tool, ti, cwd):
    """Return list of ((files...), symbol) that are renamed/removed by this call."""
    if tool in ("Edit", "MultiEdit", "Write"):
        f = ti.get("file_path") or ""
        ext = os.path.splitext(f)[1]
        if ext not in CODE_EXT:
            return []
        if tool == "Edit":
            old, new = ti.get("old_string", ""), ti.get("new_string", "")
        elif tool == "MultiEdit":
            es = [e for e in ti.get("edits") or [] if isinstance(e, dict)]
            old, new = "\n".join(e.get("old_string", "") for e in es), "\n".join(e.get("new_string", "") for e in es)
        else:
            try:
                old = open(f, errors="ignore").read()
            except Exception:
                return []
            new = ti.get("content", "")
        return [((f,), s) for s in sorted(symbols(old, ext) - symbols(new, ext))]
    if tool == "Bash":
        return bash_targets(ti.get("command", ""), cwd)
    return []


def locate(files, sym):
    """(file, line, character), 1-based, of sym's declaration."""
    for f in files:
        try:
            lines = open(f, errors="ignore").read().splitlines()
        except Exception:
            continue
        for i, line in enumerate(lines):
            for pat in PATTERNS[LANG[os.path.splitext(f)[1]]]:
                m = re.match(pat, line)
                if m and m.group(1) == sym:
                    return f, i + 1, m.start(1) + 1
    return files[0], 1, 1


def clean(p):
    return re.sub(r"[^\w./@+-]", "?", p)


def main():
    mode = os.environ.get("SCAFFOLDING_REFACTOR_GUARD", "deny")
    if mode == "off":
        return
    try:
        d = json.load(sys.stdin)
    except Exception:
        return
    tool, ti = d.get("tool_name", ""), d.get("tool_input") or {}
    cwd = d.get("cwd") or os.getcwd()
    pairs = [(fs, s) for fs, s in changed_symbols(tool, ti, cwd) if not all(TEST_RE.search(f) for f in fs)]
    missing = [(fs, s) for fs, s in pairs if not evidence(d.get("transcript_path") or "", fs, s)]
    if not missing:
        return
    block = [(fs, s) for fs, s in missing if lsp_covers(os.path.splitext(fs[0])[1])] if mode != "warn" else []
    if block:
        fs, sym = block[0]
        f, line, ch = locate(fs, sym)
        syms = ", ".join("`%s`" % s for _, s in block[:5])
        what = "this Bash sed/perl in-place command" if tool == "Bash" else "this %s" % tool
        reason = ("refactor-guard BLOCKED: %s renames or removes exported %s (defined in %s) and no LSP findReferences "
                  "on a file defining it, nor graphify query naming it, exists in this session. Do this now: "
                  "(1) call tool `LSP` with operation=findReferences, filePath=\"%s\", line=%d, character=%d "
                  "(or `mcp__graphify__query_graph` / `mcp__graphify__get_neighbors` with the symbol name); "
                  "(2) then update every reference found using Edit, or retry the same sed after findReferences. "
                  "Override: SCAFFOLDING_REFACTOR_GUARD=warn (warn only) or =off." % (what, syms, clean(f), clean(f), line, ch))
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                                                 "permissionDecisionReason": reason}}))
        return
    f0 = clean(missing[0][0][0])
    syms = ", ".join("`%s`" % s for _, s in missing[:5])
    ext = os.path.splitext(missing[0][0][0])[1]
    if lsp_covers(ext):
        how = ("run LSP `findReferences` (tool `LSP`, operation=findReferences, filePath, line, character on the "
               "declaration) or `mcp__graphify__get_neighbors` / `mcp__graphify__query_graph` with the symbol name")
    else:
        how = ("no LSP server covers `%s` here, so use `mcp__graphify__get_neighbors` / `mcp__graphify__query_graph` "
               "with the symbol name if available, else `grep -rnw <symbol>`" % ext)
    msg = ("refactor-guard (warning, not blocking): this change renames or removes exported %s in %s, and no earlier "
           "LSP findReferences on that file or graphify query on the symbol was found in this session. Before "
           "continuing, %s. Update every dependent you find. Set SCAFFOLDING_REFACTOR_GUARD=off to silence." % (syms, f0, how))
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "additionalContext": msg}}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
