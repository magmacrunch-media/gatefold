import { test, eq, ok } from './kit/assert.mjs';

/* ui/session.js, and only the part of it that is logic rather than DOM: what
   the undo stack actually HOLDS after an arrow-key nudge.
 *
 * Worth pinning because the failure is silent in exactly the way a stack bug
 * always is. The nudge used to call pushUndo() from its debounce timer —
 * AFTER the element had already moved — and history.push()'s contract is that
 * the state handed to it is the pre-mutation one. So the entry recorded where
 * the element had been nudged TO: Ctrl+Z restored the position it was already
 * in, Undo lit up in the menu and did nothing visible, and the position before
 * the run was never captured at all. Nothing caught it. keybindings.test.mjs
 * asserts the arrow keys are bound and that the debounce is a positive number;
 * neither says the entry is any good.
 *
 * What is stubbed is the shell — no canvas, no renderer, no document to speak
 * of. Timers are stubbed too, and that is the point rather than a shortcut:
 * firing the debounce by hand is the only way to assert what it commits
 * without sleeping through it. */

function mount(harness) {
    /* Fake timers. setTimeout returns the new length, so every id is truthy
       and `clearTimeout(null)` on the first nudge stays distinguishable from
       clearing a real one. */
    const timers = [];

    /** Run every armed timer. Returns how many there were. */
    function fire() {
        const pending = timers.filter(Boolean);
        timers.length = 0;
        for (const fn of pending) fn();
        return pending.length;
    }

    const sandbox = harness.coreSandbox({
        document: {
            getElementById: () => null,
            querySelector: () => null,
            addEventListener: () => {},
        },
        setTimeout: (fn) => timers.push(fn),
        clearTimeout: (id) => { if (id) timers[id - 1] = null; },
    });

    const App = sandbox.Gatefold;
    /* The entire shell session.js reaches for outside a real page. That it is
       one stub is itself the check that this file has not quietly grown a
       wider surface — App.props, App.layers, App.sizes, App.projectUI and
       App.fs are all optional at every call site and stay absent here. */
    App.canvas = { schedule: () => {} };

    harness.loadUI(sandbox, 'session.js');

    const S = App.session;
    S.initHistory();
    return { App, S, fire };
}

/** The live x of an element, read out of the document rather than off a stale
    reference — undo replaces the array wholesale. */
function xOf(App, id) {
    const el = App.gatefold.get().elements.find((e) => e.id === id);
    return el ? el.x : null;
}

export default function (M, harness) {
    test('a nudge is undoable — the entry holds the position BEFORE it', () => {
        const { App, S, fire } = mount(harness);
        const el = App.element.create('rect', { x: 100, y: 100, w: 10, h: 10 });
        S.add(el);

        S.nudge(1, 0);
        eq(xOf(App, el.id), 101, 'the nudge moved it');
        eq(fire(), 1, 'the debounce armed exactly one timer');
        ok(S.canUndo(), 'and committed an entry');

        S.undo();
        eq(xOf(App, el.id), 100, 'undo puts it back where the run started');
    });

    test('a run of nudges collapses into one entry, not one per key', () => {
        const { App, S, fire } = mount(harness);
        const el = App.element.create('rect', { x: 100, y: 100, w: 10, h: 10 });
        S.add(el);

        for (let i = 0; i < 5; i++) S.nudge(1, 0);
        eq(xOf(App, el.id), 105, 'all five moved it');
        eq(fire(), 1, 'five keypresses, one timer left armed');

        S.undo();
        eq(xOf(App, el.id), 100, 'and one undo covers the whole run');
    });

    test('an edit during a nudge run lands above it, not under it', () => {
        /* The debounce leaves a window in which another mutation can record
           its own entry. Without a flush the nudge's snapshot commits 300ms
           later, ON TOP of work that came after the state it holds, and the
           stack is then out of order — undo walks back through a state that
           never existed. */
        const { App, S } = mount(harness);
        const a = App.element.create('rect', { x: 100, y: 100, w: 10, h: 10 });
        S.add(a);

        S.nudge(1, 0);                  // timer still armed
        const b = App.element.create('circle', { x: 5, y: 5, w: 10, h: 10 });
        S.add(b);                       // an edit arrives mid-run

        const count = () => App.gatefold.get().elements.length;
        eq(count(), 2, 'both elements are in the document');

        S.undo();
        eq(count(), 1, 'the newest edit undoes first');
        eq(xOf(App, a.id), 101, 'and the nudge is still applied');

        S.undo();
        eq(xOf(App, a.id), 100, 'then the nudge, in the order it happened');
    });

    test('nudging a locked element neither moves it nor opens an entry', () => {
        const { App, S, fire } = mount(harness);
        const el = App.element.create('rect', { x: 100, y: 100, w: 10, h: 10 });
        S.add(el);
        S.setLocked(el.id, true);

        S.nudge(1, 0);
        eq(xOf(App, el.id), 100, 'locked means fixed in place');
        eq(fire(), 0, 'and no debounce was armed');
    });
}
