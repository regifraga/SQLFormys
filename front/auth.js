/**
 * Autenticação de rede opcional (controlada por window.ENV.AUTH_ENABLED).
 */

const AUTH_STORAGE_KEY = 'sqlformys_auth_identity';

function parseEnvBool(value, defaultValue = false) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return defaultValue;
    }
    const token = String(value).trim().toLowerCase();
    if (['true', 's', '1', 'sim', 'yes'].includes(token)) return true;
    if (['false', 'n', '0', 'nao', 'não', 'no'].includes(token)) return false;
    return defaultValue;
}

function isAuthEnabled() {
    return parseEnvBool(window.ENV && window.ENV.AUTH_ENABLED, false);
}

function getCachedIdentity() {
    try {
        const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function setCachedIdentity(identity) {
    if (!identity) {
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
        return;
    }
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(identity));
}

async function apiFetch(url, options = {}) {
    const opts = {
        credentials: 'include',
        ...options,
        headers: {
            ...(options.headers || {})
        }
    };
    return fetch(url, opts);
}

function hasKnownUser(identity) {
    return Boolean(identity && identity.username);
}

function renderAuthSidebar(identity, unauthenticated = false) {
    const el = document.getElementById('sidebar-auth-user');
    if (!el) return;

    if (unauthenticated && isAuthEnabled()) {
        el.classList.remove('hidden');
        el.textContent = 'Usuário: não autenticado';
        el.classList.add('sidebar-auth-user--muted');
        el.removeAttribute('title');
        return;
    }

    if (!hasKnownUser(identity)) {
        el.textContent = '';
        el.classList.add('hidden');
        el.removeAttribute('title');
        return;
    }

    const label = identity.displayName || identity.username;
    el.textContent = `Usuário: ${label}`;
    el.classList.remove('hidden');
    el.classList.remove('sidebar-auth-user--muted');
    if (identity.username && identity.username !== label) {
        el.title = identity.username;
    } else {
        el.removeAttribute('title');
    }
}

function renderAuthHeader(identity, unauthenticated = false) {
    const warn = document.getElementById('auth-unauthenticated');
    if (!warn) {
        renderAuthSidebar(identity, unauthenticated);
        return;
    }

    if (unauthenticated && isAuthEnabled()) {
        warn.classList.remove('hidden');
        renderAuthSidebar(null, true);
        return;
    }

    warn.classList.add('hidden');
    renderAuthSidebar(hasKnownUser(identity) ? identity : null, false);
}

function showAuthGateMessage() {
    const emptyState = document.getElementById('empty-state');
    const treeNavigation = document.getElementById('tree-navigation');
    if (treeNavigation) {
        treeNavigation.innerHTML =
            '<div class="loading-state" style="color: var(--text-muted);">Autenticação de rede necessária.</div>';
    }
    if (emptyState) {
        emptyState.classList.remove('hidden');
        const title = emptyState.querySelector('h2');
        const text = emptyState.querySelector('p');
        if (title) title.textContent = 'Não autenticado na rede';
        if (text) {
            text.textContent =
                'Esta instalação exige identidade de rede (Negotiate/Kerberos). Acesse pela intranet corporativa ou confirme a zona confiável do navegador. Não é necessário informar senha nesta tela.';
        }
    }
}

/**
 * @returns {Promise<{ ok: boolean, identity?: object, unauthorized?: boolean }>}
 */
async function bootstrapAuth(apiBaseUrl) {
    const kerberosRequired = isAuthEnabled();

    const cached = getCachedIdentity();
    if (cached && cached.username) {
        renderAuthHeader(cached);
    }

    let response;
    try {
        response = await apiFetch(`${apiBaseUrl}/auth/me`);
    } catch (err) {
        console.error(err);
        return { ok: !kerberosRequired };
    }

    if (response.status === 401) {
        setCachedIdentity(null);
        if (kerberosRequired) {
            renderAuthHeader(null, true);
            showAuthGateMessage();
            return { ok: false, unauthorized: true };
        }
        renderAuthHeader(null);
        return { ok: true };
    }

    if (!response.ok) {
        return { ok: !kerberosRequired };
    }

    const identity = await response.json();
    if (hasKnownUser(identity)) {
        setCachedIdentity(identity);
    } else {
        setCachedIdentity(null);
    }
    renderAuthHeader(identity);
    return { ok: true, identity };
}
