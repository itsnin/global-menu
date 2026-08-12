# AGENTS.md — Global Menu

This file is the single source of truth for anyone — human, AI, or agent — working on this
extension. Read it before touching any code. It records decisions that were made
deliberately, and the reasoning behind them, so nobody re-litigates a settled question or
undoes a fix by accident.

## Identity

| field | value |
|---|---|
| extension name | Global Menu |
| uuid | `global-menu@nin` |
| GNOME Extensions (EGO) account | `nin` |
| GitHub account | `itsnin` |
| source repo | https://github.com/itsnin/global-menu.git |
| packaged deliverable | `global-menu@nin.zip` |
| first release `version-name` | `2026.08.10` |

Don't second-guess this 


Per the official metadata rules, `version` (a bare integer) is set by the EGO server on
upload and must never be hand-set in `metadata.json`. `version-name` is the field we control,
and it's fixed for this release per the table above — a calendar-stamp version, YYYY.MM.DD.

## Target platform

- **shell-version: `["45", "46", "47", "48", "49", "50"]`.** 45 is the floor because that's
  when GNOME Shell moved to ES modules — `imports.*`, `Lang.Class`, and the old `init()`
  pattern are gone for good, and writing dual-format code to support pre-45 in 2026 buys
  nothing but maintenance cost. 50 is the ceiling because it's current.
- **Wayland only. No X11 code, anywhere, ever.** Not a fallback path, not a feature-detected
  branch, not a "just in case" import. GNOME Shell 50 has no X11 support left to fall back
  to — `RunDialog._restart()` was removed outright because restart-via-X11 no longer exists —
  and X11 as a display server is on a real, published deprecation trajectory across the
  whole ecosystem. If a GNOME API only works under X11 (X11 window properties, `Bamf`-style
  matching, XWayland-dependent input grabs), it doesn't belong in this codebase, full stop.

## Coding standard

- flat file layout at the extension root; one file, one responsibility
- `prefs/` is the only subdirectory, and it exists for exactly one reason: the preferences
  window runs in a separate GTK process with no access to Clutter, Meta, St, or Shell.
  Anything that only runs in that process goes there
- every file opens with a two-line header: `// global-menu - <what this file does>` then the
  SPDX license line
- data that flows between modules is a plain object with a consistent shape (`{type, ...}`
  style), not a class — the shape is what changes between kinds of data, not the code that
  handles it
- builder/query functions are named for what they return: `build<Thing>()` for UI,
  `search<Thing>()` / `get<Thing>()` for data lookups, so the function's job is obvious
  before you open the file
- private instance fields: `this._camelCase`
- `enable()` and `disable()` sit next to each other in the class and are strict mirrors —
  everything created in one is destroyed, disconnected, or nulled in the other, in reverse
  order

## Hard rules

These aren't style preferences. Each one exists because a real extension — reviewed , got it wrong and got rejected

- **No `eval()`, ever.** If something needs arithmetic or parsing, write a real
  recursive-descent parser. Several reference extensions did exactly this correctly; none of
  them needed `eval()` to do it.
- **No shell-string interpolation for spawning processes.** Always an argv array through
  `Gio.Subprocess`, never a hand-built string handed to something that runs it through a
  shell (`GLib.spawn_command_line_async` with a template string). One reference extension's
  `createNewFolder()` interpolated a timestamp into a shell command; harmless today because
  the value was never attacker-influenced, but it's the wrong habit to build on, and the same
  extension's install script separately shipped a real, working bug because of a mismatched
  file list — small looseness compounds.
- **No synchronous D-Bus calls or synchronous file I/O on the shell side.** It blocks the
  compositor thread. Everything in `extension.js` that touches D-Bus or the filesystem is
  async.
- **Full cleanup, no exceptions.** Every signal connected in `enable()` is disconnected in
  `disable()`. Every `GLib` timeout or idle source is removed. Every object created is
  destroyed or nulled. This is the #1 reason extensions get rejected in review, and it's
  fully within our control.
- **No deprecated modules.** No `ByteArray`, no `Lang`, no `Mainloop`, no `imports.*`. This is
  GNOME 45+ only — ES modules throughout.
