// ui/import.js — getting an image in, by any of four routes.
//
// The button, the menu, a drop on the canvas, and a paste. All four end in
// ONE decode path, so an image lands in the artstore exactly once however it
// arrived and the same file dropped twice costs one payload.
//
// THE Ctrl+V COLLISION is the fiddly part and is worth reading before
// changing anything here. Ctrl+V already means "duplicate the copied element".
// The keydown fires BEFORE the paste event, so at keydown time nothing knows
// whether the system clipboard holds an image. The sequencing:
//
//   keydown Ctrl+V  ->  schedule the internal paste on a macrotask
//   paste           ->  if it carries an image, cancel that and place it
//
// The paste listener always runs before a setTimeout(0) callback, so the
// image wins when there is one and the element paste happens when there is
// not. Fiddly, but it keeps a shortcut people already use.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    const IMPORT_FRACTION = 0.4;   // a new image lands at 40% of the canvas
    let pendingInternalPaste = null;

    /* ── the one decode path ── */

    function readFile(file) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onerror = function () { reject(new Error('could not read that file')); };
            reader.onload = function () { resolve(reader.result); };
            reader.readAsDataURL(file);
        });
    }

    function decode(dataUrl) {
        return new Promise(function (resolve, reject) {
            const img = new Image();
            img.onerror = function () { reject(new Error('that file is not an image this app can read')); };
            img.onload = function () { resolve(img); };
            img.src = dataUrl;
        });
    }

    /**
     * Register a payload and place an element for it.
     *
     * `at` is where it was dropped, or absent to centre it. Either way the
     * image arrives at 40% of the canvas, aspect kept — big enough to see,
     * small enough to position.
     */
    async function place(dataUrl, meta, at) {
        const img = await decode(dataUrl);
        const px = App.gatefold.canvasSize(App.gatefold.get().size);
        const aspect = img.width / img.height;

        const target = px * IMPORT_FRACTION;
        const w = aspect >= 1 ? target : target * aspect;
        const h = aspect >= 1 ? target / aspect : target;

        const ref = App.artstore.register(dataUrl, Object.assign({
            kind: 'raster', w: img.width, h: img.height,
            bytes: dataUrl.length, mime: '',
        }, meta || {}));

        // Decode into the bitmap cache before the element exists, so the first
        // frame that draws it already has something to draw.
        await App.images.ready([ref]);

        App.session.add(App.element.create('image', {
            x: at ? at.x - w / 2 : (px - w) / 2,
            y: at ? at.y - h / 2 : (px - h) / 2,
            w: w, h: h,
            src: ref,
            aspectRatio: aspect,
            origW: w, origH: h,
            // Fill and stroke mean nothing on an image, and leaving the
            // panel's current colours on it would show a stroke round the
            // photo the moment the stroke width slider is touched.
            fill: 'none', stroke: 'none',
        }));
        return ref;
    }

    function fail(err) {
        const msg = err && err.message ? err.message : String(err);
        if (window.Toast) Toast.show(msg.toUpperCase());
        if (App.fs && App.fs.logLine) App.fs.logLine('ERROR', 'import failed', msg);
    }

    async function fromFile(file, at) {
        if (!file) return;
        if (file.type && !file.type.startsWith('image/')) {
            fail(new Error('that is not an image'));
            return;
        }
        try {
            await place(await readFile(file), { name: file.name || '', mime: file.type || '' }, at);
        } catch (err) {
            fail(err);
        }
    }

    /** The menu's Import item, and Ctrl+I on the desktop: a native dialog. */
    async function fromDialog() {
        if (!App.fs) { document.getElementById('imageFileInput').click(); return; }
        try {
            const path = await App.fs.openImage();
            if (!path) return;                    // cancelled
            const bytes = await App.fs.readBytes(path);
            const name = String(path).split(/[\\/]/).pop();
            const ext = (name.split('.').pop() || 'png').toLowerCase();
            const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                : ext === 'webp' ? 'image/webp'
                    : ext === 'gif' ? 'image/gif' : 'image/png';

            /* Chunked, because a 20MB photo is 20 million arguments to
               String.fromCharCode.apply and that overflows the call stack —
               which presents as an import that silently does nothing for
               large files and works for small ones. */
            let binary = '';
            const CHUNK = 0x8000;
            for (let i = 0; i < bytes.length; i += CHUNK) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
            }
            await place(`data:${mime};base64,${btoa(binary)}`, { name: name, mime: mime });
        } catch (err) {
            fail(err);
        }
    }

    /* ── the three listeners ── */

    function install() {
        const canvas = App.canvas.element();

        // 1. The file input, for the button and the LITE build.
        const input = document.getElementById('imageFileInput');
        input.addEventListener('change', function (e) {
            fromFile(e.target.files[0]);
            e.target.value = '';   // so the same file twice fires change twice
        });
        document.getElementById('imageBtn').addEventListener('click', fromDialog);

        // 2. Drag and drop, onto the canvas.
        /* The document-level pair is not optional. Without a preventDefault on
           a drop that MISSES the canvas, the browser navigates to the dropped
           file — and inside a Tauri window that is unrecoverable: there is no
           address bar to get back from. */
        document.addEventListener('dragover', function (e) { e.preventDefault(); });
        document.addEventListener('drop', function (e) { e.preventDefault(); });

        canvas.addEventListener('dragover', function (e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            canvas.classList.add('drag-over');
        });
        canvas.addEventListener('dragleave', function () {
            canvas.classList.remove('drag-over');
        });
        canvas.addEventListener('drop', function (e) {
            e.preventDefault();
            canvas.classList.remove('drag-over');
            const file = e.dataTransfer.files && e.dataTransfer.files[0];
            if (file) fromFile(file, App.canvas.toCanvas(e));
        });

        // 3. Paste. See the header for the Ctrl+V sequencing.
        document.addEventListener('paste', function (e) {
            const items = (e.clipboardData && e.clipboardData.items) || [];
            for (const item of items) {
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    e.preventDefault();
                    if (pendingInternalPaste) {
                        clearTimeout(pendingInternalPaste);
                        pendingInternalPaste = null;
                    }
                    fromFile(item.getAsFile());
                    return;
                }
            }
        });

        /* Ctrl+V. Deferred by one macrotask so the paste event above — which
           runs first — can cancel it if the clipboard held an image. */
        App.session.registerAction('edit:paste', function () {
            if (pendingInternalPaste) clearTimeout(pendingInternalPaste);
            pendingInternalPaste = setTimeout(function () {
                pendingInternalPaste = null;
                App.session.pasteInternal();
            }, 0);
        });

        App.session.registerAction('file:import', fromDialog);
    }

    App.import = {
        install: install,
        fromFile: fromFile,
        fromDialog: fromDialog,
        place: place,
    };
}());
