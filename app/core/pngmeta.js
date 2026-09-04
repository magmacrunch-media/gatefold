// core/pngmeta.js — the physical size a PNG claims, written into its bytes.
//
// THE EXPORT WAS ALWAYS THE RIGHT NUMBER OF PIXELS AND NEVER SAID WHAT SIZE
// THEY WERE. core/formats.js does the millimetre arithmetic exactly once and
// ui/export.js composes at m.surface, so a JP0 J-card comes out 1200x1313 —
// which IS 4in x 4-3/8in at 300dpi. But a canvas encodes to PNG with no pHYs
// chunk, and a PNG with no pHYs states no physical size at all. Every
// consumer then supplies its own default: 72dpi in most of the Adobe tools,
// 96 in most Windows ones. The card places at roughly 16in x 18in, someone
// scales it back by eye, and the eighth of an inch of bleed this whole format
// exists to carry is gone.
//
// Which makes it the same shape as the font bug the port already fixed: the
// file looks right, nothing reports an error, and the wrongness only surfaces
// at the printer. dpi is part of a preset here (see formats.js's note on why
// it is not a control), so it is known at export time and there is no reason
// for the file not to carry it.
//
// A SQUARE COVER STAMPS NOTHING, and that is not an omission. A 1024 cover is
// 1024 pixels; it has no physical size, and inventing one would be claiming
// something the document does not say. metrics().dpi is null for a px
// document and stampDpi returns the bytes untouched.
//
// Pure by the rule in AGENTS.md: bytes in, bytes out. The ENCODING needs a
// canvas and lives in ui/png.js; the metadata is arithmetic over a byte
// array, which is why it is here and testable in Node rather than behind a
// toBlob that a suite has no way to call.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    /* \x89 P N G \r \n \x1a \n — the eight bytes every PNG opens with. The
       CR and the LF in the middle are there to catch a transfer that mangled
       line endings, which is a check worth having in this repo of all
       repos. */
    const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

    /* pHYs is nine bytes: pixels-per-unit across, pixels-per-unit down, and a
       unit specifier. Unit 1 is the metre and unit 0 means "no unit" — the
       numbers are then only an aspect ratio, which is a different claim and
       one this file neither writes nor reads as a size. */
    const PHYS = 'pHYs';
    const METRE = 1;
    const MM_PER_IN = 25.4;

    /**
     * Dots per inch as pixels per metre, rounded.
     *
     * THE ROUNDING IS WHY dpiOf DOES NOT COME BACK EXACT. pHYs is an integer
     * count per metre, and 300dpi is 11811.023...: the file can only say
     * 11811, which reads back as 299.9994dpi. Every tool that writes these
     * stores the same 11811 for 300, so the quantisation is the format's and
     * matching it is what makes the file look like every other 300dpi PNG
     * rather than like something with an opinion.
     */
    function perMetre(dpi) {
        return Math.round((Number(dpi) || 0) * 1000 / MM_PER_IN);
    }

    /* ── CRC-32, as the PNG spec defines it ─────────────── */

    let TABLE = null;

    function table() {
        if (TABLE) return TABLE;
        TABLE = new Int32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            }
            TABLE[n] = c;
        }
        return TABLE;
    }

    /** Over `bytes[from, to)`. Every chunk CRCs its TYPE and its data, not
        its length — a detail that produces a file readable by nothing if it
        is got wrong, and silently so, since the header still parses. */
    function crc32(bytes, from, to) {
        const t = table();
        let c = -1;
        for (let i = from; i < to; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
        return (c ^ -1) >>> 0;
    }

    /* ── chunks ─────────────────────────────────────────── */

    function u32(bytes, at) {
        return ((bytes[at] << 24) | (bytes[at + 1] << 16)
            | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
    }

    function putU32(bytes, at, v) {
        bytes[at] = (v >>> 24) & 0xff;
        bytes[at + 1] = (v >>> 16) & 0xff;
        bytes[at + 2] = (v >>> 8) & 0xff;
        bytes[at + 3] = v & 0xff;
    }

    function typeAt(bytes, at) {
        return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
    }

    function isPng(bytes) {
        if (!bytes || bytes.length < 8 + 12) return false;
        for (let i = 0; i < SIGNATURE.length; i++) {
            if (bytes[i] !== SIGNATURE[i]) return false;
        }
        return true;
    }

    /**
     * Every chunk as { type, start, end }, in file order.
     *
     * Walked rather than assumed. A canvas encoder emits IHDR, IDAT, IEND and
     * little else today, but a PNG may legally carry anything between them
     * and a stamp that guessed at fixed offsets would corrupt the one file it
     * met that did.
     */
    function chunks(bytes) {
        const out = [];
        let at = 8;
        while (at + 12 <= bytes.length) {
            const len = u32(bytes, at);
            const end = at + 12 + len;
            if (end > bytes.length) throw new Error('truncated PNG chunk');
            const type = typeAt(bytes, at + 4);
            out.push({ type: type, start: at, end: end });
            if (type === 'IEND') break;
            at = end;
        }
        return out;
    }

    /** A complete pHYs chunk: length, type, nine bytes of data, CRC. */
    function physChunk(ppm) {
        const c = new Uint8Array(4 + 4 + 9 + 4);
        putU32(c, 0, 9);
        for (let i = 0; i < 4; i++) c[4 + i] = PHYS.charCodeAt(i);
        putU32(c, 8, ppm);      // across
        putU32(c, 12, ppm);     // down — square pixels; nothing here makes them otherwise
        c[16] = METRE;
        putU32(c, 17, crc32(c, 4, 17));
        return c;
    }

    /**
     * Return `bytes` with its physical size set to `dpi`.
     *
     * A falsy dpi is the px case and returns the input untouched — see the
     * header. Anything that is not a PNG throws rather than passing bytes
     * through unchanged: silently declining to stamp is the exact failure
     * this file was written to end, and the caller can decide that an
     * unstamped export beats no export.
     *
     * INSERTED IMMEDIATELY AFTER IHDR. The spec requires pHYs before the
     * first IDAT, and after the header is the one position that satisfies
     * that whatever else the encoder put in the file. Any pHYs already
     * present is dropped rather than edited in place, so a second stamp
     * replaces the first instead of leaving two chunks disagreeing.
     */
    function stampDpi(bytes, dpi) {
        if (!dpi) return bytes;
        if (!isPng(bytes)) throw new Error('not a PNG');

        const all = chunks(bytes);
        if (!all.length || all[0].type !== 'IHDR') throw new Error('PNG does not open with IHDR');

        const keep = all.filter(function (c) { return c.type !== PHYS; });
        const phys = physChunk(perMetre(dpi));

        let size = 8 + phys.length;
        for (const c of keep) size += c.end - c.start;

        const out = new Uint8Array(size);
        out.set(bytes.subarray(0, 8), 0);
        let at = 8;
        for (const c of keep) {
            out.set(bytes.subarray(c.start, c.end), at);
            at += c.end - c.start;
            // Straight after the header, which is always the first chunk.
            if (c.type === 'IHDR') { out.set(phys, at); at += phys.length; }
        }
        return out;
    }

    /**
     * The dpi a PNG claims, or null for one that claims nothing.
     *
     * Not exact — see perMetre. A file stamped at 300 reads back 299.9994,
     * which is the format's precision and not a defect to round away here;
     * a caller showing it to a person should round, and a caller comparing
     * should use a tolerance.
     */
    function dpiOf(bytes) {
        if (!isPng(bytes)) return null;
        for (const c of chunks(bytes)) {
            if (c.type !== PHYS) continue;
            // Unit 0 is "no unit": a pixel aspect ratio, not a physical size.
            if (bytes[c.start + 8 + 8] !== METRE) return null;
            return u32(bytes, c.start + 8) * MM_PER_IN / 1000;
        }
        return null;
    }

    App.pngmeta = {
        SIGNATURE: SIGNATURE,
        METRE: METRE,
        isPng: isPng,
        chunks: chunks,
        crc32: crc32,
        perMetre: perMetre,
        stampDpi: stampDpi,
        dpiOf: dpiOf,
    };
}());
