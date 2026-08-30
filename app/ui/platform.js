// ui/platform.js — what the keyboard is called here.
//
// The BEHAVIOUR is already right on every platform and none of it lives in
// this file: MagmaKit.keys resolves `ctrl` from `ctrlKey || metaKey`, so Cmd+S
// and Ctrl+S have always been the same binding. What is wrong on a Mac is only
// what the menu SAYS — "Ctrl+S" on a machine with no Ctrl key people use, and
// "Exit  Alt+F4", which is not a thing that exists there at all.
//
// So this rewrites labels and nothing else. It binds no keys, prevents no
// defaults, and if it never ran the app would work identically and just read
// like a Windows app.
//
// The labels live in the markup rather than being generated, because that is
// where a reader looks for them and because the Windows spelling is the
// common case. This is a pass over them, once, at boot.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    /* userAgentData.platform is the modern answer and is absent in WebKit, so
       the userAgent is the fallback rather than the other way round. Both are
       spoofable, which does not matter: the cost of being wrong is a label. */
    function detectMac() {
        const d = navigator.userAgentData;
        if (d && typeof d.platform === 'string') return /mac/i.test(d.platform);
        return /Mac|iPhone|iPad/i.test(navigator.userAgent || '');
    }

    /* Held on the exported object rather than in a closure const, so both
       functions below read ONE value that a test can also set. Detected once
       at load; nothing in the app writes it. */
    const platform = { isMac: detectMac() };

    /* The Mac spelling. Order matters: Ctrl+Shift+S has to become the single
       glyph run ⇧⌘S, so the modifiers are consumed together rather than one
       at a time — and the shift glyph sits BEFORE the command glyph, which is
       the convention every Mac menu follows. */
    function label(text) {
        if (!platform.isMac) return text;
        return String(text)
            .replace(/Ctrl\+Shift\+/g, '⇧⌘')
            .replace(/Ctrl\+/g, '⌘')
            .replace(/Shift\+/g, '⇧')
            .replace(/\bAlt\+F4\b/g, '⌘Q')
            .replace(/\bDel\b/g, '⌫');
    }

    /** Words, not chords: a Mac quits, a PC exits. */
    const WORDS = { Exit: 'Quit' };

    /**
     * Rewrite every shortcut hint and tooltip in the page.
     *
     * Runs once, before the menu is wired, so nothing has cached a label.
     */
    function applyLabels() {
        if (!platform.isMac) return;

        // The <i> in each menu item is the shortcut hint.
        for (const hint of document.querySelectorAll('#menubar [data-action] i')) {
            hint.textContent = label(hint.textContent);
        }

        // The item's own text, for the handful that are words rather than keys.
        for (const item of document.querySelectorAll('#menubar [data-action]')) {
            const first = item.firstChild;
            if (first && first.nodeType === 3 && WORDS[first.nodeValue.trim()]) {
                first.nodeValue = WORDS[first.nodeValue.trim()];
            }
        }

        // Tooltips anywhere, which name the same chords in prose.
        for (const el of document.querySelectorAll('[title]')) {
            const t = el.getAttribute('title');
            if (t && t.indexOf('Ctrl') !== -1) el.setAttribute('title', label(t));
        }
    }

    platform.label = label;
    platform.applyLabels = applyLabels;
    App.platform = platform;
}());
