import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import electronPath from 'electron';

const server = createServer((request, response) => {
  response.setHeader('content-type', 'text/html');
  response.end(`<title>${request.url}</title><h1>Resource fixture</h1>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const userData = await mkdtemp(path.join(tmpdir(), 'cove-resources-'));
const env = { ...process.env, COVE_USER_DATA: userData, COVE_DEV_URL: '', COVE_RESOURCE_ORIGIN: `http://127.0.0.1:${server.address().port}` };
delete env.ELECTRON_RUN_AS_NODE;
try {
  for (const phase of ['exercise', 'restart']) {
    await new Promise((resolve, reject) => {
      const child = spawn(electronPath, ['scripts/native-resources.cjs'], { env: { ...env, COVE_RESOURCE_PHASE: phase }, stdio: 'inherit' });
      const timer = setTimeout(() => { child.kill(); reject(new Error(`Resource smoke ${phase} timed out.`)); }, 60000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Resource smoke ${phase} exited ${code}.`)); });
    });
  }
} finally { await new Promise(resolve => server.close(resolve)); }
