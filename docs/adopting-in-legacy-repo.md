# Dolaczanie claude-home do istniejacego projektu

Jesli twoj projekt juz ma `.claude/` z wlasnymi agentami, skilami lub
hookami, masz dwie opcje integracji.

## Opcja A -- user-level (rekomendowana)

Renderuj `claude-home` do `~/.claude/`. Claude Code automatycznie merguje
user-level config z project-level `.claude/`. Twoje projektowe pliki wygrywaja
w konfliktach -- to znaczy ze project-level `agents/developer.md` przysloni
user-level, ale user-level skile bez odpowiednika w projekcie beda nadal
widoczne.

```bash
git clone https://github.com/komluk/claude-home ~/.claude-home-src
cd ~/.claude-home-src
./install.sh --target ~/.claude
```

Po tym kazdy projekt na tej maszynie automatycznie dostaje brakujace
agenty i skile z `claude-home`, bez ruszania projektowego `.claude/`.

**Plus**: zero ryzyka nadpisania istniejacych plikow.
**Minus**: claude-home jest per-user, nie per-repo. Jesli pracujesz w kilku
projektach o roznych wymaganiach, musisz rozwazyc Opcje B.

## Opcja B -- overlay na project-level `.claude/`

Renderuj prosto do `.claude/` projektu. UWAGA: `install.sh` nadpisze pliki
o tej samej nazwie (np. `agents/developer.md`). Zrob backup:

```bash
cd /path/to/your/project
cp -r .claude .claude.backup-$(date +%Y%m%d)

cd ~/.claude-home-src
./install.sh --target /path/to/your/project/.claude
```

Po tym sprawdz:

```bash
cd /path/to/your/project
diff -r .claude.backup-<date> .claude  # zobacz co sie zmienilo
```

Jesli jakis plik projektowy byl lepszy niz claude-home -- przywroc go z backupu.

**Plus**: pelna kontrola, claude-home w gicie projektu.
**Minus**: konflikty wymagaja manualnego rozwiazania; kazdy `--refresh`
moze potencjalnie nadpisac lokalne zmiany.

### Wskazowki dla Opcji B

- Dodaj `.claude/` do `.gitignore` projektu, jesli nie chcesz commitowac
  rendered copy (ale wtedy trac spojnosc zespolu -- kazdy ma inna wersje).
- Alternatywa: commitowac `.claude/` do gita, uruchamiac `install.sh`
  tylko gdy zmieniasz `.env`, i review diff przed commitem.
- Do zautomatyzowania: dodaj shell alias lub makefile task np.
  `make claude-refresh` ktory uruchamia `install.sh --refresh`.

## Future scaffolding.tool migration steps (outside T01-T11 scope)

Poniższe kroki sa opisem mozliwej przyszlej migracji, a NIE czescia obecnej
fazy (T01-T11). Dokumentuje je tu dla jasnosci, ale ich realizacja wymaga
osobnego planu:

- **Krok 6** -- usuniecie `.claude/` z origin `scaffolding.tool` i zastapienie
  go symlinkiem do `claude-home`. Wymaga weryfikacji ze zaden test nie
  trzyma sie hardcoded path na `scaffolding.tool/.claude/`.
- **Krok 7** -- publiczne ogloszenie `claude-home`, dokumentacja migracyjna
  dla uzytkownikow scaffolding.tool, plus ewentualny wrapper skrypt do
  zainstalowania claude-home w place of the old `.claude/`.

Oba kroki wykraczaja poza obecny zakres i beda realizowane jako osobna
iteracja po walidacji fazy A.
