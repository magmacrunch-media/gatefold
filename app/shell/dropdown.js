/* ═══════════════════════════════════════════════
    magmacrunch media — retro dropdown
    ware/shell/dropdown.js

    One implementation of the click-to-open option list used by
    album-art-maker, media-search and pixel-process. The first two had a
    byte-identical copy of this; pixel-process had the same widget rewritten
    with `var`, taking an element instead of an id, and positioning the list
    with getBoundingClientRect() because its options are position:fixed and
    have to escape a clipping panel.

    This version covers all three:
      - `target` may be an element or an element id
      - the rect positioning runs only when .dropdown-options actually
        computes to position:fixed, so the absolute-positioned callers are
        untouched

    Pair with ware/shell/dropdown.css (album-art-maker, media-search).
    pixel-process keeps its own stylesheet — see the note in dropdown.css.

    Exposes window.RetroDropdown = { setup, getValue, setValue }.
    ═══════════════════════════════════════════════ */

(function () {
    function resolve(target) {
        return typeof target === 'string' ? document.getElementById(target) : target;
    }

    /* Attach open/close and selection behaviour to one dropdown.
       onSelect receives the chosen option's data-value.

       opts.markActive (default true) moves the .active class to the chosen
       option. pixel-process passes false: two of its three dropdowns are
       action menus — picking "ADD EFFECT > BLUR" appends to a chain rather
       than selecting a value — so a sticky highlight would be misleading. */
    function setup(target, onSelect, opts) {
        const markActive = !(opts && opts.markActive === false);
        const container = resolve(target);
        if (!container) return;

        const selected = container.querySelector('.dropdown-selected');
        const options = container.querySelectorAll('.dropdown-option');
        const list = container.querySelector('.dropdown-options');
        if (!selected) return;

        selected.addEventListener('click', (e) => {
            e.stopPropagation();

            // Close every other open dropdown on the page.
            document.querySelectorAll('.custom-dropdown.open').forEach(d => {
                if (d !== container) d.classList.remove('open');
            });

            // A fixed-position list is outside the trigger's containing block,
            // so it has to be told where to go. Absolute lists position
            // themselves off the trigger and must not be touched.
            if (list && getComputedStyle(list).position === 'fixed') {
                const rect = selected.getBoundingClientRect();
                list.style.top = rect.bottom + 'px';
                list.style.left = rect.left + 'px';
                list.style.width = rect.width + 'px';
            }

            container.classList.toggle('open');
        });

        options.forEach(opt => {
            opt.addEventListener('click', () => {
                const label = selected.querySelector('span:first-child');
                if (label) label.textContent = opt.textContent;
                if (markActive) {
                    options.forEach(o => o.classList.remove('active'));
                    opt.classList.add('active');
                }
                container.classList.remove('open');
                if (onSelect) onSelect(opt.dataset.value);
            });
        });

        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) container.classList.remove('open');
        });
    }

    /* data-value of the active option, or `fallback` when there is none.
       album-art-maker wants null here, media-search wants 'all'. */
    function getValue(target, fallback) {
        const container = resolve(target);
        if (!container) return fallback === undefined ? null : fallback;
        const active = container.querySelector('.dropdown-option.active');
        if (!active) return fallback === undefined ? null : fallback;
        return active.dataset.value;
    }

    /* Mark the option carrying `value` active and sync the trigger label. */
    function setValue(target, value) {
        const container = resolve(target);
        if (!container) return;

        const options = container.querySelectorAll('.dropdown-option');
        options.forEach(o => o.classList.toggle('active', o.dataset.value === value));

        const label = container.querySelector('.dropdown-selected span:first-child');
        const active = container.querySelector('.dropdown-option.active');
        if (label && active) label.textContent = active.textContent;
    }

    window.RetroDropdown = { setup, getValue, setValue };
})();
