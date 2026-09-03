import { test, eq, ok } from './kit/assert.mjs';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANS';
const PNG2 = 'data:image/png;base64,ZZZZZZZZZZZZZZZZ';

/* A document with one of everything, so the round-trip assertion actually
   covers the format rather than the two types that happen to be easy. */
function populate(M) {
    const A = M.gatefold;
    A.reset();
    const doc = A.get();
    for (const type of M.element.TYPES) {
        doc.elements.push(M.element.create(type, { x: 10, y: 20, w: 100, h: 50 }));
    }
    return doc;
}

export default function (M) {
    const A = M.gatefold;

    /* ── the size, which is the format's forward-compatibility decision ── */

    test('a new document is a 1024 square in pixels', () => {
        const d = A.reset();
        eq(d.size, { unit: 'px', trim: { w: 1024, h: 1024 }, bleed: 0, safe: 0 }, 'the default');
        eq(A.canvasSize(d.size), 1024, 'and the one number the square paths want');
        ok(A.isSquarePx(d.size), 'square');
    });

    /* The size is stored in the shape print geometry already speaks, so a CD
       wallet later is a different value in the SAME field — not a migration. */
    test('the size shape already describes a print job', () => {
        const mm = { unit: 'mm', trim: { w: 121, h: 121 }, bleed: 3, safe: 3, dpi: 300 };
        eq(Object.keys(A.defaultSize()).sort(), ['bleed', 'safe', 'trim', 'unit'],
            'the px form has the same keys the mm form needs');
        ok(!A.isSquarePx(mm), 'and a mm size is correctly not a square-px one');
    });

    /* ── serialize ── */

    test('the file names its type and version before anything else', () => {
        A.reset();
        const out = A.toProjectData();
        eq(out.type, 'gatefold', 'type');
        eq(out.version, A.FORMAT_VERSION, 'version');
    });

    /* Gating on a declared constant rather than "whatever keys the object has"
       is what makes the merge-over-default on load correct. */
    test('every declared field is written, and the art rides alongside', () => {
        A.reset();
        const out = A.toProjectData();
        for (const key of A.TOP_LEVEL) ok(key in out, `${key} is written`);
        ok('art' in out, 'art is a sibling of the document, never on the elements');
        eq(Object.keys(out).sort(),
            ['art', 'type', 'version'].concat(A.TOP_LEVEL).sort(),
            'and nothing else is written');
    });

    /* The live store never evicts, because undo can resurrect an element whose
       image was deleted. The FILE has no undo stack, so it wants exactly what
       the saved document points at. */
    test('the file carries only the art the document still uses', () => {
        A.reset();
        const used = M.artstore.register(PNG, { name: 'cover.png' });
        M.artstore.register(PNG2, { name: 'orphan.png' });
        A.get().elements.push(M.element.create('image', { src: used }));

        const out = A.toProjectData();
        eq(Object.keys(out.art), [used], 'one entry');
        eq(out.art[used].name, 'cover.png', 'the right one');
        eq(M.artstore.size(), 2, 'while the LIVE store still holds both for undo');
    });

    test('one image used many times is stored once', () => {
        A.reset();
        const ref = M.artstore.register(PNG, { name: 'cover.png' });
        for (let i = 0; i < 5; i++) A.get().elements.push(M.element.create('image', { src: ref }));
        eq(Object.keys(A.toProjectData().art).length, 1, 'one payload, five elements');
        eq(A.usedRefs(), [ref], 'and one ref');
    });

    /* ── round trip ── */

    test('every element type survives a full round trip', () => {
        const before = JSON.parse(JSON.stringify(populate(M)));
        const text = A.stringify();

        A.reset();
        const res = A.parse(text);
        ok(!res.error, res.error);
        eq(res.doc.elements.length, before.elements.length, 'same count');
        eq(res.doc.elements, before.elements, 'and every field of every type');
    });

    test('the art survives with the document', () => {
        A.reset();
        const ref = M.artstore.register(PNG, { kind: 'raster', w: 1600, h: 1067, name: 'a.jpg' });
        A.get().elements.push(M.element.create('image', { src: ref, aspectRatio: 1.5 }));
        const text = A.stringify();

        A.reset();
        eq(M.artstore.get(ref), null, 'gone after a reset');
        A.parse(text);
        eq(M.artstore.get(ref), PNG, 'and back after a load');
        eq(M.artstore.meta(ref).name, 'a.jpg', 'with its metadata');
    });

    test('what stringify writes is what parse reads', () => {
        populate(M);
        const once = A.stringify();
        A.parse(once);
        eq(A.stringify(), once, 'stable across a round trip');
    });

    /* ── the merge-over-default rule ── */

    test('a file that omits a field keeps the DEFAULT, not a hole', () => {
        A.reset();
        const res = A.fromProjectData({ type: 'gatefold', version: '1.0', elements: [] });
        ok(!res.error, 'loads');
        eq(res.doc.bgColor, '#ffffff', 'bgColor defaulted rather than undefined');
        eq(res.doc.name, 'untitled', 'name defaulted');
        eq(res.doc.size, A.defaultSize(), 'size defaulted');
    });

    test('a partial size keeps the defaults for what it did not say', () => {
        A.reset();
        const res = A.fromProjectData({
            type: 'gatefold', version: '1.0', elements: [],
            size: { unit: 'px', trim: { w: 2048, h: 2048 } },
        });
        eq(res.doc.size.trim, { w: 2048, h: 2048 }, 'what the file said');
        eq(res.doc.size.bleed, 0, 'and a real value for what it did not');
        eq(res.doc.size.safe, 0, 'both of them');
    });

    test('a null field is treated as absent rather than adopted', () => {
        A.reset();
        const res = A.fromProjectData({
            type: 'gatefold', version: '1.0', elements: [], bgColor: null,
        });
        eq(res.doc.bgColor, '#ffffff', 'a null does not become the background');
    });

    /* ── refusals ── */

    test('a file from a newer major is refused, and says so usefully', () => {
        A.reset();
        const res = A.fromProjectData({ type: 'gatefold', version: '3.0', elements: [] });
        ok(res.error, 'refused');
        ok(/3\.0/.test(res.error) && /2\.x/.test(res.error),
            'naming both the file version and what this build reads');
    });

    test('a newer MINOR still opens', () => {
        A.reset();
        ok(!A.fromProjectData({ type: 'gatefold', version: '2.7', elements: [] }).error,
            'a minor bump is readable by design');
    });

    test("someone else's file is refused rather than half-loaded", () => {
        A.reset();
        for (const data of [{ type: 'deck-design', version: '2.0' }, {}, null, { version: '1.0' }]) {
            const res = A.fromProjectData(data);
            ok(res.error, `refused: ${JSON.stringify(data)}`);
            ok(!res.doc, 'and no document handed back');
        }
    });

    test('unreadable JSON is an error, not a throw', () => {
        A.reset();
        const res = A.parse('{ this is not json');
        ok(res.error, 'reported');
        ok(/JSON/i.test(res.error), 'and says what was wrong');
    });

    test('a refused file leaves the open document alone', () => {
        A.reset();
        A.get().name = 'work in progress';
        A.fromProjectData({ type: 'deck-design', version: '9.0' });
        eq(A.get().name, 'work in progress', 'not clobbered by a failed open');
    });

    /* ── the two counters ──
       The same bug at two levels. Both are asserted directly because both are
       silent: one shows the wrong picture, the other deletes the wrong
       element. */

    test('loading re-seeds the ART counter, so a new import cannot claim a loaded ref', () => {
        A.reset();
        const r1 = M.artstore.register(PNG, { name: 'one.png' });
        const r2 = M.artstore.register(PNG2, { name: 'two.png' });
        A.get().elements.push(M.element.create('image', { src: r1 }));
        A.get().elements.push(M.element.create('image', { src: r2 }));
        const text = A.stringify();

        A.reset();
        A.parse(text);
        const fresh = M.artstore.register('data:image/png;base64,NEWNEWNEW', { name: 'new.png' });
        ok(fresh !== r1 && fresh !== r2, `${fresh} does not collide with the loaded refs`);
        eq(M.artstore.get(r1), PNG, 'and the loaded art is still itself');
    });

    test('loading re-seeds the ELEMENT counter, so a new element cannot claim a loaded id', () => {
        A.reset();
        for (let i = 0; i < 12; i++) A.get().elements.push(M.element.create('rect', {}));
        const text = A.stringify();
        const loadedIds = A.get().elements.map((el) => el.id);

        A.reset();
        A.parse(text);
        const fresh = M.element.create('rect', {});
        ok(!loadedIds.includes(fresh.id),
            `id ${fresh.id} does not collide with the loaded ${loadedIds.length}`);
    });

    /* A FILE CAN SAY ANYTHING, and one number in it can take the renderer
       down. A text element whose fontSize ran away before resize() capped it
       would be rasterised at that size on the first frame after opening, so
       the crash would come back every time the wrecked project was opened.
       Repaired on load rather than refused: the cover is still wanted. */
    test('a runaway font size in a file is clamped on load', () => {
        A.reset();
        A.get().elements.push(M.element.create('text', { text: 'A', fontSize: 40000 }));
        const text = A.stringify();

        A.reset();
        A.parse(text);
        const el = A.get().elements.find((e) => e.type === 'text');
        eq(el.fontSize, M.geometry.clampFontSize(40000, A.canvasSize(A.get().size)),
            'clamped against this document’s own canvas');
        ok(el.fontSize <= A.canvasSize(A.get().size), 'and no larger than the cover');
    });

    test('an ordinary font size survives a round trip untouched', () => {
        A.reset();
        A.get().elements.push(M.element.create('text', { text: 'A', fontSize: 72 }));
        const text = A.stringify();
        A.reset();
        A.parse(text);
        eq(A.get().elements.find((e) => e.type === 'text').fontSize, 72, 'unchanged');
    });
    /* ── housekeeping ── */

    test('the snapshot is deep, so undo cannot alias the live document', () => {
        A.reset();
        A.get().elements.push(M.element.create('rect', { x: 1 }));
        const snap = A.clone();
        A.get().elements[0].x = 999;
        eq(snap.elements[0].x, 1, 'the snapshot did not move with it');
    });

    test('reset clears the art and the ids as well as the document', () => {
        A.reset();
        M.artstore.register(PNG, { name: 'x.png' });
        A.get().elements.push(M.element.create('rect', {}));
        A.reset();
        eq(A.get().elements, [], 'no elements');
        eq(M.artstore.size(), 0, 'no art');
        eq(M.element.create('rect', {}).id, 1, 'and ids start again');
    });

    test('the extension and the large-file threshold are named, not inlined', () => {
        eq(A.EXT, 'gatefold', 'extension');
        ok(A.LARGE_FILE_BYTES > 1e6, 'and a size worth warning about');
    });

    /* ── print formats in the file ── */

    /* The bump is not about a shape change — there isn't one — it is so a
       shipped 1.x REFUSES a J-card instead of painting a 101-pixel canvas
       with every element off it and saying nothing. */
    test('the format is 2.0, and a 1.0 file still opens with no migration at all', () => {
        eq(A.FORMAT_VERSION, '2.0', 'print formats bumped the major');
        A.reset();
        const res = A.fromProjectData({
            type: 'gatefold', version: '1.0', name: 'old', bgColor: '#123456',
            size: { unit: 'px', trim: { w: 2048, h: 2048 }, bleed: 0, safe: 0 },
            elements: [M.element.create('rect', { x: 5, y: 6 })],
        });
        ok(!res.error, 'opened');
        eq(res.doc.name, 'old', 'name intact');
        eq(res.doc.bgColor, '#123456', 'colour intact');
        eq(res.doc.size.trim.w, 2048, 'and the size it was saved at');
        eq(res.doc.elements.length, 1, 'with its element');
    });

    test('a J-card round-trips through the file, panels and all', () => {
        A.reset();
        A.get().size = M.formats.sizeOf('jcard-jp2');
        A.get().elements.push(M.element.create('text', { x: 10, y: 20, text: 'SIDE A' }));
        const res = A.parse(A.stringify());
        ok(!res.error, 'reopened');
        eq(M.formats.matchId(res.doc.size), 'jcard-jp2', 'and it is still a JP2');
        eq(res.doc.size.unit, 'mm', 'still millimetres');
        eq(res.doc.size.dpi, 300, 'still at print resolution');
        eq(res.doc.size.panelAxis, 'y', 'still stacking');
        eq(res.doc.size.panels.length, 5, 'with all five panels');
        eq(res.doc.size.panels.map((p) => p.name), ['FRONT', 'SPINE', 'BACK', 'FLAP 1', 'FLAP 2'],
            'named, and in order');
    });

    /* MERGE OVER A FULL DEFAULT, one level down. A file that names a trim box
       and omits the rest must leave the defaults standing rather than leave
       holes — the new sub-fields get the same treatment as the old ones by
       construction, which is why none of this needed a migration. */
    test('a print size that omits fields keeps the defaults, not undefined', () => {
        A.reset();
        const res = A.fromProjectData({
            type: 'gatefold', version: '2.0',
            size: { unit: 'mm', trim: { w: 120, h: 120 }, panelAxis: 'x', panels: [{ name: 'A', len: 120 }] },
            elements: [],
        });
        ok(!res.error, 'opened');
        eq(res.doc.size.bleed, 0, 'the default bleed stands rather than becoming undefined');
        eq(res.doc.size.safe, 0, 'and the default safe margin');
        eq(M.formats.metrics(res.doc.size).dpi, 300, 'and a missing dpi falls back at the boundary');
        eq(res.doc.size.panels.length, 1, 'while the fields it DID name ride in');
    });

    /* The old clamp used canvasSize, which on a J-card is 101.6 — every piece
       of text in the file would have been clamped to a hundredth of the card,
       and the repair would have been worse than the damage. */
    test('a runaway font size is clamped to the CARD, not to its width in millimetres', () => {
        A.reset();
        const res = A.fromProjectData({
            type: 'gatefold', version: '2.0',
            size: M.formats.sizeOf('jcard-jp0'),
            elements: [{ id: 1, type: 'text', text: 'X', font: 'Press Start 2P', fontSize: 40000 }],
        });
        eq(res.doc.elements[0].fontSize, 1237, 'the trim, floored');
        ok(res.doc.elements[0].fontSize > 1000, 'and nowhere near 101');
    });

    /* Object.assign can add a key and cannot remove one, so anything that
       PATCHED doc.size would leave panels behind and the square would draw
       fold lines it does not have. */
    test('switching a J-card back to a square leaves nothing of the J-card behind', () => {
        A.reset();
        A.get().size = M.formats.sizeOf('jcard-jp0');
        A.get().size = A.squareSize(512);
        ok(!('panels' in A.get().size), 'no panels survive');
        ok(!('panelAxis' in A.get().size), 'nor an axis');
        ok(!('dpi' in A.get().size), 'nor a dpi');
        eq(M.panels.lines(M.formats.metrics(A.get().size)).filter((l) => l.kind === 'fold').length, 0,
            'and so the square draws no folds');
    });

    test('the default document is untouched by any of this', () => {
        eq(M.formats.metrics(A.emptyDoc().size).surface, { w: 1024, h: 1024 },
            'still a 1024 square, and the surface is still the trim');
    });
}
