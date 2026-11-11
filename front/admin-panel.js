/**
 * Painel admin: usuários, editor SQL e ações na árvore.
 */

let sqlEditorInstance = null;
let sqlEditorPath = null;
let sqlEditorBaselineContent = null;
let adminUsersCache = [];

function resolveAuthIdentity() {
    if (window.sqlformysAuthIdentity && window.sqlformysAuthIdentity.username) {
        return window.sqlformysAuthIdentity;
    }
    if (typeof getAuthIdentity === 'function') {
        return getAuthIdentity();
    }
    return null;
}

function isAdminUser() {
    const identity = resolveAuthIdentity();
    return Boolean(identity && identity.isAdmin);
}

function openAppModal({ title, body, primaryLabel = 'Confirmar', secondaryLabel = 'Cancelar', onPrimary, onSecondary }) {
    const backdrop = document.getElementById('app-modal-backdrop');
    const titleEl = document.getElementById('app-modal-title');
    const bodyEl = document.getElementById('app-modal-body');
    const footer = document.getElementById('app-modal-footer');
    const closeBtn = document.getElementById('app-modal-close');
    if (!backdrop || !titleEl || !bodyEl || !footer) return;

    titleEl.textContent = title;
    bodyEl.innerHTML = '';
    if (typeof body === 'string') {
        bodyEl.textContent = body;
    } else if (body instanceof HTMLElement) {
        bodyEl.appendChild(body);
    }
    footer.innerHTML = '';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = secondaryLabel;
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn btn-primary';
    ok.textContent = primaryLabel;
    footer.appendChild(cancel);
    footer.appendChild(ok);

    const close = () => {
        backdrop.classList.add('hidden');
        backdrop.setAttribute('aria-hidden', 'true');
    };

    cancel.onclick = async () => {
        if (onSecondary) await onSecondary();
        close();
    };
    closeBtn.onclick = async () => {
        if (onSecondary) await onSecondary();
        close();
    };
    ok.onclick = async () => {
        if (onPrimary) {
            const done = await onPrimary();
            if (done !== false) close();
        } else {
            close();
        }
    };

    backdrop.classList.remove('hidden');
    backdrop.setAttribute('aria-hidden', 'false');
}

window.openAppModal = openAppModal;

function adminSqlUrl(apiBaseUrl, relPath) {
    const encoded = String(relPath).split('/').map(encodeURIComponent).join('/');
    return `${apiBaseUrl}/admin/sql/${encoded}`;
}

async function fetchAdminUsers(apiBaseUrl) {
    const res = await apiFetch(`${apiBaseUrl}/admin/users`);
    if (!res.ok) return [];
    const data = await res.json();
    adminUsersCache = data.users || [];
    return adminUsersCache;
}

function createTreeIconBtn(label, svgInner, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tree-icon-btn';
    btn.setAttribute('data-tooltip', label);
    btn.setAttribute('aria-label', label);
    btn.innerHTML = svgInner;
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
    });
    return btn;
}

const ICON_EDIT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
const ICON_ADD = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
const ICON_RENAME = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>';
const ICON_TRASH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

const ICON_CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';

function adminGroupFolderId(groupName) {
    return groupName === 'Administradores' ? 'users:administradores' : 'users:padrao';
}

function userDisplayInitial(username) {
    const s = String(username || '').trim();
    return (s.charAt(0) || '?').toUpperCase();
}

