import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const npmCli = process.env.npm_execpath;
const sdkTarballInput = process.env.CORTEX_SDK_TARBALL;
const sdkUiTarballInput = process.env.CORTEX_SDK_UI_TARBALL;
if (!npmCli) throw new Error('npm_execpath is required');
if (!sdkUiTarballInput) throw new Error('CORTEX_SDK_UI_TARBALL must point to a packed sdk-ui artifact');

const sdkUiTarball = await realpath(resolve(sdkUiTarballInput));
const sdkTarball = sdkTarballInput ? await realpath(resolve(sdkTarballInput)) : null;
const qualificationRoot = await mkdtemp(join(tmpdir(), 'cortex-chat-widget-package-'));

function runNpm(args, cwd, capture = false) {
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(' ')} failed with exit code ${result.status}`);
  }
  return result.stdout ?? '';
}

try {
  runNpm(['run', 'build'], process.cwd());
  const packResult = JSON.parse(runNpm([
    'pack',
    '--json',
    '--ignore-scripts',
    '--pack-destination',
    qualificationRoot,
  ], process.cwd(), true));
  const widgetFilename = packResult[0]?.filename;
  if (typeof widgetFilename !== 'string') throw new Error('npm pack did not return a widget filename');
  const widgetTarball = join(qualificationRoot, widgetFilename);
  const consumerRoot = join(qualificationRoot, 'consumer');
  await mkdir(consumerRoot);
  await writeFile(join(consumerRoot, 'package.json'), '{"private":true,"type":"module"}\n', 'utf8');
  await writeFile(join(consumerRoot, 'entry.mjs'), [
    "import { mountCortexChat } from '@cortex-suite/chat-widget';",
    "if (typeof mountCortexChat !== 'function') throw new Error('widget import is incomplete');",
    "console.log('isolated widget import: OK');",
    '',
  ].join('\n'), 'utf8');

  const installInputs = [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ];
  if (sdkTarball) installInputs.push(sdkTarball);
  installInputs.push(sdkUiTarball, widgetTarball);
  runNpm(installInputs, consumerRoot);

  const installedWidget = JSON.parse(await readFile(
    join(consumerRoot, 'node_modules', '@cortex-suite', 'chat-widget', 'package.json'),
    'utf8',
  ));
  if (installedWidget.dependencies?.['@cortex-suite/sdk-ui'] !== '0.1.0') {
    throw new Error('Installed widget does not declare @cortex-suite/sdk-ui@0.1.0');
  }
  if (installedWidget.dependencies?.['@cortex-suite/sdk'] !== '1.1.21') {
    throw new Error('Installed widget does not declare @cortex-suite/sdk@1.1.21');
  }
  const buildInfo = JSON.parse(await readFile(
    join(consumerRoot, 'node_modules', '@cortex-suite', 'chat-widget', 'dist', 'build-info.json'),
    'utf8',
  ));
  if (buildInfo.sdkUi?.source !== 'npm:@cortex-suite/sdk-ui@0.1.0') {
    throw new Error(`Unexpected sdk-ui build source: ${buildInfo.sdkUi?.source}`);
  }
  if (buildInfo.sdk?.source !== 'npm:@cortex-suite/sdk@1.1.21') {
    throw new Error(`Unexpected SDK build source: ${buildInfo.sdk?.source}`);
  }

  const imported = spawnSync(process.execPath, ['entry.mjs'], {
    cwd: consumerRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (imported.status !== 0) throw new Error(`Isolated widget import failed with exit code ${imported.status}`);
  process.stdout.write(imported.stdout);
  console.log('isolated package installation: OK');
} finally {
  await rm(qualificationRoot, { recursive: true, force: true });
}
