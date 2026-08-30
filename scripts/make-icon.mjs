// scripts/make-icon.mjs — generate the icon source PNG from a pixel grid.
//
// The icon is CODE rather than a binary nobody can open: the design is a grid
// of palette indices below, so changing it is an edit rather than a round trip
// through an image editor and a re-export at eight sizes.
//
// Ported from deck-press/scripts/make-icon.mjs. Everything below the DESIGNS
// registry is that file unchanged; the design and the palette are this app's.
// It is the second copy of this script in the family, which by the kit's own
// rule makes it a promotion candidate — but magma-kit vendors js/ and testkit/
// only, so a build script would be a new category of shared file with a new
// sync path. Noted in AGENTS.md rather than designed now.
//
// THREE STEPS, and the third is not optional:
//
//   node scripts/make-icon.mjs --size 1024 --out icon-source.png
//   cd desktop && npx tauri icon ../icon-source.png && cd ..
//   node scripts/make-icon.mjs --icons desktop/src-tauri/icons
//
// The CLI produces every platform variant, which is what we want, but it scales
// with a smooth filter — measured on deck-press, it turned a five-colour design
// into 165 colours at 32x32, which is the taskbar size. The third command
// overwrites every size that is a whole multiple of the 32px grid with an exact
// nearest-neighbour render, and rebuilds icon.ico from those.
//
// tests/icon.test.mjs asserts the result: every pixel of 32x32.png is either
// transparent or exactly one of the palette colours below. Skip step three and
// that fails, because a smooth filter produces blends which are by definition
// not in the palette.
//
// Dev-time only: ESM on Node, never shipped, never loaded by the app.

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

/* THE APP'S OWN TOKENS, read off app/ui/style.css :root — not the family
   palette approximated. deck-press draws its icon in #ff2d78 / #00e5ff /
   #0d0028, which are near-misses for the tokens its own stylesheet uses: close
   enough to look right, different enough that the icon and the app are not
   actually the same colours. These five ARE the app. */
const PALETTE = {
    '.': null,                 // transparent, or --bg when one is given
    'k': '#080808',            // --bg      ground
    'p': '#ff3d6e',            // --rose    the sleeve's edge
    'c': '#00f5ff',            // --cyan    the cover art
    'w': '#f0ead8',            // --text    sleeve stock
    'd': '#15151d',            // --panel   the record
};

/* A 32x32 grid, because that is the smallest size the icon is ever shown at:
   designing AT that resolution means the small case is the one being drawn
   rather than the one being hoped for. Everything larger is a whole-number
   scale of it, so the art stays crisp instead of being resampled. */
const N = 32;

function blank() {
    return Array.from({ length: N }, () => Array.from({ length: N }, () => '.'));
}

function put(grid, x, y, ch) {
    if (x >= 0 && x < N && y >= 0 && y < N) grid[y][x] = ch;
}

function fill(grid, x, y, w, h, ch) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(grid, i, j, ch);
}

/**
 * A filled circle by distance test.
 *
 * `+ 0.5` on the radius is what stops a small disc coming out as an octagon:
 * without it the cardinal edge pixels fall exactly on the boundary and the
 * comparison drops them.
 */
function disc(grid, cx, cy, r, ch) {
    for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
            const dx = x - cx;
            const dy = y - cy;
            if (dx * dx + dy * dy <= (r + 0.5) * (r + 0.5)) put(grid, x, y, ch);
        }
    }
}

const DESIGNS = {
    /* An open gatefold: one piece of card, folded down the middle, with the
       record on one side and the artwork on the other. That is the app's name
       and the app's subject in one shape.

       SQUARE panels, and that is load-bearing rather than decorative.
       deck-press's icon is two TALL overlapping cards — "0.70, a card's
       proportions" — and at 32px two apps whose icons are both a pair of
       rectangles are hard to tell apart in a taskbar. A record sleeve is
       square, a playing card is not, and the disc is a shape deck-press's icon
       has nothing like.

       Drawn programmatically rather than typed as an ASCII picture: a
       hand-aligned rectangle is off by a pixel somewhere. */
    gatefold() {
        const g = blank();

        /* EVEN width, so the mark is symmetric in an even canvas: 30 across
           with a 1px margin either side. An odd width would centre the fold on
           a true column but leave 1px on one side and 2px on the other, and a
           lopsided icon is more obvious at 32px than a 2px spine is.

           15 tall, because an opened gatefold is a 2:1 object and there is no
           honest way to make it fill a square. Sat one row above centre —
           optically that reads as centred for a heavy shape, where true centre
           reads as slightly low. */
        const x = 1, y = 8, w = 30, h = 15;

        // One piece of card with an edge, not two separate panels: the whole
        // point of a gatefold is that it is a single sheet.
        fill(g, x, y, w, h, 'p');
        fill(g, x + 1, y + 1, w - 2, h - 2, 'w');

        // The spine, two columns down the middle.
        fill(g, 15, y + 1, 2, h - 2, 'p');

        // LEFT: the record. Near-black rather than pure black so it reads as
        // an object sitting ON the stock rather than a hole punched through it.
        disc(g, 8, 15, 5, 'd');
        disc(g, 8, 15, 2, 'p');                    // the label
        put(g, 8, 15, 'w');                        // the spindle hole

        // RIGHT: the cover art above, two lines of liner notes below. This is
        // the half the app actually edits.
        fill(g, 18, 10, 11, 6, 'c');
        fill(g, 18, 18, 11, 1, 'p');
        fill(g, 18, 20, 8, 1, 'p');

        return g;
    },
};

