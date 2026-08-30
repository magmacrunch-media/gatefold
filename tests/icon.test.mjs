import { test, eq, ok } from './kit/assert.mjs';
import { inflateSync } from 'node:zlib';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = join(ROOT, 'desktop', 'src-tauri', 'icons');

/* THE PALETTE, from scripts/make-icon.mjs, which takes it from
   app/ui/style.css :root. Kept here as literals rather than imported: a test
   that reads its expectation from the thing it is testing cannot fail. */
const PALETTE = [
    [0x08, 0x08, 0x08],   // --bg     ground
    [0xff, 0x3d, 0x6e],   // --rose   the sleeve's edge
    [0x00, 0xf5, 0xff],   // --cyan   the cover art
    [0xf0, 0xea, 0xd8],   // --text   sleeve stock
    [0x15, 0x15, 0x1d],   // --panel  the record
];

/** Minimal PNG reader: 8-bit RGBA, no interlacing, which is all we write. */
function decodePNG(path) {
    const buf = readFileSync(path);
    let off = 8;
    let width = 0;
    let height = 0;
    const idat = [];

    while (off < buf.length) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString('ascii', off + 4, off + 8);
        if (type === 'IHDR') {
            width = buf.readUInt32BE(off + 8);
            height = buf.readUInt32BE(off + 12);
            if (buf[off + 16] !== 8 || buf[off + 17] !== 6) {
                throw new Error(`${path}: expected 8-bit RGBA`);
            }
        } else if (type === 'IDAT') {
            idat.push(buf.subarray(off + 8, off + 8 + len));
        }
        off += 12 + len;
    }

    const raw = inflateSync(Buffer.concat(idat));
    const bpp = 4;
    const stride = width * bpp;
    const px = Buffer.alloc(height * stride);

    // Undo the per-scanline filters. All five, because the encoder is free to
    // pick any of them and zlib's choice is not ours to predict.
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (1 + stride)];
        const line = raw.subarray(y * (1 + stride) + 1, (y + 1) * (1 + stride));
        for (let i = 0; i < stride; i++) {
            const a = i >= bpp ? px[y * stride + i - bpp] : 0;
            const b = y > 0 ? px[(y - 1) * stride + i] : 0;
            const c = i >= bpp && y > 0 ? px[(y - 1) * stride + i - bpp] : 0;
            let v = line[i];
            if (filter === 1) v += a;
            else if (filter === 2) v += b;
            else if (filter === 3) v += (a + b) >> 1;
            else if (filter === 4) {
                const p = a + b - c;
                const pa = Math.abs(p - a);
                const pb = Math.abs(p - b);
                const pc = Math.abs(p - c);
                v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            px[y * stride + i] = v & 0xff;
        }
    }
    return { width, height, px };
}

function colours(img) {
    const seen = new Map();
    for (let i = 0; i < img.px.length; i += 4) {
        const key = `${img.px[i]},${img.px[i + 1]},${img.px[i + 2]},${img.px[i + 3]}`;
        seen.set(key, (seen.get(key) || 0) + 1);
    }
    return seen;
}

function inPalette(r, g, b, a) {
    if (a === 0) return true;                       // transparent is allowed
    if (a !== 255) return false;                    // nothing is semi-transparent
    return PALETTE.some((p) => p[0] === r && p[1] === g && p[2] === b);
}

