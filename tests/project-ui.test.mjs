import { test, eq, ok } from './kit/assert.mjs';

/* The one ui/ file worth reaching into, and only for the part of it that is
   logic rather than DOM: what Save, Save As and Open do when the disk, the
   dialog or the file disagrees with them. Every one of these is a way to lose
   work silently, which is why they are pinned rather than left to a manual
   pass.

   What is stubbed is the shell — no document, no canvas, no renderer. This
   supplies exactly the handful of named things project-ui.js reaches for,
   which doubles as a check that it has not quietly grown more. */

function mount(M, harness, opts = {}) {
    const o = opts;
    const toasts = [];
    const written = [];
    const calls = [];

    let dirty = true;
    let historyReset = 0;

    /* The harness gives core/ no document on purpose — a core module that
       needs one belongs in ui/. project-ui.js IS a ui/ module, so the shell it
       reaches for is supplied here, and the fact that this stub is four lines
       long is itself the check that it has not grown a wider surface. */
    const sandbox = harness.coreSandbox({
        document: {
            getElementById: () => null,
            querySelector: () => null,
            addEventListener: () => {},
            title: '',
        },
        Toast: { show: (m) => toasts.push(m) },
    });

    const App = sandbox.Gatefold;

    App.fs = o.noFs ? undefined : {
        saveProject: (d) => { calls.push('saveProject'); return Promise.resolve(o.savePath ?? null); },
        openProject: () => { calls.push('openProject'); return Promise.resolve(o.openPath ?? null); },
        writeText: (p, t) => {
            calls.push('writeText');
            if (o.writeFails) return Promise.reject(new Error('EACCES: permission denied'));
            written.push([p, t]);
            return Promise.resolve();
        },
        readText: () => o.readFails
            ? Promise.reject(new Error('ENOENT'))
            : Promise.resolve(o.fileText ?? ''),
        setDirty: () => Promise.resolve(),
        logLine: () => Promise.resolve(),
    };

    App.tier = { current: { has: () => !o.noFs, name: o.noFs ? 'lite' : 'full' } };

    App.session = {
        isDirty: () => dirty,
        markSaved: () => { dirty = false; },
        refreshDirty: () => {},
        resetHistory: () => { historyReset++; dirty = false; },
        render: () => {},
        registerAction: () => {},
    };
    App.confirm = { discard: () => Promise.resolve(o.confirmDiscard !== false) };
    App.images = { reset: () => {} };
    App.canvas = { setSize: () => {} };
    App.props = { syncFrom: () => {} };

    harness.loadUI(sandbox, 'project-ui.js');

    return {
        App,
        ui: App.projectUI,
        toasts,
        written,
        calls,
        isDirty: () => dirty,
        makeDirty: () => { dirty = true; },
        historyResets: () => historyReset,
    };
}

