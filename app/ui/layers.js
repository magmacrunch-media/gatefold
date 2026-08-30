// ui/layers.js — the object list. FULL only.
//
// Shaped on sprite-forge/app/ui/sprites-ui.js, with album//art's vocabulary.
// Three decisions worth stating:
//
//   RENDERED TOP-FIRST. doc.elements is bottom-first z-order, because that is
//   the order it is drawn in. A list that reads upside down against the canvas
//   is worse than no list, so the rows are reversed and the array is not.
//
//   IT DOES NOT OWN THE REORDER. The row arrows call session.reorder(), which
//   is the same function the FWD/BACK buttons in the property panel call. The
//   menu-bar rule applies here too: a second implementation of a thing that
//   already exists is a thing that can drift from it.
//
//   NAMES ARE NOT UNIQUED. sprite-forge uniques its sprite names because they
//   are the keys of its file format, and duplicates made projects saveable and
//   then unopenable. Here a name is a label on a row and nothing indexes by
//   it, so borrowing that constraint would be borrowing a rule with no reason.

(function () {
    'use strict';

    const App = (window.Gatefold = window.Gatefold || {});

    const dom = () => window.MagmaKit.dom;
    const doc = () => App.gatefold.get();

    let list = null;

    /** What a row says when the element has no name of its own. */
    function labelFor(el) {
        if (el.name) return el.name;
        if (el.type === 'text') return App.element.describe(el) || 'TEXT';
        if (el.type === 'image') {
            // The imported filename, which is exactly what artstore's `name`
            // field is for.
            const meta = el.src && App.artstore.meta(el.src);
            return (meta && meta.name) || 'IMAGE';
        }
        if (el.type === 'clipart') return App.clipart.getIconLabel(el.clipartId);
        return '';
    }

    function kindOf(el) {
        return el.type === 'clipart' ? 'ICON' : el.type.toUpperCase();
    }

    function row(el, selectedId) {
        const d = dom();
        const r = d.el('div', 'layer-row');
        if (el.id === selectedId) r.classList.add('selected');
        if (el.visible === false) r.classList.add('hidden');
        if (el.locked === true) r.classList.add('locked');

        r.appendChild(d.el('span', 'layer-kind', kindOf(el)));
        r.appendChild(d.el('span', 'layer-name', labelFor(el)));

        const eye = d.el('button', 'layer-vis', el.visible === false ? '○' : '●');
        eye.type = 'button';
        eye.title = el.visible === false ? 'Show' : 'Hide';
        eye.addEventListener('click', function (e) {
            e.stopPropagation();   // toggling visibility is not selecting
            App.session.pushUndo();
            el.visible = el.visible === false;
            App.session.render();
        });
        r.appendChild(eye);

        /* The other way out of a lock, and the discoverable one. A locked
           element is skipped by hit testing, so this row is the only place it
           can still be pointed at with a mouse. */
        const lock = d.el('button', 'layer-lock', el.locked === true ? '🔒' : '🔓');
        lock.type = 'button';
        lock.title = el.locked === true ? 'Unlock' : 'Lock in place';
        lock.addEventListener('click', function (e) {
            e.stopPropagation();   // locking is not selecting
            App.session.setLocked(el.id, el.locked !== true);
        });
        r.appendChild(lock);

        r.addEventListener('click', function () { App.session.select(el.id); });
        return r;
    }

    function render() {
        if (!list) return;
        if (!App.tier.current.has('layers')) return;

        const d = dom();
        d.clear(list);

        const els = doc().elements;
        if (!els.length) {
            list.appendChild(d.noData('— no elements —'));
            return;
        }

        const selectedId = App.session.getSelectedId();
        // Top-first: the last element in the array is drawn on top.
        for (let i = els.length - 1; i >= 0; i--) list.appendChild(row(els[i], selectedId));
    }

    function init() {
        list = document.getElementById('layersList');
        if (!list || !App.tier.current.has('layers')) return;

        App.session.registerAction('view:layers', function () {
            document.getElementById('layersToggle').click();
        });
        render();
    }

    App.layers = { init: init, render: render, labelFor: labelFor };
}());
