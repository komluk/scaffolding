# Instalacja

Trzy typowe scenariusze. Wybierz jeden i przejdz dalej.

## Opcja A -- klon bezposrednio do `~/.claude/`

Najprostszy przypadek. `scaffolding` staje sie twoim user-level `.claude/`.

```bash
git clone https://github.com/komluk/scaffolding ~/.claude
cd ~/.claude
./install.sh
```

`install.sh` zapyta o wartosci, zapisze `~/.scaffolding.env`, i podmieni
placeholdery w miejscu. Po tym wszystkie projekty na tej maszynie automatycznie
dostaja te agenty, skile, hooki.

## Opcja B -- klon obok + render do project-level `.claude/`

Gdy chcesz miec scaffolding tylko w jednym projekcie (nie user-level).

```bash
git clone https://github.com/komluk/scaffolding ~/src/scaffolding
cd ~/src/scaffolding
./install.sh --target /path/to/your/project/.claude
```

Install.sh skopiuje wszystkie potrzebne pliki do `target` i podmieni
placeholdery tam, nie dotykajac zrodla. Projekt otrzymuje wlasna kopie,
ktora nie jest pod kontrola gita (dodaj `.claude/` do `.gitignore`, jesli
chcesz).

## Opcja C -- overlay na istniejacym projekcie

Jesli projekt juz ma `.claude/` z wlasnymi agentami i chcesz dolozyc
scaffolding na wierzchu: sprawdz najpierw `docs/adopting-in-legacy-repo.md`.

## Pierwsze uruchomienie

Po przejsciu `install.sh` uruchom `claude` w dowolnym repozytorium, zeby
potwierdzic, ze konfiguracja ladowala sie poprawnie. Szybki smoke test,
ktory nie wymaga logowania:

```bash
claude --version
```

Jesli uzywasz izolowanego `CLAUDE_CONFIG_DIR` (np. osobny katalog per
klient albo per projekt), pamietaj ze **kazdy config dir ma wlasny token
autoryzacyjny**. Musisz raz wykonac `/login` wewnatrz kazdego takiego
katalogu, zanim agenty beda mogly wolac API:

```bash
CLAUDE_CONFIG_DIR=/path/to/isolated/.claude claude
# w sesji:
/login
```

Dopiero po zapisaniu tokenu dla danego `CLAUDE_CONFIG_DIR` wszystkie
kolejne uruchomienia beda dzialac bez monitu.

## Wymagania

- `git`
- `python3` (3.x, bez dependencies)
- Claude Code CLI zainstalowany i dzialajacy (`claude --version`)

## Troubleshooting

### `install.sh` zawiesza sie na prompcie

Jesli uruchamiasz z non-interactive terminal (CI, pipe), wszystkie prompty
automatycznie przyjmuja default. Jesli chcesz w pelni unattended instalacje:

```bash
./install.sh --target /path --refresh  # wymaga istniejacego ~/.scaffolding.env
```

### "unreplaced placeholders found" (exit 2)

Znaczy ze jeden z plikow w target ma `__CLAUDE_SCAFFOLDING_*__` ktore nie zostaly
zastapione. To bug w install.sh -- zgłos issue z output installera. Workaround:
uruchom `./install.sh --refresh` ponownie.

### Agent nie widzi skili

Sprawdz ze `settings.json` w target ma poprawne `skills:` frontmatter.
Jesli `claude -p "list my skills"` nie zwraca pelnej listy, najczesciej
brakuje skilla w `CLAUDE_CONFIG_DIR`. Zweryfikuj zmienna srodowiskowa
`CLAUDE_CONFIG_DIR` i strukture katalogow w `$CLAUDE_CONFIG_DIR/skills/`.

### Jak odwrocic instalacje

```bash
./uninstall.sh --target /path/to/.claude
```

Usuwa rendered copy. Jesli klonowales do `~/.claude/`, po prostu usun katalog:
`rm -rf ~/.claude`.
