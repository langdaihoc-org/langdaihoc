/**
 * Build Vercel Build Output API from Vite dist (apps/web/dist).
 * Used when cloud `vercel` build is stuck / env redacted in agent mode.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/web/dist');
const out = path.join(root, '.vercel/output');
const staticDir = path.join(out, 'static');

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(dist)) {
  console.error('Missing apps/web/dist — run web build first');
  process.exit(1);
}

rmrf(out);
fs.mkdirSync(staticDir, { recursive: true });
copyDir(dist, staticDir);

const config = {
  version: 3,
  routes: [
    {
      src: '/sw.js',
      headers: {
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Service-Worker-Allowed': '/',
      },
      continue: true,
    },
    {
      src: '/manifest.webmanifest',
      headers: {
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Content-Type': 'application/manifest+json',
      },
      continue: true,
    },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index.html' },
  ],
};

fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify(config, null, 2));
console.log('Wrote .vercel/output from apps/web/dist');
