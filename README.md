# Sanny Desktop 0.4

Lokální desktopový AI asistent pro Windows s avatarem, dvěma Ollama modely, webovým hledáním, základním operátorem a volitelným klonováním hlasu přes XTTS-v2.

## Co obsahuje 0.4

- samostatné transparentní okno avatara,
- samostatnou přesouvatelnou chatovací konzoli,
- Qwen 3.5 35B-A3B pro běžnou konverzaci,
- GPT-OSS 20B pro analýzu a aktuální informace,
- automatický nebo ruční výběr modelu,
- Ollama Web Search přes API key,
- širokoúhlý stavový panel `AI_ready.webm` / `AI_ready.mp4`,
- společný health check Ollamy, obou modelů, webu a hlasu,
- Windows český hlas jako spolehlivý fallback,
- lokální XTTS-v2 sidecar na `127.0.0.1:3211`,
- Voice Lab ukládající referenční nahrávky jako mono WAV,
- základní Operator režim s omezeným seznamem aplikací,
- uložení pozic oken a konfigurace do `%APPDATA%\Sanny Desktop`.

## První spuštění

1. Nainstaluj Node.js 20 LTS nebo novější.
2. Nainstaluj Ollamu.
3. Spusť `scripts\install-models.bat`.
4. Spusť `INSTALL_AND_RUN.bat`.
5. V nastavení vlož Ollama API key, pokud chceš používat webové hledání.

## AI heartbeat video

V konzoli klikni na **Otevřít assets/sanny** a vlož:

- `AI_ready.webm`, nebo
- `AI_ready.mp4`.

Video má vždy šířku panelu a automatickou výšku podle svého poměru stran. Přehrává se ve smyčce jen tehdy, když health check vyhodnotí všechny právě požadované části jako funkční. Pokud je web ručně nastavený na offline, nepovažuje se to za chybu.

## Vlastní hlas přes XTTS

1. Otevři kartu **Voice Lab** a nahraj alespoň 5 čistých vět.
2. Spusť `voice-engine\install-engine.bat`.
3. Potom spusť `voice-engine\start-engine.bat`, nebo restartuj Sanny Desktop. Aplikace se pokusí nainstalovaný engine spustit sama.
4. V nastavení zvol **XTTS lokální klon**.

Pokud XTTS selže nebo není dostupný, aplikace automaticky použije český Windows hlas.

### AMD upozornění

Na Windows může instalace GPU PyTorch pro Radeon vyžadovat konkrétní ovladač a ROCm balíčky. Bez funkčního GPU backendu poběží XTTS na CPU, ale může být výrazně pomalejší.

## Bezpečnost Operatoru

Operator je ve výchozím stavu vypnutý. Aktuální verze nemá univerzální shell ani mazání souborů. Povolené jsou pouze explicitně definované aplikace a jednoduché psaní do aktivního okna.

## Vývoj

```bat
npm install
npm run check
npm start
```

Větev verze 0.4: `feature/sanny-desktop-0.4`.
