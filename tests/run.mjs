#!/usr/bin/env node
// Dependency-free test runner. `node tests/run.mjs`.

import { createHarness } from './kit/harness.mjs';
import { results, test, eq, ok } from './kit/assert.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// MUST match the <script> order in app/ui/index.html — asserted below.
export const KIT_ORDER = ['boot.js', 'bridge-core.js', 'keys.js', 'history.js',
    'prefs.js', 'modal.js', 'dom.js', 'artstore.js', 'menu.js'];
export const ORDER = ['tier.js', 'palette.js', 'element.js', 'waves.js', 'geometry.js', 'guides.js', 'panels.js', 'marks.js', 'clipart.js', 'keybindings.js', 'artstore.js', 'formats.js', 'pngmeta.js', 'gatefold.js'];

export const harness = createHarness({
    appRoot: join(ROOT, 'app'),
    namespace: 'Gatefold',
    // boot.js and bridge-core.js are load-order concerns, not sandbox
    // concerns: they attach listeners and detect Tauri, neither of which a
    // core suite exercises. The pure kit modules load so core/ can lean on
    // them.
    kitFiles: ['keys.js', 'history.js', 'prefs.js', 'modal.js', 'dom.js', 'artstore.js'],
    coreFiles: ORDER,
});

const M = harness.loadCore();

// Every core module must attach. A file that loads but exports nothing is a
// silent failure the suites below would never reach.
for (const f of ORDER) {
    const mod = f.replace(/\.js$/, '');
    if (!M[mod]) {
        console.error(`core/${f} did not attach to Gatefold.${mod}`);
        process.exit(1);
    }
}

// The load order in the page IS the dependency order. Asserting it here makes
// a reordered <script> list a test failure instead of a runtime crash.
test('index.html loads kit, core and ui in order', () => {
    const srcs = harness.scriptOrder('index.html');
    eq(srcs[0], '../kit/boot.js', 'boot.js loads before anything it might report on');
    const kit = srcs.filter((s) => s.includes('/kit/')).map((s) => s.split('/').pop());
    eq(kit, KIT_ORDER, 'kit scripts in index.html');
    const core = srcs.filter((s) => s.includes('/core/')).map((s) => s.split('/').pop());
    eq(core, ORDER, 'core scripts in index.html');
    /* bridge.js is in <head> with the kit, ahead of core/ — see the comment
       in index.html — so the question is not "is the first ui/ file after the
       last core/ file" but "is the file that wires everything together last".
       main.js is that file, and it runs when every module has attached. */
    const lastCore = srcs.map((s) => s.includes('/core/')).lastIndexOf(true);
    ok(srcs.indexOf('main.js') > lastCore, 'main.js loads after every core/ module');
    eq(srcs[srcs.length - 1], 'main.js', 'main.js is last');
});

/* Source hygiene, carried over from deck-press. A shell round-trip once baked
   a literal backspace (0x08) into a regex where a \b word boundary was meant:
   the pattern then matched nothing, a feature silently stopped working, and no
   test noticed because the byte is invisible in every diff and every editor.
   GATE//FOLD is full of hand-typed SVG path data and unicode glyph escapes,
   where the same thing would hide just as well. */
test('no source file carries a stray control character', () => {
    const files = [];
    for (const dir of ['app/core', 'app/ui', 'tests']) {
        for (const f of readdirSync(join(ROOT, dir))) {
            if (/\.(js|mjs)$/.test(f)) files.push(join(dir, f));
        }
    }
    ok(files.length > 3, 'found the sources to check');
    for (const rel of files) {
        const text = readFileSync(join(ROOT, rel), 'utf8');
        for (let i = 0; i < text.length; i++) {
            const n = text.charCodeAt(i);
            if (n < 32 && n !== 9 && n !== 10 && n !== 13) {
                throw new Error(`${rel} has a 0x${n.toString(16)} at offset ${i}`);
            }
        }
    }
});

const suites = ['./pngmeta.test.mjs', './marks.test.mjs', './tier.test.mjs', './palette.test.mjs', './element.test.mjs',
    './waves.test.mjs', './geometry.test.mjs', './guides.test.mjs', './panels.test.mjs', './clipart.test.mjs',
    './keybindings.test.mjs', './artstore.test.mjs', './formats.test.mjs', './gatefold.test.mjs',
    './session.test.mjs', './project-ui.test.mjs', './icon.test.mjs', './wiring.test.mjs', './platform.test.mjs', './version.test.mjs', './kit-integrity.test.mjs'];
for (const s of suites) {
    await Promise.race([
        (async () => (await import(s)).default(M, harness))(),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${s} did not finish in 30s — a promise never settled`)), 30_000)
                .unref()),
    ]);
}

console.log(`${results.pass} passed, ${results.fail} failed`);
if (results.fail) {
    console.log('\n' + results.fails.map((f) => '  FAIL ' + f).join('\n\n'));
    process.exit(1);
}