function appendAdminUserListItem(listEl, user, apiBaseUrl) {
    const li = document.createElement('li');
    li.className = 'tree-admin-user-item';

    const avatar = document.createElement('span');
    avatar.className = `tree-admin-user-avatar${user.admin ? ' tree-admin-user-avatar--admin' : ''}`;
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = userDisplayInitial(user.username);

    const name = document.createElement('span');
    name.className = 'tree-admin-user-name';
    name.textContent = user.username;
    name.title = user.username;

    const actions = document.createElement('div');
    actions.className = 'tree-admin-user-actions';
    actions.appendChild(createTreeIconBtn('Editar', ICON_EDIT, () => {
        openUserFormModal(apiBaseUrl, { user });
    }));
    actions.appendChild(createTreeIconBtn('Apagar', ICON_TRASH, () => {
        openAppModal({
            title: 'Apagar usuário',
            body: `Confirma a exclusão de "${user.username}"?`,
            primaryLabel: 'Apagar',
            onPrimary: async () => {
                const res = await apiFetch(`${apiBaseUrl}/admin/users/${encodeURIComponent(user.username)}`, {
                    method: 'DELETE'
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    showToast('Erro', data.error || 'Falha ao apagar.', 'error');
                    return false;
                }
                await refreshAdminSidebar(apiBaseUrl);
                showToast('Usuários', 'Usuário removido.', 'success');
                return true;
            }
        });
    }));

    li.appendChild(avatar);
    li.appendChild(name);
    li.appendChild(actions);
    listEl.appendChild(li);
}

function renderAdminUserGroup(apiBaseUrl, group) {
    const users = adminUsersCache.filter(group.filter);

    const groupEl = document.createElement('div');
    groupEl.className = 'tree-admin-group';

    const head = document.createElement('div');
    head.className = 'tree-admin-group-head';

    const folderId = adminGroupFolderId(group.name);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'tree-admin-group-toggle sidebar-folder-toggle';
    toggle.dataset.sidebarFolderId = folderId;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = `
        <span class="tree-admin-chevron">${ICON_CHEVRON}</span>
        <span class="tree-admin-group-name">${group.name}</span>
        <span class="tree-admin-group-count">${users.length}</span>`;

    const addBtn = createTreeIconBtn('Adicionar usuário', ICON_ADD, () => {
        openUserFormModal(apiBaseUrl, { adminDefault: group.name === 'Administradores' });
    });
    addBtn.classList.add('tree-admin-group-add');

    head.appendChild(toggle);
    head.appendChild(addBtn);

    const panel = document.createElement('div');
    panel.className = 'tree-admin-group-panel sidebar-folder-panel';
    panel.dataset.sidebarFolderId = folderId;

    if (users.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'tree-admin-empty';
        empty.textContent = 'Nenhum usuário neste grupo.';
        panel.appendChild(empty);
    } else {
        const list = document.createElement('ul');
        list.className = 'tree-admin-user-list';
        users.forEach((user) => appendAdminUserListItem(list, user, apiBaseUrl));
        panel.appendChild(list);
    }

    toggle.addEventListener('click', () => {
        const willOpen = !panel.classList.contains('open');
        if (typeof setSidebarFolderExpanded === 'function') {
            setSidebarFolderExpanded(folderId, willOpen);
        } else {
            panel.classList.toggle('open', willOpen);
            toggle.classList.toggle('is-open', willOpen);
            toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        }
    });

    groupEl.appendChild(head);
    groupEl.appendChild(panel);
    if (typeof syncSidebarFolderPanel === 'function') {
        syncSidebarFolderPanel(panel, toggle, folderId);
    }
    return groupEl;
}

function renderAdminUsersPanel(apiBaseUrl) {
    const mount = document.getElementById('sidebar-admin-users');
    if (!mount) return;

    if (!isAdminUser()) {
        mount.innerHTML = '';
        mount.classList.add('hidden');
        return;
    }

    mount.innerHTML = '';
    mount.classList.remove('hidden');
    renderAdminUsersTree(mount, apiBaseUrl);
}

function renderAdminUsersTree(parentEl, apiBaseUrl) {
    const section = document.createElement('div');
    section.className = 'tree-admin-users';

    const head = document.createElement('div');
    head.className = 'tree-admin-users-head';

    const usersToggle = document.createElement('button');
    usersToggle.type = 'button';
    usersToggle.className = 'tree-admin-users-toggle sidebar-folder-toggle';
    usersToggle.dataset.sidebarFolderId = 'users';
    usersToggle.setAttribute('aria-expanded', 'false');
    usersToggle.innerHTML = `
        <span class="tree-admin-chevron">${ICON_CHEVRON}</span>
        <span class="tree-admin-users-title">Usuários</span>`;
    head.appendChild(usersToggle);
    section.appendChild(head);

    const body = document.createElement('div');
    body.className = 'tree-admin-users-body sidebar-folder-panel';
    body.dataset.sidebarFolderId = 'users';

    usersToggle.addEventListener('click', () => {
        const willOpen = !body.classList.contains('open');
        if (typeof setSidebarFolderExpanded === 'function') {
            setSidebarFolderExpanded('users', willOpen);
        } else {
            body.classList.toggle('open', willOpen);
            usersToggle.classList.toggle('is-open', willOpen);
            usersToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        }
    });

    const groups = [
        { name: 'Padrão', filter: (u) => !u.admin },
        { name: 'Administradores', filter: (u) => u.admin }
    ];
    groups.forEach((group) => body.appendChild(renderAdminUserGroup(apiBaseUrl, group)));

    section.appendChild(body);
    parentEl.appendChild(section);

    if (typeof syncSidebarFolderPanel === 'function') {
        syncSidebarFolderPanel(body, usersToggle, 'users');
    }
    if (typeof applySidebarExpandedToDOM === 'function') {
        applySidebarExpandedToDOM();
    }
}

function openUserFormModal(apiBaseUrl, opts = {}) {
    const editUser = opts.user || null;
    const form = document.createElement('div');
    const pwdPlaceholder = editUser ? '••••••••' : '';
    form.innerHTML = `
        <div class="form-field-stack">
            <label for="user-form-name">Nome de usuário</label>
            <input type="text" id="user-form-name" class="form-control" value="${editUser ? editUser.username : ''}" ${editUser ? '' : ''}>
        </div>
        <div class="form-field-stack">
            <label for="user-form-password">Senha${editUser ? ' (deixe em branco para manter)' : ''}</label>
            <input type="password" id="user-form-password" class="form-control" placeholder="${pwdPlaceholder}" autocomplete="new-password">
        </div>
        <div class="form-field-stack">
            <label for="user-form-role">Perfil</label>
            <select id="user-form-role" class="form-control">
                <option value="standard">Padrão</option>
                <option value="admin">Administrador</option>
            </select>
        </div>
        <span class="form-field-hint" id="user-form-hint"></span>
    `;
    const role = form.querySelector('#user-form-role');
    if (editUser && editUser.admin) role.value = 'admin';
    if (opts.adminDefault) role.value = 'admin';

    openAppModal({
        title: editUser ? 'Editar usuário' : 'Novo usuário',
        body: form,
        primaryLabel: 'Salvar',
        onPrimary: async () => {
            const username = form.querySelector('#user-form-name')?.value?.trim();
            const password = form.querySelector('#user-form-password')?.value || '';
            const isAdmin = role.value === 'admin';
            const hint = form.querySelector('#user-form-hint');
            if (!username) {
                hint.textContent = 'Informe o nome de usuário.';
                hint.classList.add('is-error');
                return false;
            }
            if (!editUser || password) {
                const err = validateStrongPasswordClient(username, password);
                if (err) {
                    hint.textContent = err;
                    hint.classList.add('is-error');
                    return false;
                }
            }
            let res;
            if (editUser) {
                res = await apiFetch(`${apiBaseUrl}/admin/users/${encodeURIComponent(editUser.username)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, admin: isAdmin })
                });
            } else {
                res = await apiFetch(`${apiBaseUrl}/admin/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, admin: isAdmin })
                });
            }
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                hint.textContent = data.error || 'Não foi possível salvar.';
                hint.classList.add('is-error');
                return false;
            }
            await refreshAdminSidebar(apiBaseUrl);
            showToast('Usuários', 'Salvo com sucesso.', 'success');
            return true;
        }
    });
}

