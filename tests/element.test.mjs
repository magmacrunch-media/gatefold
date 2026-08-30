import { test, eq, ok } from './kit/assert.mjs';

export default function (M) {
    const E = M.element;

    test('every type is one of the four families', () => {
        eq(E.TYPES.length, E.SHAPE_TYPES.length + E.WAVE_TYPES.length + 3,
            'shapes + waves + text/image/clipart');
        for (const t of E.WAVE_TYPES) ok(E.isWave(t), `${t} is a wave`);
        for (const t of E.SHAPE_TYPES) ok(!E.isWave(t), `${t} is not a wave`);
        ok(!E.isWave('text') && !E.isWave('image'), 'text and image are not waves');
    });

    test('a type only carries the fields it has a use for', () => {
        const rect = E.defaultsFor('rect');
        ok(!('wavelength' in rect), 'a rectangle has no frequency');
        ok(!('text' in rect), 'a rectangle has no text');

        const sine = E.defaultsFor('sine');
        eq(sine.wavelength, 5, 'a wave has a frequency');
        eq(sine.waveMode, 'filled', 'and a mode');
        eq(sine.steps, 5, 'and a step count');
        eq(sine.duty, 0.2, 'and a duty cycle');

        const text = E.defaultsFor('text');
        eq(text.font, 'Press Start 2P', 'text has a face');
        eq(text.fontSize, 48, 'and a size');
        ok(!('wavelength' in text), 'and no wave fields');

        const image = E.defaultsFor('image');
        eq(image.src, null, 'an image starts with no art ref');
        eq(image.aspectRatio, 1, 'and a square aspect until measured');
    });

    test('every element is visible and unnamed unless told otherwise', () => {
        for (const t of E.TYPES) {
            const el = E.defaultsFor(t);
            eq(el.visible, true, `${t} defaults visible`);
            eq(el.name, '', `${t} defaults unnamed`);
        }
    });

    test('create takes the caller’s style and keeps unknown keys', () => {
        E.resetIds();
        const el = E.create('rect', { x: 5, y: 6, fill: 'none', somethingNew: 7 });
        eq(el.type, 'rect', 'type');
        eq(el.x, 5, 'x from props');
        eq(el.fill, 'none', 'style from props');
        eq(el.stroke, '#000000', 'and the default for what props did not say');
        eq(el.somethingNew, 7, 'a key ahead of this file is kept, not dropped');
    });

    test('create cannot be talked out of its own type', () => {
        E.resetIds();
        const el = E.create('circle', { type: 'rect' });
        eq(el.type, 'circle', 'the argument wins over a stray prop');
    });

    /* Dragging up and to the left produces a negative extent, and x,y is the
       top-left everywhere else in the app. */
    test('a backwards drag folds into the origin', () => {
        eq(E.normalize({ type: 'rect', x: 100, y: 100, w: -40, h: -20 }),
            { type: 'rect', x: 60, y: 80, w: 40, h: 20 }, 'both axes fold');
        eq(E.normalize({ type: 'rect', x: 10, y: 10, w: 5, h: -5 }),
            { type: 'rect', x: 10, y: 5, w: 5, h: 5 }, 'one axis folds');
    });

    /* NOT an oversight. For a line w,h is a direction, not a size; folding one
       silently flips a line drawn up-and-right into one drawn down-and-left. */
    test('a line keeps its sign, because for a line w,h is a direction', () => {
        eq(E.normalize({ type: 'line', x: 100, y: 100, w: -40, h: -20 }),
            { type: 'line', x: 100, y: 100, w: -40, h: -20 }, 'untouched');
    });

    /* ── the data-loss assertion ──
       Open a file holding ids 1..12 into a session whose counter is 0 and the
       next new element is id 1 as well. Selection is
       `elements.find(e => e.id === selectedId)`, so it then returns the older
       of the pair and Delete removes the wrong one. The web tool could never
       hit this because it could not load anything; a format makes it real. */
    test('loading a file pushes the id counter past every id in it', () => {
        E.resetIds();
        const loaded = [{ id: 3 }, { id: 12 }, { id: 7 }];
        eq(E.seedIds(loaded), 12, 'seeded to the highest id present, not the last');

        const fresh = E.create('rect', {});
        eq(fresh.id, 13, 'the next new element clears the file');
        ok(!loaded.some((el) => el.id === fresh.id), 'and cannot collide with a loaded one');
    });

    test('seeding is absolute, not cumulative', () => {
        E.resetIds();
        E.seedIds([{ id: 50 }]);
        E.seedIds([{ id: 4 }]);
        eq(E.create('rect', {}).id, 5, 'a second load re-seeds to ITS ids, not the high-water mark');
    });

    test('seeding survives an empty or ragged element list', () => {
        E.resetIds();
        eq(E.seedIds([]), 0, 'an empty document seeds to zero');
        eq(E.create('rect', {}).id, 1, 'and ids start at one');

        E.resetIds();
        eq(E.seedIds([{ id: 'x' }, {}, null, { id: 4 }]), 4, 'junk ids are skipped, not counted');
    });

    test('ids are unique across a run', () => {
        E.resetIds();
        const seen = new Set();
        for (let i = 0; i < 200; i++) seen.add(E.create('rect', {}).id);
        eq(seen.size, 200, 'no repeats');
    });

    /* An image carries fill: 'none', stroke: 'none' as placeholders, and
       ui/props.js reads a selected element into the panel that also
       decides what the NEXT element is born with. Reading those two back
       left every later shape and every later line of text with no fill
       and no stroke — created, counted, selectable and invisible. This is
       the predicate that stops it. */
    test('an image is not stylable; everything else is', () => {
        eq(E.stylable('image'), false, 'an image draws its own pixels');
        for (const type of ['text', 'rect', 'circle', 'line', 'clipart', 'star']) {
            eq(E.stylable(type), true, type + ' has a fill and a stroke');
        }
        for (const type of E.WAVE_TYPES) {
            eq(E.stylable(type), true, type + ' has a fill and a stroke');
        }
    });

    test('an unknown type is stylable', () => {
        eq(E.stylable('sticker'), true, 'a type this list has not heard of is far more'
            + ' likely to be a shape than a second kind of bitmap, and guessing that way'
            + ' fails visibly rather than silently');
        eq(E.stylable(undefined), true, 'and so is nothing at all');
    });

    test('describe labels a text element by its first line', () => {
        eq(E.describe({ type: 'text', text: 'SIDE A\nSIDE B' }), 'SIDE A', 'first line only');
        eq(E.describe({ type: 'rect' }), '', 'a shape has nothing to say');
    });
}