- **Process isolation is absolute.** `extension.js` never imports `Gtk`, `Gdk`, or `Adw`.
  `prefs.js` never imports `Clutter`, `Meta`, `St`, or `Shell`. Mixing these crashes the
  respective process. Any code shared between both files must avoid all of the above.
- **No trademarked assets.** e.g. Apple logo
- **No defensive code against things that can't happen.** No `try/catch` around calls that
  don't throw in normal operation (`destroy()`, `disconnect()`, `GLib.Source.remove()`). No
  `?.()` or `typeof x === 'function'` guards on methods that are guaranteed to exist on the
  target GNOME Shell versions. This is called out explicitly in GNOME's own guidance as the
  clearest tell of low-effort AI-generated code, and it makes real review harder
- **Settings schema follows convention exactly**: id `org.gnome.shell.extensions.global-menu`,
  path `/org/gnome/shell/extensions/global-menu/`. `settings-schema` is declared once in
  `metadata.json`; call `this.getSettings()` with no arguments anywhere else. Don't repeat the
  schema id as a module-level constant.
- **No package-manager fallback chain includes Snap or Flatpak** as an option, per standing
  instruction — if a feature ever needs to open something like a software center, the
  fallback list stops at native and well-known alternatives, not those two.
- **Never ship `schemas/gschemas.compiled` in the packaged zip.** `glib-compile-schemas` is
  fine to run locally for testing (it's how the schema actually gets loaded on your own
  machine), but the compiled binary must not go into the zip that gets uploaded. EGO
  compiles it server-side for 45+ packages, and shexli flags shipping it as unnecessary
  build artifacts (`EGO-P-006`). Worth being precise about what "flags" means here, since
  it's not a flat ban: an established, trusted maintainer's extension can ship it, get told
  "not recommended, please consider removing" as a soft comment, and still pass That leniency is earned by a
  track record 

## Comment style

This governs comments in code files (`.js`, `.css`, schema XML) — not this document, which is
written normally so it's fast to read.

Lowercase by default. No capital letters unless leaving something lowercase would change its
actual meaning — a command, a flag, a proper name that's case-sensitive. Example: `# so you
need to do curl -fsSL` keeps `-fsSL` and `curl` as-is because writing it any other way isn't
just a style choice, it's a different (wrong) command. That's the bar: capitalize only when
lowercase would be factually wrong, not when it would just look informal.

Minimal punctuation, same rule — only when leaving it out would change or obscure the meaning
(a decimal point in a version number, for instance). No trash talk about the code, no ASCII
boxes or banners, no comment that just restates the line under it in English. Every comment
has to earn its place: for ordinary, common code, one short line on *why* this exists here is
enough — the *what* is already obvious from reading the line itself. For anything obscure or
non-obvious, cover both *what* it's doing and *why*, because neither is recoverable from the
code alone
Link to a real, working source instead of restating documentation from memory, wherever one
exists — a GitLab source line, an official doc page, a spec. Don't cite something without
checking it actually resolves.

## Prior art

Before writing this file, several existing GNOME extensions and
KDE-native equivalent were read in full and compared, purely to extract working patterns and
known failure modes — not to copy structure, features, or wording from any of them.

- **Live menu discovery** (reading a focused app's actual menu over D-Bus, via the
  `com.canonical.dbusmenu` / `org.gtk.Actions` interfaces, with a registrar bus for apps that
  support it) is the real, working way to show an app's actual menu rather than a hardcoded
  guess per app name. Two independent extensions implement this correctly; a hardcoded
  per-app-name menu is a meaningfully smaller feature by comparison
- **A monotonic generation counter**, incremented on every new async lookup and checked before
  a callback acts on its result, is the correct way to handle "the user changed focus again
  before the last lookup finished" — a real race condition in this feature area, not a
  hypothetical one. A fixe6d timeout-and-recheck is a weaker version of the same idea.
- **The GTK-side half of this whole feature is a fading dependency across the entire Linux
  desktop, not just a GNOME problem.** KDE Plasma ships an equivalent first-party "Global
  Menu" widget (Add Widgets → Global Menu), and it depends on the exact same
  `appmenu-gtk-module` user reports confirm plenty of distros no
  longer ship that module by default, so GTK apps silently don't appear in it. Any coverage
  gap this extension has for GTK apps without a live menu isn't a bug unique to this project;
  it's the state of the underlying protocol
- **well establised extesions uses real `#privateField` syntax throughout**,
  not the `_underscore` convention used everywhere else read in this project's prior art and
  used in this codebase we're staying with `this._camelCase` per the coding standard above.

