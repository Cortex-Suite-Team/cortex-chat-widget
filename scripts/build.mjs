import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

const GITHUB_SOURCE_BASES = [
  {
    localPrefix: '../../cortex-sdk/src/',
    sourceBase: 'https://raw.githubusercontent.com/Cortex-Suite-Team/cortex-sdk/main/js/src/',
  },
  {
    localPrefix: '../../cortex-sdk/browser/',
    sourceBase: 'https://raw.githubusercontent.com/Cortex-Suite-Team/cortex-sdk/main/js/browser/',
  },
  {
    localPrefix: '../../sdk-ui/src/',
    sourceBase: 'https://raw.githubusercontent.com/Cortex-Suite-Team/cortex-sdk-ui/main/src/',
  },
  {
    localPrefix: '../src/',
    sourceBase: 'https://raw.githubusercontent.com/Cortex-Suite-Team/cortex-chat-widget/main/src/',
  },
];

async function rewriteSourceMapSources(mapPath) {
  const raw = await readFile(mapPath, 'utf8');
  const map = JSON.parse(raw);

  if (!Array.isArray(map.sources)) {
    return;
  }

  map.sources = map.sources.map((source) => {
    if (typeof source !== 'string') {
      return source;
    }

    for (const { localPrefix, sourceBase } of GITHUB_SOURCE_BASES) {
      if (source.startsWith(localPrefix)) {
        return `${sourceBase}${source.slice(localPrefix.length)}`;
      }
    }

    return source;
  });

  await writeFile(mapPath, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
}

async function resolveBuildInfo() {
  const sdkBrowserEntry = require.resolve('@cortex-suite/sdk/browser');
  const sdkPackagePath = join(dirname(dirname(dirname(sdkBrowserEntry))), 'package.json');
  const sdkPackage = JSON.parse(await readFile(sdkPackagePath, 'utf8'));

  return {
    builtAt: new Date().toISOString(),
    widgetEntry: 'dist/index.js',
    sdk: {
      name: sdkPackage.name,
      version: sdkPackage.version,
      packageJsonPath: sdkPackagePath,
      browserEntryPath: sdkBrowserEntry,
    },
  };
}

const buildInfo = await resolveBuildInfo();
console.log(`[chat-widget build] ${buildInfo.sdk.name} version: ${buildInfo.sdk.version}`);
console.log(`[chat-widget build] ${buildInfo.sdk.name} browser entry: ${buildInfo.sdk.browserEntryPath}`);

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  sourcemap: true,
  banner: {
    js: `/* cortex-chat-widget build: sdk=${buildInfo.sdk.version} builtAt=${buildInfo.builtAt} */`,
  },
});
await rewriteSourceMapSources('dist/index.js.map');
await writeFile('dist/build-info.json', `${JSON.stringify(buildInfo, null, 2)}\n`, 'utf8');

await build({
  entryPoints: ['src/loader.ts'],
  outfile: 'dist/loader.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  sourcemap: true,
  banner: {
    js: `/* cortex-chat-widget loader build: sdk=${buildInfo.sdk.version} builtAt=${buildInfo.builtAt} */`,
  },
});
await rewriteSourceMapSources('dist/loader.js.map');
