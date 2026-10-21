"""Defense-in-depth redaction for the episodic action log (stdlib only).

The real protection is structural: raw tool output / file contents are never read
into a record. This pass only covers what is left (command lines, short args).
Fail-closed per field: any error replaces the field with REDACTION_ERROR.
"""
import json
import os
import re

REDACTION_ERROR = "<redaction-error>"

_PATTERNS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "secret-patterns.json")

_NAMES = r"token|secret|password|passwd|pwd|api[_-]?key|access[_-]?key|client[_-]?secret|authorization"

# Order matters: header / bearer / assignment rules run before the generic blob rule.
_GENERIC = [
    (re.compile(r"\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]*"), "***"),
    (re.compile(r"(?i)\b(authorization|x-api-key|private-token)\b\s*:\s*[^'\"\n]+"), r"\1: ***"),
    (re.compile(r"(?i)\bbearer\s+\S+"), "Bearer ***"),
    (re.compile(r"(?i)\b(" + _NAMES + r")\b\s*[=:]\s*\S+"), r"\1=***"),
    (re.compile(r"(?i)(\b[A-Z0-9_]*(?:" + _NAMES + r")[A-Z0-9_]*)=\S+"), r"\1=***"),
    (re.compile(r"://[^/@\s]+@"), "://***@"),
    (re.compile(r"(?<![\w-])--?(?:password|passwd|pass|pw)(?:[= ]\S+)"), "--password ***"),
    (re.compile(r"(?<![\w-])-p(?=\S*[A-Za-z0-9])\S{3,}"), "-p***"),
    (re.compile(r"(?i)(--[\w-]*(?:token|secret|passw(?:or)?d|api-?key|auth|credential)[\w-]*)(?:=|\s+)\S+"), r"\1 ***"),
    (re.compile(r"(?<![\w-])(-u|--user)(?:=|\s+)\S+:\S+"), r"\1 ***"),
    (re.compile(r"(?i)([?&](?:[\w-]*(?:token|secret|key|sig|auth|pass|password)[\w-]*)=)[^&\s\"']+"), r"\1***"),
]
_LONG_RUN = re.compile(r"[A-Za-z0-9+/_=-]{32,}")
_SAFE_ID = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$", re.I)

_vendored = None


def _load_vendored():
    global _vendored
    if _vendored is None:
        compiled = []
        try:
            with open(_PATTERNS_FILE, encoding="utf-8") as fh:
                for p in json.load(fh)["patterns"]:
                    try:
                        compiled.append(re.compile(p["regex"], re.IGNORECASE if p["entity"] in ("PL_PESEL",) else 0))
                    except re.error:
                        continue
        except (OSError, ValueError, KeyError):
            compiled = []
        _vendored = compiled
    return _vendored


def _secretish(seg):
    """A long token mixing letters and digits that is not a git SHA / UUID."""
    if len(seg) < 32 or _SAFE_ID.match(seg):
        return False
    return bool(re.search(r"\d", seg) and re.search(r"[A-Za-z]", seg)) or len(seg) >= 48


def _long_run(m):
    s = m.group(0)
    if _SAFE_ID.match(s):
        return s
    # Whole-run base64-ish blob that uses '/' or '+' with mixed case + digits.
    if re.search(r"[/+]", s) and re.search(r"[a-z]", s) and re.search(r"[A-Z]", s) and re.search(r"\d", s):
        return "***"
    # Otherwise judge path/word segments separately so long file paths survive.
    parts = re.split(r"([/])", s)
    return "".join("***" if _secretish(x) else x for x in parts)


def redact(text):
    """Return text with secrets masked. Never raises."""
    try:
        if not isinstance(text, str):
            return text
        out = text
        for rx in _load_vendored():
            out = rx.sub("***", out)
        for rx, repl in _GENERIC:
            out = rx.sub(repl, out)
        return _LONG_RUN.sub(_long_run, out)
    except Exception:  # noqa: BLE001 - fail closed on content
        return REDACTION_ERROR
