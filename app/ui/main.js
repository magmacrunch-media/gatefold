// main.js — page wiring. Last in the load order; everything is attached.
//
// This file owns no behaviour. It connects modules to each other and to the
// handful of controls that belong to no single one of them, and then gets out
// of the way. If a block here starts making a decision, it belongs in the
// module it is deciding for.

(function () {
    'use strict';

    const App = window.Gatefold;
    const $ = (id) => document.getElementById(id);

    /* The footer carries v1.9.0 in the markup because the web build has no
       binary to ask. On the desktop the binary is the truth. */
    const slot = $('app-version');
    if (slot && App.fs) {
        App.fs.appVersion().then((v) => { slot.textContent = `v${v}`; }).catch(() => {});
    }

    /* ── the canvas ── */

    const canvas = $('mainCanvas');
    App.canvas.init(canvas, App.session.paint);
    App.canvas.setSize(App.gatefold.canvasSize(App.gatefold.get().size));

    // One repaint path: a decoded bitmap asks the session to render, exactly
    // as every other change does.
    App.images.init(function () { App.canvas.schedule(); });

    /* ── the tools ── */

    App.tools.init({
        selectedId: App.session.getSelectedId,
        style: () => App.props.currentStyle(),
        onSelect: (id) => App.session.select(id),
        onChange: () => App.canvas.schedule(),
        onCursor: (cursor) => { canvas.style.cursor = cursor || ''; },
        onToolChange: () => App.props.updateVisibility(),
        onStrokeStart: () => App.session.beginStroke(),
        onStrokeEnd: () => App.session.commitStroke(),
        onStrokeCancel: () => App.session.cancelStroke(),
        onDrawStart: (el) => {
            // The in-progress element is in the document so it draws while it
            // is dragged out; onDrawCancel takes it back off again.
            App.gatefold.get().elements.push(el);
        },
        onDrawCancel: (el) => {
            const d = App.gatefold.get();
            d.elements = d.elements.filter((e) => e.id !== el.id);
            App.session.render();
        },
        onDrawCommit: (el) => {
            /* The element is already in the array, so this cannot go through
               session.add() — that would push a second copy. Take it out and
               put it back through the one path that records an undo entry. */
            const d = App.gatefold.get();
            d.elements = d.elements.filter((e) => e.id !== el.id);
            App.session.add(el);
        },
        onTextPlace: (x, y) => App.textmodal.add(x, y),
        onTextEdit: (el) => App.textmodal.edit(el),
    });

    canvas.addEventListener('mousedown', (e) => App.tools.onMouseDown(e, App.gatefold.get()));
    canvas.addEventListener('dblclick', (e) => App.tools.onDoubleClick(e, App.gatefold.get()));
    /* On the window, not the canvas: a drag that leaves the canvas and is
       released outside it must still finish, or the element stays stuck to
       the cursor. */
    window.addEventListener('mousemove', (e) => App.tools.onMouseMove(e, App.gatefold.get()));
    window.addEventListener('mouseup', () => App.tools.onMouseUp());

    /* ── the panels ── */

    App.props.init();
    App.shapesPopup.init();
    App.layers.init();
    App.import.install();

    $('exportBtn').addEventListener('click', () => App.export.exportPNG());
    App.session.registerAction('file:export', () => App.export.exportPNG());

    App.reference.init({
        onSample: (color) => {
            $('fillColor').value = color;
            $('fillHex').value = color;
            $('noFillBtn').classList.remove('active');
            const el = App.session.selectedElement();
            // Not onto an image: it has no fill to sample onto, and
            // overwriting its 'none' is what ui/props.js is careful not
            // to do either.
            if (el && App.element.stylable(el.type)) {
                App.session.pushUndo();
                el.fill = color;
                App.canvas.schedule();
            }
        },
        onPreview: (color) => {
            // A preview only, never applied to the element. Null means the
            // cursor left the strip, so put back what is actually selected.
            const el = App.session.selectedElement();
            const shown = color || (el && el.fill !== 'none' ? el.fill : $('fillColor').value);
            $('fillColor').value = shown;
            $('fillHex').value = shown;
        },
    });

    /* ── the canvas size and background ── */

    RetroDropdown.setup('canvasSizeDropdown', function (value) {
        const px = parseInt(value, 10);
        App.session.pushUndo();
        App.gatefold.get().size = App.gatefold.squareSize(px);
        App.canvas.setSize(px);
        App.session.render();
    });

    /* ── the action buttons ── */

    $('undoBtn').addEventListener('click', () => App.session.undo());
    $('redoBtn').addEventListener('click', () => App.session.redo());
    $('deleteBtn').addEventListener('click', () => App.session.remove());

    $('clearBtn').addEventListener('click', function () {
        if (!App.gatefold.get().elements.length) return;
        App.confirm.ask('Clear every element from this cover?').then(function (yes) {
            if (yes) App.session.clearAll();
        });
    });

    $('editTextBtn').addEventListener('click', function () {
        const el = App.session.selectedElement();
        if (el && el.type === 'text') App.textmodal.edit(el);
    });

    /* ── collapsible sections ──
       The button's .active class IS the state, because the menu bar's View
       items proxy these by clicking them. */
    for (const [toggleId, sectionId] of [['layersToggle', 'layersList'], ['refToggle', 'refSection']]) {
        const toggle = $(toggleId);
        const section = $(sectionId);
        if (!toggle || !section) continue;
        toggle.addEventListener('click', function () {
            const open = toggle.classList.toggle('active');
            section.hidden = !open;
        });
    }

    /* ── start ── */

    /* Before menu.init(), so nothing has read a label yet. On Windows this
       is a no-op; on a Mac it turns Ctrl+S into the glyphs a Mac user is
       looking for, and Exit/Alt+F4 into Quit. */
    App.platform.applyLabels();

    App.projectUI.init();
    App.helpUI.init();
    App.menu.init();

    App.session.initHistory();
    App.session.installKeys();

    /* The LITE build has no Rust close guard, so it needs the browser's. The
       desktop build has magma_kit::dirty::confirm_close and must NOT also do
       this — beforeunload in a WebView produces a second, OS-drawn prompt. */
    if (!App.fs) {
        window.addEventListener('beforeunload', function (e) {
            if (!App.session.isDirty()) return;
            e.preventDefault();
            e.returnValue = '';
        });
    }
    App.shapesPopup.setActiveTool('select');
    App.session.render();

    if (App.fs) App.fs.logLine('boot', 'ui attached', App.tier.current.name);
}());
