// global-menu - turns a declarative menu tree into real PopupMenu widgets
// SPDX-License-Identifier: GPL-3.0-or-later

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// onActivateDiscovered(itemId) is called for a discovered dbusmenu item, which carries an
// itemId but no local activate() closure - static items (the window menu) carry their own
// activate() and never call this. keeping this as a plain callback rather than a class
// reference means this file never needs to know menuManager exists, it just needs to be
// told what to do when a discovered item fires
export function renderMenuItems(popupMenu, items, onActivateDiscovered) {
    for (const item of items) {
        if (item.visible === false)
            continue;
        addItem(popupMenu, item, onActivateDiscovered);
    }
}

function addItem(popupMenu, item, onActivateDiscovered) {
    if (item.type === 'separator') {
        popupMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        return;
    }

    if (item.items) {
        addSubmenu(popupMenu, item, onActivateDiscovered);
        return;
    }

    const activate = item.activate ?? (() => onActivateDiscovered?.(item.itemId));
    const menuItem = popupMenu.addAction(item.label, activate);
    menuItem.sensitive = item.sensitive ?? true;
}

function addSubmenu(popupMenu, item, onActivateDiscovered) {
    const submenuItem = new PopupMenu.PopupSubMenuMenuItem(item.label);
    submenuItem.sensitive = item.sensitive ?? true;
    popupMenu.addMenuItem(submenuItem);

    renderMenuItems(submenuItem.menu, item.items, onActivateDiscovered);

    // itemId only exists on discovered dbusmenu items - the static window menu has no
    // submenus right now, and if it grows one later it still wouldn't have anything to
    // call AboutToShow on, since there's no remote app to ask
    if (item.itemId === undefined)
        return;

    // fires every time this specific submenu opens or closes - we only act on open.
    // some apps build a submenu's children on demand rather than upfront, so this is
    // the point where that content actually gets fetched, not before. signature
    // confirmed straight from gnome-shell's own source, not assumed:
    // https://mail.gnome.org/archives/commits-list/2012-August/msg10502.html
    //
    // submenuItem.menu is a PopupSubMenu, a plain Signals.EventEmitter object, not a
    // GObject - destroying submenuItem's own widget tree does not automatically
    // disconnect a listener sitting on that separate emitter, so this needs an explicit
    // disconnect or it leaks one listener every time a submenu gets rebuilt. submenuItem
    // itself IS a real St.BoxLayout-derived GObject though, so its own 'destroy' signal
    // is one we can rely on with certainty to fire the cleanup
    const openStateHandlerId = submenuItem.menu.connect('open-state-changed', (menu, isOpen) => {
        if (isOpen)
            item.onAboutToShow?.(item.itemId);
    });
    submenuItem.connect('destroy', () => submenuItem.menu.disconnect(openStateHandlerId));
}
