#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, lstatSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const PACKAGE = '@cortex-suite/sdk';
const SDK_PATH = join(process.cwd(), 'node_modules', '@cortex-suite', 'sdk');

function getLatestVersion() {
  const result = execSync(`npm view ${PACKAGE}@latest version --json`, { encoding: 'utf8' });
  return JSON.parse(result.trim());
}

async function getInstalledVersion() {
  const pkgPath = join(SDK_PATH, 'package.json');
  if (!existsSync(pkgPath)) return null;
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  return pkg.version;
}

async function main() {
  const latest = getLatestVersion();

  // Remove junction/symlink if present — it cannot be updated in-place
  if (existsSync(SDK_PATH)) {
    const stat = lstatSync(SDK_PATH);
    if (stat.isSymbolicLink()) {
      console.log(`Detected junction/symlink at node_modules/@cortex-suite/sdk — removing...`);
      rmSync(SDK_PATH, { recursive: true, force: true });
      console.log(`Junction removed.`);
    }
  }

  const installed = await getInstalledVersion();

  console.log(`@cortex-suite/sdk latest: ${latest}`);
  console.log(`installed: ${installed ?? 'none'}`);

  if (installed === latest) {
    console.log(`status: up to date`);
    return;
  }

  const from = installed ?? 'none';
  execSync(`npm install ${PACKAGE}@latest --save`, { stdio: 'inherit' });

  const verified = await getInstalledVersion();
  if (verified !== latest) {
    throw new Error(`Verification failed: expected ${latest}, got ${verified}`);
  }

  console.log(`updated ${PACKAGE} from ${from} to ${verified}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
