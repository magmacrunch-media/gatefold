// ui/sizes.js — the size picker, generated from core/formats.js.
//
// The four square sizes used to be four hand-typed <div>s in index.html and a
// SQUARE_SIZES constant in core/gatefold.js that nothing read: two lists, no
// source of truth, and adding a fifth size meant remembering both. This reads
// the registry, so a new format is an entry there and nothing else.
//
// ONE FLAT DROPDOWN WITH HEADINGS, not a category picker feeding a preset
// picker. app/shell/dropdown.js binds a click listener to each option node
// that exists at setup() time and adds a fresh document listener per call, so
// repopulating a second list and calling setup() again leaks listeners and
// stops the trigger toggling. The shell is vendored, so the design works
// around the widget rather than changing it — which is why populate() must
// run BEFORE setup(), and setup() exactly once.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    const ID = 'canvasSizeDropdown';

    /** The presets this build is allowed to offer. */
    function visible() {
        /* core/tier.js has reserved `sizes` for "non-square canvases, and
           later mm/print sizes" since the port without anything reading it.
           This is that reader. LITE keeps exactly the four squares that are
           live on magmacrunch.com — it loses nothing, which is the rule. */
        const allowed = App.tier.current.has('sizes');
        return App.formats.FORMATS.filter(function (f) {
            return f.tier !== 'full' || allowed;
        });
    }

    function populate() {
        const list = document.querySelector('#' + ID + ' .dropdown-options');
        if (!list) return;
        let group = null;
        let html = '';
        for (const f of visible()) {
            if (f.group !== group) {
                group = f.group;
                /* A heading, not an option. dropdown.js only ever reaches for
                   .dropdown-option, so this is inert by construction rather
                   than by being told to be. */
                html += '<div class="dropdown-group">' + group + '</div>';
            }
            html += '<div class="dropdown-option" data-value="' + f.id + '">' + f.label + '</div>';
        }
        list.innerHTML = html;
    }

    /** Push the document's size at the backing store. The one place. */
    function applyToCanvas() {
        const m = App.formats.metrics(App.gatefold.get().size);
        App.canvas.setSize(m.surface.w, m.surface.h, m.origin);
    }

    function apply(id) {
        const size = App.formats.sizeOf(id);
        if (!size) return;
        App.session.pushUndo();
        /* REPLACED, never patched. Object.assign can add a key and cannot
           remove one, so patching a square over a J-card would leave `panels`
           behind and the square would draw fold lines it does not have. */
        App.gatefold.get().size = size;
        applyToCanvas();
        /* The label is a function of the DOCUMENT, not of how the size got
           set. shell/dropdown.js writes it from the option that was clicked,
           so without this any caller that is not a click — undo, opening a
           file, anything later — leaves the picker naming the size before
           last. Re-setting it after a click is a no-op. */
        syncControls();
        App.session.render();
    }

    /** Highlight whichever preset the document IS, or say so when it is none. */
    function syncControls() {
        if (!window.RetroDropdown) return;
        const id = App.formats.matchId(App.gatefold.get().size);
        /* The preset has to be one this build actually OFFERS, not merely one
           the registry knows: shell/dropdown.js's setValue clears every
           highlight and then only writes the label `if (label && active)`, so
           an id with no option node leaves a stale label above an unhighlighted
           list — the picker reading 1024 over a J-card. Asking for the node
           first is what makes the CUSTOM branch below reachable in the case it
           was written for. */
        if (id && document.querySelector('#' + ID + ' .dropdown-option[data-value="' + id + '"]')) {
            RetroDropdown.setValue(ID, id);
            return;
        }
        /* A size this picker does not list is still a perfectly good document
           — a file saved by a build whose preset list has since changed opens
           fine — so CUSTOM is the honest label rather than a preset it is not. */
        const label = document.querySelector('#' + ID + ' .dropdown-selected span:first-child');
        document.querySelectorAll('#' + ID + ' .dropdown-option').forEach(function (o) {
            o.classList.remove('active');
        });
        if (label) label.textContent = 'CUSTOM';
    }

    function init() {
        populate();
        RetroDropdown.setup('canvasSizeDropdown', apply);
        syncControls();
    }

    App.sizes = {
        init: init,
        apply: apply,
        applyToCanvas: applyToCanvas,
        syncControls: syncControls,
    };
}());
