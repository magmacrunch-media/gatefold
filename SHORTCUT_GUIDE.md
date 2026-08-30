# GATE//FOLD desktop shortcut

Build first — the shortcut points at a binary that has to exist:

```bash
cd desktop && npm run build
```

If `cargo` reports "command not found" it is almost certainly installed and
just off PATH; it lives at `%USERPROFILE%\.cargo\bin`.

## Where the binary is

```
C:\magma\dev\gatefold\desktop\src-tauri\target\release\gatefold.exe
```

`target\release\`, **not** `desktop\build\` — Tauri has no such output
directory. The binary takes its name from the Cargo package (`gatefold`); the
installers under `target\release\bundle\` take theirs from `productName` in
`tauri.conf.json` (`GATEFOLD`).

## Create the shortcut

Run in PowerShell:

```powershell
$root = 'C:\magma\dev\gatefold\desktop\src-tauri'
$exe  = Join-Path $root 'target\release\gatefold.exe'
if (-not (Test-Path $exe)) { throw "Not built yet: $exe" }
$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'GATEFOLD.lnk'
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath       = $exe
$s.WorkingDirectory = Split-Path $exe
$s.IconLocation     = "$exe,0"
$s.Description      = 'GATE//FOLD — album cover and sleeve editor'
$s.Save()
```

Four details in there are load-bearing, all of them learned the hard way in
deck-press rather than here:

**`IconLocation` points at the exe, not at `icons\icon.ico`.** The exe carries
the icon as a compiled resource, so there is one source rather than a loose
file the icon pipeline overwrites. A shortcut whose icon points at a file the
build rewrites is exactly the arrangement that leaves a stale icon sitting on
the desktop after a rebuild.

**`[Environment]::GetFolderPath('Desktop')`, not `$env:USERPROFILE\Desktop`.**
The Desktop is redirected into OneDrive on this machine, so the literal path
finds nothing — and that redirection is why a search for the shortcut can come
up empty while the shortcut is sitting there in plain sight.

**`release`, never `debug`.** A debug binary is several times the size, starts
slower, and is the one `cargo clean` removes first.

**The `.lnk` name has no `//` in it.** `/` is not legal in a Windows filename.
The window title keeps the slashes; so does everything the user reads.

## When the desktop still shows the old icon

Windows caches shell icons aggressively, so a correct binary and a wrong-looking
shortcut are a normal combination. Diagnose in this order — it goes from
cheapest to most disruptive, and stopping early is usually possible.

**1. Ask the binary what icon it has.** This reads the compiled resource, not
the cache, so it tells you whether the problem is the build or the shell:

```powershell
Add-Type -AssemblyName System.Drawing
$exe = 'C:\magma\dev\gatefold\desktop\src-tauri\target\release\gatefold.exe'
$i = [System.Drawing.Icon]::ExtractAssociatedIcon($exe)
$i.ToBitmap().Save("$env:TEMP\extracted.png")
```

If that image is the old icon, the shell is innocent and the **build** is the
problem — see the note below. Copy the exe somewhere fresh before extracting if
you are unsure, because `ExtractAssociatedIcon` reads through a path-keyed
cache of its own.

**2. Re-save the shortcut and nudge the icon cache.** Re-running the block
above is enough to restamp it; then:

```powershell
ie4uinit.exe -show
```

**3. Restart Explorer — last resort**, because it closes every open Explorer
window:

```powershell
Stop-Process -Name explorer -Force
```

## Changing the icon does not rebuild the binary

**This will catch you.** `tauri-build` emits `cargo:rerun-if-changed` for
`tauri.conf.json` and `capabilities/` **only — not for the icon files.**
Replace every icon, run `npm run build`, and cargo happily skips the build
script and leaves the *previous* icon compiled into the Windows resource. The
build succeeds and the output looks right.

Force it:

```bash
touch desktop/src-tauri/tauri.conf.json
```

Then verify against the built binary rather than the source files — the source
files being correct is precisely what this failure mode looks like. See
`AGENTS.md` for the icon pipeline itself.

## The tradeoff this accepts

A shortcut into `target\release\` breaks the moment you run `cargo clean`, and
points at a stale binary until the next build. The installer under
`target\release\bundle\` does not have that problem, but it also installs a
second copy of the app. For a machine that builds this repo, the shortcut is
the right call; for anywhere else, ship the installer.
