/**
 * Tema claro / escuro (persistido em localStorage).
 */
const THEME_STORAGE_KEY = 'sqlformys_theme';

function getStoredTheme() {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === 'light' || value === 'dark') {
        return value;
    }
    return null;
}

function resolveInitialTheme() {
    const stored = getStoredTheme();
    if (stored) {
        return stored;
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

function applyTheme(theme, options = {}) {
    const persist = options.persist !== false;
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    if (persist && typeof patchUserSettings === 'function') {
        patchUserSettings({ theme: next });
    }
    updateThemeToggleUI(next);
    window.dispatchEvent(new CustomEvent('sqlformys-theme-change', { detail: { theme: next } }));
}

function updateThemeToggleUI(theme) {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;

    const isDark = theme === 'dark';
    btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    btn.setAttribute(
        'aria-label',
        isDark ? 'Ativar tema claro' : 'Ativar tema escuro'
    );
    const sun = btn.querySelector('.theme-icon-sun');
    const moon = btn.querySelector('.theme-icon-moon');
    if (sun) sun.classList.toggle('hidden', !isDark);
    if (moon) moon.classList.toggle('hidden', isDark);
}

function initTheme() {
    const theme = document.documentElement.getAttribute('data-theme') || resolveInitialTheme();
    applyTheme(theme, { persist: false });

    const btn = document.getElementById('theme-toggle');
    if (!btn) return;

    btn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        applyTheme(current === 'dark' ? 'light' : 'dark', { persist: true });
    });
}

document.addEventListener('DOMContentLoaded', initTheme);
