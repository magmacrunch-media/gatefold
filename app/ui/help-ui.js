// ui/help-ui.js — Reference and Credits.
//
// Both are the confirm dialog wearing a different message, which is why there
// is no third <dialog> in the markup: MagmaKit.modal.asker already gives one
// dialog three ways out, and a reference card that only needs "OK" does not
// need its own.
//
// The credits are not decoration. Lucide is ISC and every typeface is OFL,
// and both licences require attribution to travel with what they cover — this
// is where it travels to for someone who has the installed app and not the
// repo.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    const REFERENCE = [
        'TOOLS   V select · R rect · C circle · L line · T text',
        'EDIT    Ctrl+Z undo · Ctrl+Shift+Z redo · Del delete',
        '        Ctrl+C copy · Ctrl+V paste',
        'MOVE    arrows nudge 1px · Shift+arrows 10px',
        'FILE    Ctrl+N new · Ctrl+O open · Ctrl+S save',
        '        Ctrl+Shift+S save as · Ctrl+I import · Ctrl+E export',
        'VIEW    F7 layers · F1 this card',
        '',
        'Drag the handle above a selection to rotate it.',
        'Drop an image on the canvas, or paste one.',
        'Click the reference image to sample a colour.',
        'Escape deselects — useful once art covers the canvas.',
    ].join('\n');

    function version() {
        const slot = document.getElementById('app-version');
        return slot ? slot.textContent : '';
    }

    function credits() {
        return App.confirm.ask([
            `GATE//FOLD ${version()}`,
            'magmacrunch media',
            '',
            'Clip art from Lucide (ISC).',
            'Typefaces under the SIL Open Font License 1.1:',
            'Press Start 2P, Courier Prime, VT323, Silkscreen,',
            'DotGothic16, Pixelify Sans, Space Mono, Bebas Neue,',
            'Oswald, Playfair Display, Inter.',
            '',
            'Built on magma-kit.',
        ].join('\n'));
    }

    function reference() {
        return App.confirm.ask(REFERENCE);
    }

    function init() {
        App.session.registerAction('help:reference', reference);
        const link = document.getElementById('credits-link');
        if (link) link.addEventListener('click', credits);
    }

    App.helpUI = { init: init, reference: reference, credits: credits, REFERENCE: REFERENCE };
}());
