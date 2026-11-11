/**
 * Centro de notificações: histórico (até 40), toasts efêmeros e painel no header.
 */
const LS_NOTIFICATIONS_PREFIX = 'sqlformys_notifications';
const LS_NOTIFICATIONS_ERRORS_ONLY_PREFIX = 'sqlformys_notifications_errors_only';
const NOTIFICATIONS_MAX = 40;

let notificationsCache = [];
let showErrorsOnly = false;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatMessageForHtml(message) {
    const normalized = String(message ?? '')
        .replace(/\\n/g, '\n')
        .replace(/\n/g, '<br>');
    return escapeHtml(normalized).replace(/&lt;br&gt;/g, '<br>');
}

function authScopedStorageKey(prefix) {
    const id = typeof getAuthIdentity === 'function' ? getAuthIdentity() : null;
    const username = id && id.username ? String(id.username).trim() : '';
    if (!username) {
        return prefix;
    }
    const safe = username.toLowerCase().replace(/[^a-z0-9@._\\-]/gi, '_');
    return `${prefix}:${safe}`;
}

function notificationsStorageKey() {
    return authScopedStorageKey(LS_NOTIFICATIONS_PREFIX);
}

function errorsOnlyStorageKey() {
    return authScopedStorageKey(LS_NOTIFICATIONS_ERRORS_ONLY_PREFIX);
}

function loadErrorsOnlyPreference() {
    try {
        const raw = localStorage.getItem(errorsOnlyStorageKey());
        showErrorsOnly = raw === '1';
    } catch (e) {
        showErrorsOnly = false;
    }
}

function persistErrorsOnlyPreference() {
    try {
        localStorage.setItem(errorsOnlyStorageKey(), showErrorsOnly ? '1' : '0');
    } catch (e) {
        console.error('Erro ao salvar preferência de notificações', e);
    }
}

function syncErrorsOnlyFilterUi() {
    const input = document.getElementById('notifications-errors-only');
    if (!input) return;
    input.checked = showErrorsOnly;
    input.setAttribute('aria-checked', showErrorsOnly ? 'true' : 'false');
}

function setShowErrorsOnly(value) {
    const next = Boolean(value);
    if (showErrorsOnly === next) {
        syncErrorsOnlyFilterUi();
        return;
    }
    showErrorsOnly = next;
    persistErrorsOnlyPreference();
    syncErrorsOnlyFilterUi();
    updateNotificationBadge();
    const panel = document.getElementById('notifications-panel');
    if (panel && !panel.classList.contains('hidden')) {
        renderNotificationsList();
    }
}

function getNotificationsForView() {
    if (!showErrorsOnly) {
        return notificationsCache;
    }
    return notificationsCache.filter((n) => n.type === 'error');
}

function loadNotificationsFromStorage() {
    try {
        const raw = localStorage.getItem(notificationsStorageKey());
        if (!raw) {
            notificationsCache = [];
            return;
        }
        const parsed = JSON.parse(raw);
        notificationsCache = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        notificationsCache = [];
    }
}

function persistNotifications() {
    try {
        localStorage.setItem(notificationsStorageKey(), JSON.stringify(notificationsCache));
    } catch (e) {
        console.error('Erro ao salvar notificações', e);
    }
}

function normalizeType(type) {
    if (type === 'error' || type === 'warning' || type === 'success') {
        return type;
    }
    return 'success';
}

