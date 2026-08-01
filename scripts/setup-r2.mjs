/**
 * One-shot: tạo R2 bucket + public URL hint, in biến Railway cần set.
 * Yêu cầu: `npx wrangler login` và đã Enable R2 trên Dashboard.
 *
 * Usage: node scripts/setup-r2.mjs
 */
import { execSync } from 'node:child_process';

const ACCOUNT_ID = '90a3d2f1727763edc0cd6dd55badf3f6';
const BUCKET = process.env.R2_BUCKET?.trim() || 'langdaihoc-media';

function wrangler(args) {
  return execSync(`npx --yes wrangler ${args}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

console.log(`Account: ${ACCOUNT_ID}`);
console.log(`Bucket:  ${BUCKET}`);

try {
  console.log(wrangler(`r2 bucket create ${BUCKET}`));
} catch (e) {
  const msg = String(e.stderr || e.message || e);
  if (/already exists|10004|409/i.test(msg)) {
    console.log(`Bucket "${BUCKET}" đã tồn tại — tiếp tục.`);
  } else if (/10042|enable R2/i.test(msg)) {
    console.error(`
R2 chưa bật. Mở:
https://dash.cloudflare.com/${ACCOUNT_ID}/r2/overview
→ Enable / Purchase R2 (free tier), rồi chạy lại script.
`);
    process.exit(1);
  } else {
    console.error(msg);
    process.exit(1);
  }
}

console.log(`
Tiếp theo (Dashboard — không tạo được S3 key qua OAuth wrangler):

1. https://dash.cloudflare.com/${ACCOUNT_ID}/r2/${BUCKET}
2. Settings → Public access → Allow Access → copy URL dạng https://pub-xxxxx.r2.dev
3. R2 Overview → Manage R2 API Tokens → Create Account API token
   - Permission: Object Read & Write
   - Scope: bucket ${BUCKET}
4. Copy Access Key ID + Secret Access Key

Rồi set Railway:

  railway variables --set "R2_ACCOUNT_ID=${ACCOUNT_ID}"
  railway variables --set "R2_BUCKET=${BUCKET}"
  railway variables --set "R2_PUBLIC_BASE_URL=https://pub-xxxxx.r2.dev"
  railway variables --set "R2_ACCESS_KEY_ID=..."
  railway variables --set "R2_SECRET_ACCESS_KEY=..."

Hoặc dán 5 giá trị vào chat để agent set giúp.
`);
