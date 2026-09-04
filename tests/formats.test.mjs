import { test, eq, ok } from './kit/assert.mjs';

/* Millimetre panel lengths are sixteenths of an inch scaled by 25.4 and do
   not land on exact binary fractions, so the source numbers are compared to
   a tolerance. The METRICS numbers are compared exactly on purpose — at
   300dpi they are whole or half pixels, and a change to the rounding rule
   should be loud. */
const NEAR = 1e-9;
function near(a, b, msg) {
    ok(Math.abs(a - b) < NEAR, `${msg} — expected ${b}, got ${a}`);
}

export default function (M) {
    const F = M.formats;
    const G = M.gatefold;

    /* ── the registry ── */

    test('every entry has the five fields, and the ids are unique', () => {
        const seen = new Set();
        for (const f of F.FORMATS) {
            ok(typeof f.id === 'string' && f.id, `id on ${JSON.stringify(f.label)}`);
            ok(typeof f.group === 'string' && f.group, `group on ${f.id}`);
            ok(typeof f.label === 'string' && f.label, `label on ${f.id}`);
            ok(f.tier === 'lite' || f.tier === 'full', `tier on ${f.id}`);
            ok(typeof f.size === 'function', `size() is a function on ${f.id}`);
            ok(!seen.has(f.id), `${f.id} appears once`);
            seen.add(f.id);
        }
        ok(F.FORMATS.length >= 10, 'four squares and six J-cards at least');
    });

    /* The document takes ownership of what it is handed and mutates it — a
       shared literal would make two J-card documents the same object, and
       resizing one would silently resize the other. */
    test('size() hands back a fresh object every time', () => {
        const a = F.sizeOf('jcard-jp0');
        const b = F.sizeOf('jcard-jp0');
        ok(a !== b, 'not the same object');
        ok(a.panels !== b.panels, 'nor the same panel array');
        a.trim.w = 1;
        a.panels[0].len = 1;
        eq(F.sizeOf('jcard-jp0').trim.w, 101.6, 'mutating one leaves the next intact');
        near(F.sizeOf('jcard-jp0').panels[0].len, 65.0875, 'panels too');
    });

    test('an unknown id is null rather than a half-built size', () => {
        eq(F.byId('nope'), null, 'byId');
        eq(F.sizeOf('nope'), null, 'sizeOf');
    });

    /* ── the cassette numbers, against the sources ── */

    test('JP0 is the standard J-card to the published dimensions', () => {
        const s = F.sizeOf('jcard-jp0');
        eq(s.unit, 'mm', 'a print size');
        eq(s.panelAxis, 'y', 'panels stack, so the front reads right-way-up');
        eq(s.dpi, 300, 'at print resolution');
        near(s.trim.w, 101.6, 'the card is 4 in wide');
        near(s.bleed, 3.175, 'an eighth of an inch of bleed');
        near(s.safe, 3.175, 'and the same safe margin');
        eq(s.panels.map((p) => p.name), ['FRONT', 'SPINE', 'BACK'], 'three panels, in order');
        near(s.panels[0].len, 65.0875, 'front is 2 9/16 in');
        near(s.panels[1].len, 12.7, 'spine is 1/2 in');
        near(s.panels[2].len, 26.9875, 'back flap is 1 1/16 in');
        near(s.trim.h, 104.775, 'and the strip is exactly the three of them');
    });

    /* Six near-identical strips differing only in a 1/16 in step is six
       chances to mistype one, which is why they are generated. This is the
       assertion that says so. */
    test('JP1..JP5 are generated, each flap a sixteenth narrower than the last', () => {
        eq(F.jcardPanels(3).length, 6, 'JP3 is the J-card plus three');
        eq(F.jcardPanels(5).length, 8, 'JP5 is eight panels, which Wikipedia gives as the most');
        for (const extra of [0, 1, 2, 3, 4, 5]) {
            const s = F.sizeOf('jcard-jp' + extra);
            eq(s.panels.length, 3 + extra, `JP${extra} panel count`);
            /* THE CHAIN STARTS AT THE FRONT. Flap 1 is a sixteenth under
               the FRONT panel — 2 1/2 in — and not under the BACK flap, which
               is how reading Wikipedia's "the one before" wrong once made
               every additional panel about an inch. */
            if (extra >= 1) {
                near(s.panels[0].len - s.panels[3].len, 1.5875,
                    `JP${extra} flap 1 is a sixteenth under the front`);
            }
            for (let i = 4; i < s.panels.length; i++) {
                near(s.panels[i - 1].len - s.panels[i].len, 1.5875,
                    `JP${extra} flap ${i - 2} is 1/16 in narrower than the one before it`);
            }
            const sum = s.panels.reduce((t, p) => t + p.len, 0);
            near(s.trim.h, sum, `JP${extra} strip length is the sum of its panels`);
        }
    });

    /* THE TABLE, CHECKED AGAINST CARDS SOMEBODY PRINTS. The flap sizes were
       wrong for as long as they were derived from one sentence and never
       compared with a real template: National Audio Company publish a 4-panel
       J-card at 6.625 in and a 5-panel at 9.0625, which are JP1 and JP2, and
       the old table made them 5.125 and 6.0625. Pinned in INCHES because that
       is the unit every one of these templates is published in — a
       millimetre figure here would be this file checking its own conversion
       rather than its own numbers. */
    test('JP1 and JP2 are the published 4- and 5-panel templates', () => {
        const flat = (n) => F.sizeOf('jcard-jp' + n).trim.h / 25.4;
        near(flat(0), 4.125, 'JP0, the plain card');
        near(flat(1), 6.625, 'JP1 is the published 4-panel');
        near(flat(2), 9.0625, 'JP2 is the published 5-panel');
        near(flat(5), 16, 'and JP5 is exactly 16 in across the eight flaps');

        /* The five additional panels, as duplication.com lists them. */
        const flaps = F.jcardPanels(5).slice(3).map((p) => p.len / 25.4);
        const want = [2.5, 2.4375, 2.375, 2.3125, 2.25];
        for (let i = 0; i < want.length; i++) {
            near(flaps[i], want[i], `flap ${i + 1} is ${want[i]} in`);
        }
    });

    /* ── the tiers ── */

    test('the squares are the four that are live today, and they stay LITE', () => {
        const squares = F.FORMATS.filter((f) => f.group === 'SQUARE');
        eq(squares.map((f) => f.tier), ['lite', 'lite', 'lite', 'lite'],
            'LITE never regresses from what magmacrunch.com already has');
        eq(squares.map((f) => f.label), ['512', '1024', '2048', '4096'], 'and they are the same four');
        for (const px of F.SQUARE_SIZES) {
            eq(JSON.stringify(F.sizeOf('square-' + px)), JSON.stringify(G.squareSize(px)),
                `square-${px} is exactly gatefold.squareSize(${px}) — the two must not drift`);
        }
    });

    test('every cassette format is FULL — genuinely new work, not something taken away', () => {
        for (const f of F.FORMATS.filter((x) => x.group === 'CASSETTE')) {
            eq(f.tier, 'full', f.id);
        }
    });

    /* ── metrics: the px/mm boundary ── */

    /* THE NO-REGRESSION ASSERTION. Every square cover in existence goes
       through metrics() now, and it has to come out the other side as the
       same number it went in as. */
    test('metrics of a pixel square is the identity', () => {
        for (const px of F.SQUARE_SIZES) {
            const m = F.metrics(F.squareSize(px));
            eq(m.unit, 'px', 'still pixels');
            eq(m.dpi, null, 'no dpi is involved');
            eq(m.k, 1, 'and no conversion');
            eq(m.trim.w, px, 'trim w');
            eq(m.trim.h, px, 'trim h');
            eq(m.surface.w, px, 'the surface IS the trim');
            eq(m.surface.h, px, 'on both axes');
            eq(m.bleed, 0, 'no bleed');
            eq(m.origin.x, 0, 'so the origin translate is the identity');
            eq(m.origin.y, 0, 'on both axes');
            eq(m.panelAxis, null, 'and there are no panels');
            eq(m.panels.length, 0, 'none at all');
        }
    });

    test('metrics of JP0 lands on the print pixels, and pins the rounding rule', () => {
        const m = F.metrics(F.sizeOf('jcard-jp0'));
        eq(m.unit, 'mm', 'a print document');
        eq(m.dpi, 300, 'at 300dpi');
        eq(m.trim.w, 1200, '4 in at 300dpi');
        eq(m.trim.h, 1237.5, 'and the strip, unrounded');
        eq(m.bleed, 37.5, 'an eighth of an inch');
        eq(m.origin.x, 37.5, 'the trim starts one bleed in');
        eq(m.origin.y, 37.5, 'on both axes');
        /* The surface is the ONLY thing rounded: canvas.width takes an
           integer and 1237.5 + 75 is 1312.5. */
        eq(m.surface.w, 1275, 'trim plus bleed on both sides');
        eq(m.surface.h, 1313, 'and the half-pixel rounds up, once, here');
    });

    /* Panel lengths are sixteenths of an inch stored as millimetres, so a
       strip comes back a hair either side of its exact value depending on
       which panels were summed: JP2's surface arrives as 2793.7499999999995
       for an exact 2793.75, and JP4's as 4199.999999999999 for a whole 4200.
       JP0 and JP1 land on exact HALF dots — 1312.5 and 2062.5 — which is
       where Math.round changes its mind, so a half that arrived low would
       round the other way from one that arrived high. Settling first throws
       the drift away and keeps the half. */
    test('every J-card rounds its half-dot the same way', () => {
        const expected = { 0: 1313, 1: 2063, 2: 2794, 3: 3506, 4: 4200, 5: 4875 };
        for (const extra of [0, 1, 2, 3, 4, 5]) {
            const m = F.metrics(F.sizeOf('jcard-jp' + extra));
            eq(m.surface.w, 1275, `JP${extra} is always 4 in wide plus bleed`);
            eq(m.surface.h, expected[extra], `JP${extra} surface height`);
            /* The real assertion: whatever the drift, the surface is what the
               unrounded arithmetic says it is, rounded half-up. */
            const exact = Number((m.trim.h + m.bleed * 2).toFixed(6));
            eq(m.surface.h, Math.round(exact), `JP${extra} matches its own arithmetic`);
        }
    });

    /* Panel offsets stay fractional so six folds do not accumulate six
       roundings — the last fold has to land where the arithmetic says. */
    test('panel offsets run end to end without drift', () => {
        const m = F.metrics(F.sizeOf('jcard-jp5'));
        eq(m.panels.length, 8, 'eight of them');
        eq(m.panels[0].at, 0, 'the first starts at the trim edge');
        for (let i = 1; i < m.panels.length; i++) {
            near(m.panels[i].at, m.panels[i - 1].at + m.panels[i - 1].len,
                `panel ${i} starts where panel ${i - 1} ends`);
        }
        const last = m.panels[m.panels.length - 1];
        near(last.at + last.len, m.trim.h, 'and the last one ends at the trim');
    });

    test('metrics survives anything, because a file can say anything', () => {
        for (const size of [null, undefined, {}, { unit: 'mm' }, { unit: 'mm', trim: { w: 100 } },
            { unit: 'px', trim: {} }, { unit: 'mm', trim: { w: 100, h: 50 }, panels: 'no' },
            { unit: 'mm', trim: { w: 100, h: 50 }, panelAxis: 'z', panels: [{ len: 10 }] }]) {
            const m = F.metrics(size);
            ok(m.surface.w > 0 && m.surface.h > 0, `a usable surface for ${JSON.stringify(size)}`);
            ok(Array.isArray(m.panels), 'and panels is always an array');
        }
    });

    /* ── matchId ── */

    test('every preset recognises itself, and a stranger is CUSTOM', () => {
        for (const f of F.FORMATS) {
            eq(F.matchId(f.size()), f.id, `${f.id} round-trips`);
        }
        eq(F.matchId({ unit: 'px', trim: { w: 999, h: 999 }, bleed: 0, safe: 0 }), null,
            'a size nobody offered is a legitimate document, and reads as CUSTOM');
        eq(F.matchId(null), null, 'and nothing at all is not a match either');
    });

    test('a J-card is not confused with a square of the same numbers', () => {
        const jp0 = F.sizeOf('jcard-jp0');
        const flat = Object.assign({}, jp0);
        delete flat.panels;
        delete flat.panelAxis;
        eq(F.sameSize(jp0, flat), false, 'the panels are part of what a size IS');
    });

    /* ── fontCap ── */

    test('the font ceiling is one letter filling the card', () => {
        eq(F.fontCap(G.squareSize(1024)), 1024,
            'byte-identical to the number every existing caller passed');
        eq(F.fontCap(G.squareSize(512)), 512, 'and at every square size');
        eq(F.fontCap(F.sizeOf('jcard-jp0')), 1237,
            'the trim, floored — not the surface, since a glyph sized to the bleed'
            + ' is meaningless');
    });
}