async function refreshAdminSidebar(apiBaseUrl) {
    if (!isAdminUser() || typeof treeNavigation === 'undefined') return;
    await fetchAdminUsers(apiBaseUrl);
    if (typeof loadProjects === 'function') {
        await loadProjects();
    }
}

function appendTreeAdminRootBar(container, apiBaseUrl) {
    const bar = document.createElement('div');
    bar.className = 'tree-admin-bar';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline btn-sm';
    btn.textContent = 'Adicionar';
    btn.addEventListener('click', () => openAddNodeModal(apiBaseUrl, ''));
    bar.appendChild(btn);
    container.appendChild(bar);
}

function openAddNodeModal(apiBaseUrl, parentPath) {
    const body = document.createElement('div');
    body.innerHTML = `
        <div class="form-field-stack">
            <label for="add-node-type">Tipo</label>
            <select id="add-node-type" class="form-control">
                <option value="folder">Pasta</option>
                <option value="file">Arquivo</option>
            </select>
        </div>
        <div class="form-field-stack">
            <label for="add-node-name">Nome</label>
            <input type="text" id="add-node-name" class="form-control" placeholder="Nome da pasta ou arquivo">
        </div>
        <span class="form-field-hint" id="add-node-hint"></span>
    `;
    openAppModal({
        title: parentPath ? 'Adicionar na pasta' : 'Adicionar na raiz',
        body,
        onPrimary: async () => {
            const type = body.querySelector('#add-node-type')?.value;
            const name = body.querySelector('#add-node-name')?.value?.trim();
            const hint = body.querySelector('#add-node-hint');
            if (!name) {
                hint.textContent = 'Informe um nome.';
                hint.classList.add('is-error');
                return false;
            }
            const rel = parentPath ? `${parentPath}/${name}` : name;
            if (type === 'folder') {
                const res = await apiFetch(`${apiBaseUrl}/admin/folders`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: rel })
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    hint.textContent = data.error || 'Falha ao criar pasta.';
                    hint.classList.add('is-error');
                    return false;
                }
                await loadProjects();
                showToast('Estrutura', 'Pasta criada.', 'success');
                return true;
            }
            openSqlEditor(apiBaseUrl, rel, '');
            return true;
        }
    });
}

