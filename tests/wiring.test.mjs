import { test, eq, ok } from './kit/assert.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UI = join(ROOT, 'app', 'ui');

const html = readFileSync(join(UI, 'index.html'), 'utf8');
const css = readFileSync(join(UI, 'style.css'), 'utf8');
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

export default function (M) {
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

    /* ── the macOS text bug ──
       body { user-select: none } is what a canvas app wants, and Chromium
       exempts the inner editor of a form control from it. WEBKIT DOES NOT, so
       on macOS that one rule reached into every input and textarea and made
       them uneditable — the ADD TEXT dialog took no keystrokes at all, which
       presented as text vanishing when placed.

       The pair is what matters, so both halves are asserted. Windows never
       showed a symptom, which is exactly why a silent regression here would
       ship: every test on this machine would stay green. */
    test('form controls are exempt from the body user-select rule', () => {
        ok(/body\s*\{[^}]*user-select:\s*none/.test(css),
            'body still suppresses selection — that is deliberate for a canvas app');

        const carve = css.match(/(input|textarea)[^{]*\{[^}]*user-select:\s*text[^}]*\}/);
        ok(carve, 'inputs and textareas are exempted, or macOS cannot type into them');
        ok(/-webkit-user-select:\s*text/.test(carve[0]),
            'the -webkit- prefix is present — it is the one WebKit actually reads');
    });

    test('the exemption names both kinds of text entry the markup uses', () => {
        const found = css.match(/[^}]*user-select:\s*text[^}]*\}/);
        ok(found, 'there is an exemption rule at all — see the test above');
        const carve = found[0];
        ok(/<input[^>]*type="text"/.test(html), 'there are text inputs to protect');
        ok(/<textarea/.test(html), 'and a textarea — the ADD TEXT box');
        ok(/input/.test(carve), 'the exemption names input');
        ok(/textarea/.test(carve), 'the exemption names textarea');
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
    /* The panel is read BOTH ways: syncFrom() writes the selected
       element into the controls, and currentStyle() reads the same
       controls to decide what the next element is born with. An image
       carries fill: 'none', stroke: 'none' as placeholders, so syncing
       one into the panel used to latch NO-FILL and NO-STROKE on and
       leave every element created afterwards invisible. Static, like
       everything else here — it cannot prove the guard is in the right
       place, only that dropping it does not pass silently. */
    test('the property panel does not sync a styleless type into itself', () => {
        const props = readFileSync(join(UI, 'props.js'), 'utf8');
        ok(props.includes('App.element.stylable('),
            'ui/props.js consults element.stylable — without it an image import'
            + ' leaves the NO-FILL and NO-STROKE toggles stuck on and every later'
            + ' element is created invisible');
    });

    /* The REFERENCE card names chords, and a card that names one the app
       does not answer to is worse than no card. It used to be a string in
       ui/help-ui.js, free to drift from core/keybindings.js with nothing to
       notice; now it is markup, and this is what holds the two together.

       Chords are one <kbd> each rather than one per key, which is also what
       lets ui/platform.js rewrite Ctrl+Shift+S as a single Mac glyph run. */
    test('every chord the reference card names is a real binding', () => {
        const chords = [...html.matchAll(/<kbd>(Ctrl\+[^<]+)<\/kbd>/g)].map((m) => m[1]);
        ok(chords.length > 5, `found ${chords.length} chords on the card`);

        const bound = new Set(M.keybindings.BINDINGS
            .filter((b) => b.ctrl)
            .map((b) => `Ctrl+${b.shift ? 'Shift+' : ''}${b.key.toUpperCase()}`));

        for (const c of chords) {
            ok(bound.has(c),
                `${c} is on the reference card and in core/keybindings.js`
                + ` — bound: ${[...bound].sort().join(', ')}`);
        }
    });

    /* Lucide is ISC and every typeface is OFL. Both licences require the
       attribution to travel with what they cover, and for someone holding
       the installed app rather than the repo, the credits dialog IS where it
       travels to. */
    test('the credits name the licences that have to travel', () => {
        const dlg = html.slice(html.indexOf('id="creditsModal"'));
        const body = dlg.slice(0, dlg.indexOf('</dialog>'));
        for (const [what, pattern] of [
            ['the clip art source', /Lucide/],
            ['its licence', /ISC/],
            ['the font licence', /SIL Open Font License/],
            ['the app licence', /PolyForm/],
        ]) {
            ok(pattern.test(body), `the credits name ${what}`);
        }
    });

    /* The version has ONE home, the footer, and AGENTS.md counts the places
       it lives. The credits read it back out of the DOM rather than being a
       sixth copy to forget. */
    test('the credits dialog has no version of its own', () => {
        const dlg = html.slice(html.indexOf('id="creditsModal"'));
        const lede = dlg.slice(dlg.indexOf('credits-lede'), dlg.indexOf('</p>'));
        ok(/creditsVersion/.test(lede), 'there is a slot for it');
        /* The lede only. The body further down cites PolyForm 1.0.0 and the SIL
           Open Font License 1.1, which are licence versions and have every
           business being written out. */
        ok(!/v?[0-9]+[.][0-9]+[.][0-9]+/.test(lede),
            'and no literal app version beside the name — the footer is the one'
            + ' copy, and AGENTS.md counts them');
    });

    /* The four squares used to be four <div>s here AND a SQUARE_SIZES constant
       in core/: two lists that could disagree, and adding a fifth size meant
       remembering both. core/formats.js is the one list now, and this is what
       stops an option being typed back into the markup. */
    test('the size picker is generated from the registry, not typed into the markup', () => {
        const block = html.slice(html.indexOf('id="canvasSizeDropdown"'));
        const list = block.slice(block.indexOf('<div class="dropdown-options"'));
        const body = list.slice(0, list.indexOf('</div>') + 6);
        ok(!/data-value=/.test(body),
            'no hand-typed options — ui/sizes.js writes them from core/formats.js');
        ok(sources.includes("RetroDropdown.setup('canvasSizeDropdown'"),
            'and the picker is still bound, wherever that call now lives');
    });

    /* The overlay has no control to proxy, so unlike every other View item it
       cannot fall back to data-toggles for its check mark. */
    test('the print-guides View item is dispatched and reports its own state', () => {
        ok(/data-action="view:print-guides"/.test(html), 'the item exists');
        ok(!/data-action="view:print-guides"[^>]*data-toggles/.test(html),
            'and names no control, because there is none');
        const menu = readFileSync(join(UI, 'menu.js'), 'utf8');
        ok(menu.includes("'view:print-guides'"), 'the actions map dispatches it');
        ok(/case 'view:print-guides'/.test(menu), 'and stateOf answers for it');
    });

}
