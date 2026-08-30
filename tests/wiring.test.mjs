import { test, eq, ok } from './kit/assert.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UI = join(ROOT, 'app', 'ui');

const html = readFileSync(join(UI, 'index.html'), 'utf8');
const sources = readdirSync(UI)
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(UI, f), 'utf8'))
    .join('\n');

/* A control that exists in the markup but is bound by nothing is the quietest
   bug this app can have: it is drawn, it is enabled, it looks exactly like the
   working ones, and it does nothing at all. Nothing at runtime complains —
   there is no error to log, because the missing thing is a call that was never
   made.

   That is not hypothetical. The port shipped with `modalFontSelectDropdown`
   in the markup and no RetroDropdown.setup() for it, so the font picker in the
   ADD TEXT dialog never opened and the font could not be chosen. Everything
   about it looked right.

   These are static checks over the markup and the ui/ sources rather than
   behavioural ones. They cannot prove a handler does the right thing — that is
   what the rest of the suite is for — only that SOMETHING claims each control,
   which is the failure that hides. */

export default function () {
    test('every dropdown in the markup is wired to RetroDropdown.setup', () => {
        const ids = [...html.matchAll(/class="custom-dropdown"\s+id="([^"]+)"/g)]
            .map((m) => m[1]);
        ok(ids.length >= 3, `found ${ids.length} dropdowns in the markup`);

        for (const id of ids) {
            ok(sources.includes(`RetroDropdown.setup('${id}'`),
                `${id} is set up — without it the list never opens and the`
                + ' choice cannot be made');
        }
    });

    test('every dropdown read with getValue is one that was set up', () => {
        for (const m of sources.matchAll(/RetroDropdown\.getValue\('([^']+)'/g)) {
            ok(sources.includes(`RetroDropdown.setup('${m[1]}'`),
                `${m[1]} is read but never bound — getValue reads the .active`
                + ' class, which only setup() ever moves');
        }
    });

    /* A <button id> in the markup that nothing references is either dead
       markup or a dead control. Both are worth knowing about; the second is
       the one that wastes someone's afternoon. */
    test('every id-carrying button in the markup is referenced by the code', () => {
        const ids = [...html.matchAll(/<button[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
        ok(ids.length > 10, `found ${ids.length} buttons with ids`);

        const orphans = ids.filter((id) => !sources.includes(id));
        eq(orphans, [], 'buttons nothing reaches for');
    });

    test('every input and canvas with an id is referenced by the code', () => {
        const ids = [...html.matchAll(/<(?:input|textarea|canvas)[^>]*\sid="([^"]+)"/g)]
            .map((m) => m[1]);
        const orphans = ids.filter((id) => !sources.includes(id));
        eq(orphans, [], 'form controls nothing reaches for');
    });

    /* The other direction: code reaching for an id the markup does not have.
       getElementById returns null and the guard swallows it, so the feature is
       simply absent rather than broken. */
    test('every id the code asks for exists in the markup', () => {
        const asked = new Set(
            [...sources.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1])
        );
        // Ids the code creates or receives at runtime rather than finding.
        const RUNTIME = new Set([]);
        const missing = [...asked].filter(
            (id) => !RUNTIME.has(id) && !html.includes(`id="${id}"`)
        );
        eq(missing, [], 'ids the code looks for that the markup does not define');
    });
}