function openRenameFolderModal(apiBaseUrl, folderRelPath, folderName) {
    const body = document.createElement('div');
    body.innerHTML = `
        <div class="form-field-stack">
            <label for="rename-folder-name">Novo nome da pasta</label>
            <input type="text" id="rename-folder-name" class="form-control" value="${folderName}">
        </div>
        <span class="form-field-hint" id="rename-folder-hint"></span>
    `;
    openAppModal({
        title: 'Renomear pasta',
        body,
        onPrimary: async () => {
            const newName = body.querySelector('#rename-folder-name')?.value?.trim();
            const hint = body.querySelector('#rename-folder-hint');
            if (!newName) {
                hint.textContent = 'Informe o novo nome.';
                hint.classList.add('is-error');
                return false;
            }
            const parent = folderRelPath.includes('/') ? folderRelPath.slice(0, folderRelPath.lastIndexOf('/')) : '';
            const to = parent ? `${parent}/${newName}` : newName;
            const res = await apiFetch(`${apiBaseUrl}/admin/folders`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: folderRelPath, to })
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                hint.textContent = data.error || 'Falha ao renomear.';
                hint.classList.add('is-error');
                return false;
            }
            await loadProjects();
            showToast('Estrutura', 'Pasta renomeada.', 'success');
            return true;
        }
    });
}

function codemirrorTheme() {
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === 'dark' ? 'dracula' : 'default';
}

function ensureSqlEditor() {
    if (sqlEditorInstance || typeof CodeMirror === 'undefined') return;
    const ta = document.getElementById('sql-editor-textarea');
    if (!ta) return;
    sqlEditorInstance = CodeMirror.fromTextArea(ta, {
        mode: 'text/x-sql',
        lineNumbers: true,
        theme: codemirrorTheme(),
        indentWithTabs: false,
        tabSize: 2,
        lineWrapping: true
    });
}

function refreshSqlEditorLayout({ focus = false } = {}) {
    if (!sqlEditorInstance) return;
    requestAnimationFrame(() => {
        sqlEditorInstance.refresh();
        if (!focus) return;
        requestAnimationFrame(() => {
            sqlEditorInstance.refresh();
            sqlEditorInstance.focus();
        });
    });
}

async function openSqlEditor(apiBaseUrl, relPath, initialContent) {
    const container = document.getElementById('sql-editor-container');
    const formContainer = document.getElementById('form-container');
    const gridContainer = document.getElementById('grid-container');
    const emptyState = document.getElementById('empty-state');
    if (!container) return;

    sqlEditorPath = relPath;
    document.getElementById('sql-editor-title').textContent = 'Editor SQL';
    document.getElementById('sql-editor-subtitle').textContent = relPath;

    formContainer?.classList.add('hidden');
    gridContainer?.classList.add('hidden');
    emptyState?.classList.add('hidden');
    container.classList.remove('hidden');

    ensureSqlEditor();
    if (!sqlEditorInstance) return;
    bindSqlEditorShortcuts(apiBaseUrl);

    let content = initialContent;
    if (content === undefined || content === null) {
        const res = await apiFetch(adminSqlUrl(apiBaseUrl, relPath));
        if (res.ok) {
            const data = await res.json();
            content = data.content || '';
        } else {
            content = '';
        }
    }
    sqlEditorInstance.setValue(content);
    sqlEditorBaselineContent = content;
    sqlEditorInstance.setOption('theme', codemirrorTheme());
    refreshSqlEditorLayout({ focus: true });
}