function generateNotificationId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `n-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function addNotificationEntry({ title, message, type, context, read }) {
    const item = {
        id: generateNotificationId(),
        title: String(title ?? '').trim() || 'Notificação',
        message: String(message ?? ''),
        type: normalizeType(type),
        createdAt: Date.now(),
        read: Boolean(read),
        context: context ? String(context) : undefined,
    };
    notificationsCache.unshift(item);
    if (notificationsCache.length > NOTIFICATIONS_MAX) {
        notificationsCache = notificationsCache.slice(0, NOTIFICATIONS_MAX);
    }
    persistNotifications();
    return item;
}

function removeNotification(id) {
    notificationsCache = notificationsCache.filter((n) => n.id !== id);
    persistNotifications();
}

function clearAllNotifications() {
    notificationsCache = [];
    persistNotifications();
}

function markAllNotificationsRead() {
    let changed = false;
    notificationsCache.forEach((n) => {
        if (!n.read) {
            n.read = true;
            changed = true;
        }
    });
    if (changed) {
        persistNotifications();
    }
}

function getUnreadCount() {
    return getNotificationsForView().filter((n) => !n.read).length;
}

function hasUnreadError() {
    return notificationsCache.some((n) => !n.read && n.type === 'error');
}

function formatRelativeTime(timestamp) {
    const now = Date.now();
    const diffMs = now - timestamp;
    if (diffMs < 0) return 'agora';
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return 'agora';
    const min = Math.floor(sec / 60);
    if (min < 60) return `há ${min} min`;
    const hours = Math.floor(min / 60);
    if (hours < 48) return `há ${hours} h`;
    return formatAbsoluteDateTime(timestamp);
}

function formatAbsoluteDateTime(timestamp) {
    const d = new Date(timestamp);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function notificationTypeLabel(type) {
    if (type === 'error') return 'Erro';
    if (type === 'warning') return 'Aviso';
    return 'Sucesso';
}

function plainMessageFromNotification(message) {
    return String(message ?? '').replace(/\\n/g, '\n');
}

function formatNotificationForCopy(item) {
    const lines = [
        'SQLFormys — Notificação',
        `Título: ${item.title}`,
        `Tipo: ${notificationTypeLabel(item.type)}`,
        `Data: ${formatAbsoluteDateTime(item.createdAt)} (${new Date(item.createdAt).toISOString()})`,
    ];
    if (item.context) {
        lines.push(`Módulo: ${item.context}`);
    }
    lines.push('', 'Mensagem:', plainMessageFromNotification(item.message));
    return lines.join('\n');
}

async function copyTextToClipboard(text) {
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (e) {
        /* fallback abaixo */
    }

    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    } catch (e) {
        return false;
    }
}

function copyNotificationById(id) {
    const item = notificationsCache.find((n) => n.id === id);
    if (!item) return;
    const text = formatNotificationForCopy(item);
    copyTextToClipboard(text).then((ok) => {
        if (ok) {
            showToast('Copiado', 'Notificação copiada para a área de transferência.', 'success', { persist: false });
        } else {
            showToast('Copiar', 'Não foi possível copiar. Tente selecionar o texto manualmente.', 'error', { persist: false });
        }
    });
}

function notificationIconSvg(type) {
    if (type === 'success') {
        return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    }
    if (type === 'warning') {
        return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
    }
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--error-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
}

function toastIconSvg(type) {
    if (type === 'success') {
        return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    }
    if (type === 'warning') {
        return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
    }
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--error-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
}

function updateNotificationToggleAvailability() {
    const toggle = document.getElementById('notifications-toggle');
    if (!toggle) return;

    const hasItems = getNotificationsForView().length > 0;
    toggle.disabled = !hasItems;
    if (!hasItems) {
        toggle.setAttribute('title', 'Sem notificações');
        toggle.setAttribute('aria-label', 'Sem notificações');
        closeNotificationsPanel();
    } else {
        toggle.setAttribute('title', 'Notificações');
        toggle.setAttribute('aria-label', 'Notificações');
    }
}

function updateNotificationBadge() {
    const badge = document.getElementById('notifications-badge');
    const toggle = document.getElementById('notifications-toggle');
    if (!badge) {
        updateNotificationToggleAvailability();
        return;
    }

    const unread = getUnreadCount();
    if (unread === 0) {
        badge.classList.add('hidden');
        badge.textContent = '';
        if (toggle) {
            toggle.removeAttribute('data-has-error');
        }
    } else {
        badge.classList.remove('hidden');
        badge.textContent = unread > 99 ? '99+' : String(unread);
        badge.classList.toggle('is-error', hasUnreadError());

        if (toggle && hasUnreadError()) {
            toggle.setAttribute('data-has-error', 'true');
        } else if (toggle) {
            toggle.removeAttribute('data-has-error');
        }
    }

    updateNotificationToggleAvailability();
}

function closeNotificationsPanel() {
    const panel = document.getElementById('notifications-panel');
    const toggle = document.getElementById('notifications-toggle');
    if (panel) panel.classList.add('hidden');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function openNotificationsPanel() {
    const panel = document.getElementById('notifications-panel');
    const toggle = document.getElementById('notifications-toggle');
    if (!panel || !toggle || getNotificationsForView().length === 0) return;

    if (typeof closeUserMenuDropdown === 'function') {
        closeUserMenuDropdown();
    }

    markAllNotificationsRead();
    persistNotifications();
    updateNotificationBadge();
    renderNotificationsList();
    panel.classList.remove('hidden');
    toggle.setAttribute('aria-expanded', 'true');
}

function renderNotificationsList() {
    const list = document.getElementById('notifications-list');
    const empty = document.getElementById('notifications-empty');
    const clearBtn = document.getElementById('notifications-clear-all');
    if (!list) return;

    list.innerHTML = '';

    const visible = getNotificationsForView();
    const hasVisible = visible.length > 0;
    if (empty) {
        empty.classList.toggle('hidden', hasVisible);
        empty.textContent = showErrorsOnly
            ? 'Nenhuma notificação de erro'
            : 'Nenhuma notificação';
    }
    if (clearBtn) {
        clearBtn.disabled = notificationsCache.length === 0;
    }

    visible.forEach((item) => {
        const row = document.createElement('article');
        row.className = `notification-item notification-item--${item.type}`;
        if (!item.read) {
            row.classList.add('notification-item--unread');
        }
        row.setAttribute('data-id', item.id);

        row.innerHTML = `
            <div class="notification-item-icon">${notificationIconSvg(item.type)}</div>
            <div class="notification-item-body">
                <div class="notification-item-head">
                    <span class="notification-item-title">${escapeHtml(item.title)}</span>
                    <time class="notification-item-time" datetime="${new Date(item.createdAt).toISOString()}">${escapeHtml(formatRelativeTime(item.createdAt))}</time>
                </div>
                <div class="notification-item-message">${formatMessageForHtml(item.message)}</div>
                ${item.context ? `<div class="notification-item-context">${escapeHtml(item.context)}</div>` : ''}
            </div>
            <div class="notification-item-actions">
                <button type="button" class="notification-item-action notification-item-copy icon-btn" aria-label="Copiar notificação" title="Copiar para área de transferência" data-copy-id="${escapeHtml(item.id)}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                </button>
                <button type="button" class="notification-item-action notification-item-dismiss icon-btn" aria-label="Remover notificação" title="Remover" data-dismiss-id="${escapeHtml(item.id)}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        `;

        list.appendChild(row);
    });
}

