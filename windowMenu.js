// global-menu - "window" top-level menu content
// SPDX-License-Identifier: GPL-3.0-or-later

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Actions from './windowActions.js';

// sensitivity is computed fresh on every call, not cached - it has to reflect the window's
// current state, e.g. the zoom item should grey out the instant the window is already
// maximized, not just whenever the menu last happened to get rebuilt
export function getWindowMenu(window) {
    return {
        id: 'window',
        label: _('Window'),
        items: [
            {
                label: _('Minimize'),
                sensitive: Actions.canMinimize(window),
                activate: () => Actions.minimize(window),
            },
            {
                // "zoom" is the real macos term for the maximize/restore toggle, not a
                // translation choice - kept as the english term either way, same as macos
                // itself doesn't translate it to "agrandir" in french etc
                label: Actions.isMaximized(window) ? _('Zoom Out') : _('Zoom'),
                sensitive: Actions.canMaximize(window),
                activate: () => Actions.toggleMaximize(window),
            },
            {type: 'separator'},
            {
                label: _('Tile Left'),
                sensitive: Actions.canMaximize(window),
                activate: () => Actions.tileLeft(window),
            },
            {
                label: _('Tile Right'),
                sensitive: Actions.canMaximize(window),
                activate: () => Actions.tileRight(window),
            },
            {type: 'separator'},
            {
                label: _('Close'),
                sensitive: Actions.canClose(window),
                activate: () => Actions.close(window),
            },
        ],
    };
}
