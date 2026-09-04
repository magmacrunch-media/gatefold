import { test, eq, ok } from './kit/assert.mjs';

const NEAR = 1e-9;
function near(a, b, msg) {
    ok(Math.abs(a - b) < NEAR, `${msg} — expected ${b}, got ${a}`);
}

/* The bounds shape core/geometry.js hands back, built around a centre so each
   case reads as "this far off centre" rather than as four numbers to decode.
   Same helper as tests/guides.test.mjs, on purpose: the two files are testing
   the same arithmetic against different boxes. */
function boxAt(cx, cy, w = 100, h = 40) {
    return { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
}

export default function (M) {
    const P = M.panels;
    const G = M.guides;
    const F = M.formats;

    const SQUARE = F.metrics(F.squareSize(1024));
    const JP0 = F.metrics(F.sizeOf('jcard-jp0'));

    /* JP0 at 300dpi: front 0..768.75, spine 768.75..918.75, back
       918.75..1237.5. Written out because every case below leans on them. */
    const FRONT_END = 768.75;
    const SPINE_END = 918.75;
    const STRIP = 1237.5;

    /* ── boxes ── */

    /* THE BRANCHLESS CASE. A document with no panels is one box — the trim —
       which is what lets ui/props.js and ui/import.js call the panel path
       unconditionally and get their old behaviour back unchanged. */
    test('a document with no panels is one box: the trim', () => {
        const b = P.boxes(SQUARE);
        eq(b.length, 1, 'one box');
        eq(b[0].x, 0, 'at the origin');
        eq(b[0].y, 0, 'on both axes');
        eq(b[0].w, 1024, 'the full trim');
        eq(b[0].h, 1024, 'on both axes');
    });

    test('a J-card is contiguous full-width panels that add up to the strip', () => {
        const b = P.boxes(JP0);
        eq(b.map((x) => x.name), ['FRONT', 'SPINE', 'BACK'], 'in order');
        for (const box of b) {
            eq(box.x, 0, `${box.name} runs the full width`);
            eq(box.w, 1200, 'the card is 4 in wide at every panel');
        }
        eq(b[0].y, 0, 'the front starts at the top');
        near(b[0].h, FRONT_END, 'front height');
        near(b[1].y, FRONT_END, 'the spine starts where the front ends');
        near(b[2].y, SPINE_END, 'and the back where the spine ends');
        near(b[2].y + b[2].h, STRIP, 'the last panel ends at the trim');
    });

    test('nothing to work with is an empty list, not a throw', () => {
        eq(P.boxes(null).length, 0, 'boxes');
        eq(P.primary(null), null, 'primary');
        eq(P.lines(null).length, 0, 'lines');
    });

    /* ── at / primary ── */

    test('a point resolves to the panel it is on, and the bleed to none', () => {
        eq(P.at(JP0, 600, 100).name, 'FRONT', 'high on the card');
        eq(P.at(JP0, 600, 800).name, 'SPINE', 'in the middle');
        eq(P.at(JP0, 600, 1100).name, 'BACK', 'and low');
        eq(P.at(JP0, 600, -20), null, 'the bleed is outside every panel');
        eq(P.at(JP0, -20, 600), null, 'on both axes');
        eq(P.at(JP0, 600, STRIP + 20), null, 'and past the far edge too');
    });

    test('the panel a new element belongs on is the front', () => {
        eq(P.primary(JP0).name, 'FRONT', 'the J-card');
        eq(P.primary(SQUARE).w, 1024, 'and a square is its own whole page');
    });

    /* ── snapIn: the headline ── */

    /* A title centred on the FRONT PANEL, not on the whole strip — whose
       centre on a J-card is a point inside the spine, where nothing anybody
       wants is. */
    test('centre-snap means the centre of the panel, not of the strip', () => {
        const onFront = P.snapIn(boxAt(600, FRONT_END / 2), JP0, 4);
        eq(onFront.dx, 0, 'already centred horizontally');
        near(onFront.dy, 0, 'and on the front panel vertically');
        eq(onFront.lines.length, 2, 'so both lines are drawn');

        const atStripCentre = P.snapIn(boxAt(600, STRIP / 2), JP0, 4);
        eq(atStripCentre.dx, 0, 'the horizontal centre is shared by every panel');
        near(atStripCentre.dy, 0, 'but the strip centre is 234 units off the front centre');
        eq(atStripCentre.lines.length, 1, 'so only the one line');
        eq(atStripCentre.lines[0].axis, 'x', 'the vertical one');
    });

    test('crossing a fold hands off to the panel the element is now on', () => {
        const spineCentre = FRONT_END + (SPINE_END - FRONT_END) / 2;
        const s = P.snapIn(boxAt(600, spineCentre + 2), JP0, 4);
        near(s.dy, -2, 'pulled onto the SPINE centre, not back to the front');
        const line = s.lines.find((l) => l.axis === 'y');
        near(line.at, spineCentre, 'and the line is drawn through the spine');
    });

    /* PROOF THE PANEL PATH IS A SUPERSET, NOT A FORK. ui/tools.js calls
       snapIn for every document now, so a square cover has to come out with
       exactly what guides.snapToCentre gave it. */
    test('on a square document snapIn is guides.snapToCentre, exactly', () => {
        for (const b of [boxAt(512, 512), boxAt(515, 510), boxAt(552, 552), boxAt(514, 200)]) {
            eq(JSON.stringify(P.snapIn(b, SQUARE, 4)),
                JSON.stringify(G.snapToCentre(b, 1024, 4)),
                `same answer for a box at ${b.x},${b.y}`);
        }
    });

    test('snapIn is a no-op on the degenerate arguments, not a throw', () => {
        for (const args of [[null, JP0, 4], [boxAt(600, 400), null, 4],
            [boxAt(600, 400), JP0, 0], [boxAt(600, 400), JP0, -1],
            [undefined, undefined, undefined]]) {
            const s = P.snapIn(...args);
            eq(s.dx, 0, 'dx');
            eq(s.dy, 0, 'dy');
            eq(s.lines.length, 0, 'no lines');
        }
    });

    /* ── bleedBox ── */

    /* An INNER edge is a fold, not a cut. Running the front panel's photo
       past it would put it on the spine. */
    test('a panel grows to the bleed only on the edges that are really cuts', () => {
        const front = P.bleedBox(JP0, P.boxes(JP0)[0]);
        eq(front.x, -37.5, 'past the left cut');
        eq(front.y, -37.5, 'and the top cut');
        eq(front.w, 1200 + 75, 'both sides');
        near(front.h, FRONT_END + 37.5, 'but only the top — the fold below stays put');

        const spine = P.bleedBox(JP0, P.boxes(JP0)[1]);
        eq(spine.x, -37.5, 'the spine reaches both side cuts');
        eq(spine.w, 1275, 'so it is a full bleed wide');
        near(spine.y, FRONT_END, 'and neither of its folds moves');
        near(spine.h, SPINE_END - FRONT_END, 'at all');

        const back = P.bleedBox(JP0, P.boxes(JP0)[2]);
        near(back.y, SPINE_END, 'the back keeps its fold');
        near(back.h, STRIP - SPINE_END + 37.5, 'and grows into the bottom cut');
    });

    test('with no bleed the box is returned as it was', () => {
        const page = P.boxes(SQUARE)[0];
        const grown = P.bleedBox(SQUARE, page);
        eq(JSON.stringify({ x: grown.x, y: grown.y, w: grown.w, h: grown.h }),
            JSON.stringify({ x: 0, y: 0, w: 1024, h: 1024 }),
            'so ui/props.js COVER on a square cover is byte-identical to before');
    });

    /* ── lines ── */

    test('a square has a trim and nothing to fold', () => {
        const l = P.lines(SQUARE);
        eq(l.filter((x) => x.kind === 'fold').length, 0, 'no folds');
        eq(l.filter((x) => x.kind === 'safe').length, 0, 'and no safe margin, since it has none');
        eq(l.filter((x) => x.kind === 'trim').length, 1, 'just the trim box');
    });

    /* ZERO AND THE FAR EDGE ARE CUTS, NOT FOLDS. They are already the trim,
       and drawing them twice in the fold weight says the card bends there. */
    test('the folds are the internal boundaries only', () => {
        const folds = P.lines(JP0).filter((x) => x.kind === 'fold');
        eq(folds.length, 2, 'a three-panel card bends twice');
        eq(folds.every((f) => f.axis === 'y'), true, 'across the stack');
        near(folds[0].at, FRONT_END, 'below the front');
        near(folds[1].at, SPINE_END, 'and below the spine');
    });

    test('a JP5 bends seven times', () => {
        eq(P.lines(F.metrics(F.sizeOf('jcard-jp5'))).filter((x) => x.kind === 'fold').length, 7,
            'eight panels, seven folds');
    });

    /* An eighth of an inch of a title disappearing into a bend is the same
       lost title as an eighth disappearing into the knife. */
    test('the safe margin is inset from every cut and every fold', () => {
        const safe = P.lines(JP0).filter((x) => x.kind === 'safe');
        const across = safe.filter((s) => s.axis === 'x').map((s) => s.at);
        eq(across.length, 2, 'the two side cuts');
        eq(across[0], 37.5, 'inset from the left');
        eq(across[1], 1200 - 37.5, 'and the right');

        const along = safe.filter((s) => s.axis === 'y').map((s) => s.at);
        eq(along.length, 6, 'two per panel');
        near(along[0], 37.5, 'below the top cut');
        near(along[1], FRONT_END - 37.5, 'and above the first fold');
        near(along[5], STRIP - 37.5, 'up to the bottom cut');
    });

    /* ── labels ── */

    test('every panel is named, in stacking order', () => {
        const labels = P.lines(JP0).filter((x) => x.kind === 'label');
        eq(labels.map((l) => l.name), ['FRONT', 'SPINE', 'BACK'], 'the three panels');

        const jp5 = P.lines(F.metrics(F.sizeOf('jcard-jp5'))).filter((x) => x.kind === 'label');
        eq(jp5.map((l) => l.name),
            ['FRONT', 'SPINE', 'BACK', 'FLAP 1', 'FLAP 2', 'FLAP 3', 'FLAP 4', 'FLAP 5'],
            'and all eight of a JP5 — the case the labels exist for');
    });

    /* The band between a panel's leading edge and its safe line: the strip a
       printer's template already reserves. Anywhere else is over artwork. */
    test('a name sits in the panel margin, not in the panel', () => {
        const labels = P.lines(JP0).filter((x) => x.kind === 'label');
        const boxes = P.boxes(JP0);
        eq(labels.length, boxes.length, 'one label per panel');

        for (const l of labels) eq(l.x, 37.5, `${l.name} is inset from the left cut`);

        labels.forEach(function (l, i) {
            const top = boxes[i].y;
            ok(l.y > top && l.y < top + 37.5,
                `${l.name} at ${l.y} is inside its own margin band ${top}..${top + 37.5}`);
        });
    });

    /* boxes() calls the whole trim PAGE so the rest of this file needs no
       branch for a square. That is a convenience for the code, not a fact
       about the document, and it must not reach the canvas. */
    test('a square cover is not labelled PAGE', () => {
        eq(P.lines(SQUARE).filter((x) => x.kind === 'label').length, 0, 'nothing to name');
    });

    /* ── a safe margin without panels ── */

    /* A record jacket is one face with a quarter inch of safety: no folds to
       draw and nothing to name, but a safe rectangle that is the whole reason
       to turn the overlay on. ui/menu.js asks exactly this question to decide
       whether the View item is dead, having previously asked for the panel
       count and been right only because no such format existed yet. */
    test('a jacket has a safe rectangle to draw, and no folds or names', () => {
        const LP = F.metrics(F.sizeOf('lp-12'));
        const l = P.lines(LP);
        eq(l.filter((x) => x.kind === 'fold').length, 0, 'one face does not bend');
        eq(l.filter((x) => x.kind === 'label').length, 0, 'and has no panel to name');
        eq(l.filter((x) => x.kind === 'safe').length, 4, 'but four safe lines, a rectangle');
        ok(l.some((x) => x.kind !== 'trim'), 'so the overlay is worth offering');
    });

    test('a square has nothing to offer, which is what makes the test honest', () => {
        ok(!P.lines(SQUARE).some((x) => x.kind !== 'trim'),
            'nothing but the trim, which is the canvas edge');
    });

    /* ── panels that run across ── */

    test('a tray card boxes left to right, full height, in order', () => {
        const TRAY = F.metrics(F.sizeOf('cd-tray'));
        const b = P.boxes(TRAY);
        eq(b.map((x) => x.name), ['SPINE', 'BACK', 'SPINE'], 'in order');
        for (const box of b) {
            eq(box.y, 0, `${box.name} runs the full height`);
            near(box.h, TRAY.trim.h, 'top to bottom');
        }
        eq(b[0].x, 0, 'the first spine starts at the cut');
        near(b[1].x, b[0].w, 'the back starts where it ends');
        near(b[2].x, b[1].x + b[1].w, 'and the far spine after that');
        near(b[2].x + b[2].w, TRAY.trim.w, 'ending exactly at the trim');

        const folds = P.lines(TRAY).filter((x) => x.kind === 'fold');
        eq(folds.length, 2, 'two folds, one either side of the back');
        eq(folds.every((f) => f.axis === 'x'), true, 'across the card, not down it');
    });

    /* A panel can be narrower than its own name. This file reports the space
       and ui/render.js measures against it, because measuring needs a ctx. */
    test('a label knows how much room it has', () => {
        const TRAY = F.metrics(F.sizeOf('cd-tray'));
        const room = {};
        for (const l of P.lines(TRAY).filter((x) => x.kind === 'label')) {
            room[l.name] = l.room;
        }
        eq(room.SPINE, 0, 'a quarter-inch spine has none: 75 dots less two safe margins');
        ok(room.BACK > 1500, `the back tray has plenty, got ${room.BACK}`);

        /* A stacked card reads across its full width, so its names always
           fit and this can never take one away. */
        for (const l of P.lines(JP0).filter((x) => x.kind === 'label')) {
            near(l.room, JP0.trim.w - 37.5 * 2, `${l.name} gets the full width`);
        }
    });
}