export default function () {
    test('the icon set exists', () => {
        for (const f of ['32x32.png', '64x64.png', '128x128.png', '128x128@2x.png',
            'icon.png', 'icon.ico']) {
            ok(existsSync(join(ICONS, f)), `icons/${f} exists`);
            ok(statSync(join(ICONS, f)).size > 0, `icons/${f} is not empty`);
        }
    });

    test('the icons are the sizes they are named', () => {
        for (const [name, n] of Object.entries({
            '32x32.png': 32, '64x64.png': 64, '128x128.png': 128,
            '128x128@2x.png': 256, 'icon.png': 512,
        })) {
            const img = decodePNG(join(ICONS, name));
            eq([img.width, img.height], [n, n], name);
        }
    });

    /* ── THE ONE THAT MATTERS ──
       `tauri icon` scales with a SMOOTH filter. Measured on this very design,
       it turned five colours into 180 at 32x32 — and 32 is the taskbar size,
       so that is the one everybody looks at. The third command of the pipeline
       overwrites it with an exact nearest-neighbour render.

       deck-forge documents this as prose — "a correct 32x32.png has 5 distinct
       colours" — and has no test, so skipping the third command there passes
       `npm run check` in silence.

       Asserting PALETTE CONFORMANCE rather than a colour COUNT is deliberate.
       A count can pass for the wrong reason; a blend cannot be in the palette,
       because a blend of two palette colours is by construction a third thing.
       And the failure message names the offending pixel, which is the
       difference between "the icon is wrong" and "you skipped step three". */
    test('every pixel of 32x32.png is a palette colour — step three was run', () => {
        const img = decodePNG(join(ICONS, '32x32.png'));
        const bad = [];
        for (let i = 0; i < img.px.length; i += 4) {
            const [r, g, b, a] = [img.px[i], img.px[i + 1], img.px[i + 2], img.px[i + 3]];
            if (!inPalette(r, g, b, a)) {
                const n = i / 4;
                bad.push(`(${n % 32},${Math.floor(n / 32)}) rgba(${r},${g},${b},${a})`);
            }
        }
        ok(bad.length === 0,
            bad.length
                ? `${bad.length} resampled pixels — re-run:\n`
                    + '        node scripts/make-icon.mjs --icons desktop/src-tauri/icons\n'
                    + `      first offenders: ${bad.slice(0, 3).join('  ')}`
                : 'clean');
    });

    test('the larger exact sizes are clean too', () => {
        for (const name of ['64x64.png', '128x128.png', '128x128@2x.png', 'icon.png']) {
            const img = decodePNG(join(ICONS, name));
            let bad = 0;
            for (let i = 0; i < img.px.length; i += 4) {
                if (!inPalette(img.px[i], img.px[i + 1], img.px[i + 2], img.px[i + 3])) bad++;
            }
            eq(bad, 0, `${name} has no resampled pixels`);
        }
    });

    test('the design actually uses its palette, rather than being one flat square', () => {
        const seen = colours(decodePNG(join(ICONS, '32x32.png')));
        ok(seen.size >= 4, `${seen.size} distinct colours — the art is present`);
        ok(seen.size <= PALETTE.length, `${seen.size} colours, palette has ${PALETTE.length}`);
    });

    /* sprite-forge's favicon.svg IS the source of its desktop icon set;
       deck-forge broke that link and has no favicon at all. One grid, both
       outputs — so the tab and the taskbar cannot drift apart. */
    test('the favicon comes from the same grid as the icon', () => {
        const fav = decodePNG(join(ROOT, 'app', 'ui', 'favicon.png'));
        eq([fav.width, fav.height], [32, 32], 'favicon is 32x32');
        const icon = decodePNG(join(ICONS, '32x32.png'));
        ok(fav.px.equals(icon.px), 'favicon.png and icons/32x32.png are the same pixels');
    });

    /* The stamped app inherits its donor's icons, because tauri-build refuses
       to compile without them and new-app.mjs is documented as
       `--from ../sprite-forge`. Every app on the kit ships the pink robot
       until someone replaces it, and this app did for its first commit. */
    test('this is not still the donor app’s icon', () => {
        const donor = join(ROOT, '..', 'sprite-forge', 'desktop', 'src-tauri', 'icons', '32x32.png');
        if (!existsSync(donor)) return;   // sibling not checked out; nothing to compare
        const mine = readFileSync(join(ICONS, '32x32.png'));
        ok(!mine.equals(readFileSync(donor)), 'the icon is this app’s own');
    });
}
