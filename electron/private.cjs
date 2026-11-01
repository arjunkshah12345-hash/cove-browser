const { spawn: spawnProcess } = require('node:child_process');
const { mkdtemp: makeTempDirectory } = require('node:fs/promises');
const { tmpdir: tempDirectory } = require('node:os');
const path = require('node:path');

function validPath(value) {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes('\0');
}

async function launchPrivate({
  execPath = process.execPath,
  appPath,
  isPackaged = false,
  env = process.env,
  spawn = spawnProcess,
  mkdtemp = makeTempDirectory,
  tmpdir = tempDirectory,
} = {}) {
  if (!validPath(execPath)) throw new TypeError('Invalid private runtime executable path.');
  if (typeof isPackaged !== 'boolean') throw new TypeError('Invalid private runtime packaging flag.');
  if (!isPackaged && !validPath(appPath)) throw new TypeError('Invalid private runtime app path.');
  if (!env || typeof env !== 'object' || Array.isArray(env)) throw new TypeError('Invalid private runtime environment.');
  if ([spawn, mkdtemp, tmpdir].some(dependency => typeof dependency !== 'function')) throw new TypeError('Invalid private runtime dependency.');

  const tempRoot = tmpdir();
  if (!validPath(tempRoot) || !path.isAbsolute(tempRoot)) throw new TypeError('Invalid temporary directory.');
  const userDataPath = await mkdtemp(path.join(tempRoot, 'cove-private-'));
  if (!validPath(userDataPath) || !path.isAbsolute(userDataPath)) throw new TypeError('Invalid private user data directory.');
  const launchEnv = { ...env, COVE_PRIVATE: '1', COVE_USER_DATA: userDataPath };
  delete launchEnv.ELECTRON_RUN_AS_NODE;

  return new Promise((resolve, reject) => {
    const child = spawn(execPath, isPackaged ? [] : [appPath], {
      detached: true,
      stdio: 'ignore',
      env: launchEnv,
    });
    if (!child || typeof child.once !== 'function' || typeof child.unref !== 'function') {
      reject(new TypeError('Invalid private runtime child process.'));
      return;
    }
    child.once('error', reject);
    child.once('spawn', () => {
      try {
        child.unref();
        resolve({ spawned: true, pid: child.pid, userDataPath });
      } catch (error) {
        reject(error);
      }
    });
  });
}

module.exports = { launchPrivate };
