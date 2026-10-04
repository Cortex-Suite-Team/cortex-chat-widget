import { assertNoLocalPaths } from './dist-integrity.mjs';

await assertNoLocalPaths();
console.log('dist local-path check: OK');
