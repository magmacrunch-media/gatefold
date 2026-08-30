import { test, eq, ok } from './kit/assert.mjs';

/* The table is data so that it can be checked. What goes wrong with a
   keyboard is not usually one binding being wrong, it is two bindings quietly
   claiming the same chord, or a surface offering an action nothing implements
   — neither of which is visible by reading the table. */

export default function (M) {
    const K = M.keybindings;

    const chord = (b) => `${b.ctrl ? 'Ctrl+' : ''}${b.shift ? 'Shift+' : ''}${b.key}`;

    test('no two bindings claim the same chord', () => {
        const seen = new Map();
        for (const b of K.BINDINGS) {
            const c = chord(b).toLowerCase();
            ok(!seen.has(c), `${chord(b)} is claimed by both ${seen.get(c)} and ${b.action}`);
            seen.set(c, b.action);
        }
    });

    /* MagmaKit.keys matches a single character case-insensitively, so 'v' and
       'V' are the same binding and declaring both would be the collision
       above under a different name. */
    test('single-character keys are declared in lower case', () => {
        for (const b of K.BINDINGS) {
            if (b.key.length === 1) eq(b.key, b.key.toLowerCase(), `${b.action} key`);
        }
    });

    test('every action a surface offers exists in the table', () => {
        const actions = new Set(K.BINDINGS.map((b) => b.action));
        for (const [surface, list] of Object.entries(K.AVAILABLE)) {
            for (const a of list) ok(actions.has(a), `${surface} offers ${a}, which is bound`);
        }
    });

    test('every action in the table is reachable from some surface', () => {
        const offered = new Set(Object.values(K.AVAILABLE).flat());
        for (const b of K.BINDINGS) {
            ok(offered.has(b.action), `${b.action} is offered by at least one surface`);
        }
    });

    test('everything that must not reach the browser is a real action', () => {
        const actions = new Set(K.BINDINGS.map((b) => b.action));
        for (const a of K.PREVENT) ok(actions.has(a), `${a} is bound`);
    });

    /* Ctrl+S must not save the page and Ctrl+O must not open a file — that is
       the whole reason PREVENT exists. */
    test('the browser-stealing chords are all prevented', () => {
        for (const a of ['project:save', 'project:save-as', 'project:open', 'project:new',
            'file:import', 'file:export',
            // Ctrl+L is the address bar, and Ctrl+Shift+L is a password
            // manager in more than one browser.
            'edit:lock', 'edit:unlock-all']) {
            ok(K.PREVENT.includes(a), `${a} is prevented`);
        }
    });

    /* In a WebView an unhandled Backspace outside a field has historically
       meant "go back", and there is nowhere to go back to in a single-page
       tool — it unloads the app. */
    test('delete is prevented, because Backspace outside a field means "go back"', () => {
        ok(K.PREVENT.includes('edit:delete'), 'prevented');
        const keys = K.BINDINGS.filter((b) => b.action === 'edit:delete').map((b) => b.key);
        eq(keys.sort(), ['Backspace', 'Delete'], 'both keys mean delete');
    });

    /* Escape is deliberately NOT prevented: inside a field it means "cancel"
       and the field keeps it, which is the kit's documented behaviour. */
    test('escape is not prevented, so a field can still cancel with it', () => {
        ok(!K.PREVENT.includes('select:none'), 'left alone');
    });

    test('save and save-as differ only by shift, and shift is exact', () => {
        const save = K.BINDINGS.find((b) => b.action === 'project:save');
        const saveAs = K.BINDINGS.find((b) => b.action === 'project:save-as');
        eq([save.key, !!save.ctrl, !!save.shift], ['s', true, false], 'Ctrl+S');
        eq([saveAs.key, !!saveAs.ctrl, !!saveAs.shift], ['s', true, true], 'Ctrl+Shift+S');
    });

    test('both spellings of redo resolve to one action', () => {
        const redos = K.BINDINGS.filter((b) => b.action === 'edit:redo');
        eq(redos.length, 2, 'Ctrl+Shift+Z and Ctrl+Y');
        ok(redos.every((b) => b.ctrl), 'both need ctrl');
    });

    test('the unmodified letter shortcuts do not collide with the ctrl ones', () => {
        const bare = K.BINDINGS.filter((b) => !b.ctrl && b.key.length === 1);
        eq(bare.map((b) => b.key).sort(), ['c', 'l', 'r', 't', 'v'], 'the five tool keys');
        for (const b of bare) ok(b.action.startsWith('tool:'), `${b.key} is a tool`);
    });

    test('a nudge is one pixel, or ten with shift', () => {
        eq(K.NUDGE, { fine: 1, coarse: 10 }, 'the two steps');
        ok(K.NUDGE_DEBOUNCE_MS > 0, 'and rapid nudges collapse into one undo entry');
    });

    test('all four arrows nudge', () => {
        const dirs = K.BINDINGS.filter((b) => b.action.startsWith('nudge:'))
            .map((b) => b.action.split(':')[1]).sort();
        eq(dirs, ['down', 'left', 'right', 'up'], 'four directions');
    });

    /* A dialog must not let Delete remove the element behind it while a title
       is being typed. */
    test('a modal surface offers almost nothing', () => {
        eq(K.AVAILABLE.modal, ['select:none'], 'only the way out');
        ok(K.AVAILABLE.editor.length > 10, 'while the editor offers the rest');
    });
}
