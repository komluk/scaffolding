# Instalacja

Trzy typowe scenariusze. Wybierz jeden i przejdz dalej.

## Opcja A -- klon bezposrednio do `~/.claude/`

Najprostszy przypadek. `claude-home` staje sie twoim user-level `.claude/`.

```bash
git clone https://github.com/komluk/claude-home ~/.claude
cd ~/.claude
./install.sh
```

`install.sh` zapyta o wartosci, zapisze `~/.claude-home.env`, i podmieni
placeholdery w miejscu. Po tym wszystkie projekty na tej maszynie automatycznie
dostaja te agenty, skile, hooki.

## Opcja B -- klon obok + render do project-level `.claude/`

Gdy chcesz miec claude-home tylko w jednym projekcie (nie user-level).

```bash
git clone https://github.com/komluk/claude-home ~/src/claude-home
cd ~/src/claude-home
./install.sh --target /path/to/your/project/.claude
```

Install.sh skopiuje wszystkie potrzebne pliki do `target` i podmieni
placeholdery tam, nie dotykajac zrodla. Projekt otrzymuje wlasna kopie,
ktora nie jest pod kontrola gita (dodaj `.claude/` do `.gitignore`, jesli
chcesz).

## Opcja C -- overlay na istniejacym projekcie

Jesli projekt juz ma `.claude/` z wlasnymi agentami i chcesz dolozyc
claude-home na wierzchu: sprawdz najpierw `docs/adopting-in-legacy-repo.md`.

## Wymagania

- `git`
- `python3` (3.x, bez dependencies)
- Claude Code CLI zainstalowany i dzialajacy (`claude --version`)

## Troubleshooting

### `install.sh` zawiesza sie na prompcie

Jesli uruchamiasz z non-interactive terminal (CI, pipe), wszystkie prompty
automatycznie przyjmuja default. Jesli chcesz w pelni unattended instalacje:

```bash
./install.sh --target /path --refresh  # wymaga istniejacego ~/.claude-home.env
```

### "unreplaced placeholders found" (exit 2)

Znaczy ze jeden z plikow w target ma `__CLAUDE_HOME_*__` ktore nie zostaly
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
