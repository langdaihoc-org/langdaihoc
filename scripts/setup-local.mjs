#!/usr/bin/env node
/**
 * One-shot local setup: Supabase → env → migrate → seed
 * Usage: pnpm setup:local
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function run(cmd, args = [], opts = {}) {
  console.log(`\n▶ ${cmd} ${args.join(' ')}`.trim());
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: opts.cwd ?? root,
    shell: process.platform === 'win32',
    env: { ...process.env, ...opts.env },
  });
  if (result.status !== 0) {
    console.error(`\n✗ Failed: ${cmd} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

function ensureEnvFile(target, example) {
  if (existsSync(target)) return;
  if (!existsSync(example)) {
    console.warn(`⚠ Missing ${example} — skip copying env`);
    return;
  }
  copyFileSync(example, target);
  console.log(`✓ Created ${target} from example`);
}

function tryInjectSupabaseKeys() {
  const apiEnvPath = join(root, 'apps/api/.env');
  if (!existsSync(apiEnvPath)) return;

  const status = spawnSync('supabase', ['status', '-o', 'env'], {
    cwd: root,
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
  if (status.status !== 0 || !status.stdout) {
    console.log('ℹ Could not read supabase status — fill SUPABASE_* keys in apps/api/.env manually');
    return;
  }

  const keys = {};
  for (const line of status.stdout.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (!m) continue;
    keys[m[1]] = m[2].replace(/^"|"$/g, '');
  }

  let content = readFileSync(apiEnvPath, 'utf8');
  const map = {
    SUPABASE_URL: keys.API_URL ?? keys.SUPABASE_URL,
    SUPABASE_ANON_KEY: keys.ANON_KEY ?? keys.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: keys.SERVICE_ROLE_KEY ?? keys.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: keys.DB_URL ?? keys.DATABASE_URL,
  };

  for (const [key, val] of Object.entries(map)) {
    if (!val) continue;
    if (content.includes(`${key}=`)) {
      content = content.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${val}`);
    } else {
      content += `\n${key}=${val}`;
    }
  }
  writeFileSync(apiEnvPath, content);
  console.log('✓ Injected Supabase keys into apps/api/.env');
}

console.log('🚀 langdaihoc — setup local\n');

run('pnpm', ['install']);

console.log('\n📦 Starting Supabase (Docker required)...');
run('pnpm', ['supabase:start']);

ensureEnvFile(join(root, 'apps/api/.env'), join(root, 'apps/api/.env.example'));
ensureEnvFile(join(root, 'apps/web/.env'), join(root, 'apps/web/.env.example'));
tryInjectSupabaseKeys();

run('pnpm', ['db:migrate']);

const apiEnv = join(root, 'apps/api/.env');
if (existsSync(apiEnv)) {
  const envContent = readFileSync(apiEnv, 'utf8');
  const env = {};
  for (const line of envContent.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  run('pnpm', ['db:seed'], { env });
} else {
  run('pnpm', ['db:seed']);
}

console.log('\n✅ Setup complete!');
console.log('   pnpm dev');
console.log('   Web: http://localhost:5173');
console.log('   API: http://localhost:3001/api/health');
console.log('   Tài khoản local: xem output của pnpm db:seed');
