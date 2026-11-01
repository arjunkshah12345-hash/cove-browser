import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, copyFile, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { archiveRelease, sha256File } from '../scripts/archive-release.mjs';

const execute = promisify(execFile);

async function fixture(context) {
  const root = await mkdtemp(path.join(tmpdir(), 'cove-release-test-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const versionRoot = path.join(root, 'release', '0.6.0');
  const packageRoot = path.join(versionRoot, 'Cove-darwin-arm64');
  const resources = path.join(packageRoot, 'Cove.app', 'Contents', 'Resources');
  await mkdir(resources, { recursive: true });
  const contents = path.dirname(resources);
  await writeFile(path.join(contents, 'Info.plist'), '<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Cove</string><key>CFBundleShortVersionString</key><string>0.6.0</string></dict></plist>');
  for (const relative of ['MacOS/Cove', 'Frameworks/Electron Framework.framework/Versions/A/Electron Framework']) {
    const filename = path.join(contents, relative);
    await mkdir(path.dirname(filename), { recursive: true });
    if (process.platform === 'darwin') await copyFile('/usr/bin/true', filename);
    else await writeFile(filename, 'non-macOS fixture, native checks skipped');
    await chmod(filename, 0o755);
  }
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '0.6.0' }));
  const asar = path.join(resources, 'app.asar');
  await writeFile(asar, 'release fixture, not a browser profile');
  const hash = await sha256File(asar);
  await writeFile(path.join(versionRoot, 'VERIFICATION.md'), `Fixture artifact: \`${hash}\`.`);
  for (const filename of ['LICENSE', 'LICENSES.chromium.html', 'version']) await writeFile(path.join(packageRoot, filename), filename);
  return { root, versionRoot, packageRoot, asar, hash };
}

const target = { platform: 'darwin', arch: 'arm64' };

test('archive rejects unsupported platforms before accessing an artifact', async () => {
  await assert.rejects(archiveRelease('/not-used', { platform: 'win32', arch: 'x64' }), /only for macOS arm64/);
});

test('archive rejects path-like release versions', async (context) => {
  const { root } = await fixture(context);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '../elsewhere' }));
  await assert.rejects(archiveRelease(root, target), /numeric release version/);
});

test('archive refuses an app changed since verification', { skip: process.platform !== 'darwin' }, async (context) => {
  const { root, asar } = await fixture(context);
  await writeFile(asar, 'changed artifact');
  await assert.rejects(archiveRelease(root, target), /does not match/);
});

test('archive rejects incomplete bundles', { skip: process.platform !== 'darwin' }, async (context) => {
  const { root, packageRoot } = await fixture(context);
  await rm(path.join(packageRoot, 'Cove.app', 'Contents', 'MacOS', 'Cove'));
  await assert.rejects(archiveRelease(root, target), /ENOENT/);
});

test('archive rejects a mismatched bundle version', { skip: process.platform !== 'darwin' }, async (context) => {
  const { root, packageRoot } = await fixture(context);
  const plist = path.join(packageRoot, 'Cove.app', 'Contents', 'Info.plist');
  await writeFile(plist, (await readFile(plist, 'utf8')).replace('0.6.0', '0.5.0'));
  await assert.rejects(archiveRelease(root, target), /does not match this release/);
});

test('archive rejects changed archived bytes and cleans staging', { skip: process.platform !== 'darwin' }, async (context) => {
  const { root, versionRoot, asar } = await fixture(context);
  const run = async (command, args) => {
    await writeFile(asar, 'changed between preflight and archive');
    return execute(command, args);
  };
  await assert.rejects(archiveRelease(root, { ...target, run }), /changed during archiving/);
  assert.deepEqual((await readdir(versionRoot)).sort(), ['Cove-darwin-arm64', 'VERIFICATION.md']);
});

test('archive rejects a non-Mach-O runtime', { skip: process.platform !== 'darwin' }, async (context) => {
  const { root, packageRoot } = await fixture(context);
  await writeFile(path.join(packageRoot, 'Cove.app/Contents/MacOS/Cove'), 'not an executable');
  await assert.rejects(archiveRelease(root, target), /Mach-O/);
});

test('archive rejects runtime mutation during archiving', { skip: process.platform !== 'darwin' }, async (context) => {
  const { root, versionRoot, packageRoot } = await fixture(context);
  const run = async (command, args) => {
    await writeFile(path.join(packageRoot, 'Cove.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework'), 'corrupted runtime');
    return execute(command, args);
  };
  await assert.rejects(archiveRelease(root, { ...target, run }), /runtime changed during archiving/);
  assert.deepEqual((await readdir(versionRoot)).sort(), ['Cove-darwin-arm64', 'VERIFICATION.md']);
});

test('archive preserves existing downloads instead of replacing them', async (context) => {
  const { root, versionRoot } = await fixture(context);
  await mkdir(path.join(versionRoot, 'downloads'));
  const sentinel = path.join(versionRoot, 'downloads', 'keep.txt');
  await writeFile(sentinel, 'preserved');
  await assert.rejects(archiveRelease(root, target), /already exist/);
  assert.equal(await readFile(sentinel, 'utf8'), 'preserved');
});

test('macOS archive includes checksums, exact identity, licenses and honest release status', { skip: process.platform !== 'darwin' }, async (context) => {
  const { root, hash } = await fixture(context);
  const output = await archiveRelease(root, target);
  const release = JSON.parse(await readFile(path.join(output, 'RELEASE.json'), 'utf8'));
  assert.equal(release.appAsarSha256, hash);
  assert.equal(release.publicReleaseReady, false);
  assert.equal(release.signed, false);
  assert.equal(release.notarized, false);
  assert.equal(release.channel, 'developer');
  const { stdout: entries } = await execute('/usr/bin/unzip', ['-Z1', path.join(output, release.archive.filename)]);
  for (const entry of ['Cove-darwin-arm64/Cove.app/Contents/Resources/app.asar', 'Cove-darwin-arm64/LICENSE', 'Cove-darwin-arm64/LICENSES.chromium.html']) assert.ok(entries.split('\n').includes(entry));
  const archiveHash = await sha256File(path.join(output, release.archive.filename));
  assert.equal(release.archive.sha256, archiveHash);
  assert.equal(await readFile(path.join(output, 'SHA256SUMS'), 'utf8'), `${archiveHash}  ${release.archive.filename}\n`);
  await assert.rejects(archiveRelease(root, target), /already exist/);
});
