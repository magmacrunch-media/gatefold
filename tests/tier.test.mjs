import { test, eq, ok } from './kit/assert.mjs';

/* The LITE/FULL split is a product decision, so the thing worth asserting is
   the decision, not the mechanism: that LITE is a strict subset, that the
   table lists exceptions rather than members, and above all that nothing the
   web tool can already do has quietly become desktop-only. */

export default function (M) {
    const T = M.tier;

    const lite = T.create(false);
    const full = T.create(true);

    test('the tier is decided by whether there is a filesystem behind it', () => {
        eq(full.name, 'full', 'a backed build is FULL');
        eq(lite.name, 'lite', 'an unbacked build is LITE');
        ok(full.isFull && !full.isLite, 'full is not also lite');
        ok(lite.isLite && !lite.isFull, 'lite is not also full');
    });

    test('FULL has everything LITE has', () => {
        for (const cap of Object.keys(T.CAPABILITIES)) {
            ok(!lite.has(cap) || full.has(cap), `full has ${cap} if lite does`);
        }
    });

    test('the table lists exceptions, so an unlisted capability is in both', () => {
        ok(lite.has('shapes'), 'LITE draws shapes');
        ok(lite.has('clipart'), 'LITE has the clip art');
        ok(lite.has('undo'), 'LITE has undo');
        ok(lite.has('export'), 'LITE exports a PNG');
        ok(lite.has('reference'), 'LITE has the reference eyedropper');
        ok(lite.has('import'), 'LITE imports images');
    });

    /* THE RULE, ASSERTED. Everything the tool live on magmacrunch.com can do
       today stays in LITE. A capability may only be desktop-only when it is
       new work needing a filesystem or a window — never by taking something
       away from the web build to make the desktop one look better. If this
       list has to shrink, that is a product decision someone must make on
       purpose, and this is where they will be made to make it. */
    test('LITE never regresses from what is live today', () => {
        const LIVE_TODAY = ['shapes', 'waves', 'clipart', 'text', 'import',
            'reference', 'undo', 'export', 'rotate', 'zorder', 'canvasSize'];
        for (const cap of LIVE_TODAY) {
            ok(lite.has(cap), `LITE keeps ${cap}`);
        }
    });

    test('the desktop-only capabilities are the ones that need a desktop', () => {
        eq(Object.keys(T.CAPABILITIES).sort(),
            ['layers', 'menubar', 'projects', 'sizes'],
            'exactly four, and each needs a filesystem or a window');
        for (const cap of Object.keys(T.CAPABILITIES)) {
            ok(!lite.has(cap), `LITE does not have ${cap}`);
            ok(full.has(cap), `FULL has ${cap}`);
        }
    });
}
