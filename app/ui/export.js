// ui/export.js — the cover as a PNG file.
//
// THREE THINGS HAVE TO BE TRUE ABOUT THE FILE THIS WRITES, and every one of
// them fails silently when it is not:
//
//   1. EVERY IMAGE HAS DECODED. A bitmap still decoding draws nothing, so the
//      export writes a PNG with a hole where the photo should be. The web tool
//      checked this and refused with a toast; this waits instead, which is the
//      better answer to "try again in a moment".
//
//   2. EVERY FONT IN USE HAS LOADED. This is the one the web tool could not
//      have known about, because on the website the faces came from Google's
//      CDN and were usually warm. A face that has not arrived draws as the
//      fallback and NOTHING SAYS SO — font-display:swap has already painted.
//      Self-hosting them stops the request being blocked; awaiting them here
//      is what stops the exported file being in the wrong typeface.
//
//   3. THE FILE HAS TO SAY HOW BIG IT IS. compose() renders at m.surface, so
//      a J-card is already the right number of dots — 1275 x 1313 for a JP0 —
//      but a canvas encodes to PNG with no pHYs chunk and a PNG without one
//      states no physical size at all. Readers then supply their own default
//      and the card places at four times its size. core/pngmeta.js writes it
//      in; encode() below is the only place that happens, for both builds.
//
// Printer's marks are the one thing here that is OPT-IN. They need paper
// outside the bleed, so a marked export is a bigger image than an unmarked
// one — see core/marks.js — and changing what m.surface produces without
// being asked is not a favour.
//
// The desktop/web fork is sprite-forge's saveSheet shape: a native Save dialog
// when there is a filesystem, an <a download> when there is not.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    /* Whether to add printer's marks, remembered across sessions. OFF by
       default and opt-in on purpose: marks need paper outside the bleed, so a
       marked export is a BIGGER IMAGE than an unmarked one. Every print export
       so far has been exactly m.surface, and quietly handing back different
       dimensions would break anyone who had measured one. */
    const prefs = window.MagmaKit.prefs.create('gatefold.export');

    let marks = !!((prefs.read() || {}).marks);

    function marksOn() { return marks; }

    function setMarks(on) {
        marks = !!on;
        prefs.patch({ marks: marks });
        if (window.Toast) Toast.show(marks ? 'CROP MARKS ON' : 'CROP MARKS OFF');
        return marks;
    }

    /** Every distinct face the document actually draws with. */
    function fontsInUse(doc) {
        const fonts = new Set();
        for (const el of doc.elements) {
            if (el.type === 'text' && el.visible !== false) {
                fonts.add(el.font || 'Press Start 2P');
            }
        }
        return [...fonts];
    }

    function fontsReady(doc) {
        if (!document.fonts || !document.fonts.load) return Promise.resolve();
        return Promise.all(fontsInUse(doc).map(function (f) {
            // Resolve on failure too: one missing face must not stop the
            // export, it just draws in the fallback as it would have anyway.
            return document.fonts.load(`16px "${f}"`).catch(function () {});
        }));
    }

    /**
     * Render the document to an offscreen canvas at full size.
     *
     * No selection chrome, which is now just an option rather than the
     * null-it-and-restore dance the web tool needed — the chrome used to be
     * drawn into the same canvas as the artwork.
     */
    function compose(doc) {
        /* THE SURFACE, so a print document exports at its own dpi WITH its
           bleed — that is the file a duplicator asks for. A square cover has
           no bleed, so its surface is its trim and nothing about it changes.

           No `panels` and no `guides` are passed, which is the whole of what
           makes the fold lines and the safe margin non-printing: they are not
           suppressed here, they are simply never asked for. */
        const m = App.formats.metrics(doc.size);
        const c = document.createElement('canvas');
        c.width = m.surface.w;
        c.height = m.surface.h;
        App.render.render(c.getContext('2d'), doc, {
            selectedId: null,
            measure: App.canvas.measure,
            metrics: m,
            width: m.surface.w,
            height: m.surface.h,
        });
        return c;
    }

    /**
     * The artwork, on a sheet with room for printer's marks around it.
     *
     * Returns compose()'s own canvas untouched whenever there are no marks to
     * add — the toggle is off, or the document has no bleed and therefore no
     * cut to mark. THE UNMARKED FILE IS BYTE FOR BYTE WHAT IT ALWAYS WAS; this
     * function either wraps it or gets out of the way.
     *
     * The margin is filled white rather than left transparent because it is
     * PAPER. Beyond the bleed nothing is printed, and a transparent slug
     * composites into whatever happens to be behind it — including black,
     * which would hide every mark on the sheet.
     */
    function composeSheet(doc) {
        const art = compose(doc);
        const m = App.formats.metrics(doc.size);
        if (!marks || !App.marks.wanted(m)) return art;

        const s = App.marks.sheet(m);
        const c = document.createElement('canvas');
        c.width = s.w;
        c.height = s.h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, s.w, s.h);
        // An integer offset, so this is a copy and not a resample. See
        // core/marks.js's margin().
        ctx.drawImage(art, s.offset.x, s.offset.y);
        App.render.printMarks(ctx, App.marks.lines(m), App.marks.weight(m));
        return c;
    }

    /**
     * The finished file's bytes: the composed canvas, with its physical size
     * written into it.
     *
     * BOTH BUILDS GO THROUGH HERE. LITE offers only the four square pixel
     * sizes today, whose dpi is null and which stampDpi therefore returns
     * untouched — so this changes nothing about what the web build writes.
     * What it buys is that there is one encoder rather than two, and the day
     * core/tier.js's `sizes` capability opens up, the web export carries its
     * print size without anyone having to remember this file.
     */
    async function encode(canvas, doc) {
        const raw = await App.png.bytes(canvas);
        try {
            return App.pngmeta.stampDpi(raw, App.formats.metrics(doc.size).dpi);
        } catch (err) {
            /* An unstamped export beats no export — the pixels are right
               either way and only the size a printer assumes is lost. But it
               is lost SILENTLY, which is the whole reason the stamp exists, so
               it is worth a toast even though nothing is broken. */
            if (window.Toast) Toast.show('EXPORTED WITHOUT PRINT SIZE');
            if (App.fs && App.fs.logLine) {
                App.fs.logLine('WARN', 'could not stamp print size',
                    err && err.message ? err.message : String(err));
            }
            return raw;
        }
    }

    function filename() {
        const raw = (document.getElementById('fileName').value || 'cover').trim();
        const safe = raw.replace(/[^\w.-]+/g, '-') || 'gatefold';
        return safe.endsWith('.png') ? safe : safe + '.png';
    }

    async function exportPNG() {
        const doc = App.gatefold.get();
        const name = filename();

        try {
            await Promise.all([App.images.ready(App.gatefold.usedRefs()), fontsReady(doc)]);
        } catch {
            // Neither of those rejects by design; if one somehow does, an
            // export that is slightly wrong beats no export and no message.
            if (window.Toast) Toast.show('SOME ASSETS DID NOT LOAD — EXPORTING ANYWAY');
        }

        const canvas = composeSheet(doc);

        if (!App.fs) {
            // LITE: the browser's own download. There is no Save dialog and
            // no path to report.
            /* A Blob, where this used to be toDataURL. The stamp works on
               BYTES and a data URL has none to reach, so this is what lets
               one encode() serve both builds; it also stops a 4096 square
               being turned into a twenty-megabyte base64 string on its way
               to a click. */
            const url = URL.createObjectURL(
                new Blob([await encode(canvas, doc)], { type: 'image/png' }));
            const a = document.createElement('a');
            a.download = name;
            a.href = url;
            a.click();
            /* The click returns before the download has read the blob, so the
               URL cannot be revoked on the next line — some browsers cancel
               the download outright. Held for a minute, then released. */
            setTimeout(function () { URL.revokeObjectURL(url); }, 60_000);
            if (window.Toast) Toast.show('EXPORTED ' + name.toUpperCase());
            return name;
        }

        try {
            const path = await App.fs.savePng(name);
            if (!path) return null;   // cancelled is not an error
            const out = path.endsWith('.png') ? path : path + '.png';
            await App.fs.writeBytes(out, await encode(canvas, doc));
            if (window.Toast) Toast.show('EXPORTED');
            return out;
        } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            if (window.Toast) Toast.show('EXPORT FAILED: ' + msg.toUpperCase());
            if (App.fs.logLine) App.fs.logLine('ERROR', 'export failed', msg);
            return null;
        }
    }

    App.export = {
        exportPNG: exportPNG,
        compose: compose,
        composeSheet: composeSheet,
        encode: encode,
        marksOn: marksOn,
        setMarks: setMarks,
        fontsInUse: fontsInUse,
        filename: filename,
    };
}());
