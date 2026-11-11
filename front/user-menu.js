/**
 * Badge de usuário no header e troca de senha.
 */

function validateStrongPasswordClient(username, password) {
    if (!password || password.length < 10) {
        return 'Mínimo 10 caracteres.';
    }
    const userKey = String(username || '').trim().toLowerCase();
    if (userKey && password.toLowerCase() === userKey) {
        return 'Não pode ser igual ao nome de usuário.';
    }
    const common = ['123456', 'password', 'senha123', 'qwerty'];
    if (common.includes(password.toLowerCase())) {
        return 'Senha muito comum.';
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
        return 'Use maiúscula, minúscula, número e caractere especial.';
    }
    return '';
}

function closeUserMenuDropdown() {
    const dd = document.getElementById('user-menu-dropdown');
    const btn = document.getElementById('user-menu-toggle');
    if (dd) dd.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function initUserMenu(identity, apiBaseUrl) {
    const wrap = document.getElementById('user-menu-wrap');
    const btn = document.getElementById('user-menu-toggle');
    const dd = document.getElementById('user-menu-dropdown');
  const label = document.getElementById('user-badge-label');
    const changePwdBtn = document.getElementById('user-menu-change-password');
    const logoutBtn = document.getElementById('user-menu-logout');
    const menuDivider = document.getElementById('user-menu-divider');
    if (!wrap || !btn) return;

    if (!identity || !identity.username) {
        wrap.classList.add('hidden');
        return;
    }

    wrap.classList.remove('hidden');
    const display = identity.displayName || identity.username;
    if (label) {
        label.textContent = display;
        if (identity.username !== display) {
            btn.title = identity.username;
        }
    }

    const iconStd = wrap.querySelector('.user-badge-icon--standard');
    const iconAdm = wrap.querySelector('.user-badge-icon--admin');
    if (identity.isAdmin) {
        iconStd?.classList.add('hidden');
        iconAdm?.classList.remove('hidden');
    } else {
        iconAdm?.classList.add('hidden');
        iconStd?.classList.remove('hidden');
    }

    let showDivider = false;
    if (identity.canChangePassword && changePwdBtn) {
        changePwdBtn.classList.remove('hidden');
        changePwdBtn.onclick = () => {
            closeUserMenuDropdown();
            openChangePasswordModal(apiBaseUrl, identity.username);
        };
        showDivider = true;
    } else if (changePwdBtn) {
        changePwdBtn.classList.add('hidden');
    }

    if (menuDivider) {
        menuDivider.classList.toggle('hidden', !showDivider);
    }

    if (logoutBtn && !logoutBtn.dataset.bound) {
        logoutBtn.dataset.bound = '1';
        logoutBtn.addEventListener('click', () => {
            closeUserMenuDropdown();
            if (typeof logout === 'function') {
                logout();
            }
        });
    }

    if (!btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = dd && dd.classList.contains('hidden');
            if (open) {
                if (typeof closeNotificationsPanel === 'function') {
                    closeNotificationsPanel();
                }
                dd.classList.remove('hidden');
                btn.setAttribute('aria-expanded', 'true');
            } else {
                closeUserMenuDropdown();
            }
        });
        document.addEventListener('click', () => closeUserMenuDropdown());
    }
}

function openChangePasswordModal(apiBaseUrl, username) {
    if (typeof openAppModal !== 'function') return;
    const body = document.createElement('div');
    body.innerHTML = `
        <div class="form-field-stack">
            <label for="pwd-current">Senha atual</label>
            <input type="password" id="pwd-current" class="form-control" autocomplete="current-password">
        </div>
        <div class="form-field-stack">
            <label for="pwd-new">Nova senha</label>
            <input type="password" id="pwd-new" class="form-control" autocomplete="new-password">
            <span class="form-field-hint" id="pwd-hint">Mínimo 10 caracteres, maiúscula, minúscula, número e caractere especial.</span>
        </div>
        <div class="form-field-stack">
            <label for="pwd-confirm">Confirmar nova senha</label>
            <input type="password" id="pwd-confirm" class="form-control" autocomplete="new-password">
        </div>
    `;

    openAppModal({
        title: 'Trocar senha',
        body,
        primaryLabel: 'Salvar',
        onPrimary: async () => {
            const current = body.querySelector('#pwd-current')?.value || '';
            const next = body.querySelector('#pwd-new')?.value || '';
            const confirm = body.querySelector('#pwd-confirm')?.value || '';
            const hint = body.querySelector('#pwd-hint');
            const err = validateStrongPasswordClient(username, next);
            if (err) {
                hint.textContent = err;
                hint.classList.add('is-error');
                return false;
            }
            if (next !== confirm) {
                hint.textContent = 'Confirmação não confere.';
                hint.classList.add('is-error');
                return false;
            }
            const res = await apiFetch(`${apiBaseUrl}/auth/password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword: current, newPassword: next })
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                hint.textContent = data.error || 'Não foi possível alterar a senha.';
                hint.classList.add('is-error');
                return false;
            }
            if (typeof showToast === 'function') {
                showToast('Senha', 'Senha atualizada. O navegador pode solicitar login novamente.', 'success');
            }
            return true;
        }
    });
}

window.validateStrongPasswordClient = validateStrongPasswordClient;
window.initUserMenu = initUserMenu;
