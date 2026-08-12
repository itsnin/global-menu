// global-menu - turns a dbusmenu layout tree into our own declarative menu shape
// SPDX-License-Identifier: GPL-3.0-or-later

// spec confirmed against two independent server implementations' xml, not one:
// https://github.com/Alexays/Waybar/blob/master/protocol/dbus-menu.xml
// https://lxr.kde.org/source/plasma/plasma-workspace/libdbusmenuqt/com.canonical.dbusmenu.xml
const TYPE_SEPARATOR = 'separator';

// client is threaded through so every submenu item can carry an onAboutToShow callback
// that calls back into the same client it came from - menuRenderer.js never needs to
// know a DbusmenuClient exists, it just calls whatever's attached to the item
export function layoutToMenus(rootNode, client) {
    return rootNode.children.map(topLevelNode => ({
        id: `dbusmenu:${topLevelNode.id}`,
        label: topLevelNode.props.label ?? '',
        items: (topLevelNode.children ?? []).map(child => toMenuItem(child, client)),
    }));
}

function toMenuItem(node, client) {
    if (node.props.type === TYPE_SEPARATOR)
        return {type: TYPE_SEPARATOR};

    const hasSubmenu = node.props['children-display'] === 'submenu';

    return {
        // stripped label straight off the wire - dbusmenu labels commonly carry a "_"
        // mnemonic marker (e.g. "_File") the way gtk accelerators do, and we're not
        // rendering an underline for it, so it'd otherwise show up as a literal
        // underscore in the menu
        label: (node.props.label ?? '').replace('_', ''),
        sensitive: node.props.enabled ?? true,
        // dbusmenu's own "visible" property, honored the same way a hidden item in
        // windowMenu.js would be - we don't add a menu item for something the app itself
        // says shouldn't be shown right now
        visible: node.props.visible ?? true,
        items: hasSubmenu ? node.children.map(child => toMenuItem(child, client)) : undefined,
        // itemId travels with the item so menuRenderer can hand it straight back to
        // dbusmenuClient.activate() without either side needing to know the other's
        // internal id scheme
        itemId: node.id,
        // only meaningful on a submenu item - menuRenderer calls this when the submenu
        // actually opens, not before, since some apps build children on demand
        onAboutToShow: hasSubmenu ? itemId => client.aboutToShow(itemId) : undefined,
    };
}
