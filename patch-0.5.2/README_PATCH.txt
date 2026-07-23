SANNY DESKTOP PATCH 0.5.1 -> 0.5.2
====================================

Obsah patche:
- korekce zkomolenych hlasovych prikazu
- vlastni slovnik aplikaci a Windows funkci
- potvrzeni hlasoveho prikazu pred jeho provedenim
- moznost opraveny text jen vlozit do pole nebo zahodit
- varovani pri nedolozenem tvrzeni o uspesne akci
- Personality Core v1
- automaticka zaloha a rollback

INSTALACE
1. Ukonci Sannyho pres ikonu v systemove liste.
2. Otevri slozku, kde mas Sanny Desktop 0.5.1.
3. Rozbal obsah tohoto ZIPu primo do teto slozky.
4. Spust APPLY_PATCH.bat.
5. Po dokonceni spust puvodni INSTALL_AND_RUN.bat.

Po rozbaleni musi byt APPLY_PATCH.bat vedle main.js, renderer.html a package.json.

NAVRAT NA 0.5.1
- ukonci Sannyho
- spust ROLLBACK_PATCH.bat

Poznamka:
Patch neinstaluje znovu Ollamu, modely, Whisper, XTTS ani node_modules.
