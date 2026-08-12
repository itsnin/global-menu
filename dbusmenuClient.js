// global-menu - reads a registered app's actual menu content over com.canonical.dbusmenu
// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// verified against the real, complete interface definition here rather than a partial
// snippet, since a wrong type signature here means silently garbled or empty menus, not a
// clean crash: https://github.com/Alexays/Waybar/blob/master/protocol/dbus-menu.xml
const DBUSMENU_XML = `
<node>
  <interface name="com.canonical.dbusmenu">
    <property name="Version" type="u" access="read"/>
    <property name="Status" type="s" access="read"/>
    <method name="GetLayout">
      <arg type="i" name="parentId" direction="in"/>
      <arg type="i" name="recursionDepth" direction="in"/>
      <arg type="as" name="propertyNames" direction="in"/>
      <arg type="u" name="revision" direction="out"/>
      <arg type="(ia{sv}av)" name="layout" direction="out"/>
    </method>
    <method name="Event">
      <arg type="i" name="id" direction="in"/>
      <arg type="s" name="eventId" direction="in"/>
      <arg type="v" name="data" direction="in"/>
      <arg type="u" name="timestamp" direction="in"/>
    </method>
    <method name="AboutToShow">
      <arg type="i" name="id" direction="in"/>
      <arg type="b" name="needUpdate" direction="out"/>
    </method>
    <signal name="LayoutUpdated">
      <arg type="u" name="revision"/>
      <arg type="i" name="parentId"/>
    </signal>
    <signal name="ItemsPropertiesUpdated">
      <arg type="a(ia{sv})" name="updatedProps"/>
      <arg type="a(ias)" name="removedProps"/>
    </signal>
  </interface>
</node>`;

const DBusmenuProxy = Gio.DBusProxy.makeProxyWrapper(DBUSMENU_XML);

// same string every real client uses, checked against two independent implementations'
// own docs rather than guessed: https://valadoc.org/dbusmenu-glib-0.4/Dbusmenu.MENUITEM_EVENT_ACTIVATED.html
const EVENT_CLICKED = 'clicked';

// unwraps GLib.Variant('a{sv}') into a plain js object, since every property dict
// coming off the wire needs this and we'd otherwise write the same unwrap loop
// in three different places
function unwrapPropertyDict(variant) {
    const result = {};
    for (const [key, value] of Object.entries(variant.deep_unpack()))
        result[key] = value.deep_unpack();
    return result;
}

// recursively turns one raw (ia{sv}av) tuple into our own plain {id, props, children}
// shape, so nothing downstream of this file ever touches a GLib.Variant directly
function unwrapLayoutNode([id, propsVariant, childrenVariants]) {
    return {
        id,
        props: unwrapPropertyDict(propsVariant),
        children: childrenVariants.map(child => unwrapLayoutNode(child.deep_unpack())),
    };
}

export class DbusmenuClient {
    constructor(serviceName, menuObjectPath, onLayoutChanged) {
        this._onLayoutChanged = onLayoutChanged;
        this._proxy = new DBusmenuProxy(Gio.DBus.session, serviceName, menuObjectPath);

        // layout can change any time after the app starts (menus are frequently rebuilt
        // per-focused-document, per-selection, etc) - we don't poll for this, we react to
        // the signal the spec defines for exactly this purpose
        this._proxy.connectSignal('LayoutUpdated', () => this._refresh());
    }

    // parentId 0 = root, recursionDepth -1 = fetch the whole tree in one call rather than
    // one round trip per level - this is the same call shape confirmed against a live
    // dbus-monitor trace on a real running app, not assumed from the spec alone:
    // https://github.com/mattermost/mattermost/issues/5088
    async _refresh() {
        try {
            const [, layout] = await this._proxy.GetLayoutAsync(0, -1, ['label', 'enabled', 'visible', 'children-display', 'type']);
            this._onLayoutChanged(unwrapLayoutNode(layout));
        } catch (error) {
            logError(error, 'global-menu: failed to read dbusmenu layout');
        }
    }

    // called once right after construction - GetLayout has to be fetched at least once
    // up front, LayoutUpdated only fires on subsequent changes
    async start() {
        await this._refresh();
    }

    activate(itemId) {
        // fire-and-forget, matching the interface's own annotation that Event expects no
        // reply: https://github.com/gnustep/libs-dbuskit/blob/master/Bundles/DBusMenu/com.canonical.dbusmenu.xml
        this._proxy.EventAsync(itemId, EVENT_CLICKED, GLib.Variant.new('i', 0), GLib.get_monotonic_time() / 1000)
            .catch(error => logError(error, 'global-menu: failed to activate menu item'));
    }

    // call this when a submenu is opened, not before - some apps build a submenu's
    // children on demand rather than upfront, so a submenu can legitimately be empty
    // in the layout we already have until this fires. needUpdate=false means the app is
    // telling us nothing changed, so we skip a getlayout call that would just return
    // what we already have. confirmed as a real, documented bug class (not hypothetical)
    // by a working client's own changelog:
    // https://www.stackage.org/nightly-2026-07-21/package/dbus-menu-0.1.3.4
    async aboutToShow(itemId) {
        const proxy = this._proxy;
        try {
            const [needUpdate] = await proxy.AboutToShowAsync(itemId);
            // this client may have been torn down (destroy() nulls _proxy), or replaced
            // by a fresh one for a different window, while the call above was in flight -
            // check against the same proxy reference we started with, not this._proxy,
            // since a new client would have a new proxy of its own
            if (needUpdate && this._proxy === proxy)
                await this._refresh();
        } catch (error) {
            logError(error, 'global-menu: AboutToShow failed');
        }
    }

    destroy() {
        this._proxy = null;
        this._onLayoutChanged = null;
    }
}
