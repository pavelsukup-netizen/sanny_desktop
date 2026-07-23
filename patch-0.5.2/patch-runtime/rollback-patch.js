'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BACKUP_ROOT = path.join(ROOT, '_patch_backup', '0.5.1_to_0.5.2');

function copyRecursive(sourceDir, targetDir) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.name === 'backup-info.json') continue;
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      copyRecursive(source, target);
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
  }
}

try {
  if (!fs.existsSync(BACKUP_ROOT)) {
    throw new Error('Zaloha _patch_backup\\0.5.1_to_0.5.2 nebyla nalezena.');
  }
  copyRecursive(BACKUP_ROOT, ROOT);
  try { fs.unlinkSync(path.join(ROOT, '.sanny-version')); } catch {}
  console.log('[OK] Soubory verze 0.5.1 byly obnoveny.');
  console.log('[INFO] Slozku patch-runtime muzes ponechat, aplikace ji bez injekce nepouzije.');
} catch (error) {
  console.error(`[CHYBA] ${error.message || error}`);
  process.exitCode = 1;
}
