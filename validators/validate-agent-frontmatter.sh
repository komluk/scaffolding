#!/bin/bash
# Agent Frontmatter Validator
# Validates model/effort tier fields in agents/*.md frontmatter.
# Usage: ./validate-agent-frontmatter.sh path/to/agents/<name>.md
#    or: ./validate-agent-frontmatter.sh path/to/agents/   (validates all *.md)
# Exit 0 on valid, exit 1 on invalid with error message(s).

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

TARGET="$1"

if [ -z "$TARGET" ]; then
    echo -e "${RED}ERROR: No path provided${NC}"
    echo "Usage: $0 path/to/agents/<name>.md | path/to/agents/"
    exit 1
fi

VALID_MODELS="opus|sonnet|haiku|inherit"
VALID_EFFORTS="low|medium|high|xhigh|max"

validate_file() {
    local FILE="$1"
    local ERRORS=()

    # --- Frontmatter block present (file starts with ---) ---
    local FIRST_LINE
    FIRST_LINE=$(head -1 "$FILE")
    if [ "$FIRST_LINE" != "---" ]; then
        ERRORS+=("Frontmatter block missing: file must start with a '---' line")
    fi

    local FRONTMATTER
    FRONTMATTER=$(awk '/^---$/{if(f){exit}else{f=1;next}} f{print}' "$FILE")
    if [ -z "$FRONTMATTER" ]; then
        ERRORS+=("Frontmatter block empty or unterminated (expected '---' ... '---')")
    fi

    # --- Check 1: model — present and one of opus|sonnet|haiku|inherit ---
    local MODEL_VALUE
    MODEL_VALUE=$(echo "$FRONTMATTER" | grep -oP '^model:\s*\K.*' | xargs 2>/dev/null || true)
    if [ -z "$MODEL_VALUE" ]; then
        ERRORS+=("Missing required field: model")
    elif ! echo "$MODEL_VALUE" | grep -qE "^(${VALID_MODELS})$"; then
        ERRORS+=("Invalid model: '${MODEL_VALUE}' (must be one of: ${VALID_MODELS})")
    fi

    # --- Check 2: effort — if present, one of low|medium|high|xhigh|max ---
    local EFFORT_VALUE
    EFFORT_VALUE=$(echo "$FRONTMATTER" | grep -oP '^effort:\s*\K.*' | xargs 2>/dev/null || true)
    if [ -n "$EFFORT_VALUE" ] && ! echo "$EFFORT_VALUE" | grep -qE "^(${VALID_EFFORTS})$"; then
        ERRORS+=("Invalid effort: '${EFFORT_VALUE}' (must be one of: ${VALID_EFFORTS})")
    fi

    # --- Check 3: model: haiku must NOT have effort (haiku does not support it) ---
    if [ "$MODEL_VALUE" = "haiku" ] && [ -n "$EFFORT_VALUE" ]; then
        ERRORS+=("model: haiku must not set effort (haiku does not support the effort parameter)")
    fi

    # --- Report ---
    if [ ${#ERRORS[@]} -eq 0 ]; then
        echo -e "${GREEN}VALID: ${FILE}${NC}"
        echo "  model: ${MODEL_VALUE}"
        echo "  effort: ${EFFORT_VALUE:-<not set>}"
        return 0
    else
        echo -e "${RED}INVALID: ${FILE} has ${#ERRORS[@]} error(s)${NC}"
        for err in "${ERRORS[@]}"; do
            echo "  - ${err}"
        done
        return 1
    fi
}

FAILED=0

if [ -d "$TARGET" ]; then
    FOUND=0
    for FILE in "$TARGET"/*.md; do
        [ -f "$FILE" ] || continue
        FOUND=1
        validate_file "$FILE" || FAILED=1
    done
    if [ "$FOUND" -eq 0 ]; then
        echo -e "${RED}ERROR: No .md files found in ${TARGET}${NC}"
        exit 1
    fi
elif [ -f "$TARGET" ]; then
    validate_file "$TARGET" || FAILED=1
else
    echo -e "${RED}ERROR: Path not found: ${TARGET}${NC}"
    exit 1
fi

exit $FAILED
