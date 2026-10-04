import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const LOCAL_PATH_PATTERNS = [
  /(?:^|["'\s(=])[A-Za-z]:[\\/]/,
  /file:\/\/\/(?:[A-Za-z]:\/|Users\/|home\/|tmp\/)/i,
  /(?:^|["'\s])\/(?:Users|home|tmp)\//,
];

async function listFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, path));
    } else if (entry.isFile()) {
      files.push({ path, name: relative(root, path).replaceAll('\\', '/') });
    }
  }
  return files.sort((left, right) => left.name.localeCompare(right.name));
}

export async function assertNoLocalPaths(root = 'dist') {
  const leaks = [];
  for (const file of await listFiles(root)) {
    const contents = await readFile(file.path, 'utf8');
    if (LOCAL_PATH_PATTERNS.some((pattern) => pattern.test(contents))) {
      leaks.push(file.name);
    }
  }
  if (leaks.length > 0) {
    throw new Error(`Published dist contains local filesystem paths: ${leaks.join(', ')}`);
  }
}

export async function hashTree(root = 'dist') {
  const hashes = new Map();
  for (const file of await listFiles(root)) {
    const contents = await readFile(file.path);
    hashes.set(file.name, createHash('sha256').update(contents).digest('hex'));
  }
  return hashes;
}

export function assertEqualHashes(first, second, label) {
  const names = new Set([...first.keys(), ...second.keys()]);
  const changed = [...names].filter((name) => first.get(name) !== second.get(name));
  if (changed.length > 0) {
    throw new Error(`${label} is not reproducible: ${changed.join(', ')}`);
  }
}
