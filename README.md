# claude-scaffolding

Przenosna konfiguracja Claude Code: agenci, skille, komendy, hooki, workflow.
Repozytorium mozna sklonowac do kazdego projektu i uzywac natychmiast, bez
zadnych bibliotek Pythona ani backendu.

## Wprowadzenie

`claude-scaffolding` to wydzielony, samodzielny `~/.claude/` wyciety z repozytorium
`scaffolding.tool`. Zawiera wylacznie to, co da sie przewiezc jako markdown --
czyli wiedze agentow, skile i konfiguracje. Wszystko, co wymaga backendu,
bazy danych lub dlugotrwalego procesu, zostaje w origin repo i jest
opisane w [docs/locked-to-project/](docs/locked-to-project/README.md).

Cele:

- jeden `git clone` i masz komplet agentow, skili i hookow
- zadnych sciezek hardcodowanych na `/opt/platform/scaffolding.tool`
- parametryzacja przez `install.sh` z auto-detekcja wartosci
- idempotentny rerender (`install.sh --refresh`)
- licencja MIT

## Szybki start

### Ktery flow instalacji wybrac?

| Flow | Kiedy uzywac | Przestrzen nazw agentow |
|------|-------------|------------------------|
| `/plugin install claude-scaffolding@komluk-scaffolding` | Wiekszos uzytkownikow, zero-config, natywny marketplace Claude Code | `claude-scaffolding:developer` (z prefixem) |
| `./install.sh --target /path/to/repo` | Chcesz pliki skopiowane do drzewa repo, wlasna konfiguracja przez `~/.claude-scaffolding.env` | `developer` (bare -- install.sh usuwa prefix automatycznie) |

Dodatkowe wskazowki:

| Potrzeba | Flow |
|----------|------|
| Upgrade przez `/plugin update` | Opcja A (Plugin) |
| Wlasny `__CLAUDE_SCAFFOLDING_PROJECT_NAME__`, klucz Sonar, test commands | Opcja B (install.sh) |
| Integracja per-project `.claude/` vs user-level | Opcja B (install.sh --target) |
| Rozwoj/edycja komponentow claude-scaffolding | Opcja B (klon repo) |

---

### Opcja A -- Plugin Claude Code (zalecana dla szybkiego startu)

**Wymaganie:** `komluk/claude-scaffolding` jest repozytorium prywatnym, wiec Claude
Code CLI musi byc zalogowane do konta GitHub z dostepem do tego repo. Przed
pierwszym uzyciem uruchom:

```bash
gh auth login
# Wybierz: GitHub.com, HTTPS, login with web browser, scope: repo
```

**Kroki po instalacji (WSZYSTKIE wymagane):**

```
1. /plugin marketplace add komluk/claude-scaffolding
2. /plugin install claude-scaffolding@komluk-scaffolding
3. /reload-plugins                       ← WYMAGANE: Claude Code nie hot-reloaduje rejestru agentow
4. (opcjonalnie) /init-claude-scaffolding   ← patrz: "Czy potrzebujesz /init-claude-scaffolding?" ponizej
5. Task(subagent_type="claude-scaffolding:developer", prompt="...")
```

> **Bez `/reload-plugins`** rejestr `subagent_type` nie zostaje odswiezone po instalacji
> pluginu -- `Task(subagent_type="claude-scaffolding:developer")` zwroci blad
> `Agent type not found`. Mozna tez zamiast `/reload-plugins` zrestartowac cala sesje `claude`.

Plugin trafi do `~/.claude/plugins/cache/komluk-scaffolding/claude-scaffolding/<version>/`.
Parametry sa zaszyte jako sensowne defaulty (`pytest`, `npm test`, `./backend`, itd.) --
jesli potrzebujesz wlasnych wartosci, uzyj Opcji B.

---

### Opcja B -- Klon + install.sh (pelna parametryzacja)

```bash
# 1. Klon prosto do ~/.claude/ (user-level)
git clone https://github.com/komluk/claude-scaffolding ~/.claude
cd ~/.claude
./install.sh

# LUB: klon obok + render do .claude/ projektu (project-level)
git clone https://github.com/komluk/claude-scaffolding ~/src/claude-scaffolding
cd ~/src/claude-scaffolding
./install.sh --target /path/to/your/project/.claude
```

