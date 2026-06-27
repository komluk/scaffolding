#!/bin/bash
# Skill Frontmatter Validator
# Validates that a SKILL.md file has well-formed frontmatter and body.
# Usage: ./validate-skill.sh path/to/skills/<name>/SKILL.md
# Exit 0 on valid, exit 1 on invalid with error message(s).

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

FILE="$1"

if [ -z "$FILE" ]; then
    echo -e "${RED}ERROR: No file path provided${NC}"
    echo "Usage: $0 path/to/skills/<name>/SKILL.md"
    exit 1
fi

if [ ! -f "$FILE" ]; then
    echo -e "${RED}ERROR: File not found: ${FILE}${NC}"
    exit 1
fi

ERRORS=()

# --- Check 1: frontmatter block present (file starts with ---) ---
FIRST_LINE=$(head -1 "$FILE")
if [ "$FIRST_LINE" != "---" ]; then
    ERRORS+=("Frontmatter block missing: file must start with a '---' line")
fi

# Extract frontmatter between first pair of ---
FRONTMATTER=$(awk '/^---$/{if(f){exit}else{f=1;next}} f{print}' "$FILE")
if [ -z "$FRONTMATTER" ]; then
    ERRORS+=("Frontmatter block empty or unterminated (expected '---' ... '---')")
fi

# --- Check 2: name field — present, kebab-case, equals parent dir ---
NAME_VALUE=$(echo "$FRONTMATTER" | grep -oP '^name:\s*\K.*' | xargs 2>/dev/null || true)
PARENT_DIR=$(basename "$(dirname "$(cd "$(dirname "$FILE")" && pwd)/$(basename "$FILE")")")
if [ -z "$NAME_VALUE" ]; then
    ERRORS+=("Missing required field: name")
else
    if ! echo "$NAME_VALUE" | grep -qE '^[a-z][a-z0-9-]*$'; then
        ERRORS+=("Invalid name: '${NAME_VALUE}' (must be kebab-case ^[a-z][a-z0-9-]*\$)")
    fi
    if [ "$NAME_VALUE" != "$PARENT_DIR" ]; then
        ERRORS+=("name '${NAME_VALUE}' does not match parent directory '${PARENT_DIR}'")
    fi
fi

# --- Check 3: description field — present, non-empty, 1-340 chars ---
DESC_VALUE=$(echo "$FRONTMATTER" | grep -oP '^description:\s*\K.*' | sed -e 's/^"//' -e 's/"$//' 2>/dev/null || true)
if [ -z "$DESC_VALUE" ]; then
    ERRORS+=("Missing or empty required field: description")
else
    DESC_LEN=${#DESC_VALUE}
    if [ "$DESC_LEN" -lt 1 ] || [ "$DESC_LEN" -gt 340 ]; then
        ERRORS+=("description length ${DESC_LEN} out of range (must be 1-340 chars)")
    fi
fi

# --- Check 3b: optional fields — context, agent, effort (allowed, value-checked) ---
# These optional fields tune how a skill is delivered (e.g. `context: fork` runs
# the skill in an isolated forked subagent). They are OPTIONAL; only their values
# are constrained when present. Any other frontmatter key is left untouched.
CONTEXT_VALUE=$(echo "$FRONTMATTER" | grep -oP '^context:\s*\K.*' | xargs 2>/dev/null || true)
if [ -n "$CONTEXT_VALUE" ] && [ "$CONTEXT_VALUE" != "fork" ]; then
    ERRORS+=("Invalid context: '${CONTEXT_VALUE}' (only 'fork' is supported)")
fi

AGENT_VALUE=$(echo "$FRONTMATTER" | grep -oP '^agent:\s*\K.*' | xargs 2>/dev/null || true)
if [ -n "$AGENT_VALUE" ] && ! echo "$AGENT_VALUE" | grep -qE '^(Explore|Plan|general-purpose)$'; then
    ERRORS+=("Invalid agent: '${AGENT_VALUE}' (must be Explore, Plan, or general-purpose)")
fi

EFFORT_VALUE=$(echo "$FRONTMATTER" | grep -oP '^effort:\s*\K.*' | xargs 2>/dev/null || true)
if [ -n "$EFFORT_VALUE" ] && ! echo "$EFFORT_VALUE" | grep -qE '^(low|medium|high)$'; then
    ERRORS+=("Invalid effort: '${EFFORT_VALUE}' (must be low, medium, or high)")
fi

# --- Check 4: at least one '##' heading in the body ---
if ! grep -qE '^##[^#]' "$FILE"; then
    ERRORS+=("No '##' section heading found in body")
fi

# --- Check 5: file under 500 lines ---
LINE_COUNT=$(awk 'END{print NR}' "$FILE" | xargs)
if [ "$LINE_COUNT" -ge 500 ]; then
    ERRORS+=("File has ${LINE_COUNT} lines (must be under 500)")
fi

# --- Report ---
if [ ${#ERRORS[@]} -eq 0 ]; then
    echo -e "${GREEN}VALID: ${FILE}${NC}"
    echo "  name: ${NAME_VALUE}"
    echo "  description: ${#DESC_VALUE} chars"
    echo "  lines: ${LINE_COUNT}"
    exit 0
else
    echo -e "${RED}INVALID: ${FILE} has ${#ERRORS[@]} error(s)${NC}"
    for err in "${ERRORS[@]}"; do
        echo "  - ${err}"
    done
    exit 1
fi
