// global-menu - preferences window
// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class GlobalMenuPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: _('Behavior'),
        });
        page.add(group);

        const debounceRow = new Adw.SpinRow({
            title: _('Focus change delay'),
            subtitle: _('Milliseconds to wait after switching windows before rebuilding the menu'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 500,
                step_increment: 10,
            }),
        });
        group.add(debounceRow);

        settings.bind('focus-debounce-ms', debounceRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);

        // gjs would otherwise be free to garbage-collect settings the moment this function
        // returns, since nothing else holds a reference to it - stashing it on the window
        // keeps it alive for as long as the binding above needs it to be
        window._settings = settings;
    }
}
