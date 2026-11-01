import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);

export async function sha256File(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function hashArchiveEntry(archivePath, entry) {
  const child = spawn('/usr/bin/unzip', ['-p', archivePath, entry]);
  const completion = new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('close', (code) => resolve({ code }));
  });
  child.stderr.resume();
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of child.stdout) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  const result = await completion;
  if (result.error) throw result.error;
  if (result.code !== 0 || bytes === 0) throw new Error(`Missing or corrupt archived entry: ${entry}`);
  return hash.digest('hex');
}

async function validateMacBundle(packageRoot, version, checkFramework = true) {
  const contents = path.join(packageRoot, 'Cove.app', 'Contents');
  const plist = path.join(contents, 'Info.plist');
  const { stdout: executable } = await execute('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', plist]);
  const { stdout: appVersion } = await execute('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plist]);
  if (executable.trim() !== 'Cove' || appVersion.trim() !== version) throw new Error('App bundle executable or version does not match this release.');
  const required = ['MacOS/Cove'];
  if (checkFramework) required.push('Frameworks/Electron Framework.framework/Versions/A/Electron Framework');
  for (const relative of required) {
    const filename = path.join(contents, relative);
    const metadata = await stat(filename);
    if (!metadata.isFile() || metadata.size === 0) throw new Error(`Missing app runtime: ${relative}`);
    await access(filename, constants.X_OK);
    const { stdout: format } = await execute('/usr/bin/file', ['-b', filename]);
    if (!format.includes('Mach-O') || !/\barm64\b/.test(format)) throw new Error(`App runtime must be Mach-O with arm64 support: ${relative}`);
  }
}

export async function archiveRelease(root, { platform = process.platform, arch = process.arch, run = execute } = {}) {
  if (platform !== 'darwin' || arch !== 'arm64') throw new Error('Release archives are currently verified only for macOS arm64.');
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('Expected a numeric release version.');
  const versionRoot = path.join(root, 'release', manifest.version);
  const packageName = `Cove-${platform}-${arch}`;
  const packageRoot = path.join(versionRoot, packageName);
  const output = path.join(versionRoot, 'downloads');
  try {
    await access(output);
    throw new Error(`Release downloads already exist: ${output}. Preserve them; use a new release version.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const appAsar = path.join(packageRoot, 'Cove.app', 'Contents', 'Resources', 'app.asar');
  await validateMacBundle(packageRoot, manifest.version);
  const runtimePaths = ['Cove.app/Contents/MacOS/Cove', 'Cove.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework'];
  const runtimeHashes = {};
  for (const relative of runtimePaths) runtimeHashes[relative] = await sha256File(path.join(packageRoot, relative));
  const artifactHash = await sha256File(appAsar);
  const verification = await readFile(path.join(versionRoot, 'VERIFICATION.md'), 'utf8');
  if (!verification.includes(`\`${artifactHash}\``)) throw new Error('Packaged app does not match its verification ledger. Verify the app before archiving.');
  for (const filename of ['LICENSE', 'LICENSES.chromium.html', 'version']) await access(path.join(packageRoot, filename));
  await mkdir(versionRoot, { recursive: true });
  const stage = await mkdtemp(path.join(versionRoot, '.downloads-'));
  try {
    const archiveName = `Cove-${manifest.version}-${platform}-${arch}-developer.zip`;
    const archivePath = path.join(stage, archiveName);
    await run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', packageRoot, archivePath]);
    const extracted = path.join(stage, '.verify');
    await execute('/usr/bin/unzip', ['-q', archivePath, `${packageName}/Cove.app/Contents/Info.plist`, `${packageName}/Cove.app/Contents/MacOS/Cove`, '-d', extracted]);
    const archivedPackage = path.join(extracted, packageName);
    await validateMacBundle(archivedPackage, manifest.version, false);
    const archivedHash = await hashArchiveEntry(archivePath, `${packageName}/Cove.app/Contents/Resources/app.asar`);
    if (archivedHash !== artifactHash) throw new Error('Archived app.asar changed during archiving; release was not created.');
    for (const relative of runtimePaths) {
      if (await hashArchiveEntry(archivePath, `${packageName}/${relative}`) !== runtimeHashes[relative]) throw new Error(`App runtime changed during archiving: ${relative}`);
    }
    for (const filename of ['LICENSE', 'LICENSES.chromium.html', 'version']) await hashArchiveEntry(archivePath, `${packageName}/${filename}`);
    await rm(extracted, { recursive: true });
    const archiveHash = await sha256File(archivePath);
    const archive = await stat(archivePath);
    await writeFile(path.join(stage, 'SHA256SUMS'), `${archiveHash}  ${archiveName}\n`);
    await writeFile(path.join(stage, 'RELEASE.json'), `${JSON.stringify({
      name: 'Cove', version: manifest.version, platform, arch,
      channel: 'developer', signed: false, notarized: false, publicReleaseReady: false,
      archive: { filename: archiveName, bytes: archive.size, sha256: archiveHash },
      appAsarSha256: artifactHash,
      runtimeSha256: runtimeHashes,
      limitations: ['Unsigned developer build; no automatic updates.', 'macOS arm64 only; other platforms are not verified.', 'See VERIFICATION.md and FEATURES.md for coverage and outstanding release gates.']
    }, null, 2)}\n`);
    await writeFile(path.join(stage, 'VERIFICATION.md'), verification);
    await rename(stage, output);
    return output;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(`Developer release archive: ${await archiveRelease(fileURLToPath(new URL('../', import.meta.url)))}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