## Clipboard access 

 checking for content and reading it are the
same `St.Clipboard.get_content()` call, tried across a fixed list of MIME types; a `null`
result *is* the presence check.current EGO review thread flagging exactly this API for reviewer scrutiny.
but if the extension is genuine in most casees a manual review is performed and the extension gets passed

## shexli vs correctness - read this before fixxing a flag

`shexli` is a real, official-page-linked static analyzer (`pip install shexli`). Run it before every packaging pass. But it does
AST pattern-matching, not runtime reasoning — its own source says so directly for the rule
below (`detection_strategy` in `shexli/spec.py`)

- **`EGO-C49-004` (`Meta.Window.get_maximized()` removed in 49) will always flag
  `windowActions.js`**, and that flag is a false positive we're keeping, not a bug we're
  hiding. `get_maximized()` genuinely was removed in 49 (confirmed directly against the
  porting guide's own wording — not soft-deprecated, gone), and the fix genuinely is
  `is_maximized()`. But we support 45-50, both methods are real depending on which version is
  running, and the call sits behind a `typeof window.is_maximized === 'function'` gate that
  only reaches `get_maximized()`on pre valied gnome 49 sessions.  shexli's checker
  can't see that gate; it just looks for the literal call reviewer will check it manually and most likely pass it 
- **The correct response to this specific flag is a loud comment at the call site, not a
  workaround.** Do not rewrite the call as a dynamic string lookup (`window['get_' +
  'maximized']()`) or anything else designed to make the AST checker miss it. That would trade
  a flagged-but-explainable line for a genuinely obfuscated one, which is a worse thing to
  hand a reviewer and violates the "code must be readable, not obfuscated" rule directly.
  for future reviews point at this section and at the `ddterm` thread as precedent for exactly this pattern
- **Don't drop 45-48 support to make the flag disappear either
- **shexli's silence isn't proof of correctness — it missed a real leak in this codebase
  once already.** `_addSubmenu()` in `menuManager.js` had a raw
  `submenuItem.menu.connect('open-state-changed', ...)` with no disconnect anywhere. in well established extensions shexli never flagged it here — this was caught by manually
  cross-checking a real reviewer finding shown for another extension against a grep of our
  own `.connect(` calls, not by the tool. Fixed by capturing the handler id and disconnecting
  it from the item's own `destroy` signal (a real GObject signal we can rely on, unlike the
  plain `Signals.EventEmitter` the handler itself lives on) lession : run this kind of
  manual cross-check against real EGO findings whenever one surfaces, don't treat a clean
  shexli run as the last word on cleanup correctness.

## Sources

Everything in this document that describes an official rule (metadata fields, review
guidelines, deprecated modules, process isolation, the 45+ ESM cutover) is taken directly from
the current, official GNOME documentation and is meant to be trusted rather than re-verified
line by line:

- https://gjs.guide/extensions/ — general reference index
- https://gjs.guide/extensions/review-guidelines/review-guidelines.html — the actual EGO
  review rules
- https://gjs.guide/extensions/review-guidelines/best-practices.html — AI-generation-specific
  guidance, itself downstream of a real GNOME contributor's public write-up:
  https://blogs.gnome.org/jrahmatzadeh/2026/07/27/ego-ai-reference/ (that post's own comment
  thread is where the idea of putting these rules in a repo's `AGENTS.md` file came from —
  this file is that suggestion, applied)
- https://gjs.guide/extensions/overview/updates-and-breakage.html — why extensions break and
  what avoids it

