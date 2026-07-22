const { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const Store = require('electron-store');

const store = new Store({ defaults: {
  avatarBounds: { width: 330, height: 420 }, consoleBounds: { width: 560, height: 760 },
  chatModel: 'qwen3.5:35b-a3b', toolModel: 'gpt-oss:20b', webMode: 'auto',
  operatorEnabled: false, ollamaApiKey: '', voiceEngine: 'windows', voiceProfile: 'sanny',
  voiceRate: 0, voiceVolume: 100
}});

let avatarWindow, consoleWindow, tray, speechProcess, voiceProcess;
const history = [];
const assetDir = path.join(app.getPath('userData'), 'assets', 'sanny');
const sampleDir = path.join(app.getPath('userData'), 'voice-lab', 'samples');
fs.mkdirSync(assetDir, { recursive: true });
fs.mkdirSync(sampleDir, { recursive: true });

function createAvatarWindow() {
  const b = store.get('avatarBounds');
  avatarWindow = new BrowserWindow({ ...b, transparent: true, frame: false, alwaysOnTop: true,
    resizable: false, skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  avatarWindow.loadFile('renderer.html', { query: { mode: 'avatar' } });
  avatarWindow.on('move', () => store.set('avatarBounds', avatarWindow.getBounds()));
}

function createConsoleWindow() {
  if (consoleWindow && !consoleWindow.isDestroyed()) { consoleWindow.show(); consoleWindow.focus(); return; }
  const a = avatarWindow.getBounds(), saved = store.get('consoleBounds');
  consoleWindow = new BrowserWindow({ width: saved.width || 560, height: saved.height || 760,
    x: saved.x ?? Math.max(0, a.x - (saved.width || 560) - 12), y: saved.y ?? a.y,
    frame: false, alwaysOnTop: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  consoleWindow.loadFile('renderer.html', { query: { mode: 'console' } });
  consoleWindow.once('ready-to-show', () => consoleWindow.show());
  consoleWindow.on('move', () => store.set('consoleBounds', consoleWindow.getBounds()));
  consoleWindow.on('resize', () => store.set('consoleBounds', consoleWindow.getBounds()));
  consoleWindow.on('closed', () => { consoleWindow = null; });
}

function startVoiceEngine() {
  const python = path.join(__dirname, 'voice-engine', '.venv', 'Scripts', 'python.exe');
  const server = path.join(__dirname, 'voice-engine', 'server.py');
  if (!fs.existsSync(python) || !fs.existsSync(server)) return;
  voiceProcess = spawn(python, [server], { cwd: path.dirname(server), windowsHide: true });
  voiceProcess.on('exit', () => { voiceProcess = null; });
}

async function tags() {
  const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`Ollama ${r.status}`);
  return r.json();
}
async function xttsHealth() {
  try { return (await fetch('http://127.0.0.1:3211/health', { signal: AbortSignal.timeout(1800) })).ok; }
  catch { return false; }
}
async function getHealth() {
  const c = store.store, h = { core: true, ollama: false, chatModel: false, toolModel: false, web: true, voice: true, ready: false };
  try {
    const names = ((await tags()).models || []).map(m => m.name || m.model);
    h.ollama = true;
    h.chatModel = names.some(n => n === c.chatModel || n.startsWith(c.chatModel + ':'));
    h.toolModel = names.some(n => n === c.toolModel || n.startsWith(c.toolModel + ':'));
  } catch {}
  if (c.webMode !== 'offline') h.web = Boolean(c.ollamaApiKey);
  h.xtts = await xttsHealth();
  h.voice = c.voiceEngine === 'xtts' ? h.xtts : true;
  h.ready = h.core && h.ollama && h.chatModel && h.toolModel && h.web && h.voice;
  return h;
}

function chooseModel(text, forced = 'auto') {
  if (forced === 'qwen') return store.get('chatModel');
  if (forced === 'gpt') return store.get('toolModel');
  return /(analyz|porovnej|naplánuj|strategie|ověř|najdi|internet|aktuáln|výzkum|soubor|aplikac|otevři|klikni|napiš do)/i.test(text)
    ? store.get('toolModel') : store.get('chatModel');
}
async function webSearch(query) {
  const key = store.get('ollamaApiKey');
  if (!key) throw new Error('Chybí Ollama API key.');
  const r = await fetch('https://ollama.com/api/web_search', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: 5 }), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Web search ${r.status}`);
  return r.json();
}
async function chat(payload) {
  const text = String(payload.text || '').trim();
  if (!text) return { text: '' };
  const model = chooseModel(text, payload.modelMode), webMode = payload.webMode || store.get('webMode');
  const useWeb = webMode === 'auto' ? /(aktuáln|dnes|zítra|najdi|ověř|internet|novink|cena|počas)/i.test(text)
    : webMode === 'manual' ? /^(najdi|vyhledej|ověř)/i.test(text) : false;
  let webContext = '', sources = [];
  if (useWeb) {
    const data = await webSearch(text);
    sources = (data.results || []).map(x => ({ title: x.title, url: x.url }));
    webContext = '\n\nAktuální webové zdroje:\n' + (data.results || []).map((x, i) => `[${i + 1}] ${x.title}\n${x.content}\n${x.url}`).join('\n\n');
  }
  const system = 'Jsi Sanny, lokální český desktopový AI asistent Pavla. Mluv přirozeně, stručně, hovorově a přesně. Humor může být lehce jízlivý, ale musí dávat smysl. Nikdy nepředstírej schopnosti, které nemáš. Webové zdroje cituj číslem. Rizikové akce na PC vždy nejdřív popiš a vyžádej potvrzení.';
  const messages = [{ role: 'system', content: system }, ...history.slice(-12), { role: 'user', content: text + webContext }];
  const r = await fetch('http://127.0.0.1:11434/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false, options: { temperature: model.includes('gpt-oss') ? 0.3 : 0.65, num_ctx: 32768 } }),
    signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw new Error(`Ollama chat ${r.status}`);
  const data = await r.json(), answer = data.message?.content || data.response || '';
  history.push({ role: 'user', content: text }, { role: 'assistant', content: answer });
  return { text: answer, model, sources };
}

function stopSpeech() { if (speechProcess && !speechProcess.killed) speechProcess.kill(); speechProcess = null; }
async function speakWindows(text) {
  stopSpeech();
  const clean = String(text).replace(/https?:\/\/\S+/g, '').replace(/[*_`#>]/g, ' ').slice(0, 5000).replace(/'/g, "''");
  const script = `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $cs=$s.GetInstalledVoices()|?{$_.VoiceInfo.Culture.Name -eq 'cs-CZ'}|select -First 1; if($cs){$s.SelectVoice($cs.VoiceInfo.Name)}; $s.Rate=${Number(store.get('voiceRate')) || 0}; $s.Volume=${Number(store.get('voiceVolume')) || 100}; $s.Speak('${clean}')`;
  speechProcess = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true });
  return new Promise(resolve => speechProcess.on('exit', resolve));
}
async function speakXtts(text) {
  stopSpeech();
  const r = await fetch('http://127.0.0.1:3211/synthesize', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language: 'cs', profile: store.get('voiceProfile') }), signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw new Error(`XTTS ${r.status}`);
  const wav = path.join(app.getPath('temp'), `sanny_${Date.now()}.wav`);
  fs.writeFileSync(wav, Buffer.from(await r.arrayBuffer()));
  speechProcess = spawn('powershell.exe', ['-NoProfile', '-Command', `$p=New-Object Media.SoundPlayer '${wav.replace(/'/g, "''")}'; $p.PlaySync()`], { windowsHide: true });
  return new Promise(resolve => speechProcess.on('exit', () => { try { fs.unlinkSync(wav); } catch {} resolve(); }));
}
async function speak(text) {
  if (store.get('voiceEngine') === 'xtts') { try { return await speakXtts(text); } catch { return speakWindows(text); } }
  return speakWindows(text);
}

