// ui/export.js — the cover as a PNG file.
//
// TWO THINGS HAVE TO BE TRUE BEFORE COMPOSITING, and both of them fail
// silently if they are not:
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
// The desktop/web fork is sprite-forge's saveSheet shape: a native Save dialog
// when there is a filesystem, an <a download> when there is not.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

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
        const px = App.gatefold.canvasSize(doc.size);
        const c = document.createElement('canvas');
        c.width = px;
        c.height = px;
        App.render.render(c.getContext('2d'), doc, {
            selectedId: null,
            measure: App.canvas.measure,
            width: px,
        });
        return c;
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

        const canvas = compose(doc);

        if (!App.fs) {
            // LITE: the browser's own download. There is no Save dialog and
            // no path to report.
            const a = document.createElement('a');
            a.download = name;
            a.href = canvas.toDataURL('image/png');
            a.click();
            if (window.Toast) Toast.show('EXPORTED ' + name.toUpperCase());
            return name;
        }

        try {
            const path = await App.fs.savePng(name);
            if (!path) return null;   // cancelled is not an error
            const out = path.endsWith('.png') ? path : path + '.png';
            await App.fs.writeBytes(out, await App.png.bytes(canvas));
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
        fontsInUse: fontsInUse,
        filename: filename,
    };
}());