Install.sh pyta o kilka wartosci (komenda testow backendu, komenda walidacji
frontendu, klucz SonarQube, nazwa projektu, itp.), zapisuje je w
`~/.claude-scaffolding.env` i renderuje placeholdery `__CLAUDE_SCAFFOLDING_*__` z
`templates/*.tmpl` do plikow docelowych. Po pierwszym uruchomieniu mozna
zmienic wartosci edytujac `~/.claude-scaffolding.env` i uruchamiajac:

```bash
./install.sh --refresh
```

co jest idempotentne -- kazde kolejne wywolanie daje identyczny wynik bez
interakcji.

`install.sh` automatycznie kopiuje `CLAUDE.md` i `settings.json` do katalogu
docelowego oraz usuwa prefix `claude-scaffolding:` z wyrenderowanych plikow.
Nie trzeba zadnych dodatkowych krokow -- agenci sa od razu dostepni jako bare names
(np. `Task(subagent_type="developer")`).

---

### Czy potrzebujesz `/init-claude-scaffolding`? (tylko Opcja A)

Ta komenda kopiuje `CLAUDE.md` i `settings.json` do `$CWD` projektu (bez nadpisywania).
Dotyczy wylacznie flow z pluginem -- install.sh robi to automatycznie.

| Scenariusz | Uruchomic init? | Dlaczego |
|-----------|----------------|---------|
| Projekt solo, plugin zawsze zainstalowany | Nie | Hook SessionStart wstrzykuje protokol przy kazdym starcie sesji |
| Repo zespolowe, inni klonuja bez pluginu | Tak | `CLAUDE.md` w repo = protokol podrozuje razem z kodem |
| CI/automatyzacja czyta repo | Tak | Scommitowany `CLAUDE.md` = reproducible context |
| Jednorazowy/PoC projekt | Nie | Hook wystarczy, nie zasmiecaj repo |

**Roznica mechaniczna:**

- **Hook-based** (domyslnie po install + reload): protokol zyje w SessionStart hook output,
  jest efemeryczny, per-sesyjny, wymaga aktywnego pluginu.
- **Init-based** (po `/init-claude-scaffolding`): `CLAUDE.md` zapisany w `$CWD`,
  persistentny, wersjonowany w git, dziala nawet bez pluginu.

---

### Czeste problemy (gotchas)

**"Agent type 'developer' not found"**
- Zapomniałeś uruchomic `/reload-plugins` po instalacji, LUB
- Uzywasz bare name `developer` w flow z pluginem -- uzyj `claude-scaffolding:developer`.

**"Claude ignoruje protokol delegacji"**
- Plugin zaladowany, ale `/reload-plugins` nie byl uruchomiony po instalacji, LUB
- Uzywasz starszej wersji hooka (przed `45cb106`) ktora uzywala plain echo zamiast
  `hookSpecificOutput.additionalContext`.

**"Zainstalowalem plugin, ale nic nie dziala w nowej sesji"**
- Zrestartuj Claude Code w calosci (nie tylko otwiera nowa sesje) -- cache pluginow
  moze byc przeterminowany. `/reload-plugins` jest szybszym rozwiazaniem jezeli sesja jest aktywna.

## Wymagania