function hexToRGB(hex) {
    return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
    ];
}

/** CRC32, for PNG chunks. Node's zlib.crc32 exists on 20.15+; this is the fallback. */
let TABLE = null;
function crc32(buf) {
    if (!TABLE) {
        TABLE = new Int32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            TABLE[n] = c;
        }
    }
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}

/** RGBA pixels -> a PNG file. Filter byte 0 on every scanline; no interlacing. */
function encodePNG(width, height, rgba) {
    const raw = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
        const row = y * (1 + width * 4);
        raw[row] = 0;
        rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;    // bit depth
    ihdr[9] = 6;    // RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

/**
 * Scale a grid up by whole pixels — nearest neighbour, never interpolated.
 * A blurred pixel-art icon is the one thing this must not produce.
 */
function render(grid, size, background) {
    const n = grid.length;
    if (size % n !== 0) {
        throw new Error(`size ${size} is not a whole multiple of the ${n}px grid`);
    }
    const scale = size / n;
    const rgba = Buffer.alloc(size * size * 4);
    const bg = background ? hexToRGB(background) : null;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const cell = grid[Math.floor(y / scale)][Math.floor(x / scale)];
            const hex = PALETTE[cell];
            const i = (y * size + x) * 4;
            if (hex) {
                const [r, g, b] = hexToRGB(hex);
                rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
            } else if (bg) {
                rgba[i] = bg[0]; rgba[i + 1] = bg[1]; rgba[i + 2] = bg[2]; rgba[i + 3] = 255;
            }
        }
    }
    return rgba;
}

/**
 * A Windows .ico wrapping PNG entries.
 *
 * Only whole multiples of the 32px grid go in, which is why 16 and 48 are
 * absent: they would have to be resampled and resampling is the entire problem
 * this file exists to avoid. Windows picks the nearest available size and
 * downscales for a 16px slot itself, which is no worse than shipping a blurred
 * one — and it is the 32px taskbar entry that is actually looked at.
 */
function encodeICO(pngs) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);           // reserved
    header.writeUInt16LE(1, 2);           // 1 = icon
    header.writeUInt16LE(pngs.length, 4);

    const entries = [];
    let offset = 6 + pngs.length * 16;
    for (const { size, data } of pngs) {
        const e = Buffer.alloc(16);
        e[0] = size >= 256 ? 0 : size;    // 0 means 256
        e[1] = size >= 256 ? 0 : size;
        e[2] = 0;                          // palette size
        e[3] = 0;                          // reserved
        e.writeUInt16LE(1, 4);             // colour planes
        e.writeUInt16LE(32, 6);            // bits per pixel
        e.writeUInt32LE(data.length, 8);
        e.writeUInt32LE(offset, 12);
        entries.push(e);
        offset += data.length;
    }
    return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const args = process.argv.slice(2);
const arg = (name, fallback) => {
    const i = args.indexOf('--' + name);
    return i === -1 ? fallback : args[i + 1];
};

const design = arg('design', 'gatefold');
const size = Number(arg('size', 1024));
const out = arg('out', 'icon-source.png');
const background = arg('bg', '#080808');

const make = DESIGNS[design];
if (!make) {
    console.error(`unknown design ${design}; have: ${Object.keys(DESIGNS).join(', ')}`);
    process.exit(1);
}
const grid = make();
const png = (n) => encodePNG(n, n, render(grid, n, background));

/* --print draws the grid to the terminal. The whole reason the design is code
   is that it can be looked at without a build. */
if (args.includes('--print')) {
    for (const row of grid) console.log(row.join(''));
}

/* --icons DIR overwrites the sizes the Tauri CLI resampled.
   `tauri icon` produces every platform variant, which is what we want, but it
   scales with a smooth filter: measured, it turned a five-colour design into
   165 colours at 32x32, and 32 is the taskbar size. Every whole multiple of
   the grid is regenerated here at nearest neighbour. The odd Windows Store tile
   sizes (30, 44, 71, 89, ...) are not multiples of 32, so they keep the CLI's
   output — they are the sizes nobody looks closely at. */
const iconsDir = arg('icons', null);
const favicon = arg('favicon', null);

if (iconsDir) {
    const exact = { '32x32.png': 32, '64x64.png': 64, '128x128.png': 128,
        '128x128@2x.png': 256, 'icon.png': 512 };
    for (const [name, n] of Object.entries(exact)) {
        writeFileSync(`${iconsDir}/${name}`, png(n));
        console.log(`  ${name}  ${n}x${n}  exact`);
    }
    const ico = encodeICO([32, 64, 128, 256].map((n) => ({ size: n, data: png(n) })));
    writeFileSync(`${iconsDir}/icon.ico`, ico);
    console.log(`  icon.ico  32/64/128/256  exact`);
} else if (favicon) {
    /* The SAME grid as the desktop icon, which is the point. sprite-forge's
       favicon.svg is the source its icon set is generated from; deck-press
       broke that link and has no favicon at all. One grid, both outputs, one
       identity. */
    writeFileSync(favicon, png(32));
    console.log(`${favicon}  32x32  from the same grid as the icon`);
} else if (!args.includes('--print')) {
    writeFileSync(out, encodePNG(size, size, render(grid, size, background)));
    console.log(`${out}  ${size}x${size}  design=${design}`);
}
