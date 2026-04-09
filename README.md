# claude-home

Przenosna konfiguracja Claude Code: agenci, skille, komendy, hooki, workflow.
Repozytorium mozna sklonowac do kazdego projektu i uzywac natychmiast, bez
zadnych bibliotek Pythona ani backendu.

## Wprowadzenie

`claude-home` to wydzielony, samodzielny `~/.claude/` wyciety z repozytorium
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

```bash
# 1. Klon prosto do ~/.claude/ (user-level)
git clone https://github.com/komluk/claude-home ~/.claude
cd ~/.claude
./install.sh

# LUB: klon obok + render do .claude/ projektu (project-level)
git clone https://github.com/komluk/claude-home ~/src/claude-home
cd ~/src/claude-home
./install.sh --target /path/to/your/project/.claude
```

Install.sh pyta o kilka wartosci (komenda testow backendu, komenda walidacji
frontendu, klucz SonarQube, nazwa projektu, itp.), zapisuje je w
`~/.claude-home.env` i podmienia placeholdery `__CLAUDE_HOME_*__` w plikach
docelowych. Po pierwszym uruchomieniu mozna zmienic wartosci edytujac
`~/.claude-home.env` i uruchamiajac:

```bash
./install.sh --refresh
```

co jest idempotentne -- kazde kolejne wywolanie daje identyczny wynik bez
interakcji.

## Wymagania

- `git`
- `python3` (dowolna wersja 3.x, bez pip deps)
- Claude Code CLI (https://claude.ai/code)

## Co jest w srodku

```
claude-home/
├── agents/         11 agentow (analyst, architect, coordinator, developer,
│                    debugger, devops, gitops, performance-optimizer,
│                    researcher, reviewer, tech-writer)
├── skills/         30 skili (api-design, error-handling, pattern-recognition,
│                    spec-*, mui-styling, python-patterns, testing-strategy, ...)
├── commands/       Podstawowe komendy slash (context, execute-prp,
│                    generate-prp, init-openspec)
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

| Komponent | Dlaczego nie w claude-home |
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
cd ~/.claude  # lub gdzie skloniles claude-home
git pull
./install.sh --refresh  # rerenderuje placeholdery z istniejacego .env
```

Idempotentnosc jest testowana -- dwie kolejne `./install.sh --refresh`
produkuja bit-identyczne pliki.

## Parametryzacja

Pelna lista placeholderow `__CLAUDE_HOME_*__` znajduje sie w
[docs/parametrization.md](docs/parametrization.md). Krotka wersja:

- `CLAUDE_HOME_TEST_BACKEND_CMD` -- komenda do uruchomienia testow backendu
- `CLAUDE_HOME_TEST_FRONTEND_CMD` -- komenda walidacji frontendu
- `CLAUDE_HOME_PROJECT_NAME` -- nazwa projektu (domyslnie `basename $PWD`)
- `CLAUDE_HOME_SONAR_PROJECT_KEY` -- klucz SonarQube (opcjonalny)
- `CLAUDE_HOME_SCHEMAS_DIR` -- katalog schematow OpenSpec
- `CLAUDE_HOME_BACKEND_EXAMPLE_PATH` -- przykladowa sciezka feature backendu

Install.sh ma auto-detekcje dla kazdego z tych pol -- czyta `package.json`,
szuka `venv/`, sprawdza `.sonarlint/connectedMode.json` itp. Mozna wszystko
pomijac enterem i wrocic do tego pozniej przez `~/.claude-home.env`.

## Dokumentacja

- [docs/installation.md](docs/installation.md) -- szczegolowe opcje instalacji
- [docs/parametrization.md](docs/parametrization.md) -- pelna tabela placeholderow
- [docs/adopting-in-legacy-repo.md](docs/adopting-in-legacy-repo.md) --
  jak dodac do istniejacego projektu ze swoim `.claude/`
- [docs/locked-to-project/](docs/locked-to-project/README.md) -- Tier C
- [CHANGELOG.md](CHANGELOG.md) -- historia zmian

## Licencja

MIT -- patrz [LICENSE](LICENSE).
