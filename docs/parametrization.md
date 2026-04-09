# Parametryzacja

`claude-home` uzywa placeholderow `__CLAUDE_HOME_*__` w plikach szablonowych,
ktore `install.sh` podmienia na wartosci z `~/.claude-home.env`. To pozwala
jednemu repo sluzyc wielu projektom bez forkow i edycji w miejscu.

## Lista placeholderow

| Placeholder | Znaczenie | Default | Auto-detect | Pliki ktore uzywaja |
|-------------|-----------|---------|-------------|----------------------|
| `CLAUDE_HOME_TEST_BACKEND_CMD` | Komenda uruchamiajaca testy backendu | `echo '[claude-home] no backend tests configured' && true` | Szuka `venv/`, `.venv/`, `app/backend/venv/`, `backend/venv/` -> `source <venv>/bin/activate && pytest` | `agents/developer.md`, `agents/reviewer.md`, `skills/spec-develop/SKILL.md`, `CLAUDE.md` |
| `CLAUDE_HOME_TEST_FRONTEND_CMD` | Komenda walidacji frontendu | `echo '[claude-home] no frontend validation configured' && true` | Jesli `package.json` ma `"validate"` -> `npm run validate`; jesli `tsconfig.json` -> `npx tsc --noEmit` | `agents/developer.md`, `skills/spec-develop/SKILL.md`, `CLAUDE.md` |
| `CLAUDE_HOME_SONAR_PROJECT_KEY` | Klucz projektu SonarQube | (pusty) | Czyta `.sonarlint/connectedMode.json` jesli istnieje | `agents/reviewer.md`, `CLAUDE.md` |
| `CLAUDE_HOME_SCHEMAS_DIR` | Katalog OpenSpec schemas | `./.scaffolding/openspec/schemas` | (brak) | `commands/init-openspec.md`, `skills/spec-design/SKILL.md` |
| `CLAUDE_HOME_PROJECT_NAME` | Nazwa projektu | `basename $PWD` | `basename $PWD` | `CLAUDE.md`, `agents/architect.md` |
| `CLAUDE_HOME_BACKEND_EXAMPLE_PATH` | Przykladowa sciezka feature backendu | `app/backend/app/feature/` | (brak) | `skills/spec-design/SKILL.md`, `skills/spec-develop/SKILL.md` |

## Jak zmienic wartosc po instalacji

Dwa sposoby:

### 1. Re-uruchomic install.sh

```bash
cd ~/.claude  # lub gdzie jest claude-home
./install.sh  # zapyta o kazda wartosc, domyslne pokaze aktualna
```

### 2. Edytowac `~/.claude-home.env` recznie

```bash
nano ~/.claude-home.env
# zmien wartosc, np.:
# CLAUDE_HOME_SONAR_PROJECT_KEY=myorg.myproject

./install.sh --refresh  # rerenderuje pliki docelowe z tymi wartosciami
```

`--refresh` jest trybem non-interactive: uzywa pliku `.env`, nie pyta
o nic, daje identyczny wynik przy kazdym uruchomieniu (idempotent).

## Format `~/.claude-home.env`

```env
# komentarze zaczynaja sie od #
KEY=VALUE
# bez cudzyslowow
# bez spacji wokol =
CLAUDE_HOME_TEST_BACKEND_CMD=source app/backend/venv/bin/activate && pytest
```

Plik ma uprawnienia 0600 (tylko wlasciciel czyta) -- ustawiane automatycznie
przez `install.sh`.

## Jak sprawdzic, co zostalo podmienione

```bash
# Zadnych `__CLAUDE_HOME_*__` nie powinno byc w target:
grep -rn "__CLAUDE_HOME_" /path/to/.claude/

# Wartosci z .env powinny sie pojawic w CLAUDE.md:
grep -n "pytest\|npm run validate" /path/to/.claude/CLAUDE.md
```

## Dodawanie nowych placeholderow

Jesli fork potrzebuje dodatkowego pola:

1. Dodaj `CLAUDE_HOME_MY_KEY=default` do `.claude-home.env.example`.
2. Dodaj `prompt_for CLAUDE_HOME_MY_KEY "Opis" "default"` w `install.sh`.
3. Uzyj `__CLAUDE_HOME_MY_KEY__` w pliku szablonowym i dodaj go do
   tablicy `TEMPLATES` w `install.sh`.
4. Zaktualizuj tabele w tym pliku.

`install.sh` automatycznie eksportuje wszystkie `CLAUDE_HOME_*` z ENV do
procesu Pythona, ktory robi podmiane -- nie trzeba dotykac logiki
`render_file`.
