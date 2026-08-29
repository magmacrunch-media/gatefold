// ui/session.js — the one place the app's live state changes.
//
// Undo, the selection, the dirty flag, the keyboard, and the single render
// fan-out. Everything else asks this file to do something; nothing else
// mutates the document and then repaints on its own.
//
// The web tool had all of this spread through app.js: `elements` and
// `selectedElement` as two module-level lets, forty-five listeners each
// calling History.push and CanvasRenderer.render for themselves, and a
// syncSelectedElement() called defensively from six places because
// selectedElement was an object reference INTO the array that undo replaced
// wholesale. Here the selection is an ID and the element is looked up at the
// point of use, which deletes that whole class of bug rather than patching it.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    const HISTORY_CAP = 60;

    let history = null;
    let selectedId = null;
    let savedRevision = 0;
    let pushedDirty = null;
    let nudgeTimer = null;

    const doc = () => App.gatefold.get();

    /* ── history ────────────────────────────────────────── */

    function initHistory() {
        history = window.MagmaKit.history.create({
            cap: HISTORY_CAP,
            snapshot: () => App.gatefold.clone(),
            restore: function (state) {
                App.gatefold.set(state);
                /* The selection is NOT part of the snapshot — undoing a colour
                   change must not also jump you to a different element — so it
                   can point at something the restored document no longer has.
                   Drop it rather than leave it dangling. */
                if (selectedId != null && !doc().elements.some((el) => el.id === selectedId)) {
                    selectedId = null;
                }
                render();
            },
        });
        markSaved();
    }

    /** Record the state BEFORE a mutation. */
    function pushUndo() {
        if (history) history.push();
        refreshDirty();
    }

    /* A colour picker fires `input` continuously through a drag and `change`
       once at the end; a range slider does the same. So beginStroke is called
       over and over during one gesture, and it has to keep the state the
       gesture STARTED from — otherwise a single drag of the fill picker is two
       hundred undo entries.

       There is no latch here for that. magma-kit 0.2.0's beginStroke is
       idempotent, which is where the guard belongs: all three apps on the kit
       had independently written the same latch before it moved in there. */
    function beginStroke() {
        if (history) history.beginStroke();
    }

    function commitStroke() {
        if (!history) return;
        history.commitStroke();
        refreshDirty();
    }

    function cancelStroke() {
        if (history) history.cancelStroke();
    }

    function undo() { if (history && history.undo()) refreshDirty(); }
    function redo() { if (history && history.redo()) refreshDirty(); }
    function canUndo() { return !!history && history.canUndo(); }
    function canRedo() { return !!history && history.canRedo(); }

    /** A freshly opened file is not a modified one, and its undo stack must
        not reach back into the document that was open before it. */
    function resetHistory() {
        if (history) history.clear();
        selectedId = null;
        markSaved();
    }

    /* ── dirty ──────────────────────────────────────────── */

    function markSaved() {
        if (history) savedRevision = history.revision();
        refreshDirty();
    }

    /* revision() counts undos too, so undoing all the way back to the saved
       state still reports dirty. Both sibling apps accept the same false
       positive rather than keeping a second hash of the document: over-
       reporting costs one unnecessary prompt, and under-reporting is silent
       data loss. */
    function isDirty() {
        return !!history && history.revision() !== savedRevision;
    }

    function refreshDirty() {
        const dirty = isDirty();
        if (App.projectUI) App.projectUI.refreshLabel(dirty);

        if (dirty !== pushedDirty && App.fs && App.fs.setDirty) {
            pushedDirty = dirty;
            // The Rust side owns the close-confirm and this is the only thing
            // that ever tells it there is something to confirm. On failure,
            // forget we pushed so the next change tries again.
            App.fs.setDirty(dirty).catch(function () { pushedDirty = null; });
        }
    }

    /* ── selection ──────────────────────────────────────── */

    function getSelectedId() { return selectedId; }

    function selectedElement() {
        return selectedId == null
            ? null
            : doc().elements.find((el) => el.id === selectedId) || null;
    }

    function select(id) {
        selectedId = id;
        render();
        if (App.props) App.props.syncFrom(selectedElement());
    }

    /* ── the frame ──────────────────────────────────────── */

    function paint() {
        const ctx = App.canvas.context();
        if (!ctx) return;
        App.render.render(ctx, doc(), {
            selectedId: selectedId,
            measure: App.canvas.measure,
            width: App.canvas.size(),
        });
    }

    /** Everything that changed the document ends up here. */
    function render() {
        App.canvas.schedule();
        updateStats();
        if (App.layers) App.layers.render();
        if (App.props) App.props.updateVisibility();
    }

    function updateStats() {
        const n = doc().elements.length;
        const sizeStat = document.getElementById('canvasSizeStat');
        const countStat = document.getElementById('elementCountStat');
        const px = App.gatefold.canvasSize(doc().size);
        if (sizeStat) sizeStat.textContent = `${px}×${px}`;
        if (countStat) countStat.textContent = `${n} ELEMENT${n === 1 ? '' : 'S'}`;
    }

    /* ── document edits ─────────────────────────────────── */

    function add(el) {
        pushUndo();
        doc().elements.push(el);
        selectedId = el.id;
        render();
        if (App.props) App.props.syncFrom(el);
    }

    function remove(id) {
        const target = id == null ? selectedId : id;
        if (target == null) return;
        pushUndo();
        const d = doc();
        d.elements = d.elements.filter((el) => el.id !== target);
        if (selectedId === target) selectedId = null;
        render();
    }

    function clearAll() {
        pushUndo();
        doc().elements = [];
        selectedId = null;
        render();
    }

    /** Move the selected element one step through the z-order. The layers
        panel drives this too, so there is one implementation of the reorder. */
    function reorder(id, delta) {
        const d = doc();
        const i = d.elements.findIndex((el) => el.id === id);
        if (i < 0) return;
        const j = i + delta;
        if (j < 0 || j >= d.elements.length) return;
        pushUndo();
        const [el] = d.elements.splice(i, 1);
        d.elements.splice(j, 0, el);
        render();
    }

    function nudge(dx, dy) {
        const el = selectedElement();
        if (!el) return;
        el.x += dx;
        el.y += dy;
        App.canvas.schedule();
        /* Rapid nudges collapse into ONE undo entry: holding an arrow key for
           a second is a single intention, not thirty of them. */
        clearTimeout(nudgeTimer);
        nudgeTimer = setTimeout(function () {
            pushUndo();
        }, App.keybindings.NUDGE_DEBOUNCE_MS);
    }

    /* ── the clipboard ──────────────────────────────────── */

    let clipboard = null;

    function copy() {
        const el = selectedElement();
        if (el) clipboard = JSON.parse(JSON.stringify(el));
    }

    /** Returns whether it pasted, so ui/import.js can decide about an image
        on the system clipboard instead. */
    function pasteInternal() {
        if (!clipboard) return false;
        const clone = JSON.parse(JSON.stringify(clipboard));
        clone.id = App.element.nextId();
        clone.x = (clone.x || 0) + 20;
        clone.y = (clone.y || 0) + 20;
        add(clone);
        return true;
    }

    function hasClipboard() { return !!clipboard; }

    /* ── the keyboard ───────────────────────────────────── */

    const ACTIONS = {
        'edit:undo': undo,
        'edit:redo': redo,
        'edit:copy': copy,
        'edit:delete': () => remove(),
        'select:none': () => select(null),
        'nudge:up': (e) => nudge(0, -stepFor(e)),
        'nudge:down': (e) => nudge(0, stepFor(e)),
        'nudge:left': (e) => nudge(-stepFor(e), 0),
        'nudge:right': (e) => nudge(stepFor(e), 0),
        'tool:select': () => App.tools.setTool('select'),
        'tool:rect': () => App.tools.setTool('rect'),
        'tool:circle': () => App.tools.setTool('circle'),
        'tool:line': () => App.tools.setTool('line'),
        'tool:text': () => App.tools.setTool('text'),
    };

    function stepFor(e) {
        return e.shiftKey ? App.keybindings.NUDGE.coarse : App.keybindings.NUDGE.fine;
    }

    /** Actions other modules own. They register rather than being reached for,
        so a module that is not loaded simply has no binding. */
    function registerAction(name, fn) { ACTIONS[name] = fn; }

    function installKeys() {
        const resolver = App.keybindings.create();
        document.addEventListener('keydown', function (e) {
            // A dialog is open: only the way out is live, so Delete cannot
            // remove the element behind it while a title is being typed.
            const surface = document.querySelector('dialog[open]') ? 'modal' : 'editor';
            const action = resolver.resolve(e, App.keybindings.AVAILABLE[surface]);
            if (!action) return;
            const handler = ACTIONS[action];
            if (!handler) return;
            if (App.keybindings.PREVENT.indexOf(action) !== -1) e.preventDefault();
            handler(e);
        });
    }

    App.session = {
        initHistory: initHistory,
        installKeys: installKeys,
        registerAction: registerAction,

        pushUndo: pushUndo,
        beginStroke: beginStroke,
        commitStroke: commitStroke,
        cancelStroke: cancelStroke,
        undo: undo,
        redo: redo,
        canUndo: canUndo,
        canRedo: canRedo,
        resetHistory: resetHistory,

        markSaved: markSaved,
        isDirty: isDirty,
        refreshDirty: refreshDirty,

        getSelectedId: getSelectedId,
        selectedElement: selectedElement,
        select: select,

        paint: paint,
        render: render,

        add: add,
        remove: remove,
        clearAll: clearAll,
        reorder: reorder,
        nudge: nudge,

        copy: copy,
        pasteInternal: pasteInternal,
        hasClipboard: hasClipboard,
    };
}());
