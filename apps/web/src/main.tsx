import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { registerServiceWorker } from './lib/pwa';
import './index.css';

/** Vercel luôn gắn lại *.vercel.app mỗi lần deploy — chuyển về domain chính. */
const host = window.location.hostname;
if (host.endsWith('.vercel.app')) {
  const dest = `https://langdaihoc.xyz${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(dest);
} else {
  registerServiceWorker();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
