// ui/help-ui.js — Reference and Credits.
//
// Both used to be a block of text handed to the confirm dialog: one monospace
// paragraph in which the chords, the prose and the licence notices all had the
// same weight, so the card said everything and showed nothing. They are real
// dialogs now, shaped on sprite-forge's, which solved this first — a heading,
// sub-labels, and a definition list for the chords.
//
// The content is in the MARKUP rather than built here, for the same reason
// ui/platform.js gives for the menu: that is where a reader looks for it, and
// it is what platform.applyLabels() rewrites at boot so a Mac reads Cmd. A
// card assembled in JavaScript would need its own relabelling pass.
//
// The credits are not decoration. Lucide is ISC and every typeface is OFL, and
// both licences require attribution to travel with what they cover — this is
// where it travels to for someone who has the installed app and not the repo.
//
// The version is not written here either. index.html carries it once, in the
// footer, and this reads it back out; AGENTS.md counts the five places a
// version lives and this file is deliberately not a sixth.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    const $ = (id) => document.getElementById(id);

    let wired = null;

    function ensure() {
        if (wired) return wired;
        const ref = $('referenceModal');
        const cre = $('creditsModal');
        if (!ref || !cre || !window.MagmaKit || !window.MagmaKit.modal) return null;

        // The three ways out — the x, the CLOSE button and the backdrop — are
        // the kit's, the same as every other dialog in the app.
        wired = {
            reference: window.MagmaKit.modal.wire(ref, { closers: ['referenceClose'] }),
            credits: window.MagmaKit.modal.wire(cre, { closers: ['creditsClose'] }),
        };
        return wired;
    }

    /* Both are reachable from the same menu and showModal() on an already-open
       dialog throws, so opening one closes the other. */
    function open(which) {
        const w = ensure();
        if (!w) return;
        const other = which === 'credits' ? 'reference' : 'credits';
        w[other].close();
        w[which].open();
    }

    function credits() {
        const slot = $('creditsVersion');
        const version = $('app-version');
        if (slot && version) slot.textContent = version.textContent;
        open('credits');
    }

    function reference() { open('reference'); }

    function init() {
        App.session.registerAction('help:reference', reference);
        const link = $('credits-link');
        if (link) link.addEventListener('click', credits);
    }

    App.helpUI = { init: init, reference: reference, credits: credits };
}());
