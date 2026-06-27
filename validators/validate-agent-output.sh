#!/bin/bash
# Agent Output Frontmatter Validator
# Validates that agent output contains correct YAML frontmatter fields.
# Usage: echo "output" | ./validate-agent-output.sh
#    or: ./validate-agent-output.sh "output text"
# Exit 0 on valid, exit 1 on invalid with error message.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# Read input from argument or stdin
if [ -n "$1" ]; then
    INPUT="$1"
else
    INPUT=$(cat)
fi

if [ -z "$INPUT" ]; then
    echo -e "${RED}ERROR: No input provided${NC}"
    echo "Usage: echo 'output' | $0"
    echo "   or: $0 'output text'"
    exit 1
fi

# Extract frontmatter between first pair of ---
FRONTMATTER=$(echo "$INPUT" | awk '/^---$/{if(f){exit}else{f=1;next}} f{print}')

if [ -z "$FRONTMATTER" ]; then
    echo -e "${RED}INVALID: No YAML frontmatter found${NC}"
    echo "  Expected output to start with --- delimited YAML block"
    exit 1
fi

ERRORS=()

# Validate required fields exist
REQUIRED_FIELDS=("agent" "task" "status" "gate" "score" "files_modified" "next_agent")
for field in "${REQUIRED_FIELDS[@]}"; do
    if ! echo "$FRONTMATTER" | grep -qE "^${field}:"; then
        ERRORS+=("Missing required field: ${field}")
    fi
done

# Validate 'agent' field value (must be a known agent name)
VALID_AGENTS="analyst|architect|researcher|developer|debugger|reviewer|optimizer|prompt-engineer|mcp-builder|tech-writer|devops|gitops|coordinator"
AGENT_VALUE=$(echo "$FRONTMATTER" | grep -oP '^agent:\s*\K.*' | xargs 2>/dev/null || true)
if [ -n "$AGENT_VALUE" ]; then
    if ! echo "$AGENT_VALUE" | grep -qE "^(${VALID_AGENTS})$"; then
        ERRORS+=("Invalid agent value: '${AGENT_VALUE}' (must be one of: ${VALID_AGENTS})")
    fi
fi

# Validate 'status' field value
VALID_STATUSES="success|partial_success|blocked|failed"
STATUS_VALUE=$(echo "$FRONTMATTER" | grep -oP '^status:\s*\K.*' | xargs 2>/dev/null || true)
if [ -n "$STATUS_VALUE" ]; then
    if ! echo "$STATUS_VALUE" | grep -qE "^(${VALID_STATUSES})$"; then
        ERRORS+=("Invalid status value: '${STATUS_VALUE}' (must be one of: ${VALID_STATUSES})")
    fi
fi

# Validate 'gate' field value
VALID_GATES="passed|failed|not_applicable"
GATE_VALUE=$(echo "$FRONTMATTER" | grep -oP '^gate:\s*\K.*' | xargs 2>/dev/null || true)
if [ -n "$GATE_VALUE" ]; then
    if ! echo "$GATE_VALUE" | grep -qE "^(${VALID_GATES})$"; then
        ERRORS+=("Invalid gate value: '${GATE_VALUE}' (must be one of: ${VALID_GATES})")
    fi
fi

# Validate 'score' field value (XX/100 or n/a)
SCORE_VALUE=$(echo "$FRONTMATTER" | grep -oP '^score:\s*\K.*' | xargs 2>/dev/null || true)
if [ -n "$SCORE_VALUE" ]; then
    if ! echo "$SCORE_VALUE" | grep -qE '^(n/a|[0-9]{1,3}/100)$'; then
        ERRORS+=("Invalid score value: '${SCORE_VALUE}' (must be 'n/a' or 'XX/100')")
    fi
fi

# Validate 'files_modified' field value (non-negative integer)
FILES_VALUE=$(echo "$FRONTMATTER" | grep -oP '^files_modified:\s*\K.*' | xargs 2>/dev/null || true)
if [ -n "$FILES_VALUE" ]; then
    if ! echo "$FILES_VALUE" | grep -qE '^[0-9]+$'; then
        ERRORS+=("Invalid files_modified value: '${FILES_VALUE}' (must be a non-negative integer)")
    fi
fi

# Validate 'next_agent' field value
VALID_NEXT="analyst|architect|researcher|developer|debugger|reviewer|optimizer|prompt-engineer|mcp-builder|tech-writer|devops|gitops|coordinator|none|user_decision"
NEXT_VALUE=$(echo "$FRONTMATTER" | grep -oP '^next_agent:\s*\K.*' | xargs 2>/dev/null || true)
if [ -n "$NEXT_VALUE" ]; then
    if ! echo "$NEXT_VALUE" | grep -qE "^(${VALID_NEXT})$"; then
        ERRORS+=("Invalid next_agent value: '${NEXT_VALUE}' (must be an agent name, 'none', or 'user_decision')")
    fi
fi

# Validate optional 'severity' field if present
SEVERITY_VALUE=$(echo "$FRONTMATTER" | grep -oP '^severity:\s*\K.*' | xargs 2>/dev/null || true)
if [ -n "$SEVERITY_VALUE" ]; then
    VALID_SEVERITIES="none|low|medium|high|critical"
    if ! echo "$SEVERITY_VALUE" | grep -qE "^(${VALID_SEVERITIES})$"; then
        ERRORS+=("Invalid severity value: '${SEVERITY_VALUE}' (must be one of: ${VALID_SEVERITIES})")
    fi
fi

# Report results
if [ ${#ERRORS[@]} -eq 0 ]; then
    echo -e "${GREEN}VALID: Agent output frontmatter is well-formed${NC}"
    echo "  agent: ${AGENT_VALUE}"
    echo "  status: ${STATUS_VALUE}"
    echo "  gate: ${GATE_VALUE}"
    echo "  score: ${SCORE_VALUE}"
    echo "  files_modified: ${FILES_VALUE}"
    echo "  next_agent: ${NEXT_VALUE}"
    exit 0
else
    echo -e "${RED}INVALID: Agent output frontmatter has ${#ERRORS[@]} error(s)${NC}"
    for err in "${ERRORS[@]}"; do
        echo "  - ${err}"
    done
    exit 1
fi