function dispatchTransientToast(title, message, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toastType = normalizeType(type);
    const toast = document.createElement('div');
    toast.className = `toast ${toastType}`;
    toast.setAttribute('role', 'status');

    toast.innerHTML = `
        ${toastIconSvg(toastType)}
        <div class="toast-content">
            <div class="toast-title">${escapeHtml(title)}</div>
            <div class="toast-message">${formatMessageForHtml(message)}</div>
        </div>
        <button type="button" class="toast-close icon-btn" aria-label="Fechar notificação">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
    `;

    const dismiss = () => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    };

    toast.querySelector('.toast-close')?.addEventListener('click', dismiss);
    container.appendChild(toast);

    setTimeout(dismiss, 5000);
}

function showToast(title, message, type = 'success', options = null) {
    const opts = options && typeof options === 'object' ? options : {};
    const persist = opts.persist !== false;

    const toastType = normalizeType(type);
    const safeTitle = String(title ?? '').trim() || 'Notificação';
    const safeMessage = String(message ?? '');

    if (persist) {
        addNotificationEntry({
            title: safeTitle,
            message: safeMessage,
            type: toastType,
            context: opts.context,
            read: false,
        });
        updateNotificationBadge();
        const panel = document.getElementById('notifications-panel');
        if (panel && !panel.classList.contains('hidden')) {
            renderNotificationsList();
        }
    }

    dispatchTransientToast(safeTitle, safeMessage, toastType);
}

