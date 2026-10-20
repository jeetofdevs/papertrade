import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Commit shown in the footer, so you can tell which version is live.
function commit() {
  const fromEnv = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.SOURCE_COMMIT || process.env.GIT_COMMIT;
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    // Some NEAR wallet libraries still reference Node's `global`.
    global: 'globalThis',
    __BUILD_COMMIT__: JSON.stringify(commit()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
  },
});
