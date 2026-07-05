#!/bin/bash
# Pre-Commit Hook: Run validation before git commit
#
# Framework-agnostic variant (scaffolding).
# Detects the project's own validation entrypoint by convention and runs
# the FIRST match only (no stacking). If nothing is detected, warns and
# passes (non-blocking).
#
# Detection priority:
#  1. Makefile target: test / check / validate
#  2. justfile recipe: test / check / validate
#  3. package.json script: validate / test (via pnpm/yarn/bun/npm by lockfile)
#  4. Python: pyproject.toml or pytest.ini/setup.cfg + pytest available
#  5. Rust: Cargo.toml -> cargo test
#  6. Go: go.mod -> go test ./...
#  7. PHP: composer.json "test" script -> composer test
#  8. JVM: ./gradlew test or ./mvnw test
#
# Additionally: when the repo is the scaffolding plugin itself
# (.claude-plugin/plugin.json present), also runs validators/validate-skill.sh
# and validators/validate-agent-frontmatter.sh.

echo ""
echo "Running pre-commit validation..."
echo ""

run_check() {
    # run_check <label> <cmd...>
    local label="$1"
    shift
    echo "[$label] running: $*"
    if "$@"; then
        echo "[$label] validation passed"
    else
        echo "[$label] validation failed -- fix errors before committing" >&2
        exit 1
    fi
}

# --- Detect and run the project's own validation (first match only) ---

detect_and_run() {
    # 1. Makefile targets
    if [ -f "Makefile" ]; then
        for target in test check validate; do
            if make -n "$target" >/dev/null 2>&1; then
                run_check "make" make "$target"
                return 0
            fi
        done
    fi

    # 2. justfile recipes
    if { [ -f "justfile" ] || [ -f "Justfile" ]; } && command -v just >/dev/null 2>&1; then
        for recipe in test check validate; do
            if just --summary 2>/dev/null | tr ' ' '\n' | grep -qx "$recipe"; then
                run_check "just" just "$recipe"
                return 0
            fi
        done
    fi

    # 3. package.json scripts (validate preferred over test)
    if [ -f "package.json" ]; then
        local pm="npm"
        if [ -f "pnpm-lock.yaml" ]; then pm="pnpm"
        elif [ -f "yarn.lock" ]; then pm="yarn"
        elif [ -f "bun.lockb" ] || [ -f "bun.lock" ]; then pm="bun"
        fi
        for script in validate test; do
            if grep -q "\"$script\"[[:space:]]*:" package.json 2>/dev/null; then
                run_check "$pm" "$pm" run "$script"
                return 0
            fi
        done
    fi

    # 4. Python: pytest by convention
    if [ -f "pyproject.toml" ] || [ -f "pytest.ini" ] || [ -f "setup.cfg" ]; then
        local venv=""
        for candidate in venv .venv app/backend/venv backend/venv; do
            if [ -f "$candidate/bin/activate" ]; then
                venv="$candidate"
                break
            fi
        done
        if [ -n "$venv" ]; then
            # shellcheck disable=SC1090,SC1091
            source "$venv/bin/activate"
        fi
        if command -v pytest >/dev/null 2>&1; then
            run_check "pytest" pytest
            return 0
        fi
    fi

    # 5. Rust
    if [ -f "Cargo.toml" ] && command -v cargo >/dev/null 2>&1; then
        run_check "cargo" cargo test
        return 0
    fi

    # 6. Go
    if [ -f "go.mod" ] && command -v go >/dev/null 2>&1; then
        run_check "go" go test ./...
        return 0
    fi

    # 7. PHP composer
    if [ -f "composer.json" ] && command -v composer >/dev/null 2>&1 \
        && grep -q '"test"[[:space:]]*:' composer.json 2>/dev/null; then
        run_check "composer" composer test
        return 0
    fi

    # 8. JVM wrappers
    if [ -x "./gradlew" ]; then
        run_check "gradle" ./gradlew test
        return 0
    fi
    if [ -x "./mvnw" ]; then
        run_check "maven" ./mvnw test
        return 0
    fi

    return 1
}

if ! detect_and_run; then
    echo "[warn] no validation entrypoint detected (Makefile/justfile/package.json/pytest/cargo/go/composer/gradlew/mvnw) -- skipping (non-blocking)"
fi

# --- Scaffolding plugin self-validation ---
if [ -f ".claude-plugin/plugin.json" ]; then
    echo ""
    echo "[scaffolding] plugin repo detected -- running plugin validators"
    if [ -x "validators/validate-skill.sh" ] && [ -d "skills" ]; then
        for skill in skills/*/SKILL.md; do
            [ -f "$skill" ] || continue
            if ! ./validators/validate-skill.sh "$skill" >/dev/null 2>&1; then
                echo "[validate-skill] FAILED: $skill" >&2
                ./validators/validate-skill.sh "$skill" >&2
                exit 1
            fi
        done
        echo "[validate-skill] all skills passed"
    fi
    if [ -x "validators/validate-agent-frontmatter.sh" ] && [ -d "agents" ]; then
        run_check "validate-agent-frontmatter" ./validators/validate-agent-frontmatter.sh agents/
    fi
fi

echo ""
echo "All applicable validation checks passed."
echo ""

exit 0