- `git`
- `python3` (dowolna wersja 3.x, bez pip deps)
- Claude Code CLI (https://claude.ai/code)

## Co jest w srodku

```
claude-scaffolding/
├── agents/         11 agentow (analyst, architect, coordinator, developer,
│                    debugger, devops, gitops, performance-optimizer,
│                    researcher, reviewer, tech-writer)
├── skills/         30 skili (api-design, error-handling, pattern-recognition,
│                    spec-*, mui-styling, python-patterns, testing-strategy, ...)
├── commands/       14 komend slash: 4 top-level (context, execute-prp,
│                    generate-prp, init-openspec) + 10 w `commands/specs/`
│                    (apply, archive, bulk-archive, continue, explore, ff,
│                    new, onboard, sync, verify) -- namespaced komendy OpenSpec
├── hooks/          7 hookow bezpieczenstwa (block-destructive-rm,
│                    block-env-write, pre-commit-validation, ...)
├── templates/      Szablony PRP (base, planning, spec)
├── validators/     Walidatory markdown (output-frontmatter, prp-document)
├── output-styles/  Definicja output-frontmatter
├── workflows/      YAML definicje workflow i coordinate
├── install.sh      Installer z parametryzacja
├── uninstall.sh    Undo install.sh (usuwa rendered copy)
├── CLAUDE.md       Glowny prompt projektu (z placeholderami)
└── settings.json   Hooki + statusline + permissions
```

## Czego nie ma (Tier C)

Komponenty zalezne od runtime scaffolding.tool NIE sa tutaj -- zostaly
opisane w [docs/locked-to-project/](docs/locked-to-project/README.md).
Skrocona lista:

| Komponent | Dlaczego nie w claude-scaffolding |
|-----------|----------------------------|
| `semantic-memory` MCP server | Wymaga Postgres + pgvector + embedding model |
| `semantic-memory-store` skill | Wywoluje bash do FastAPI backendu |
| `/workflow` komenda | Wymaga FastAPI + Redis + worker |
| `/distill` komenda | Wymaga distill CLI + DB |
| `ui-ux-pro-max` scripts/data | Python CLI + CSV database |

Skile ktore odwoluja sie do tych komponentow maja defensywne fallbacki:
jesli zaleznosci sa niedostepne, agent pomija odpowiednia sekcje zamiast
sie zawiesic.

## Aktualizacja

Repo ma ustabilizowane API plikowe -- nowe wersje dodaja agentow i skile,
nie usuwaja ich. Aby zaktualizowac:

```bash
cd ~/.claude  # lub gdzie skloniles claude-scaffolding
git pull
./install.sh --refresh  # rerenderuje placeholdery z istniejacego .env
```

Idempotentnosc jest testowana -- dwie kolejne `./install.sh --refresh`
produkuja bit-identyczne pliki.

## Parametryzacja

Pelna lista placeholderow `__CLAUDE_SCAFFOLDING_*__` znajduje sie w
[docs/parametrization.md](docs/parametrization.md). Krotka wersja:

- `CLAUDE_SCAFFOLDING_TEST_BACKEND_CMD` -- komenda do uruchomienia testow backendu
- `CLAUDE_SCAFFOLDING_TEST_FRONTEND_CMD` -- komenda walidacji frontendu
- `CLAUDE_SCAFFOLDING_PROJECT_NAME` -- nazwa projektu (domyslnie `basename $PWD`)
- `CLAUDE_SCAFFOLDING_SONAR_PROJECT_KEY` -- klucz SonarQube (opcjonalny)
- `CLAUDE_SCAFFOLDING_SCHEMAS_DIR` -- katalog schematow OpenSpec
- `CLAUDE_SCAFFOLDING_BACKEND_EXAMPLE_PATH` -- przykladowa sciezka feature backendu

Install.sh ma auto-detekcje dla kazdego z tych pol -- czyta `package.json`,
szuka `venv/`, sprawdza `.sonarlint/connectedMode.json` itp. Mozna wszystko
pomijac enterem i wrocic do tego pozniej przez `~/.claude-scaffolding.env`.

## Dokumentacja

- [docs/installation.md](docs/installation.md) -- szczegolowe opcje instalacji
- [docs/parametrization.md](docs/parametrization.md) -- pelna tabela placeholderow
- [docs/adopting-in-legacy-repo.md](docs/adopting-in-legacy-repo.md) --
  jak dodac do istniejacego projektu ze swoim `.claude/`
- [docs/locked-to-project/](docs/locked-to-project/README.md) -- Tier C
- [CHANGELOG.md](CHANGELOG.md) -- historia zmian

## Wersjonowanie

Projekt trzyma sie [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html).

| Bump | Kiedy |
|------|-------|
| **MAJOR** (X.0.0) | Breaking changes: usuniecie agenta/skilla/command, zmiana API `install.sh`, niekompatybilne zmiany `plugin.json` schema |
| **MINOR** (x.Y.0) | Nowy agent/skill/command/hook, nowa opcja `install.sh`, nowa feature w CI (backward compatible) |
| **PATCH** (x.y.Z) | Bug fix, typo, poprawki dokumentacji |

Source of truth dla wersji: `.claude-plugin/plugin.json` (`version` field).
Git tag MUSI pasowac (`v${version}`) -- jest to wymuszone przez
`release.yml` w GitHub Actions. Kazdy tag `v*` automatycznie tworzy
GitHub Release z assetami `install.sh`, `uninstall.sh`,
`.claude-scaffolding.env.example`.

Historia wersji: [CHANGELOG.md](CHANGELOG.md).

## Licencja

MIT -- patrz [LICENSE](LICENSE).
