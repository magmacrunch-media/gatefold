import { test, eq, ok } from './kit/assert.mjs';

/* Copied from deck-press/tests/artstore.test.mjs alongside the module itself.
   Both move up to magma-kit in 0.2.0 — see the header on core/artstore.js —
   and until they do, this file is deliberately not diverged from its twin.

   The assertion that matters most is the last one: adopt() re-seeding the ref
   counter. A file holding img1..img9 loaded into a store whose counter is 0
   would have the next import allocate img1, and register() would hand back the
   LOADED art, so the element silently shows the wrong picture. */

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANS';
const PNG2 = 'data:image/png;base64,ZZZZZZZZZZZZZZZZ';
const SVG = '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';

export default function (M) {
    const A = M.artstore;

    test('a payload registers and comes back', () => {
        A.reset();
        const ref = A.register(PNG, { kind: 'raster', w: 1200, h: 1680, name: 'ace.png' });
        ok(ref, 'got a ref');
        eq(A.get(ref), PNG, 'the payload round-trips');
        eq(A.meta(ref).w, 1200, 'and the metadata with it');
    });

    /* The whole point of the indirection: a card record must never carry bytes.
       The ref is a dozen characters where the payload is megabytes, and the
       undo stack multiplies whatever the document holds by its depth. */
    test('meta never hands back the payload', () => {
        A.reset();
        const ref = A.register(PNG, { name: 'a.png' });
        ok(!('payload' in A.meta(ref)), 'meta is metadata, not bytes');
        ok(A.get(ref), 'bytes are available, but only when asked for by name');
    });

    test('the same payload twice is one copy and one ref', () => {
        A.reset();
        const a = A.register(PNG, { name: 'first.png' });
        const b = A.register(PNG, { name: 'again.png' });
        eq(a, b, 'the same ref comes back');
        eq(A.size(), 1, 'and only one copy is held');
    });

    test('different payloads never share a ref', () => {
        A.reset();
        const a = A.register(PNG, {});
        const b = A.register(PNG2, {});
        ok(a !== b, 'distinct refs');
        eq(A.size(), 2);
        eq(A.get(a), PNG);
        eq(A.get(b), PNG2);
    });

    test('a missing ref is null, not a throw', () => {
        A.reset();
        eq(A.get('nope'), null);
        eq(A.meta('nope'), null);
        eq(A.has('nope'), false);
    });

    test('registering nothing registers nothing', () => {
        A.reset();
        eq(A.register('', {}), null);
        eq(A.register(null, {}), null);
        eq(A.size(), 0);
    });

    /* The live store keeps everything on purpose — undo can resurrect a card
       whose art was cleared — but the FILE only needs what the document still
       points at. */
    test('serialize prunes to what is referenced, and the store keeps the rest', () => {
        A.reset();
        const keep = A.register(PNG, { name: 'keep.png' });
        const drop = A.register(PNG2, { name: 'drop.png' });
        const out = A.serialize([keep]);
        eq(Object.keys(out), [keep], 'only the referenced entry is written');
        eq(out[keep].payload, PNG, 'with its bytes');
        eq(A.get(drop), PNG2, 'and the unreferenced one is still in the live store');
    });

    test('serialize with no argument writes everything', () => {
        A.reset();
        A.register(PNG, {});
        A.register(PNG2, {});
        eq(Object.keys(A.serialize()).length, 2);
    });

    /* THE DATA-LOSS BUG, asserted directly.
       A file holding img1..img3, adopted into a store whose counter is still 0,
       would have the next import allocate img1 — which already exists, so
       register() hands back the LOADED art and the card silently shows the
       wrong picture. adopt() must re-seed the counter past the highest ref it
       loaded. */
    test('adopt re-seeds the counter so a later import cannot collide', () => {
        A.reset();
        A.adopt({
            img1: { kind: 'raster', payload: PNG, name: 'one.png' },
            img2: { kind: 'raster', payload: PNG2, name: 'two.png' },
            img3: { kind: 'vector', payload: SVG, name: 'three.svg' },
        });
        eq(A.size(), 3, 'all three adopted');
        const fresh = A.register('data:image/png;base64,NEWNEWNEW', { name: 'new.png' });
        ok(!['img1', 'img2', 'img3'].includes(fresh),
            `a fresh import got ${fresh}, which collides with a loaded one`);
        eq(A.get('img1'), PNG, 'and the loaded art is untouched');
        eq(A.get(fresh), 'data:image/png;base64,NEWNEWNEW', 'as is the new art');
    });

    test('adopt replaces rather than merges', () => {
        A.reset();
        A.register(PNG, {});
        A.adopt({ img9: { payload: PNG2 } });
        eq(A.size(), 1, 'the previous document’s art is gone');
        eq(A.get('img9'), PNG2);
    });

    test('adopt survives a malformed or absent map', () => {
        A.reset();
        A.adopt(null);
        eq(A.size(), 0);
        A.adopt({ img1: null, img2: { name: 'no payload' }, img3: { payload: PNG } });
        eq(A.size(), 1, 'only the entry with bytes was taken');
    });

    test('adopted payloads still dedupe against a later import', () => {
        A.reset();
        A.adopt({ img4: { payload: PNG, name: 'loaded.png' } });
        eq(A.register(PNG, { name: 'same-again.png' }), 'img4',
            'importing bytes the file already had reuses its ref');
        eq(A.size(), 1);
    });

    test('weight reports what a save would cost', () => {
        A.reset();
        eq(A.weight(), 0);
        A.register(PNG, {});
        eq(A.weight(), PNG.length);
        A.register(PNG2, {});
        eq(A.weight(), PNG.length + PNG2.length);
    });

    test('vector art is stored as source text, not as a data URL', () => {
        A.reset();
        const ref = A.register(SVG, { kind: 'vector', w: 10, h: 10 });
        eq(A.get(ref), SVG, 'the source came back verbatim');
        eq(A.meta(ref).kind, 'vector');
        ok(!A.get(ref).startsWith('data:'),
            'staying text is what keeps it inlinable, and inlining is what keeps it vector');
    });
}
