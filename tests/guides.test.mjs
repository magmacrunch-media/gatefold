import { test, eq, ok } from './kit/assert.mjs';

/* The bounds shape core/geometry.js hands back, built around a centre so the
   arithmetic in each case reads as "this far off centre" rather than as four
   numbers to decode. */
function boxAt(cx, cy, w = 100, h = 40) {
    return { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
}

export default function (M) {
    const G = M.guides;
    const PX = 1024;
    const MID = 512;

    test('a box already on the centre reports both guides and moves nothing', () => {
        const s = G.snapToCentre(boxAt(MID, MID), PX, 4);
        eq(s.dx, 0, 'nothing to correct horizontally');
        eq(s.dy, 0, 'nothing to correct vertically');
        eq(s.lines.length, 2, 'and both lines are drawn');
    });

    test('inside the tolerance it snaps, and lands exactly on the centre', () => {
        const b = boxAt(MID + 3, MID - 2);
        const s = G.snapToCentre(b, PX, 4);
        eq(s.dx, -3, 'pulled back to the middle');
        eq(s.dy, 2, 'and up to it');
        eq(b.x + b.w / 2 + s.dx, MID, 'the corrected centre is the canvas centre exactly');
        eq(b.y + b.h / 2 + s.dy, MID, 'on both axes');
    });

    /* The reason the tolerance is a parameter at all: ui/tools.js converts a
       screen-pixel constant through canvas.scale(), because the backing store
       runs 512 to 4096 against an element about 740px wide and a fixed number
       of document units would snap four times harder on a big cover. */
    test('outside the tolerance nothing happens at all', () => {
        const s = G.snapToCentre(boxAt(MID + 40, MID + 40), PX, 4);
        eq(s.dx, 0, 'left where it was put');
        eq(s.dy, 0, 'on both axes');
        eq(s.lines.length, 0, 'and no line claims otherwise');
    });

    test('the tolerance is inclusive at its edge', () => {
        eq(G.snapToCentre(boxAt(MID + 4, MID + 5), PX, 4).dx, -4, 'exactly 4 away snaps');
        eq(G.snapToCentre(boxAt(MID + 4, MID + 5), PX, 4).dy, 0, 'and 5 away does not');
    });

    /* THE AXES ARE INDEPENDENT, which is the common case rather than an edge
       one: a title sits high on a cover and wants to be horizontally centred
       without being dragged to the middle of the artwork. */
    test('one axis can snap while the other is left alone', () => {
        const s = G.snapToCentre(boxAt(MID + 2, 200), PX, 4);
        eq(s.dx, -2, 'centred horizontally');
        eq(s.dy, 0, 'and untouched vertically');
        eq(s.lines.length, 1, 'one line, for the axis that actually aligned');
        eq(s.lines[0].axis, 'x', 'the vertical line through the canvas centre');
        eq(s.lines[0].at, MID, 'drawn at the centre');
    });

    test('the canvas size decides where the centre is', () => {
        eq(G.snapToCentre(boxAt(2048, 2048), 4096, 4).lines.length, 2, '4096 centres at 2048');
        eq(G.snapToCentre(boxAt(2048, 2048), 1024, 4).lines.length, 0, 'and 1024 does not');
    });

    /* Called on every mousemove of every drag, so the degenerate arguments are
       the common path rather than a curiosity. None of them may throw. */
    test('nothing to work with is a no-op, not a throw', () => {
        for (const args of [
            [null, PX, 4],
            [boxAt(MID, MID), 0, 4],
            [boxAt(MID, MID), PX, 0],
            [boxAt(MID, MID), PX, -1],
            [undefined, undefined, undefined],
        ]) {
            const s = G.snapToCentre(...args);
            eq(s.dx, 0, `dx for ${JSON.stringify(args[1])}/${JSON.stringify(args[2])}`);
            eq(s.dy, 0, 'dy');
            eq(s.lines.length, 0, 'no lines');
        }
    });

    test('a zero tolerance snaps only what is already exact', () => {
        ok(G.snapToCentre(boxAt(MID, MID), PX, 0).lines.length === 0,
            'zero is treated as off rather than as "must be perfect" — the caller'
            + ' asking for no tolerance is asking for no snapping');
    });
}
