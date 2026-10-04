import { createHash } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { assertEqualHashes, assertNoLocalPaths, hashTree } from './dist-integrity.mjs';

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error('npm_execpath is required to run the reproducibility check');
}

function run(args, capture = false) {
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(' ')} failed: ${result.error?.message ?? `exit code ${result.status}`}`);
  }
  return result.stdout ?? '';
}

async function buildSnapshot() {
  run(['run', 'build']);
  await assertNoLocalPaths();
  const dist = await hashTree();
  const packResult = JSON.parse(run(['pack', '--json', '--ignore-scripts'], true));
  const packagePath = packResult[0]?.filename;
  if (typeof packagePath !== 'string') {
    throw new Error('npm pack did not return a package filename');
  }
  const packageBytes = await readFile(packagePath);
  await unlink(packagePath);
  return {
    dist,
    packageHash: createHash('sha256').update(packageBytes).digest('hex'),
  };
}

const first = await buildSnapshot();
const second = await buildSnapshot();
assertEqualHashes(first.dist, second.dist, 'dist');
if (first.packageHash !== second.packageHash) {
  throw new Error('npm package tarball is not reproducible');
}
console.log(`reproducible dist/package: OK (${first.packageHash})`);
