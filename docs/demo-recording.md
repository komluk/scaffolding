# Recording the Demo GIF

A practical guide for recording the demo GIF that the README placeholder expects.
The goal: a short, legible clip showing claude-scaffolding's multi-agent orchestration
in action.

## Tooling

Recommended: **asciinema** to record a terminal session, then **agg** to convert the
cast to an animated GIF. asciinema captures real terminal text (crisp, small files),
and `agg` renders a clean GIF with no screen-capture noise.

### Install

```bash
# macOS
brew install asciinema agg

# Debian / Ubuntu
sudo apt install asciinema
cargo install --git https://github.com/asciinema/agg   # agg via Rust toolchain

# agg can also be downloaded as a prebuilt binary from:
# https://github.com/asciinema/agg/releases
```

### Record and convert

```bash
# 1. Record (Ctrl-D or `exit` to stop)
asciinema rec demo.cast

# 2. Convert to a clean GIF
agg --font-size 16 \
    --theme monokai \
    --speed 1.3 \
    --idle-time-limit 1.5 \
    --line-height 1.3 \
    demo.cast demo.gif
```

Flag notes:
- `--font-size 16` — large enough to read on a GitHub README at full width.
- `--theme monokai` — high-contrast dark theme (use `asciinema-theme` or `dracula` too).
- `--speed 1.3` — slightly faster playback keeps the clip punchy.
- `--idle-time-limit 1.5` — caps long pauses (e.g. agent thinking time) at 1.5s.
- `--line-height 1.3` — comfortable spacing.

### Alternative: terminalizer

[terminalizer](https://github.com/faressoft/terminalizer) records and renders in one
tool with a YAML config (`terminalizer record demo` → `terminalizer render demo`).
It is easier to theme but produces larger GIFs than the asciinema + agg pipeline.

## Terminal Setup

Set this up before recording so the GIF is legible on GitHub:

- **Window size:** ~100 columns x 30 rows. Resize with `printf '\e[8;30;100t'` or your
  terminal's preferences. This keeps the GIF wide but not so tall it dominates the page.
- **Font size:** 16-18pt in the terminal (and `--font-size 16` in `agg`).
- **Prompt:** use a clean, short prompt. Temporarily set `PS1='$ '` so paths and git
  branch noise do not clutter the recording.
- **Colors:** dark background, high contrast. Disable transparency.
- **Clear scrollback** (`clear`) right before you start recording.
- Close unrelated tabs/notifications so nothing pops in mid-take.

## Storyboard (~20-30 seconds)

A tight shot list. Type at a natural pace; `agg --speed` tightens it afterward.

| Time | Shot | What appears on screen |
|------|------|------------------------|
| 0-6s | **Install** | `/plugin marketplace add komluk/scaffolding` then `/plugin install scaffolding@komluk-scaffolding` |
| 6-9s | **Activate** | `/reload-plugins` — plugin loads, 11 agents registered |
| 9-18s | **Delegate** | `Task(subagent_type="scaffolding:developer", prompt="add a healthcheck endpoint")` — show the developer agent picking up the task and producing a diff/result |
| 18-26s | **Orchestrate** | A second hop: the routing protocol hands off to `scaffolding:reviewer` (or `scaffolding:tech-writer`) — show two agents collaborating |
| 26-30s | **Payoff** | Final status line, e.g. `[Agent: reviewer] gate: passed` — clip ends on a clean success |

Keep it to two agents max on screen. The story to tell: *one request → automatic
routing → multiple specialized agents do the work*. Do not narrate every step; let the
agent output speak.

## Placing the File

1. Save the final GIF as `demo.gif` in the **repository root** (next to `README.md`).
2. In `README.md`, replace the placeholder line:

   ```diff
   - <!-- TODO: add demo.gif showing an agent workflow -->
   + ![claude-scaffolding demo](demo.gif)
   ```

3. Keep `demo.gif` under ~3 MB so it loads quickly on GitHub. If it is too large,
   lower `--font-size`, trim idle time, or shorten the recording.
4. You can delete `demo.cast` after converting, or keep it committed so the GIF can be
   regenerated later.
