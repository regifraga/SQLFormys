/**
 * Preferências do usuário: arquivo via API quando autenticado, senão localStorage.
 */
const LS_FAVORITES_KEY = 'sqlformys_favorites';
const LS_THEME_KEY = 'sqlformys_theme';
const LS_SIDEBAR_KEY = 'sqlformys_sidebar_expanded';
const LS_SIDEBAR_WIDTH_KEY = 'sqlformys_sidebar_width';
const SIDEBAR_WIDTH_DEFAULT = 300;
const SIDEBAR_WIDTH_MIN_DRAG = 200;
const SIDEBAR_WIDTH_MIN_STORE = 280;
const SIDEBAR_WIDTH_MAX = 600;

let settingsCache = {
    favorites: [],
    theme: null,
    sidebarExpanded: [],
    sidebarWidth: null
};

let patchTimer = null;
let pendingPatch = {};

function usesServerSettings() {
    const id = typeof getAuthIdentity === 'function' ? getAuthIdentity() : null;
    return Boolean(id && id.username);
}

function localFavoritesStorageKey() {
    const id = typeof getAuthIdentity === 'function' ? getAuthIdentity() : null;
    const username = id && id.username ? String(id.username).trim() : '';
    if (!username) {
        return LS_FAVORITES_KEY;
    }
    const safe = username.toLowerCase().replace(/[^a-z0-9@._\\-]/gi, '_');
    return `${LS_FAVORITES_KEY}:${safe}`;
}

