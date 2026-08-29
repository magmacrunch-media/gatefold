import { test, eq, ok } from './kit/assert.mjs';

export default function (M) {
    const P = M.palette;

    test('a hex colour is six digits with a hash', () => {
        ok(P.isValidHex('#ff3d6e'), 'lowercase');
        ok(P.isValidHex('#FF3D6E'), 'uppercase');
        ok(!P.isValidHex('ff3d6e'), 'no hash is not yet valid');
        ok(!P.isValidHex('#f36'), 'three digits is not the form this app stores');
        ok(!P.isValidHex('#ff3d6ee'), 'seven digits');
        ok(!P.isValidHex('#gg3d6e'), 'not hex digits');
        ok(!P.isValidHex(''), 'empty');
    });

    /* The auto-prefix is the whole reason normalizeHex exists rather than a
       bare regex test: people paste 'ff3d6e' out of a palette far more often
       than '#ff3d6e', and the web tool handled that in four separate places. */
    test('a bare six-digit value is a colour with the hash added', () => {
        eq(P.normalizeHex('ff3d6e'), '#ff3d6e', 'prefixed');
        eq(P.normalizeHex('#ff3d6e'), '#ff3d6e', 'already prefixed');
        eq(P.normalizeHex('  ff3d6e  '), '#ff3d6e', 'trimmed');
        eq(P.normalizeHex('FF3D6E'), '#ff3d6e', 'lowercased so two spellings are one value');
    });

    /* Null is "leave it alone", not "error". The hex field is edited a
       character at a time, so most keystrokes are not yet a colour and must
       not be treated as a failure. */
    test('anything that is not yet a colour is null, not a throw', () => {
        eq(P.normalizeHex('#ff'), null, 'half typed');
        eq(P.normalizeHex('nonsense'), null, 'not a colour');
        eq(P.normalizeHex(''), null, 'empty');
        eq(P.normalizeHex(null), null, 'null');
        eq(P.normalizeHex(undefined), null, 'undefined');
    });

    /* 'none' is a real value in the element model — it is what a shape with
       its fill switched off carries — so normalize must pass it through and
       must not treat it as a colour. */
    test("'none' survives normalisation and is not a hex", () => {
        eq(P.normalizeHex('none'), 'none', 'passed through');
        ok(!P.isValidHex('none'), 'but it is not a hex value');
        eq(P.NONE, 'none', 'and it is named');
    });

    /* padStart is load-bearing: '#000' is a valid CSS colour and an INVALID
       value for <input type="color">, so without the pad the picker would
       silently snap to black while the hex field showed something else. */
    test('a dark pixel is #000000, not #000', () => {
        eq(P.rgbToHex(0, 0, 0), '#000000', 'black pads to six digits');
        eq(P.rgbToHex(1, 2, 3), '#010203', 'every channel pads');
        eq(P.rgbToHex(255, 255, 255), '#ffffff', 'white');
        eq(P.rgbToHex(255, 61, 110), '#ff3d6e', 'the app accent');
    });

    test('channel values are clamped and rounded', () => {
        eq(P.rgbToHex(-5, 300, 127.6), '#00ff80', 'out of range clamps, fractions round');
    });

    test('everything rgbToHex produces is something isValidHex accepts', () => {
        for (let v = 0; v < 256; v += 17) {
            ok(P.isValidHex(P.rgbToHex(v, 255 - v, (v * 3) % 256)), `round trip at ${v}`);
        }
    });
}
