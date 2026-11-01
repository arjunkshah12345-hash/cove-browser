import { packager } from '@electron/packager';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const electron = JSON.parse(await readFile(path.join(root, 'node_modules/electron/package.json'), 'utf8'));
const stage = await mkdtemp(path.join(tmpdir(), 'cove-package-'));
try {
  await cp(path.join(root, 'dist'), path.join(stage, 'dist'), { recursive: true });
  await cp(path.join(root, 'electron'), path.join(stage, 'electron'), { recursive: true });
  await cp(path.join(root, 'docs'), path.join(stage, 'docs'), { recursive: true });
  for (const filename of ['LICENSE', 'SECURITY.md', 'README.md', 'CHANGELOG.md', 'FEATURES.md', 'CONTRIBUTING.md']) await cp(path.join(root, filename), path.join(stage, filename));
  const licenses = path.join(stage, 'third-party-licenses');
  await mkdir(licenses);
  for (const [name, relative] of Object.entries({
    'dm-sans-OFL.txt': '@fontsource-variable/dm-sans/LICENSE',
    'instrument-serif-OFL.txt': '@fontsource/instrument-serif/LICENSE',
    'lucide-LICENSE.txt': 'lucide-react/LICENSE',
    'react-LICENSE.txt': 'react/LICENSE',
    'react-dom-LICENSE.txt': 'react-dom/LICENSE'
  })) await cp(path.join(root, 'node_modules', relative), path.join(licenses, name));
  await writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: manifest.name, productName: 'Cove', version: manifest.version, description: manifest.description, license: manifest.license, main: manifest.main }));
  const outputs = await packager({ dir: stage, name: 'Cove', appBundleId: 'org.covebrowser.desktop', appVersion: manifest.version, electronVersion: electron.version, platform: process.platform, arch: process.arch, out: path.join(root, 'release', manifest.version), asar: true, overwrite: true, prune: false });
  for (const output of outputs) console.log(`Packaged Cove: ${output}`);
  console.log('Unsigned developer build. Not notarized or configured for automatic updates.');
} finally {
  await rm(stage, { recursive: true, force: true });
}