function isSqlEditorOpen() {
    const container = document.getElementById('sql-editor-container');
    return Boolean(container && !container.classList.contains('hidden'));
}

function isSqlEditorDirty() {
    if (!sqlEditorInstance) return false;
    return sqlEditorInstance.getValue() !== (sqlEditorBaselineContent ?? '');
}

function confirmCloseSqlEditorIfNeeded() {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (proceed) => {
            if (settled) return;
            settled = true;
            resolve(proceed);
        };
        if (!isSqlEditorOpen()) {
            finish(true);
            return;
        }
        if (!isSqlEditorDirty()) {
            closeSqlEditor();
            finish(true);
            return;
        }
        openAppModal({
            title: 'Descartar alterações?',
            body: 'O conteúdo foi alterado e ainda não foi salvo. Se sair agora, as alterações serão perdidas. Deseja realmente sair?',
            primaryLabel: 'Sair sem salvar',
            secondaryLabel: 'Continuar editando',
            onPrimary: async () => {
                closeSqlEditor();
                finish(true);
                return true;
            },
            onSecondary: async () => {
                finish(false);
            }
        });
    });
}

function requestCloseSqlEditor() {
    void confirmCloseSqlEditorIfNeeded();
}

async function saveSqlEditorContent(apiBaseUrl) {
    if (!sqlEditorPath || !sqlEditorInstance || !isSqlEditorOpen()) return;
    const content = sqlEditorInstance.getValue();
    const res = await apiFetch(adminSqlUrl(apiBaseUrl, sqlEditorPath), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast('Editor SQL', data.error || 'Falha ao salvar.', 'error');
        return;
    }
    sqlEditorBaselineContent = content;
    showToast('Editor SQL', 'Arquivo salvo.', 'success');
    const savedPath = sqlEditorPath;
    await loadProjects();
    await reloadModuleFormAfterSqlSave(savedPath);
}

function bindSqlEditorShortcuts(apiBaseUrl) {
    ensureSqlEditor();
    if (!sqlEditorInstance) return;
    sqlEditorInstance.setOption('extraKeys', {
        'Ctrl-S'() {
            void saveSqlEditorContent(apiBaseUrl);
        },
        Esc() {
            requestCloseSqlEditor();
        }
    });
}

function moduleTitleForPath(path) {
    const pathNorm = String(path || '').trim();
    if (!pathNorm) return '';
    const titleEl = document.getElementById('form-title');
    if (titleEl && window.sqlformysActiveQueryPath === pathNorm) {
        const title = titleEl.textContent?.trim();
        if (title) return title;
    }
    const parts = pathNorm.split('/');
    return parts[parts.length - 1] || pathNorm;
}

async function reloadModuleFormAfterSqlSave(savedPath) {
    const path = String(savedPath || '').trim();
    if (!path || typeof loadFormFields !== 'function') return;
    sqlEditorPath = null;
    document.getElementById('sql-editor-container')?.classList.add('hidden');
    await loadFormFields(path, moduleTitleForPath(path));
}

function closeSqlEditor() {
    const container = document.getElementById('sql-editor-container');
    container?.classList.add('hidden');
    sqlEditorPath = null;
    sqlEditorBaselineContent = null;
    const path = window.sqlformysActiveQueryPath;
    const formContainer = document.getElementById('form-container');
    const gridContainer = document.getElementById('grid-container');
    const emptyState = document.getElementById('empty-state');
    if (path && formContainer) {
        formContainer.classList.remove('hidden');
        emptyState?.classList.add('hidden');
        return;
    }
    formContainer?.classList.add('hidden');
    gridContainer?.classList.add('hidden');
    if (emptyState) {
        emptyState.classList.remove('hidden');
    }
}

