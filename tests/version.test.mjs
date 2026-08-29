import { versionSuite } from './kit/versions.mjs';
import { test, eq, ok } from './kit/assert.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export default function () {
    // markup: 'must-match' rather than 'none' — this app has a web (LITE)
    // build too, and a browser has no binary to ask, so index.html carries
    // the version in its footer. That is the copy that rots: a bump that
    // forgets it now fails here instead of shipping a footer that disagrees
    // with the installer.
    versionSuite({ root: ROOT, markup: 'must-match' })(test, eq, ok);
}
