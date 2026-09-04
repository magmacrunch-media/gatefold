import { test, eq, ok, throws } from './kit/assert.mjs';

/* core/pngmeta.js — the pHYs chunk that tells a printer how big the file is.
 *
 * Worth pinning byte by byte because every failure here is silent. A wrong
 * CRC produces a chunk that decoders skip, so the export looks fine and is
 * still sized by guesswork; a pHYs written after the first IDAT is invalid
 * and skipped the same way; and a second stamp that appends rather than
 * replaces leaves two chunks disagreeing, with which one wins left to the
 * reader. None of it shows up until something is printed at the wrong size.
 *
 * The PNGs here are synthetic. The chunk framing is real — length, type,
 * payload, CRC — but the IDAT holds three arbitrary bytes rather than a
 * deflate stream, because nothing in this file decodes an image and a real
 * one would only make the fixtures harder to read. */

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function bytes(...parts) {
    const flat = [];
    for (const p of parts) for (const b of p) flat.push(b);
    return new Uint8Array(flat);
}

function be32(v) {
    return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}

/** A framed chunk, CRC'd over type + data as the spec requires. */
function chunk(M, type, data = []) {
    const body = bytes([...type].map((c) => c.charCodeAt(0)), data);
    return bytes(be32(data.length), body, be32(M.pngmeta.crc32(body, 0, body.length)));
}

/** A minimal well-formed PNG. `extra` goes between IHDR and IDAT. */
function png(M, extra = []) {
    return bytes(
        SIG,
        chunk(M, 'IHDR', [...be32(1), ...be32(1), 8, 6, 0, 0, 0]),
        extra,
        chunk(M, 'IDAT', [0x11, 0x22, 0x33]),
        chunk(M, 'IEND')
    );
}

const types = (M, b) => M.pngmeta.chunks(b).map((c) => c.type);

/* HOW CLOSE A ROUND TRIP CAN GET. pHYs counts whole pixels per metre, so the
   stored value is at worst half a unit out and a dpi read back is worst-case
   0.5 * 25.4 / 1000 = 0.0127 off. 600dpi is very nearly that: 23622 per metre
   reads back 599.9988. Tighter than this is asserting against the format
   rather than against the code. */
const DPI_EPS = 0.02;

function nearDpi(M, b, want, what) {
    const got = M.pngmeta.dpiOf(b);
    ok(Math.abs(got - want) <= DPI_EPS, `${what}: read back ${got}, want ~${want}`);
}