function ensureFormModuleEditButton() {
    const header = document.querySelector('#form-container .form-card-header');
    if (!header) return null;
    let btn = document.getElementById('form-module-edit-btn');
    if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'form-module-edit-btn';
        btn.className = 'tree-icon-btn form-module-edit-btn hidden';
        btn.setAttribute('aria-label', 'Editar SQL');
        btn.setAttribute('data-tooltip', 'Editar SQL');
        header.appendChild(btn);
    }
    return btn;
}

function updateFormModuleEditAction(queryPath, apiBaseUrl) {
    const btn = ensureFormModuleEditButton();
    if (!btn) return;
    if (!isAdminUser() || !queryPath) {
        btn.classList.add('hidden');
        btn.onclick = null;
        return;
    }
    btn.classList.remove('hidden');
    if (!btn.dataset.initialized) {
        btn.dataset.initialized = '1';
        btn.innerHTML = ICON_EDIT;
    }
    btn.onclick = () => openSqlEditor(apiBaseUrl, queryPath);
}

function initAdminPanel(identity, apiBaseUrl) {
    window.sqlformysAuthIdentity = identity || null;
    const activePath = typeof window.sqlformysActiveQueryPath === 'string'
        ? window.sqlformysActiveQueryPath
        : '';
    const formEl = document.getElementById('form-container');
    if (activePath && formEl && !formEl.classList.contains('hidden')) {
        updateFormModuleEditAction(activePath, apiBaseUrl);
    } else if (!isAdminUser()) {
        updateFormModuleEditAction(null, apiBaseUrl);
    }

    if (!identity || !identity.isAdmin) return;

    fetchAdminUsers(apiBaseUrl);

    bindSqlEditorShortcuts(apiBaseUrl);

    const saveBtn = document.getElementById('sql-editor-save');
    const cancelBtn = document.getElementById('sql-editor-cancel');
    if (saveBtn && !saveBtn.dataset.bound) {
        saveBtn.dataset.bound = '1';
        saveBtn.addEventListener('click', () => {
            void saveSqlEditorContent(apiBaseUrl);
        });
    }
    if (cancelBtn && !cancelBtn.dataset.bound) {
        cancelBtn.dataset.bound = '1';
        cancelBtn.addEventListener('click', requestCloseSqlEditor);
    }

    if (typeof window.addEventListener === 'function') {
        window.addEventListener('sqlformys-theme-change', () => {
            if (sqlEditorInstance) {
                sqlEditorInstance.setOption('theme', codemirrorTheme());
            }
        });
    }
}

function attachFolderAdminActions(folderHeader, folderRelPath, folderName, apiBaseUrl) {
    if (!isAdminUser()) return;
    const actions = document.createElement('span');
    actions.className = 'tree-row-actions';
    actions.appendChild(createTreeIconBtn('Renomear pasta', ICON_RENAME, () => {
        openRenameFolderModal(apiBaseUrl, folderRelPath, folderName);
    }));
    actions.appendChild(createTreeIconBtn('Adicionar', ICON_ADD, () => {
        openAddNodeModal(apiBaseUrl, folderRelPath);
    }));
    folderHeader.appendChild(actions);
}

function attachModuleEditAction(moduleLink, path, apiBaseUrl) {
    if (!isAdminUser()) return;
    const actions = document.createElement('span');
    actions.className = 'tree-row-actions';
    actions.appendChild(createTreeIconBtn('Editar SQL', ICON_EDIT, () => {
        openSqlEditor(apiBaseUrl, path);
    }));
    moduleLink.appendChild(actions);
}

window.initAdminPanel = initAdminPanel;
window.appendTreeAdminRootBar = appendTreeAdminRootBar;
window.renderAdminUsersPanel = renderAdminUsersPanel;
window.renderAdminUsersTree = renderAdminUsersTree;
window.attachFolderAdminActions = attachFolderAdminActions;
window.attachModuleEditAction = attachModuleEditAction;
window.updateFormModuleEditAction = updateFormModuleEditAction;
window.isAdminUser = isAdminUser;
window.openSqlEditor = openSqlEditor;
window.fetchAdminUsers = fetchAdminUsers;
window.closeSqlEditor = closeSqlEditor;
window.confirmCloseSqlEditorIfNeeded = confirmCloseSqlEditorIfNeeded;