export default async function (M, harness) {
    /* ── save ── */

    await test.async('Save with no path falls through to Save As', async () => {
        const t = mount(M, harness, { savePath: 'C:/a/cover.gatefold' });
        await t.ui.save();
        ok(t.calls.includes('saveProject'), 'the dialog was opened');
        eq(t.ui.path(), 'C:/a/cover.gatefold', 'and the path was remembered');
    });

    await test.async('Save with a path does not ask again', async () => {
        const t = mount(M, harness, { savePath: 'C:/a/cover.gatefold' });
        await t.ui.save();
        t.calls.length = 0;
        t.makeDirty();
        await t.ui.save();
        ok(!t.calls.includes('saveProject'), 'no second dialog');
        ok(t.calls.includes('writeText'), 'it just wrote');
    });

    await test.async('Save As appends the extension when the dialog did not', async () => {
        const t = mount(M, harness, { savePath: 'C:/a/cover' });
        await t.ui.saveAs();
        eq(t.ui.path(), 'C:/a/cover.gatefold', 'extension added');
        eq(t.written[0][0], 'C:/a/cover.gatefold', 'and that is what was written to');
    });

    await test.async('Save As does not double the extension', async () => {
        const t = mount(M, harness, { savePath: 'C:/a/cover.gatefold' });
        await t.ui.saveAs();
        eq(t.ui.path(), 'C:/a/cover.gatefold', 'left alone');
    });

    /* ── the disciplines that stop work being lost ── */

    await test.async('a cancelled Save As writes nothing and stays dirty', async () => {
        const t = mount(M, harness, { savePath: null });
        await t.ui.saveAs();
        ok(!t.calls.includes('writeText'), 'nothing written');
        ok(t.isDirty(), 'still dirty');
        eq(t.ui.path(), null, 'and no path was taken');
        eq(t.toasts, [], 'cancelling is not an event worth a message');
    });

    /* Marking clean on a failed save is how unsaved work gets thrown away
       silently: the document says it is saved, the user closes it, and the
       close guard does not fire. */
    await test.async('a save the disk refuses stays dirty', async () => {
        const t = mount(M, harness, { savePath: 'C:/a/cover.gatefold', writeFails: true });
        await t.ui.save();
        ok(t.isDirty(), 'STILL DIRTY after a failed write');
        ok(t.toasts.some((m) => /SAVE FAILED/i.test(m)), 'and it says so');
    });

    await test.async('a failed save does not take the path either', async () => {
        const t = mount(M, harness, { savePath: 'C:/a/cover.gatefold', writeFails: true });
        await t.ui.saveAs();
        eq(t.ui.path(), null, 'a path that was never written to is not the open file');
    });

    /* A project that cannot be encoded fails for a reason the user can go and
       fix; a disk that will not take the bytes is not theirs to fix. Sending
       them to look at their document for an EACCES wastes their time. */
    await test.async('encoding failure and disk failure read differently', async () => {
        const disk = mount(M, harness, { savePath: 'C:/a/c.gatefold', writeFails: true });
        await disk.ui.save();
        const diskMsg = disk.toasts[disk.toasts.length - 1];

        const enc = mount(M, harness, { savePath: 'C:/a/c.gatefold' });
        // A document that cannot be serialised: a cycle.
        const doc = enc.App.gatefold.get();
        doc.elements.push({ id: 1, type: 'rect' });
        doc.elements[0].self = doc.elements[0];
        await enc.ui.save();
        const encMsg = enc.toasts[enc.toasts.length - 1];

        ok(/SAVE FAILED/i.test(diskMsg), `disk: ${diskMsg}`);
        ok(/CANNOT SAVE THIS PROJECT/i.test(encMsg), `encoding: ${encMsg}`);
        ok(diskMsg !== encMsg, 'and they are not the same sentence');
    });

    /* ── open ── */

    await test.async('opening resets the undo stack', async () => {
        const t = mount(M, harness, {
            openPath: 'C:/a/c.gatefold',
            fileText: JSON.stringify({ type: 'gatefold', version: '1.0', elements: [] }),
        });
        await t.ui.open();
        eq(t.historyResets(), 1, 'reset once');
        ok(!t.isDirty(), 'and a freshly opened file is not a modified one');
        eq(t.ui.path(), 'C:/a/c.gatefold', 'the path is now the open file');
    });

    await test.async('a cancelled open changes nothing', async () => {
        const t = mount(M, harness, { openPath: null });
        await t.ui.open();
        eq(t.historyResets(), 0, 'no reset');
        eq(t.ui.path(), null, 'no path');
    });

    await test.async('a file that will not read is reported, not swallowed', async () => {
        const t = mount(M, harness, { openPath: 'C:/a/c.gatefold', readFails: true });
        await t.ui.open();
        ok(t.toasts.some((m) => /COULD NOT READ/i.test(m)), 'reported');
        eq(t.historyResets(), 0, 'and nothing was adopted');
    });

    await test.async("someone else's file leaves the open document alone", async () => {
        const t = mount(M, harness, {
            openPath: 'C:/a/c.gatefold',
            fileText: JSON.stringify({ type: 'deck-design', version: '2.0' }),
        });
        t.App.gatefold.get().name = 'work in progress';
        await t.ui.open();
        eq(t.App.gatefold.get().name, 'work in progress', 'not clobbered');
        eq(t.historyResets(), 0, 'and the undo stack was not thrown away either');
    });

    await test.async('declining the discard prompt aborts the open', async () => {
        const t = mount(M, harness, { openPath: 'C:/a/c.gatefold', confirmDiscard: false });
        await t.ui.open();
        eq(t.calls.length, 0, 'the picker never opened');
    });

    /* ── the LITE build ── */

    await test.async('with no filesystem every entry point is inert', async () => {
        const t = mount(M, harness, { noFs: true });
        await t.ui.save();
        await t.ui.saveAs();
        await t.ui.open();
        eq(t.calls.length, 0, 'nothing was called');
        ok(t.isDirty(), 'and nothing was marked saved');
    });
}