export default function (M, harness) {
    test('the CRC is the one the PNG spec means', () => {
        /* The standard CRC-32 check value: "123456789" is 0xCBF43926. Asserted
           against the published constant rather than against this file's own
           output, so the fixtures below — which are CRC'd by this same
           function — are not vouching for themselves. */
        const s = new Uint8Array([...'123456789'].map((c) => c.charCodeAt(0)));
        eq(M.pngmeta.crc32(s, 0, s.length), 0xcbf43926, 'CRC-32 check value');
    });

    test('300dpi is 11811 pixels per metre', () => {
        /* The integer every other tool writes for 300dpi. 300 / 25.4 * 1000 is
           11811.023..., so the file can only say 11811 — matching that exactly
           is what makes the export indistinguishable from any other 300dpi
           PNG. */
        eq(M.pngmeta.perMetre(300), 11811, '300dpi');
        eq(M.pngmeta.perMetre(600), 23622, '600dpi');
        eq(M.pngmeta.perMetre(72), 2835, '72dpi');
    });

    test('a document with no physical size is not stamped', () => {
        const src = png(M);
        /* metrics().dpi is null for a px document. A 1024 square cover is 1024
           pixels and nothing else; claiming inches for it would be inventing
           something the document does not say. */
        for (const none of [null, undefined, 0]) {
            const out = M.pngmeta.stampDpi(src, none);
            ok(out === src, 'the very same array comes back');
        }
        eq(M.pngmeta.dpiOf(src), null, 'and it still claims nothing');
    });

    test('the stamp lands after IHDR and before the first IDAT', () => {
        // Invalid anywhere after IDAT, and decoders that do read it read it
        // from the header end.
        const out = M.pngmeta.stampDpi(png(M), 300);
        eq(types(M, out), ['IHDR', 'pHYs', 'IDAT', 'IEND'], 'chunk order');
    });

    test('a stamped PNG reads back as the dpi it was given', () => {
        nearDpi(M, M.pngmeta.stampDpi(png(M), 300), 300, '300dpi');
        nearDpi(M, M.pngmeta.stampDpi(png(M), 600), 600, '600dpi');
    });

    test('stamping twice replaces the chunk rather than adding a second', () => {
        /* Two pHYs chunks is not a file that fails to open — it is a file that
           opens at whichever size the reader happened to keep. */
        const once = M.pngmeta.stampDpi(png(M), 300);
        const twice = M.pngmeta.stampDpi(once, 600);
        eq(types(M, twice), ['IHDR', 'pHYs', 'IDAT', 'IEND'], 'still one pHYs');
        nearDpi(M, twice, 600, 'and it is the new one');
    });

    test('a pHYs already in the file is replaced wherever it sat', () => {
        const stale = [...chunk(M, 'pHYs', [...be32(2835), ...be32(2835), 1])];
        const out = M.pngmeta.stampDpi(png(M, stale), 300);
        eq(types(M, out), ['IHDR', 'pHYs', 'IDAT', 'IEND'], 'one pHYs, and it moved');
        nearDpi(M, out, 300, 'the 72dpi one is gone');
    });

    test('the image data is not touched', () => {
        /* The whole operation is an insertion. If a single IDAT byte moves the
           export is corrupt, and a corrupt PNG is the one failure here that is
           NOT silent — which makes it the cheapest to assert. */
        const out = M.pngmeta.stampDpi(png(M), 300);
        const idat = M.pngmeta.chunks(out).find((c) => c.type === 'IDAT');
        eq([...out.subarray(idat.start + 8, idat.start + 11)], [0x11, 0x22, 0x33], 'IDAT payload');
    });

    test('unit 0 is a pixel ratio, not a size, and is not read as one', () => {
        const ratio = [...chunk(M, 'pHYs', [...be32(4), ...be32(3), 0])];
        eq(M.pngmeta.dpiOf(png(M, ratio)), null, 'no physical size claimed');
    });

    test('anything that is not a PNG is refused, not passed through', () => {
        /* Loudly. Quietly declining to stamp is the exact failure this module
           exists to end, so the caller gets to decide, not this file. */
        const notPng = new Uint8Array(40);
        throws(() => M.pngmeta.stampDpi(notPng, 300), 'not a PNG', 'bad signature');
        eq(M.pngmeta.isPng(notPng), false, 'and it says so');

        const truncated = png(M).subarray(0, 20);
        throws(() => M.pngmeta.stampDpi(truncated, 300), 'truncated', 'a cut-off chunk');
    });

    test('a JP0 J-card exports as a 4-inch card, not a 16-inch one', () => {
        /* The point of the whole module, tied back to the format table: the
           surface core/formats.js computes and the dpi this file stamps have
           to describe the same physical object. 1275 x 1313 dots is the 4in x
           4-1/8in trim plus an eighth of an inch of bleed on every side. With
           no pHYs a reader assumes its own default — 72dpi puts this card at
           over 17 inches wide. */
        const size = M.formats.jcardSize(0);
        const m = M.formats.metrics(size);
        eq([m.surface.w, m.surface.h], [1275, 1313], 'JP0 surface in dots');

        const out = M.pngmeta.stampDpi(png(M), m.dpi);
        const dpi = M.pngmeta.dpiOf(out);
        const inches = (dots) => dots / dpi;

        ok(Math.abs(inches(m.surface.w) - 4.25) < 0.001, `${inches(m.surface.w)}in wide`);
        ok(Math.abs(inches(m.surface.h) - 4.3767) < 0.001, `${inches(m.surface.h)}in tall`);
        ok(Math.abs(inches(m.trim.w) - 4) < 0.001, 'and the trim is exactly 4in');
    });
}
