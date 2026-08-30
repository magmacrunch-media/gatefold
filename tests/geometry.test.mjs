import { test, eq, ok } from './kit/assert.mjs';

function close(actual, expected, what, tol = 1e-9) {
    if (!(Math.abs(actual - expected) <= tol)) {
        throw new Error(`${what}:\n      got ${actual}\n      want ${expected} (+/- ${tol})`);
    }
}

/* The injected measurer. Nothing here owns a canvas, which is the whole point
   of bounds() taking this as a parameter — a monospace stand-in makes the text
   arithmetic exact and checkable by hand. */
const measure = (text, font, size) => text.length * size * 0.6;

export default function (M) {
    const G = M.geometry;

    /* ── bounds ── */

    test('a shape’s bounds are its box', () => {
        eq(G.bounds({ type: 'rect', x: 10, y: 20, w: 30, h: 40 }, measure),
            { x: 10, y: 20, w: 30, h: 40 }, 'as stored');
    });

    test('a negative extent folds in the bounds too', () => {
        eq(G.bounds({ type: 'rect', x: 100, y: 100, w: -40, h: -20 }, measure),
            { x: 60, y: 80, w: 40, h: 20 }, 'folded');
    });

    test('a line’s BOX is folded even though the line keeps its direction', () => {
        eq(G.bounds({ type: 'line', x: 100, y: 100, w: -40, h: -20 }, measure),
            { x: 60, y: 80, w: 40, h: 20 }, 'the box is axis-aligned regardless');
    });

    test('text is measured, not stored', () => {
        const b = G.bounds({ type: 'text', x: 0, y: 0, text: 'ABCD', fontSize: 100 }, measure);
        eq(b.w, 240, '4 chars x 100 x 0.6');
        close(b.h, 130, 'one line at fontSize * 1.3');
    });

    test('multi-line text takes the widest line and stacks the rest', () => {
        const b = G.bounds({ type: 'text', x: 0, y: 0, text: 'AB\nABCDE\nA', fontSize: 10 }, measure);
        eq(b.w, 30, 'the widest of the three lines');
        close(b.h, 39, 'three lines at 13 each');
    });

    test('empty text still has a box you can grab', () => {
        const b = G.bounds({ type: 'text', x: 0, y: 0, text: '', fontSize: 20 }, measure);
        ok(b.w > 0 && b.h > 0, 'not a zero-size element that cannot be selected');
    });

    /* ── rotation ── */

    test('toLocal is the exact inverse of toWorld', () => {
        const el = { type: 'rect', x: 100, y: 100, w: 200, h: 80, rotation: 37 };
        const b = G.bounds(el, measure);
        for (const [x, y] of [[0, 0], [150, 140], [400, -50], [123.456, 78.9]]) {
            const back = G.toWorld(...Object.values(G.toLocal(x, y, el, b)), el, b);
            close(back.x, x, `round trip x from (${x},${y})`, 1e-9);
            close(back.y, y, `round trip y from (${x},${y})`, 1e-9);
        }
    });

    test('the rotation centre is the centre of the unrotated box', () => {
        const el = { type: 'rect', x: 100, y: 100, w: 200, h: 80, rotation: 90 };
        const b = G.bounds(el, measure);
        const c = G.centerOf(b);
        eq(c, { x: 200, y: 140 }, 'centre');
        const p = G.toLocal(c.x, c.y, el, b);
        close(p.x, c.x, 'the centre maps to itself');
        close(p.y, c.y, 'in both axes');
    });

    test('an unrotated element short-circuits to the identity', () => {
        const el = { type: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0 };
        eq(G.toLocal(3, 4, el, G.bounds(el, measure)), { x: 3, y: 4 }, 'unchanged');
    });

    test('the envelope grows to contain the turned box', () => {
        const b = { x: 0, y: 0, w: 100, h: 20 };
        eq(G.envelope(b, 0), b, 'no rotation, no growth');
        const e = G.envelope(b, 90);
        close(e.w, 20, 'a quarter turn swaps the sides');
        close(e.h, 100, 'both of them');
        eq(G.centerOf(e), G.centerOf(b), 'and it stays centred');
    });

    /* The property that actually defines an envelope: it contains the turned
       box. Asserting "it gets bigger" is wrong — a long thin box at 45 degrees
       gets NARROWER (100x20 becomes 84.85 wide), which is how this test first
       went wrong. */
    test('the envelope contains all four corners of the turned box, at any angle', () => {
        const el = { type: 'rect', x: 40, y: 60, w: 100, h: 20 };
        const b = G.bounds(el, measure);
        for (const deg of [0, 17, 45, 90, 137, 180, 271, 359]) {
            const e = G.envelope(b, deg);
            const turned = { ...el, rotation: deg };
            const corners = [[b.x, b.y], [b.x + b.w, b.y],
                [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]];
            for (const [cx, cy] of corners) {
                const p = G.toWorld(cx, cy, turned, b);
                ok(p.x >= e.x - 1e-9 && p.x <= e.x + e.w + 1e-9
                    && p.y >= e.y - 1e-9 && p.y <= e.y + e.h + 1e-9,
                    `corner (${cx},${cy}) at ${deg} deg is inside the envelope`);
            }
        }
    });

    /* ══ THE BUG THIS MODULE EXISTS TO FIX ══
       render() draws inside a rotation; the old hitTest compared the raw
       cursor against the UNROTATED box. Both directions have to be asserted:
       the first shows the new behaviour works, and only the SECOND proves the
       old behaviour is actually gone. */

    test('a point inside the ROTATED shape hits, though it is outside the axis-aligned box', () => {
        // A wide flat bar turned upright: its box is 200x20 at 0 degrees, so a
        // point 60px above the centre is far outside it. Turned 90 degrees the
        // bar is vertical and that point is squarely on the element.
        const el = { type: 'rect', x: 0, y: 90, w: 200, h: 20, rotation: 90 };
        const b = G.bounds(el, measure);
        ok(!G.inPaddedBox(100, 40, b), 'the point is NOT in the unrotated box');
        eq(G.hitTest(100, 40, [el], measure), el, 'but it does hit the rotated element');
    });

    test('a point inside the axis-aligned box MISSES when the shape has turned away', () => {
        // The other end of the same bar. At 0 degrees x=190 is on it; upright,
        // that is out past the end of the now-vertical bar.
        const el = { type: 'rect', x: 0, y: 90, w: 200, h: 20, rotation: 90 };
        const b = G.bounds(el, measure);
        ok(G.inPaddedBox(190, 100, b), 'the point IS in the unrotated box');
        eq(G.hitTest(190, 100, [el], measure), null,
            'and the old code would have selected it — this is the regression');
    });

    test('the hit box follows the element all the way round', () => {
        const at = (deg) => {
            const el = { type: 'rect', x: 0, y: 90, w: 200, h: 20, rotation: deg };
            return G.hitTest(100, 40, [el], measure);
        };
        eq(at(0), null, 'flat: the point is above the bar');
        ok(at(90), 'upright: the point is on it');
        ok(at(270), 'and upright the other way');
        eq(at(180), null, 'flat again: back to a miss');
    });

    /* ── hit testing ── */

    test('the topmost element wins', () => {
        const a = { id: 1, type: 'rect', x: 0, y: 0, w: 100, h: 100 };
        const b = { id: 2, type: 'rect', x: 0, y: 0, w: 100, h: 100 };
        eq(G.hitTest(50, 50, [a, b], measure).id, 2, 'later in the array is drawn on top');
    });

    test('the padding makes a thin element grabbable', () => {
        const el = { type: 'line', x: 50, y: 50, w: 100, h: 0 };
        ok(G.hitTest(60, 50 - G.PAD + 1, [el], measure), 'just inside the pad');
        eq(G.hitTest(60, 50 - G.PAD - 5, [el], measure), null, 'and outside it misses');
    });

    /* A hidden element that still answered a hit test would be selectable
       through whatever is drawn over it, which reads as the app selecting the
       wrong thing. */
    test('a hidden element is not clickable', () => {
        const hidden = { id: 1, type: 'rect', x: 0, y: 0, w: 100, h: 100, visible: false };
        const under = { id: 2, type: 'rect', x: 0, y: 0, w: 100, h: 100 };
        eq(G.hitTest(50, 50, [hidden], measure), null, 'nothing to hit');
        eq(G.hitTest(50, 50, [under, hidden], measure).id, 2, 'the visible one below is found');
    });

    test('an element with no visible field is visible', () => {
        ok(G.hitTest(5, 5, [{ type: 'rect', x: 0, y: 0, w: 10, h: 10 }], measure),
            'absent means visible, so a hand-written file still works');
    });

    test('empty space and an empty document hit nothing', () => {
        eq(G.hitTest(500, 500, [{ type: 'rect', x: 0, y: 0, w: 10, h: 10 }], measure), null, 'miss');
        eq(G.hitTest(0, 0, [], measure), null, 'empty');
        eq(G.hitTest(0, 0, null, measure), null, 'absent');
    });

    /* ── handles ── */

    test('the four corner handles sit at the padded corners', () => {
        const b = { x: 100, y: 100, w: 200, h: 100 };
        const h = {};
        for (const x of G.handles(b)) h[x.id] = [x.x, x.y];
        eq(h.tl, [100 - G.PAD, 100 - G.PAD], 'top left');
        eq(h.br, [300 + G.PAD, 200 + G.PAD], 'bottom right');
        eq(h.tr, [300 + G.PAD, 100 - G.PAD], 'top right');
        eq(h.bl, [100 - G.PAD, 200 + G.PAD], 'bottom left');
    });

    test('the rotation handle is centred above the top edge', () => {
        const r = G.rotationHandle({ x: 100, y: 100, w: 200, h: 100 });
        eq(r.x, 200, 'centred horizontally');
        eq(r.y, 100 - G.PAD - G.ROT_REACH, 'above by pad plus reach');
    });

    test('the handles rotate with the element', () => {
        const el = { type: 'rect', x: 100, y: 100, w: 200, h: 100, rotation: 90 };
        const b = G.bounds(el, measure);
        // Where the top-left handle actually is on screen once turned.
        const local = G.handles(b)[0];
        const world = G.toWorld(local.x, local.y, el, b);
        eq(G.hitTestHandle(world.x, world.y, el, b).id, 'tl', 'found at its turned position');
    });

    test('the rotation handle is checked before the corners', () => {
        const el = { type: 'rect', x: 100, y: 100, w: 200, h: 100, rotation: 0 };
        const b = G.bounds(el, measure);
        const r = G.rotationHandle(b);
        eq(G.hitTestHandle(r.x, r.y, el, b).id, 'rotate', 'rotate');
    });

    test('empty space is not a handle', () => {
        const el = { type: 'rect', x: 100, y: 100, w: 200, h: 100 };
        eq(G.hitTestHandle(200, 150, el, G.bounds(el, measure)), null, 'the middle is not a handle');
        eq(G.hitTestHandle(0, 0, null, { x: 0, y: 0, w: 0, h: 0 }), null, 'nor is nothing selected');
    });

    /* ── the rotation drag ──
       A DELTA from where the grab started. The original used the cursor's
       absolute angle, which looked right only because the handle always sat
       directly above the unrotated centre. Once the handle turns with the
       element a grab starts at origRotation from vertical, so an absolute
       angle adds that offset again and the element jumps by its own rotation
       on the first mousemove. */
    test('a rotation drag that has not moved does not rotate', () => {
        eq(G.rotateBy(40, 12, 12), 40, 'no movement, no change');
    });

    test('a rotation drag applies the delta, not the absolute angle', () => {
        eq(G.rotateBy(40, 12, 42), 70, 'moved 30 degrees, rotated 30 degrees');
        eq(G.rotateBy(0, 90, 100), 10, 'grabbing at 90 does not add 90');
    });

    test('rotation wraps into 0..360', () => {
        eq(G.rotateBy(350, 0, 30), 20, 'past the top');
        eq(G.rotateBy(10, 0, -30), 340, 'and back under it');
        ok(G.rotateBy(0, 0, 720) >= 0, 'never negative');
    });

    test('angleAt measures from the centre in degrees', () => {
        const c = { x: 100, y: 100 };
        close(G.angleAt(200, 100, c), 0, 'due right is zero');
        close(G.angleAt(100, 200, c), 90, 'down is +90 in screen coordinates');
        close(G.angleAt(100, 0, c), -90, 'up is -90');
    });

    /* ── resize ── */

    test('resize returns a patch and does not touch the element', () => {
        const el = { type: 'rect', x: 10, y: 10, w: 100, h: 100 };
        const patch = G.resize(el, 'br', 50, 20, { x: 10, y: 10, w: 100, h: 100 });
        eq(patch, { w: 150, h: 120 }, 'the patch');
        eq(el, { type: 'rect', x: 10, y: 10, w: 100, h: 100 }, 'the element is untouched');
    });

    test('a free box resizes from each corner', () => {
        const ob = { x: 100, y: 100, w: 200, h: 100 };
        const el = { type: 'rect' };
        eq(G.resize(el, 'br', 10, 20, ob), { w: 210, h: 120 }, 'br grows');
        eq(G.resize(el, 'tl', 10, 20, ob), { x: 110, y: 120, w: 190, h: 80 }, 'tl moves the origin');
        eq(G.resize(el, 'tr', 10, 20, ob), { y: 120, w: 210, h: 80 }, 'tr moves only y');
        eq(G.resize(el, 'bl', 10, 20, ob), { x: 110, w: 190, h: 120 }, 'bl moves only x');
    });

    test('a box cannot be dragged inside out', () => {
        const p = G.resize({ type: 'rect' }, 'br', -500, -500, { x: 0, y: 0, w: 100, h: 100 });
        ok(p.w >= 2 && p.h >= 2, 'clamped to a minimum rather than going negative');
    });

    test('a line moves the end that was grabbed', () => {
        const ob = { x: 0, y: 0, w: 100, h: 50 };
        eq(G.resize({ type: 'line' }, 'br', 20, 10, ob), { w: 120, h: 60 }, 'the far end follows');
        eq(G.resize({ type: 'line' }, 'tl', 20, 10, ob), { x: 20, y: 10, w: 80, h: 40 },
            'the near end moves and the far end stays put');
    });

    test('text scales its font size by the diagonal, not its box', () => {
        const ob = { x: 0, y: 0, w: 300, h: 400, fontSize: 50 };  // diagonal 500
        const p = G.resize({ type: 'text' }, 'br', 300, 400, ob); // now 600x800, diagonal 1000
        eq(p.fontSize, 100, 'doubled');
        ok(!('w' in p) && !('h' in p), 'and the box is not set — the glyphs re-measure');
    });

    test('a font size cannot be dragged below legibility', () => {
        const ob = { x: 0, y: 0, w: 300, h: 400, fontSize: 50 };
        eq(G.resize({ type: 'text' }, 'br', -299, -399, ob).fontSize, 8, 'floors at 8');
    });

    /* THE CEILING, and the case that matters most is the last one.

       resize() floored the font size and left the top open, so a corner
       handle dragged past the canvas produced a size in the tens of
       thousands. ui/render.js then asks the engine to rasterise and stroke
       glyph outlines at that size every frame, which kills the renderer:
       the window goes black and nothing is logged, because no JavaScript
       threw. */
    test('a font size cannot be dragged past the canvas', () => {
        const ob = { x: 0, y: 0, w: 300, h: 400, fontSize: 50 };  // diagonal 500
        const p = G.resize({ type: 'text' }, 'br', 30000, 40000, ob, 1024);
        eq(p.fontSize, 1024, 'clamped to the canvas, not scaled to five figures');
    });

    test('the canvas is the cap, so a bigger canvas allows a bigger font', () => {
        const ob = { x: 0, y: 0, w: 300, h: 400, fontSize: 50 };
        eq(G.resize({ type: 'text' }, 'br', 30000, 40000, ob, 4096).fontSize, 4096,
            'a 4096 cover can hold a 4096px letter');
        eq(G.resize({ type: 'text' }, 'br', 30000, 40000, ob, 512).fontSize, 512,
            'and a 512 one cannot');
    });

    test('a caller that passes no canvas size still gets a cap', () => {
        const ob = { x: 0, y: 0, w: 300, h: 400, fontSize: 50 };
        eq(G.resize({ type: 'text' }, 'br', 30000, 40000, ob).fontSize, G.MAX_FONT_FALLBACK,
            'the fallback is the largest canvas the app offers — an UNBOUNDED'
            + ' default is the shape of the bug this cap exists for, so the'
            + ' forgetful caller is merely generous rather than fatal');
    });

    test('clampFontSize holds both ends', () => {
        eq(G.clampFontSize(0, 1024), G.MIN_FONT, 'nothing is still legible');
        eq(G.clampFontSize(9999, 1024), 1024, 'and nothing is unbounded');
        eq(G.clampFontSize(48, 1024), 48, 'an ordinary size passes through');
        eq(G.clampFontSize(NaN, 1024), G.MIN_FONT, 'junk floors rather than propagating');
    });

    test('a zero-size text does not divide by zero', () => {
        eq(G.resize({ type: 'text' }, 'br', 10, 10, { x: 0, y: 0, w: 0, h: 0, fontSize: 20 }), {},
            'no diagonal, no scale, no NaN');
    });

    test('an image resizes with its aspect locked from every corner', () => {
        const el = { type: 'image', aspectRatio: 2 };
        const ob = { x: 100, y: 100, w: 200, h: 100 };
        for (const h of ['tl', 'tr', 'bl', 'br']) {
            const p = G.resize(el, h, 60, -40, ob);
            close(p.w / p.h, 2, `${h} keeps the aspect`);
        }
    });

    test('an image resized from tl keeps its bottom-right corner still', () => {
        const el = { type: 'image', aspectRatio: 2 };
        const ob = { x: 100, y: 100, w: 200, h: 100 };
        const p = G.resize(el, 'tl', 40, 0, ob);
        close(p.x + p.w, 300, 'right edge unmoved');
        close(p.y + p.h, 200, 'bottom edge unmoved');
    });

    /* ── fit ── */

    test('contain fits the whole image inside the canvas', () => {
        const box = { x: 0, y: 0, w: 1000, h: 1000 };
        const p = G.fit({ aspectRatio: 2 }, 'contain', box);
        eq([p.w, p.h], [1000, 500], 'width fills, height letterboxes');
        eq([p.x, p.y], [0, 250], 'centred');
    });

    test('cover fills the canvas and lets the long side hang off', () => {
        const box = { x: 0, y: 0, w: 1000, h: 1000 };
        const p = G.fit({ aspectRatio: 2 }, 'cover', box);
        eq([p.w, p.h], [2000, 1000], 'height fills, width overhangs');
        eq([p.x, p.y], [-500, 0], 'centred, so it hangs off equally both sides');
    });

    test('a tall image covers and contains the other way round', () => {
        const box = { x: 0, y: 0, w: 1000, h: 1000 };
        eq(G.fit({ aspectRatio: 0.5 }, 'contain', box).h, 1000, 'contain: height fills');
        eq(G.fit({ aspectRatio: 0.5 }, 'cover', box).w, 1000, 'cover: width fills');
    });

    test('a square image in a square canvas is the canvas either way', () => {
        const box = { x: 0, y: 0, w: 1000, h: 1000 };
        for (const mode of ['cover', 'contain']) {
            eq(G.fit({ aspectRatio: 1 }, mode, box), { x: 0, y: 0, w: 1000, h: 1000 }, mode);
        }
    });

    /* Idempotence is what lets the fit BE the stored geometry. The original
       had to re-base its scale slider by hand after every fit because its fit
       and its scale were two numbers fighting. */
    test('re-fitting an already-fitted image changes nothing', () => {
        const box = { x: 0, y: 0, w: 1000, h: 1000 };
        const once = G.fit({ aspectRatio: 1.6 }, 'cover', box);
        const twice = G.fit({ aspectRatio: 1.6, w: once.w, h: once.h }, 'cover', box);
        eq(twice, once, 'stable');
    });

    test('fit works in a box that is not at the origin — a print box later', () => {
        const p = G.fit({ aspectRatio: 1 }, 'contain', { x: -3, y: -3, w: 106, h: 106 });
        eq([p.x, p.y, p.w, p.h], [-3, -3, 106, 106], 'the box offset carries through');
    });

    test('an image with no measurable aspect gets the box rather than NaN', () => {
        const box = { x: 0, y: 0, w: 100, h: 100 };
        for (const el of [{ aspectRatio: 0 }, { aspectRatio: NaN }, { w: 0, h: 0 }]) {
            const p = G.fit(el, 'cover', box);
            ok(Number.isFinite(p.w) && Number.isFinite(p.h), `finite for ${JSON.stringify(el)}`);
        }
    });
}