function aiReadyAsset() {
  for (const n of ['AI_ready.webm', 'AI_ready.mp4']) { const p = path.join(assetDir, n); if (fs.existsSync(p)) return pathToFileURL(p).href; }
  return null;
}
function operator(action) {
  if (!store.get('operatorEnabled')) throw new Error('Operator je vypnutý.');
  const allowed = { notepad: 'notepad.exe', calculator: 'calc.exe', explorer: 'explorer.exe', chrome: 'chrome.exe', edge: 'msedge.exe', vscode: 'code.exe' };
  if (action.type === 'open_app' && allowed[action.app]) { spawn(allowed[action.app], [], { detached: true }); return { ok: true }; }
  if (action.type === 'type_text') {
    const txt = String(action.text || '').replace(/'/g, "''").replace(/[+^%~(){}\[\]]/g, '{$&}');
    spawn('powershell.exe', ['-NoProfile', '-Command', `$w=New-Object -ComObject WScript.Shell; Start-Sleep -Milliseconds 300; $w.SendKeys('${txt}')`], { windowsHide: true });
    return { ok: true };
  }
  throw new Error('Akce není povolená.');
}

app.whenReady().then(() => {
  createAvatarWindow(); startVoiceEngine();
  const icon = nativeImage.createFromDataURL('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iOCIgZmlsbD0iIzIxYzg3NSIvPjx0ZXh0IHg9IjE2IiB5PSIyMiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxOCI+UzwvdGV4dD48L3N2Zz4=');
  tray = new Tray(icon); tray.setToolTip('Sanny Desktop');
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Otevřít konzoli', click: createConsoleWindow },
    { label: 'Zobrazit / skrýt avatara', click: () => avatarWindow.isVisible() ? avatarWindow.hide() : avatarWindow.show() },
    { type: 'separator' }, { label: 'Ukončit', click: () => app.quit() }]));
  globalShortcut.register('CommandOrControl+Shift+Space', () => avatarWindow.isVisible() ? avatarWindow.hide() : avatarWindow.show());
});
app.on('window-all-closed', e => e.preventDefault());
app.on('will-quit', () => { globalShortcut.unregisterAll(); stopSpeech(); if (voiceProcess && !voiceProcess.killed) voiceProcess.kill(); });

ipcMain.handle('open-console', createConsoleWindow);
ipcMain.handle('close-window', e => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.handle('minimize-window', e => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.handle('get-config', () => store.store);
ipcMain.handle('set-config', (_e, patch) => { Object.entries(patch || {}).forEach(([k, v]) => store.set(k, v)); return store.store; });
ipcMain.handle('health', getHealth);
ipcMain.handle('chat', (_e, p) => chat(p));
ipcMain.handle('speak', (_e, text) => speak(text));
ipcMain.handle('stop-speech', stopSpeech);
ipcMain.handle('asset-info', () => ({ aiReady: aiReadyAsset(), assetDir }));
ipcMain.handle('open-assets', () => shell.openPath(assetDir));
ipcMain.handle('save-voice-sample', (_e, { name, base64 }) => {
  const safe = String(name || `sample_${Date.now()}.wav`).replace(/[^a-zA-Z0-9_.-]/g, '_');
  const p = path.join(sampleDir, safe.endsWith('.wav') ? safe : `${safe}.wav`);
  fs.writeFileSync(p, Buffer.from(base64, 'base64')); return p;
});
ipcMain.handle('list-voice-samples', () => fs.readdirSync(sampleDir).filter(x => x.endsWith('.wav')));
ipcMain.handle('operator', (_e, action) => operator(action));
