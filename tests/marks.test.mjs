import { test, eq, ok } from './kit/assert.mjs';

/* core/marks.js — the crop and fold marks, and the sheet they need room on.
 *
 * The whole design rests on one constraint that is easy to state and easy to
 * get wrong: A MARK MAY NOT TOUCH THE ARTWORK. The bleed is image that the
 * knife takes away, so a mark drawn in it is both printed over a photograph
 * and thrown away by the cut it was meant to guide. Most of what is asserted
 * below is that constraint from several directions, because a file that
 * violates it looks completely normal until it comes back from the printer. */

const NEAR = 1e-9;
function near(a, b, msg) {
    ok(Math.abs(a - b) < NEAR, `${msg} — expected ${b}, got ${a}`);
}

/** Every point a mark occupies, as [x, y] pairs. */
function ends(k) {
    return [[k.x1, k.y1], [k.x2, k.y2]];
}

export default function (M) {
    const K = M.marks;
    const F = M.formats;

    const SQUARE = F.metrics(F.squareSize(1024));
    const JP0 = F.metrics(F.sizeOf('jcard-jp0'));
    const JP5 = F.metrics(F.sizeOf('jcard-jp5'));

    /* A landscape card, exercising the panelAxis 'x' path that core/panels.js
       and core/formats.js both implement and no preset uses yet. */
    const SIDE = F.metrics({
        unit: 'mm', trim: { w: 104.775, h: 101.6 }, bleed: 3.175, safe: 3.175,
        dpi: 300, panelAxis: 'x', panels: F.jcardPanels(0),
    });

    /* ── when there is anything to mark ── */

    /* A BLEED IS THE TEST, NOT PANELS. A bleed is what makes a document
       something that gets cut out of a larger sheet, and a cut is the thing a
       crop mark is about. */
    test('a document with no bleed has no cut to mark', () => {
        eq(K.wanted(SQUARE), false, 'a square cover');
        eq(K.wanted(null), false, 'and nothing at all');
        eq(K.sheet(SQUARE), null, 'no sheet');
        eq(K.lines(SQUARE).length, 0, 'no marks');
    });

    test('a J-card has both', () => {
        eq(K.wanted(JP0), true, 'wanted');
        ok(K.lines(JP0).length > 0, 'and marks to draw');
    });

    /* ── the sheet ── */

    /* THE OFFSET IS WHERE ui/export.js DRAWS THE COMPOSED ARTWORK, and
       drawImage at a fractional offset resamples every pixel it copies. A
       300dpi card would arrive very slightly soft with nothing on screen to
       show for it. */
    test('the margin is a whole number of dots, so the artwork is copied not resampled', () => {
        for (const [name, m] of [['JP0', JP0], ['JP5', JP5], ['landscape', SIDE]]) {
            const g = K.margin(m);
            eq(g, Math.round(g), `${name}'s margin is an integer`);
            const s = K.sheet(m);
            eq(s.offset.x, g, `${name} places the surface at it`);
            eq(s.offset.y, g, 'on both axes');
            eq(s.w, m.surface.w + g * 2, `${name} sheet width`);
            eq(s.h, m.surface.h + g * 2, `${name} sheet height`);
        }
    });

    test('a JP0 sheet is the 1275x1313 surface plus a margin all round', () => {
        eq(K.margin(JP0), 56, 'an eighth of an inch and a half again, in dots');
        const s = K.sheet(JP0);
        eq([s.w, s.h], [1387, 1425], 'the marked export');
        /* The point of the whole file: the card itself did not change size. */
        eq([JP0.surface.w, JP0.surface.h], [1275, 1313], 'the card is what it was');
    });

    /* ── the constraint ── */

    test('no mark reaches the artwork', () => {
        for (const [name, m] of [['JP0', JP0], ['JP5', JP5], ['landscape', SIDE]]) {
            const g = K.margin(m);
            const left = g + m.origin.x, top = g + m.origin.y;
            const right = left + m.trim.w, bottom = top + m.trim.h;

            for (const k of K.lines(m)) {
                for (const [x, y] of ends(k)) {
                    /* Outside the TRIM on at least one axis, and by at least
                       the bleed — which is exactly the strip that gets cut
                       away. A mark satisfying this cannot be printed over
                       image and cannot be trimmed off. */
                    const out = x <= left - m.bleed + NEAR || x >= right + m.bleed - NEAR
                        || y <= top - m.bleed + NEAR || y >= bottom + m.bleed - NEAR;
                    ok(out, `${name}: ${k.kind} mark point (${x}, ${y}) is clear of the bleed`);
                }
            }
        }
    });

    test('every mark is on the sheet', () => {
        for (const [name, m] of [['JP0', JP0], ['JP5', JP5], ['landscape', SIDE]]) {
            const s = K.sheet(m);
            for (const k of K.lines(m)) {
                for (const [x, y] of ends(k)) {
                    ok(x >= 0 && x <= s.w && y >= 0 && y <= s.h,
                        `${name}: ${k.kind} point (${x}, ${y}) inside 0..${s.w} x 0..${s.h}`);
                }
            }
        }
    });

    /* Unprinted paper between the mark and the edge of the image. A hairline
       flush against the boundary reads as a cropping accident. */
    test('no mark runs off the edge of the sheet', () => {
        const s = K.sheet(JP0);
        for (const k of K.lines(JP0)) {
            for (const [x, y] of ends(k)) {
                ok(x > 1 && x < s.w - 1 && y > 1 && y < s.h - 1,
                    `${k.kind} point (${x}, ${y}) stands clear of the sheet edge`);
            }
        }
    });

    /* ── crop marks ── */

    test('two crop marks meet at every corner, aligned to the cuts', () => {
        const crop = K.lines(JP0).filter((k) => k.kind === 'crop');
        eq(crop.length, 8, 'four corners, two marks each');

        const g = K.margin(JP0);
        const left = g + JP0.origin.x, top = g + JP0.origin.y;
        const right = left + JP0.trim.w, bottom = top + JP0.trim.h;

        /* Each one is exactly a bleed clear of the cut it marks, and exactly a
           bleed long. A single mark locates a line; the PAIR locates the
           corner, which is why there are eight and not four. */
        const horiz = crop.filter((k) => k.y1 === k.y2);
        eq(horiz.length, 4, 'four run along the top and bottom cuts');
        for (const k of horiz) {
            ok(k.y1 === top || k.y1 === bottom, `sits on a cut at y=${k.y1}`);
            near(Math.abs(k.x2 - k.x1), JP0.bleed, 'a bleed long');
        }

        const vert = crop.filter((k) => k.x1 === k.x2);
        eq(vert.length, 4, 'and four along the sides');
        for (const k of vert) {
            ok(k.x1 === left || k.x1 === right, `sits on a cut at x=${k.x1}`);
            near(Math.abs(k.y2 - k.y1), JP0.bleed, 'a bleed long');
        }
    });

    /* ── fold marks ── */

    /* ZERO IS A CUT, NOT A FOLD. The first panel's leading edge is already
       marked, in the other kind — the same rule core/panels.js draws by. */
    test('a tick on both sides of every internal fold, and none at the cuts', () => {
        const folds = K.lines(JP0).filter((k) => k.kind === 'fold');
        eq(folds.length, 4, 'a three-panel card bends twice, marked from both edges');

        const g = K.margin(JP0);
        const top = g + JP0.origin.y;
        const at = [...new Set(folds.map((k) => k.y1))].sort((a, b) => a - b);
        eq(at.length, 2, 'at two heights');
        near(at[0], top + JP0.panels[1].at, 'below the front');
        near(at[1], top + JP0.panels[2].at, 'and below the spine');

        eq(K.lines(JP5).filter((k) => k.kind === 'fold').length, 14,
            'eight panels, seven folds, two ticks each');
    });

    test('a landscape card is marked across its own axis', () => {
        const folds = K.lines(SIDE).filter((k) => k.kind === 'fold');
        eq(folds.length, 4, 'two folds, two ticks each');
        /* Vertical ticks above and below, where the stacked card has
           horizontal ones to its left and right. */
        for (const k of folds) eq(k.x1, k.x2, 'each tick is vertical');
    });
}
