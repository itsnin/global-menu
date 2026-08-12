// global-menu - decides which menus should exist right now and keeps the panel button
// row in sync with that decision
// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {Registrar} from './registrar.js';
import {DbusmenuClient} from './dbusmenuClient.js';
import {layoutToMenus} from './dbusmenuTranslator.js';
import {getWindowMenu} from './windowMenu.js';
import {renderMenuItems} from './menuRenderer.js';

// a menu bar is a row of separate top-level buttons (file, edit, view...), each with its
// own dropdown - not one indicator with a nested submenu. this class owns the whole row:
// which buttons exist right now, and swapping the set when the focused window changes.
// actually turning a menu's items into widgets is menuRenderer's job, not this file's
export class MenuManager {
    constructor(uuid, settings) {
        this._uuid = uuid;
        this._settings = settings;
        this._buttons = new Map(); // menu id -> {button, label}
        this._registrar = new Registrar();
        this._registrar.export();

        this._dbusmenuClient = null;
        // bumped every time updateForWindow runs - GetLayout is async, so a stale reply
        // for a window the user already switched away from can land after a newer one
        // is already in flight. this is the same generation-counter pattern used to
        // solve the identical race in every reference extension that does live menu
        // discovery - see AGENTS.md prior art notes
        this._generation = 0;
    }

    updateForWindow(window) {
        this._generation += 1;
        const generation = this._generation;

        if (this._dbusmenuClient) {
            this._dbusmenuClient.destroy();
            this._dbusmenuClient = null;
        }

        const isNormalWindow = window && window.window_type === Meta.WindowType.NORMAL;
        if (!isNormalWindow || this._isBlocked(window)) {
            this._reconcile([]);
            return;
        }

        // window menu renders immediately - it's built from mutter state we already
        // have, no d-bus round trip needed, so there's no reason to make the user wait
        // on it just because a discovered menu (if there is one) hasn't arrived yet
        this._reconcile([getWindowMenu(window)]);

        const registration = this._registrar.lookup(window.get_pid());
        if (!registration)
            return;

        this._dbusmenuClient = new DbusmenuClient(
            registration.service,
            registration.menuObjectPath,
            layout => {
                // the window this layout is for may no longer be focused by the time it
                // arrives - discard it rather than render a dead app's menu over
                // whatever the user's actually looking at now
                if (generation !== this._generation)
                    return;
                this._reconcile([...layoutToMenus(layout, this._dbusmenuClient), getWindowMenu(window)]);
            }
        );
        this._dbusmenuClient.start();
    }

    // exact match only, case-insensitive, against the focused window's wm class - no
    // globbing or regex, so a typo here fails closed (item just never matches) instead
    // of matching something the user didn't mean to block
    _isBlocked(window) {
        const wmClass = window.get_wm_class();
        if (!wmClass)
            return false;

        const blocklist = this._settings.get_strv('app-blocklist');
        return blocklist.some(entry => entry.toLowerCase() === wmClass.toLowerCase());
    }

    // swaps the button row to match `menus` - reuses a button whose id is still wanted
    // (relabels it and rebuilds its dropdown), destroys ones that dropped out, creates
    // ones that are new. reusing in place instead of destroying and recreating every time
    // avoids visible flicker on every focus change
    _reconcile(menus) {
        const wantedIds = new Set(menus.map(menu => menu.id));

        for (const [id, entry] of this._buttons) {
            if (!wantedIds.has(id)) {
                entry.button.destroy();
                this._buttons.delete(id);
            }
        }

        menus.forEach((menu, index) => {
            let entry = this._buttons.get(menu.id);
            if (!entry)
                entry = this._createButton(menu, index);

            entry.label.text = menu.label;

            entry.button.menu.removeAll();
            renderMenuItems(entry.button.menu, menu.items, itemId => this._dbusmenuClient?.activate(itemId));
        });
    }

    _createButton(menu, position) {
        const button = new PanelMenu.Button(0.5, menu.label, false);
        const label = new St.Label({
            text: menu.label,
            y_align: Clutter.ActorAlign.CENTER,
        });
        button.add_child(label);

        // each top-level menu needs its own unique status-area key - addToStatusArea
        // tracks indicators in a lookup keyed by this string, so reusing the extension's
        // bare uuid across multiple buttons would make each new one silently replace the
        // last
        Main.panel.addToStatusArea(`${this._uuid}:${menu.id}`, button, position, 'left');

        const entry = {button, label};
        this._buttons.set(menu.id, entry);
        return entry;
    }

    destroy() {
        if (this._dbusmenuClient) {
            this._dbusmenuClient.destroy();
            this._dbusmenuClient = null;
        }

        this._registrar.unexport();
        this._registrar = null;

        for (const entry of this._buttons.values())
            entry.button.destroy();
        this._buttons.clear();
    }
}
