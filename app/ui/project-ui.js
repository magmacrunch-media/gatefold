// ui/project-ui.js — New, Open, Save, Save As, and the name in the header.
//
// FULL only: every entry point returns immediately when there is no
// filesystem, and the menu that offers them is hidden in the LITE build
// anyway. core/gatefold.js owns the FORMAT; this owns the dialogs, the path,
// and what the user is told when something goes wrong.
//
// Four disciplines, all of them learned in the sibling apps and all of them
// about not losing work:
//
//   MARK CLEAN ONLY AFTER THE WRITE RESOLVES. Marking clean on a cancelled or
//   failed save is how unsaved work gets thrown away silently.
//
//   RESET THE UNDO STACK ON LOAD. A freshly opened file is not a modified
//   one, and its undo must not reach back into the document that was open
//   before it — undoing past the load would restore the previous project's
//   elements into this one.
//
//   SAVE FALLS THROUGH TO SAVE AS. With no path there is nothing to save to,
//   so Ctrl+S on a new document opens the dialog rather than doing nothing.
//
//   ENCODING FAILURE AND DISK FAILURE ARE DIFFERENT MESSAGES. A project that
//   cannot be encoded fails for a reason the user can go and fix. A disk that
//   will not take the bytes is not theirs to fix, and telling them to look at
//   their document would send them hunting for a problem that is not there.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    let currentPath = null;

    const fs = () => App.fs;
    const say = (msg) => { if (window.Toast) Toast.show(msg); };

    function basename(path) {
        return String(path || '').split(/[\\/]/).pop();
    }

    /* ── the header ── */

    /** Called by session.refreshDirty on every change. */
    function refreshLabel(dirty) {
        const name = currentPath ? basename(currentPath) : 'untitled';
        const slot = document.getElementById('doc-name');
        if (slot) {
            slot.textContent = name + (dirty ? ' •' : '');
            slot.title = currentPath || 'not saved yet';
        }
        document.title = `${name}${dirty ? ' •' : ''} — GATE//FOLD`;
    }

    /* ── write ── */

    async function writeTo(path) {
        let text;
        try {
            text = App.gatefold.stringify();
        } catch (err) {
            // The document's problem, and a real one to report.
            say('CANNOT SAVE THIS PROJECT: ' + (err && err.message ? err.message : err));
            return false;
        }

        if (text.length > App.gatefold.LARGE_FILE_BYTES) {
            say(`LARGE PROJECT: ${Math.round(text.length / 1048576)} MB OF EMBEDDED ART`);
        }

        try {
            await fs().writeText(path, text);
        } catch (err) {
            // The disk's problem, and not the user's to fix.
            say('SAVE FAILED: ' + (err && err.message ? err.message : err));
            if (fs().logLine) fs().logLine('ERROR', 'save failed', String(err));
            return false;
        }

        // Only now. Not before the write, and not if it threw.
        App.session.markSaved();
        say('SAVED');
        return true;
    }

    async function saveAs() {
        if (!fs()) return;
        const suggested = currentPath
            || (App.gatefold.get().name || 'untitled').replace(/[^\w.-]+/g, '-')
                + '.' + App.gatefold.EXT;
        const path = await fs().saveProject(suggested);
        if (!path) return;                      // cancelled is not a failure
        const ext = '.' + App.gatefold.EXT;
        const target = path.endsWith(ext) ? path : path + ext;
        if (await writeTo(target)) {
            currentPath = target;
            App.session.refreshDirty();
        }
    }

    async function save() {
        if (!fs()) return;
        if (!currentPath) return saveAs();
        await writeTo(currentPath);
    }

    /* ── read ── */

    async function open() {
        if (!fs()) return;
        if (!await App.confirm.discard('Open another project?')) return;

        let path;
        try {
            path = await fs().openProject();
        } catch {
            say('COULD NOT OPEN THE FILE PICKER');
            return;
        }
        if (!path) return;                      // cancelled

        let text;
        try {
            text = await fs().readText(path);
        } catch (err) {
            say('COULD NOT READ THAT FILE: ' + (err && err.message ? err.message : err));
            return;
        }

        // core/gatefold.js reports a message rather than throwing, and leaves
        // the open document alone when it refuses.
        const res = App.gatefold.parse(text);
        if (res.error) { say(res.error.toUpperCase()); return; }

        adopt(path);
        say('OPENED ' + basename(path).toUpperCase());
    }

    /** Everything that has to happen when the document is replaced. */
    function adopt(path) {
        currentPath = path;
        App.images.reset();
        /* Inline rather than through ui/sizes.js, which would be a wider
           dependency than this module has ever needed — its suite stubs
           App.canvas with four lines on purpose, and core/formats.js is
           already in that sandbox. */
        const m = App.formats.metrics(App.gatefold.get().size);
        App.canvas.setSize(m.surface.w, m.surface.h, m.origin);
        App.session.resetHistory();
        App.session.render();
        App.props.syncFrom(null);
        syncCanvasControls();
    }

    /** The controls that show document state rather than element state. */
    function syncCanvasControls() {
        const doc = App.gatefold.get();
        /* Guarded: the suite runs this module without the UI layer, and the
           picker knows how to say CUSTOM for a size no preset matches, which
           is a question only ui/sizes.js can answer. */
        if (App.sizes) App.sizes.syncControls();
        const bg = document.getElementById('bgColor');
        const bgHex = document.getElementById('bgHex');
        if (bg) bg.value = doc.bgColor;
        if (bgHex) bgHex.value = doc.bgColor;
    }

    async function newProject() {
        if (!await App.confirm.discard('Start a new cover?')) return;
        App.gatefold.reset();
        adopt(null);
        say('NEW COVER');
    }

    function init() {
        if (!App.tier.current.has('projects')) {
            refreshLabel(false);
            return;
        }
        App.session.registerAction('project:new', newProject);
        App.session.registerAction('project:open', open);
        App.session.registerAction('project:save', save);
        App.session.registerAction('project:save-as', saveAs);
        refreshLabel(false);
    }

    App.projectUI = {
        init: init,
        newProject: newProject,
        open: open,
        save: save,
        saveAs: saveAs,
        refreshLabel: refreshLabel,
        path: () => currentPath,
    };
}());
