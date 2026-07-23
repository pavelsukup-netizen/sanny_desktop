'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BACKUP_ROOT = path.join(ROOT, '_patch_backup', '0.5.1_to_0.5.2');
const MARKER = 'SANNY_PATCH_0_5_2';

function fail(message) {
  console.error(`[CHYBA] ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function write(file, content) {
  fs.writeFileSync(path.join(ROOT, file), content, 'utf8');
}

function ensureFile(file) {
  if (!fs.existsSync(path.join(ROOT, file))) fail(`Chybi soubor ${file}. Rozbal patch primo do slozky Sanny Desktop 0.5.1.`);
}

function backup(files) {
  fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  for (const file of files) {
    const source = path.join(ROOT, file);
    if (!fs.existsSync(source)) continue;
    const target = path.join(BACKUP_ROOT, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  fs.writeFileSync(path.join(BACKUP_ROOT, 'backup-info.json'), JSON.stringify({
    createdAt: new Date().toISOString(),
    sourceVersion: '0.5.1',
    targetVersion: '0.5.2',
    files
  }, null, 2));
}

function injectRenderer(html) {
  if (html.includes(MARKER)) return html;

  const scriptTag = `\n<!-- ${MARKER} -->\n<script src="patch-runtime/voice-guard.js"></script>\n`;
  if (!/<\/body>/i.test(html)) fail('renderer.html nema uzaviraci tag </body>.');
  html = html.replace(/<\/body>/i, `${scriptTag}</body>`);

  // Vypne nekolik beznych variant automatickeho odeslani po STT.
  const patterns = [
    /(recognition\.onresult\s*=\s*[^\n]+?)(?:send\(\);)/g,
    /(sttAutoSend\s*\?\s*)(?:send\(\))/g,
    /(autoSendTranscript\s*&&\s*)(?:send\(\))/g,
    /(if\s*\([^)]*(?:autoSend|sttAutoSend)[^)]*\)\s*\{?\s*)(?:await\s+)?send\(\);?/g
  ];
  for (const pattern of patterns) {
    html = html.replace(pattern, '$1window.SannyVoiceGuard.stageFromInput();');
  }

  return html;
}

function injectMain(main) {
  if (main.includes('function sannyPersonalityPrompt()')) return main;

  const helper = `\n// ${MARKER}: modulární Personality Core v1\nfunction sannyPersonalityPrompt() {\n  try {\n    const p = path.join(__dirname, 'patch-runtime', 'personality-core.json');\n    const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));\n    const rules = Array.isArray(cfg.rules) ? cfg.rules.join('\\n- ') : '';\n    return [\n      'OSOBNOST SANNYHO:',\n      cfg.description || '',\n      'Pravidla:',\n      rules ? '- ' + rules : '',\n      'Osobnost smí měnit styl odpovědi, nikdy fakta, stav nástrojů ani výsledek akcí.'\n    ].filter(Boolean).join('\\n');\n  } catch {\n    return 'Mluv přirozeně, česky, hovorově a stručně. Nikdy si nevymýšlej výsledky nástrojů.';\n  }\n}\n`;

  const requireBlock = /((?:const|let|var)\s+path\s*=\s*require\(['"]path['"]\);?)/;
  if (requireBlock.test(main)) {
    main = main.replace(requireBlock, `$1${helper}`);
  } else {
    main = helper + main;
  }

  const replacements = [
    [/content\s*:\s*systemPrompt\b/g, "content: `${systemPrompt}\\n\\n${sannyPersonalityPrompt()}`"],
    [/content\s*:\s*system\b/g, "content: `${system}\\n\\n${sannyPersonalityPrompt()}`"],
    [/content\s*:\s*SYSTEM_PROMPT\b/g, "content: `${SYSTEM_PROMPT}\\n\\n${sannyPersonalityPrompt()}`"]
  ];
  let changed = false;
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(main)) {
      main = main.replace(pattern, replacement);
      changed = true;
    }
  }

  if (!changed) {
    console.warn('[VAROVANI] Nenasel jsem system prompt pro automaticke napojeni Personality Core. Hlasovy guard bude fungovat, osobnost zustane puvodni.');
  }

  return main;
}

function updatePackage(pkgText) {
  const pkg = JSON.parse(pkgText);
  const current = String(pkg.version || '');
  if (!current.startsWith('0.5.1') && !current.startsWith('0.5.2')) {
    fail(`Ocekavana verze 0.5.1, nalezena ${current || 'nezjistena'}.`);
  }
  pkg.version = '0.5.2';
  pkg.sannyPatch = '0.5.1-to-0.5.2';
  return JSON.stringify(pkg, null, 2) + '\n';
}

function main() {
  for (const file of ['package.json', 'main.js', 'renderer.html']) ensureFile(file);

  const packageJson = read('package.json');
  const parsed = JSON.parse(packageJson);
  if (String(parsed.version || '').startsWith('0.5.2') && read('renderer.html').includes(MARKER)) {
    console.log('[OK] Patch 0.5.2 uz je aplikovany.');
    return;
  }

  backup(['package.json', 'main.js', 'renderer.html', 'preload.js']);
  write('renderer.html', injectRenderer(read('renderer.html')));
  write('main.js', injectMain(read('main.js')));
  write('package.json', updatePackage(packageJson));
  fs.writeFileSync(path.join(ROOT, '.sanny-version'), '0.5.2\n', 'utf8');

  console.log('[OK] Zaloha vytvorena v _patch_backup\\0.5.1_to_0.5.2');
  console.log('[OK] Hlasovy prepis dostal korekci a potvrzovaci dialog.');
  console.log('[OK] Personality Core v1 byl pripojen k system promptu, pokud byl nalezen.');
  console.log('[OK] Verze aktualizovana na 0.5.2.');
}

try {
  main();
} catch (error) {
  if (!process.exitCode) process.exitCode = 1;
  console.error(error.message || error);
}