window.showToast = showToast;
window.refreshNotificationsStorage = function refreshNotificationsStorage() {
    loadNotificationsFromStorage();
    loadErrorsOnlyPreference();
    syncErrorsOnlyFilterUi();
    updateNotificationBadge();
    const panel = document.getElementById('notifications-panel');
    if (panel && !panel.classList.contains('hidden')) {
        renderNotificationsList();
    }
};

function confirmClearAllNotifications() {
    if (notificationsCache.length === 0) return;

    const runClear = () => {
        clearAllNotifications();
        updateNotificationBadge();
        renderNotificationsList();
    };

    if (typeof openAppModal === 'function') {
        openAppModal({
            title: 'Limpar notificações',
            body: 'Remover todas as notificações do histórico? Esta ação não pode ser desfeita.',
            primaryLabel: 'Limpar tudo',
            secondaryLabel: 'Cancelar',
            onPrimary: () => {
                runClear();
            },
        });
        return;
    }

    if (window.confirm('Remover todas as notificações?')) {
        runClear();
    }
}

function initNotificationsCenter() {
    loadNotificationsFromStorage();
    loadErrorsOnlyPreference();

    const wrap = document.getElementById('notifications-wrap');
    const toggle = document.getElementById('notifications-toggle');
    const panel = document.getElementById('notifications-panel');
    const list = document.getElementById('notifications-list');
    const clearBtn = document.getElementById('notifications-clear-all');
    const errorsOnlyInput = document.getElementById('notifications-errors-only');

    if (!toggle || !panel) {
        updateNotificationBadge();
        return;
    }

    syncErrorsOnlyFilterUi();
    updateNotificationBadge();
    renderNotificationsList();

    if (errorsOnlyInput && !errorsOnlyInput.dataset.bound) {
        errorsOnlyInput.dataset.bound = '1';
        errorsOnlyInput.addEventListener('change', (e) => {
            e.stopPropagation();
            setShowErrorsOnly(errorsOnlyInput.checked);
        });
    }

    if (!toggle.dataset.bound) {
        toggle.dataset.bound = '1';
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (toggle.disabled) return;
            const isOpen = !panel.classList.contains('hidden');
            if (isOpen) {
                closeNotificationsPanel();
            } else {
                openNotificationsPanel();
            }
        });
    }

    if (clearBtn && !clearBtn.dataset.bound) {
        clearBtn.dataset.bound = '1';
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            confirmClearAllNotifications();
        });
    }

    if (list && !list.dataset.bound) {
        list.dataset.bound = '1';
        list.addEventListener('click', (e) => {
            const copyBtn = e.target.closest('[data-copy-id]');
            if (copyBtn) {
                e.stopPropagation();
                const copyId = copyBtn.getAttribute('data-copy-id');
                if (copyId) {
                    copyNotificationById(copyId);
                }
                return;
            }

            const dismissBtn = e.target.closest('[data-dismiss-id]');
            if (!dismissBtn) return;
            e.stopPropagation();
            const id = dismissBtn.getAttribute('data-dismiss-id');
            if (!id) return;
            removeNotification(id);
            updateNotificationBadge();
            renderNotificationsList();
        });
    }

    if (!document.body.dataset.notificationsGlobalBound) {
        document.body.dataset.notificationsGlobalBound = '1';
        document.addEventListener('click', (e) => {
            if (!wrap || wrap.contains(e.target)) return;
            closeNotificationsPanel();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeNotificationsPanel();
            }
        });
    }
}

window.closeNotificationsPanel = closeNotificationsPanel;

document.addEventListener('DOMContentLoaded', () => {
    initNotificationsCenter();
});
