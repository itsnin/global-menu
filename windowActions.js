// global-menu - meta.window queries and mutations for the window menu
// SPDX-License-Identifier: GPL-3.0-or-later

// gnome 49 dropped the Meta.MaximizeFlags argument from maximize()/unmaximize(), added
// set_maximize_flags()/set_unmaximize_flags() for single-axis control, and outright
// REMOVED get_maximized() in favor of is_maximized() - not deprecated, gone:
// https://gjs.guide/extensions/upgrading/gnome-shell-49.html#meta-window
// confirmed live and current: multiple 2026 ego review threads for other extensions
// (reviewed by the same team we're targeting) show this exact shexli finding rejected
// until fixed, e.g. https://extensions.gnome.org/review/71292
// we target 45-50, so both shapes are real inside our own support range. checking
// whether is_maximized exists (not a shell version string) is the right gate - it's the
// one symbol that's cleanly present or absent across the break
function hasModernMaximizeApi(window) {
    return typeof window.is_maximized === 'function';
}

// is_maximized() takes no arguments and returns a plain boolean - same shape as every
// other is_x() getter in gtk/meta. pre-49's get_maximized() returns a Meta.MaximizeFlags
// bitmask (0 = Meta.MaximizeFlags.NONE), confirmed against a real running session's own
// output, not just the spec: https://discourse.gnome.org/t/how-to-get-get-windows-width-height-x-coordinate-y-coordinate-activeworkspace-and-isviewable/10881
//
// shexli (EGO-C49-004) flags any get_maximized() call in a file that declares 49 in
// shell-version, full stop - its own source says the check is "AST detection of
// get_maximized() calls gated by explicit shell-version membership for 49", meaning it
// has no idea this call sits behind the hasModernMaximizeApi() branch below and only
// ever runs on pre-49. that's a real, acknowledged gap in the tool (its own author calls
// the analyzer logic "not fully reviewed"), not a bug in this file - we support 45-50 and
// genuinely need both code paths, so the fix here is keeping this comment loud enough
// that a reviewer skimming the report sees the gate immediately, not hiding the call
// behind something like a dynamic string lookup just to dodge a linter
export function isMaximized(window) {
    if (hasModernMaximizeApi(window))
        return window.is_maximized();
    return window.get_maximized() !== 0;
}

export function toggleMaximize(window) {
    const modern = hasModernMaximizeApi(window);

    if (isMaximized(window)) {
        if (modern)
            window.unmaximize();
        else
            window.unmaximize(3); // pre-49: Meta.MaximizeFlags.BOTH
    } else if (modern) {
        window.maximize();
    } else {
        window.maximize(3);
    }
}

export function minimize(window) {
    window.minimize();
}

export function canMinimize(window) {
    return window.can_minimize();
}

export function canMaximize(window) {
    return window.can_maximize();
}

export function close(window) {
    window.delete(global.get_current_time());
}

export function canClose(window) {
    return window.can_close();
}

// tiles to the left/right half of the window's CURRENT monitor, not a different monitor -
// worth stating outright because move_to_monitor() looks like it could do this and does
// something else entirely (relocates the window to a different physical display)
function tileHalf(window, side) {
    const workArea = window.get_work_area_for_monitor(window.get_monitor());
    const halfWidth = Math.floor(workArea.width / 2);

    window.move_resize_frame(
        true, // user_op - treat this as a user-initiated move for window-constraint purposes
        side === 'left' ? workArea.x : workArea.x + halfWidth,
        workArea.y,
        halfWidth,
        workArea.height
    );
}

export function tileLeft(window) {
    tileHalf(window, 'left');
}

export function tileRight(window) {
    tileHalf(window, 'right');
}
