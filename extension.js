// global-menu - entry point
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {MenuManager} from './menuManager.js';

export default class GlobalMenuExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._focusTimeoutId = 0;

        // a real menu bar is a row of separate buttons (file, edit, view...), not one
        // indicator with a dropdown - menuManager owns every button this extension creates,
        // so there's nothing button-shaped for this class to hold onto itself
        this._menuManager = new MenuManager(this.uuid, this._settings);

        // debounced focus tracking. global.display can fire notify::focus-window more than
        // once during a single window-switch animation, and mutter can briefly report no
        // focused window mid-transition on wayland - so we don't rebuild on every event, we
        // wait for things to settle
        global.display.connectObject('notify::focus-window', () => {
            if (this._focusTimeoutId)
                GLib.source_remove(this._focusTimeoutId);

            const debounceMs = this._settings.get_int('focus-debounce-ms');
            this._focusTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, debounceMs, () => {
                this._focusTimeoutId = 0;
                this._menuManager.updateForWindow(global.display.focus_window);
                return GLib.SOURCE_REMOVE;
            });
        }, this);

        // run once immediately for whatever's already focused when we're enabled -
        // otherwise the bar sits empty until the user next switches windows
        this._menuManager.updateForWindow(global.display.focus_window);
    }

    disable() {
        global.display.disconnectObject(this);

        if (this._focusTimeoutId) {
            GLib.source_remove(this._focusTimeoutId);
            this._focusTimeoutId = 0;
        }

        this._menuManager.destroy();
        this._menuManager = null;

        this._settings = null;
    }
}
