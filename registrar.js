// global-menu - implements com.canonical.AppMenu.Registrar so apps can tell us where
// their menu lives
// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const REGISTRAR_BUS_NAME = 'com.canonical.AppMenu.Registrar';
const REGISTRAR_OBJECT_PATH = '/com/canonical/AppMenu/Registrar';

// the real, canonical interface. this predates wayland - every existing implementation
// (unity, kde's old qdbusmenu bridge, other gnome extensions) keys registrations by an x11
// window id, passed as a uint32. we can't do that, we have no x11 window ids to hand out.
// pid works identically on both display servers and is exactly what an app already knows
// about itself with zero extra plumbing on its side, so that's what we register apps by
// instead - see AGENTS.md for why this had to be written from the spec rather than copied
const REGISTRAR_XML = `
<node>
  <interface name="com.canonical.AppMenu.Registrar">
    <method name="RegisterWindow">
      <arg type="u" name="windowId" direction="in"/>
      <arg type="o" name="menuObjectPath" direction="in"/>
    </method>
    <method name="UnregisterWindow">
      <arg type="u" name="windowId" direction="in"/>
    </method>
    <method name="GetMenuForWindow">
      <arg type="u" name="windowId" direction="in"/>
      <arg type="s" name="service" direction="out"/>
      <arg type="o" name="menuObjectPath" direction="out"/>
    </method>
    <signal name="WindowRegistered">
      <arg type="u" name="windowId"/>
      <arg type="s" name="service"/>
      <arg type="o" name="menuObjectPath"/>
    </signal>
    <signal name="WindowUnregistered">
      <arg type="u" name="windowId"/>
    </signal>
  </interface>
</node>`;

export class Registrar {
    constructor() {
        // windowId here is always a pid, despite the spec's "windowId" naming - kept as-is
        // rather than renamed, so this still reads as an implementation of the real
        // interface above, not a fork of it
        this._registrations = new Map(); // pid -> {service, menuObjectPath}
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(REGISTRAR_XML, this);
    }

    // export() and own the bus name only once mutter's own d-bus connection is ready -
    // doing this in enable() rather than the constructor is a hard ego rule, not a
    // preference: https://gjs.guide/extensions/review-guidelines/review-guidelines.html#only-use-initialization-for-static-resources
    export() {
        this._dbusImpl.export(Gio.DBus.session, REGISTRAR_OBJECT_PATH);

        this._ownerId = Gio.bus_own_name(
            Gio.BusType.SESSION,
            REGISTRAR_BUS_NAME,
            Gio.BusNameOwnerFlags.NONE,
            null,
            null,
            null
        );
    }

    unexport() {
        if (this._ownerId) {
            Gio.bus_unown_name(this._ownerId);
            this._ownerId = 0;
        }
        this._dbusImpl.unexport();
        this._registrations.clear();
    }

    // dbus method - called by an app over the bus, not from our own code, so the argument
    // shape is fixed by the xml above and can't be changed to something nicer
    RegisterWindow(pid, menuObjectPath, invocation) {
        const sender = invocation.get_sender();
        this._registrations.set(pid, {service: sender, menuObjectPath});
        this._dbusImpl.emit_signal('WindowRegistered',
            new GLib.Variant('(uso)', [pid, sender, menuObjectPath]));
        invocation.return_value(null);
    }

    UnregisterWindow(pid, invocation) {
        this._registrations.delete(pid);
        this._dbusImpl.emit_signal('WindowUnregistered', new GLib.Variant('(u)', [pid]));
        invocation.return_value(null);
    }

    GetMenuForWindow(pid, invocation) {
        const entry = this._registrations.get(pid);
        if (entry)
            invocation.return_value(new GLib.Variant('(so)', [entry.service, entry.menuObjectPath]));
        else
            invocation.return_error_literal(Gio.DBusError, Gio.DBusError.FAILED, 'No menu registered for this pid');
    }

    // our own lookup, called from menuManager - not a dbus method, just a plain getter
    // so menuManager doesn't need to know invocation objects exist
    lookup(pid) {
        return this._registrations.get(pid) ?? null;
    }
}