function readLocalSidebarExpanded() {
    try {
        const raw = localStorage.getItem(LS_SIDEBAR_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function readLocalSidebarWidth() {
    try {
        const raw = localStorage.getItem(LS_SIDEBAR_WIDTH_KEY);
        if (raw === null || raw === '') return null;
        const n = parseInt(raw, 10);
        return Number.isFinite(n) && n >= SIDEBAR_WIDTH_MIN_STORE ? n : null;
    } catch {
        return null;
    }
}

function sidebarWidthMax() {
    return Math.min(SIDEBAR_WIDTH_MAX, window.innerWidth * 0.5);
}

function clampSidebarWidth(px, { forDrag = false } = {}) {
    let w = Math.round(Number(px));
    if (!Number.isFinite(w)) {
        return null;
    }
    const maxW = sidebarWidthMax();
    const minW = forDrag ? SIDEBAR_WIDTH_MIN_DRAG : SIDEBAR_WIDTH_MIN_STORE;
    if (w < minW) w = minW;
    if (w > maxW) w = maxW;
    return w;
}

function readLocalFavorites() {
    try {
        const raw = localStorage.getItem(localFavoritesStorageKey());
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function loadUserSettings(apiBaseUrl) {
    if (usesServerSettings()) {
        try {
            const res = await apiFetch(`${apiBaseUrl}/me/settings`);
            if (res.ok) {
                const data = await res.json();
                const width = typeof data.sidebarWidth === 'number' ? data.sidebarWidth : null;
                settingsCache = {
                    favorites: Array.isArray(data.favorites) ? data.favorites : [],
                    theme: data.theme === 'dark' || data.theme === 'light' ? data.theme : null,
                    sidebarExpanded: Array.isArray(data.sidebarExpanded) ? data.sidebarExpanded : [],
                    sidebarWidth: width && width >= SIDEBAR_WIDTH_MIN_STORE ? width : null
                };
                return settingsCache;
            }
        } catch (e) {
            console.error('Erro ao carregar preferências do servidor', e);
        }
    }

    const theme = localStorage.getItem(LS_THEME_KEY);
    settingsCache = {
        favorites: readLocalFavorites(),
        theme: theme === 'dark' || theme === 'light' ? theme : null,
        sidebarExpanded: readLocalSidebarExpanded(),
        sidebarWidth: readLocalSidebarWidth()
    };
    return settingsCache;
}

function getSettingsCache() {
    return settingsCache;
}

function isSidebarFolderExpanded(id) {
    return settingsCache.sidebarExpanded.includes(id);
}

function flushPendingPatch() {
    if (!Object.keys(pendingPatch).length) {
        return;
    }
    const body = { ...pendingPatch };
    pendingPatch = {};
    const apiBase = (window.ENV && window.ENV.API_BASE_URL)
        ? window.ENV.API_BASE_URL
        : 'http://localhost:8080/api';
    apiFetch(`${apiBase}/me/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).catch((e) => console.error('Erro ao salvar preferências', e));
}

function patchUserSettings(partial) {
    if (partial.favorites !== undefined) {
        settingsCache.favorites = partial.favorites;
    }
    if (partial.theme !== undefined) {
        settingsCache.theme = partial.theme;
    }
    if (partial.sidebarExpanded !== undefined) {
        settingsCache.sidebarExpanded = partial.sidebarExpanded;
    }
    if (partial.sidebarWidth !== undefined) {
        settingsCache.sidebarWidth = partial.sidebarWidth;
    }

    if (usesServerSettings()) {
        Object.assign(pendingPatch, partial);
        clearTimeout(patchTimer);
        patchTimer = setTimeout(flushPendingPatch, 300);
        return;
    }

    if (partial.favorites !== undefined) {
        try {
            localStorage.setItem(localFavoritesStorageKey(), JSON.stringify(settingsCache.favorites));
        } catch (e) {
            console.error(e);
        }
    }
    if (partial.theme !== undefined && settingsCache.theme) {
        try {
            localStorage.setItem(LS_THEME_KEY, settingsCache.theme);
        } catch (e) {
            console.error(e);
        }
    }
    if (partial.sidebarExpanded !== undefined) {
        try {
            localStorage.setItem(LS_SIDEBAR_KEY, JSON.stringify(settingsCache.sidebarExpanded));
        } catch (e) {
            console.error(e);
        }
    }
    if (partial.sidebarWidth !== undefined && settingsCache.sidebarWidth != null) {
        try {
            localStorage.setItem(LS_SIDEBAR_WIDTH_KEY, String(settingsCache.sidebarWidth));
        } catch (e) {
            console.error(e);
        }
    }
}

function applySavedSidebarWidth() {
    const w = clampSidebarWidth(settingsCache.sidebarWidth);
    if (w == null) {
        document.documentElement.style.removeProperty('--sidebar-width');
        return;
    }
    document.documentElement.style.setProperty('--sidebar-width', `${w}px`);
}

function saveSidebarWidth(px) {
    const w = clampSidebarWidth(px);
    if (w == null || w < SIDEBAR_WIDTH_MIN_STORE) {
        return;
    }
    settingsCache.sidebarWidth = w;
    patchUserSettings({ sidebarWidth: w });
}

function setSidebarFolderExpanded(id, open) {
    const set = new Set(settingsCache.sidebarExpanded);
    if (open) {
        set.add(id);
    } else {
        set.delete(id);
    }
    settingsCache.sidebarExpanded = [...set];
    patchUserSettings({ sidebarExpanded: settingsCache.sidebarExpanded });
    if (typeof applySidebarExpandedToDOM === 'function') {
        applySidebarExpandedToDOM();
    }
}

function setSidebarExpandedAll(ids) {
    settingsCache.sidebarExpanded = [...ids];
    patchUserSettings({ sidebarExpanded: settingsCache.sidebarExpanded });
    if (typeof applySidebarExpandedToDOM === 'function') {
        applySidebarExpandedToDOM();
    }
}

function anySidebarFolderExpanded() {
    return settingsCache.sidebarExpanded.length > 0;
}

function getFavoritesFromSettings() {
    return settingsCache.favorites || [];
}

function saveFavoritesToSettings(favorites) {
    settingsCache.favorites = favorites;
    patchUserSettings({ favorites });
}

function syncSidebarFolderPanel(panelEl, toggleEl, id) {
    if (!panelEl || !id) return;
    const open = isSidebarFolderExpanded(id);
    panelEl.classList.toggle('open', open);
    if (toggleEl) {
        toggleEl.classList.toggle('is-open', open);
        toggleEl.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
}

function applySidebarExpandedToDOM() {
    document.querySelectorAll('.tree-folder-content[data-sidebar-folder-id]').forEach((panel) => {
        const id = panel.getAttribute('data-sidebar-folder-id');
        const open = isSidebarFolderExpanded(id);
        panel.classList.toggle('open', open);
        const header = panel.previousElementSibling;
        if (header && header.classList.contains('tree-folder-header')) {
            header.classList.toggle('active', open);
        }
    });

    document.querySelectorAll('.sidebar-folder-panel[data-sidebar-folder-id]').forEach((panel) => {
        const id = panel.getAttribute('data-sidebar-folder-id');
        const toggle = document.querySelector(
            `.sidebar-folder-toggle[data-sidebar-folder-id="${CSS.escape(id)}"]`
        );
        syncSidebarFolderPanel(panel, toggle, id);
    });

    if (typeof updateExpandCollapseAllButton === 'function') {
        updateExpandCollapseAllButton();
    }
}

window.usesServerSettings = usesServerSettings;
window.loadUserSettings = loadUserSettings;
window.getSettingsCache = getSettingsCache;
window.patchUserSettings = patchUserSettings;
window.isSidebarFolderExpanded = isSidebarFolderExpanded;
window.setSidebarFolderExpanded = setSidebarFolderExpanded;
window.setSidebarExpandedAll = setSidebarExpandedAll;
window.anySidebarFolderExpanded = anySidebarFolderExpanded;
window.getFavoritesFromSettings = getFavoritesFromSettings;
window.saveFavoritesToSettings = saveFavoritesToSettings;
window.applySidebarExpandedToDOM = applySidebarExpandedToDOM;
window.syncSidebarFolderPanel = syncSidebarFolderPanel;
window.applySavedSidebarWidth = applySavedSidebarWidth;
window.saveSidebarWidth = saveSidebarWidth;
window.clampSidebarWidth = clampSidebarWidth;
