const API_BASE_URL = (window.ENV && window.ENV.API_BASE_URL) ? window.ENV.API_BASE_URL : 'http://localhost:8080/api';


// Elementos do DOM
const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('toggle-sidebar');
const sidebarResizer = document.getElementById('sidebar-resizer');
const treeNavigation = document.getElementById('tree-navigation');
const formContainer = document.getElementById('form-container');
const emptyState = document.getElementById('empty-state');
const formTitle = document.getElementById('form-title');
const formSubtitle = document.getElementById('form-subtitle');
const dynamicForm = document.getElementById('dynamic-form');
const btnCancel = document.getElementById('btn-cancel');
const btnClear = document.getElementById('btn-clear');
const btnExecute = document.getElementById('btn-execute');
const searchInput = document.getElementById('search-modules');
const clearSearchBtn = document.getElementById('clear-search');
const toggleSidebarFoldersBtn = document.getElementById('toggle-sidebar-folders');
const favoritesToggleBtn = document.getElementById('sidebar-favorites-toggle');
const favoritesPanelEl = document.getElementById('sidebar-favorites-panel');

// Elementos da Grid
const gridContainer = document.getElementById('grid-container');
const resultThead = document.getElementById('result-thead');
const resultTbody = document.getElementById('result-tbody');
const gridEmptyState = document.getElementById('grid-empty-state');
const resultTable = document.getElementById('result-table');
const btnExportCSV = document.getElementById('btn-export-csv');
const btnExportExcel = document.getElementById('btn-export-excel');
const gridActions = document.querySelector('.grid-actions');
const gridSearchContainer = document.getElementById('grid-search-container');
const gridSearchInput = document.getElementById('search-grid');
const clearGridSearchBtn = document.getElementById('clear-grid-search');
const resultDocument = document.getElementById('result-document');
const resultCardBody = document.querySelector('.result-card-body');

// Estado atual
let currentQueryPath = null;
let currentFields = [];
let allProjects = [];
let currentQueryResult = null;
let gridSortState = { column: null, direction: 'asc' };
let gridColumnTypes = {};
let currentQueryLookups = {};
let currentResultType = 'GRID';
let mermaidLibInitialized = false;

/* ==========================================================================
   Inicialização
   ========================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
    initAppTooltips();

    const versionPromise = loadAppVersion();

    const authResult = await bootstrapAuth(API_BASE_URL);
    await versionPromise;

    if (!authResult.ok) {
        if (authResult.loggedOut) {
            return;
        }
        if (!authResult.unauthorized) {
            showToast('Autenticação', 'Não foi possível verificar a identidade de rede.', 'error');
        }
        return;
    }

    if (typeof refreshNotificationsStorage === 'function') {
        refreshNotificationsStorage();
    }

    if (typeof loadUserSettings === 'function') {
        await loadUserSettings(API_BASE_URL);
        const prefs = typeof getSettingsCache === 'function' ? getSettingsCache() : null;
        if (prefs && prefs.theme && typeof applyTheme === 'function') {
            applyTheme(prefs.theme, { persist: false });
        }
        if (typeof applySavedSidebarWidth === 'function') {
            applySavedSidebarWidth();
        }
    }

    initSidebarFolderControls();
    loadProjects();

    // Event Listeners
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const collapsed = sidebar.classList.contains('collapsed');
        toggleBtn.setAttribute('aria-label', collapsed ? 'Expandir Menu' : 'Recolher Menu');
        toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });

    // Lógica de Redimensionamento da Sidebar
    let isResizing = false;
    let sidebarResizeDidMove = false;
    let sidebarResizeStartX = 0;

    if (sidebarResizer) {
        sidebarResizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isResizing = true;
            sidebarResizeDidMove = false;
            sidebarResizeStartX = e.clientX;
            document.body.classList.add('is-resizing');
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            if (Math.abs(e.clientX - sidebarResizeStartX) > 4) {
                sidebarResizeDidMove = true;
            }
            
            let newWidth = e.clientX;
            if (typeof clampSidebarWidth === 'function') {
                newWidth = clampSidebarWidth(newWidth, { forDrag: true });
            } else {
                const minWidth = 200;
                const maxWidth = Math.min(600, window.innerWidth * 0.5);
                if (newWidth < minWidth) newWidth = minWidth;
                if (newWidth > maxWidth) newWidth = maxWidth;
            }
            if (newWidth == null) return;

            document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.classList.remove('is-resizing');
                if (sidebarResizeDidMove) {
                    const raw = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width');
                    const width = parseInt(raw, 10);
                    if (!Number.isNaN(width) && typeof saveSidebarWidth === 'function') {
                        saveSidebarWidth(width);
                    }
                }
                sidebarResizeDidMove = false;
            }
        });
    }

    btnCancel.addEventListener('click', handleCancel);
    btnClear.addEventListener('click', handleClear);
    btnExecute.addEventListener('click', handleExecute);

    if (btnExportCSV) {
        btnExportCSV.addEventListener('click', exportToCSV);
    }
    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', exportToExcel);
    }

    // Eventos de Filtro de Módulos
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const value = searchInput.value.trim();
            if (value !== '') {
                if (clearSearchBtn) clearSearchBtn.classList.remove('hidden');
                const filtered = filterTree(allProjects, value);
                renderTree(filtered, treeNavigation, true);
            } else {
                if (clearSearchBtn) clearSearchBtn.classList.add('hidden');
                renderTree(allProjects, treeNavigation, false);
            }
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                clearSearch(true);
            }
        });
    }

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            clearSearch(true);
        });
    }

    // Eventos de Filtro da Grid
    if (gridSearchInput) {
        gridSearchInput.addEventListener('input', () => {
            filterGrid();
        });

        gridSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                clearGridSearch(true);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                gridSearchInput.blur();
            }
        });
    }

    if (clearGridSearchBtn) {
        clearGridSearchBtn.addEventListener('click', () => {
            clearGridSearch(true);
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllCustomSelects();
            if (searchInput && searchInput.value !== '') {
                clearSearch(false);
            }
            if (gridSearchInput && gridSearchInput.value !== '') {
                clearGridSearch(false);
            }
        } else if (e.key === 'F2' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
            if (tryOpenFormModuleEditFromShortcut()) {
                e.preventDefault();
            }
        }
    });

    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.custom-select')) {
            closeAllCustomSelects();
        }
    });

    document.addEventListener('scroll', (e) => {
        if (e.target && e.target.closest && e.target.closest('.custom-select-menu')) return;
        closeAllCustomSelects();
    }, true);
    window.addEventListener('resize', () => closeAllCustomSelects());

    function clearSearch(shouldFocus = false) {
        if (searchInput) {
            searchInput.value = '';
            if (shouldFocus) searchInput.focus();
        }
        if (clearSearchBtn) {
            clearSearchBtn.classList.add('hidden');
        }
        renderTree(allProjects, treeNavigation, false);
    }

    function clearGridSearch(shouldFocus = false) {
        if (gridSearchInput) {
            gridSearchInput.value = '';
            if (shouldFocus) gridSearchInput.focus();
        }
        filterGrid();
    }

    dynamicForm.addEventListener('change', handleFormControlChange);

    dynamicForm.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            if (e.ctrlKey) {
                handleCancel();
            } else {
                handleClear();
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            handleExecute();
        }
    });
});

/* ==========================================================================
   Funções de Rede (API)
   ========================================================================== */
async function loadAppVersion() {
    const el = document.getElementById('app-version-info');
    if (!el) return;

    try {
        const response = await apiFetch(`${API_BASE_URL}/version`);
        if (!response.ok) return;

        const data = await response.json();
        const base = data.name || 'SQLFormys';
        const suffix = data.productName ? ` (${data.productName})` : '';
        const ver = data.version ? ` v${data.version}` : '';
        el.textContent = `${base}${suffix}${ver}`;
    } catch (err) {
        console.error(err);
    }
}

async function loadProjects() {
    try {
        if (typeof isAdminUser === 'function' && isAdminUser() && typeof fetchAdminUsers === 'function') {
            await fetchAdminUsers(API_BASE_URL);
        }
        const response = await apiFetch(`${API_BASE_URL}/projects`);
        if (!response.ok) throw new Error('Falha ao carregar estrutura de projetos');
        
        const data = await response.json();
        const projects = Array.isArray(data) ? data : (data.projects || []);
        const productName = (data && !Array.isArray(data)) ? data.productName : "";
        
        allProjects = projects;
        if (typeof renderAdminUsersPanel === 'function') {
            renderAdminUsersPanel(API_BASE_URL);
        }
        renderTree(projects, treeNavigation);
        renderFavorites();

        if (productName) {
            document.title = `SQLFormys (${productName})`;
            const logoText = document.querySelector('.logo span');
            if (logoText) {
                logoText.textContent = `SQLFormys (${productName})`;
            }
        }
    } catch (error) {
        console.error(error);
        treeNavigation.innerHTML = '<div class="loading-state" style="color: var(--error-color);">Erro ao carregar menu.</div>';
        showToast('Erro de Conexão', 'Não foi possível carregar a estrutura de projetos.', 'error');
    }
}

async function loadFormFields(queryPath, moduleTitle) {
    if (typeof confirmCloseSqlEditorIfNeeded === 'function') {
        const canProceed = await confirmCloseSqlEditorIfNeeded();
        if (!canProceed) return;
    } else if (typeof closeSqlEditor === 'function') {
        closeSqlEditor();
    }
    document.getElementById('sql-editor-container')?.classList.add('hidden');
    try {
        const response = await apiFetch(`${API_BASE_URL}/queries/${queryPath}`);
        if (!response.ok) throw new Error('Falha ao carregar campos do formulário');
        
        const data = await response.json();
        const fields = data.fields || [];
        const description = data.description || '';
        const executeMode = data.executeMode || '';
        const server = data.server || '';
        const timeout = data.timeout || 60;
        currentResultType = String(data.resultType || 'GRID').toUpperCase();
        
        currentQueryPath = queryPath;
        window.sqlformysActiveQueryPath = queryPath;
        currentFields = fields;
        currentQueryLookups = data.lookups || {};

        resetResultDocumentView();
        renderForm(queryPath, moduleTitle, fields, description, executeMode, server, timeout, currentResultType);
        
        // Esconder empty state e grid antiga, mostrar form
        emptyState.classList.add('hidden');
        gridContainer.classList.add('hidden');
        formContainer.classList.remove('hidden');

        if (executeMode.toUpperCase() === 'AUTO') {
            handleExecute();
        }

    } catch (error) {
        console.error(error);
        showToast('Erro', 'Falha ao carregar os campos do módulo selecionado.', 'error');
    }
}

async function executeQuery(payload) {
    // Desabilitar botão
    btnExecute.disabled = true;
    const originalText = btnExecute.innerText;
    btnExecute.innerText = 'Executando...';

    currentQueryResult = null;

    // Limpar tempo de execução anterior
    const executionTimeEl = document.getElementById('execution-time');
    if (executionTimeEl) {
        executionTimeEl.innerHTML = '';
        executionTimeEl.classList.add('hidden');
    }

    const startTime = performance.now();

    try {
        const response = await apiFetch(`${API_BASE_URL}/queries/${currentQueryPath}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = errorText;
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.error) {
                    errorMessage = errorJson.error;
                }
            } catch (e) {
                // Se não for JSON, mantém o texto puro
            }
            throw new Error(errorMessage || 'Erro ao processar a requisição');
        }

        const result = await response.json();
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        // Tentar formatar a resposta se for JSON para a notificação
        let msg = result.message || 'Operação realizada com sucesso.';
        showToast('Sucesso', msg, 'success', { context: currentQueryPath || undefined });

        renderQueryResult(result, duration);

    } catch (error) {
        console.error(error);
        const errMsg = error.message || 'Erro ao processar a requisição';
        showToast('Erro de Execução', errMsg, 'error', { context: currentQueryPath || undefined });
    } finally {
        // Habilitar botão novamente
        btnExecute.disabled = false;
        btnExecute.innerText = originalText;
    }
}

/* ==========================================================================
   Renderização do Menu Lateral em Árvore (Tree View)
   ========================================================================== */
function treeCollapsedAbbr(name) {
    const parts = String(name || '').trim().split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    const token = parts[0] || '?';
    return token.slice(0, 2).toUpperCase();
}

function treeBadgeHue(name) {
    let hash = 0;
    const s = String(name || '');
    for (let i = 0; i < s.length; i++) {
        hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    }
    return hash % 360;
}

function treeSqlModuleIconMarkup(inlineStyle = '') {
    const styleAttr = inlineStyle ? ` style="${inlineStyle}"` : '';
    return `<svg class="tree-icon module-icon sql-module-icon"${styleAttr} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
        <path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
        <path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6"></path>
    </svg>`;
}

function renderTree(nodes, container, isSearching = false) {
    container.innerHTML = ''; // Limpar loading state

    if (typeof isAdminUser === 'function' && isAdminUser()) {
        const projectsHead = document.createElement('div');
        projectsHead.className = 'tree-projects-section';
        projectsHead.innerHTML = '<span class="tree-projects-section-title">Projetos</span>';
        container.appendChild(projectsHead);
        if (typeof appendTreeAdminRootBar === 'function') {
            appendTreeAdminRootBar(container, API_BASE_URL);
        }
    }

    if (!nodes || nodes.length === 0) {
        if (container.children.length === 0) {
            container.innerHTML = '<div class="loading-state">Nenhum projeto encontrado.</div>';
        }
        return;
    }

    const treeContainer = document.createElement('div');
    treeContainer.className = 'tree-root';

    // Função auxiliar recursiva
    function buildSubTree(nodeList, parentElement, level = 0, parentRelPath = '') {
        nodeList.forEach(node => {
            const itemContainer = document.createElement('div');
            itemContainer.className = 'tree-node-container';

            if (node.type === 'folder') {
                const folderHeader = document.createElement('button');
                folderHeader.className = 'tree-folder-header';
                folderHeader.type = 'button';
                folderHeader.style.paddingLeft = `${16 + (level * 16)}px`;
                folderHeader.setAttribute('data-tooltip', node.name);
                if (level === 0) {
                    folderHeader.dataset.treeDepth = '0';
                    folderHeader.style.setProperty('--tree-badge-hue', String(treeBadgeHue(node.name)));
                }
                const badge = level === 0
                    ? `<span class="tree-collapsed-badge" aria-hidden="true">${treeCollapsedAbbr(node.name)}</span>`
                    : '';
                folderHeader.innerHTML = `
                    <svg class="tree-icon folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    ${badge}
                    <span class="tree-title">${node.name}</span>
                    <svg class="tree-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                `;

                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'tree-folder-content';

                const folderRel = parentRelPath ? `${parentRelPath}/${node.name}` : node.name;
                const folderId = `tree:${folderRel}`;
                childrenContainer.dataset.sidebarFolderId = folderId;

                if (typeof attachFolderAdminActions === 'function') {
                    attachFolderAdminActions(folderHeader, folderRel, node.name, API_BASE_URL);
                }

                if (node.children && node.children.length > 0) {
                    buildSubTree(node.children, childrenContainer, level + 1, folderRel);
                }

                const shouldOpen = isSearching
                    || (typeof isSidebarFolderExpanded === 'function' && isSidebarFolderExpanded(folderId));
                if (shouldOpen) {
                    childrenContainer.classList.add('open');
                    folderHeader.classList.add('active');
                }

                folderHeader.addEventListener('click', () => {
                    if (sidebar.classList.contains('collapsed')) {
                        sidebar.classList.remove('collapsed');
                        toggleBtn.setAttribute('aria-label', 'Recolher Menu');
                        toggleBtn.setAttribute('aria-expanded', 'true');
                        childrenContainer.classList.add('open');
                        folderHeader.classList.add('active');
                        if (typeof setSidebarFolderExpanded === 'function') {
                            setSidebarFolderExpanded(folderId, true);
                        }
                        return;
                    }
                    const isOpen = childrenContainer.classList.contains('open');
                    const willOpen = !isOpen;
                    childrenContainer.classList.toggle('open', willOpen);
                    folderHeader.classList.toggle('active', willOpen);
                    if (typeof setSidebarFolderExpanded === 'function') {
                        setSidebarFolderExpanded(folderId, willOpen);
                    }
                });

                itemContainer.appendChild(folderHeader);
                itemContainer.appendChild(childrenContainer);
            } else {
                // node.type === 'module'
                const moduleLink = document.createElement('a');
                moduleLink.className = 'tree-module-link module-link';
                moduleLink.dataset.path = node.path;
                moduleLink.style.paddingLeft = `${16 + (level * 16)}px`;
                moduleLink.setAttribute('data-tooltip', node.name);
                
                const isFav = getFavorites().includes(node.path);
                const isActive = (node.path === currentQueryPath);
                if (isActive) {
                    moduleLink.classList.add('active');
                }
                
                moduleLink.innerHTML = `
                    <div class="tree-module-info">
                        ${treeSqlModuleIconMarkup()}
                        <span class="tree-title">${node.name}</span>
                    </div>
                    <button class="favorite-btn ${isFav ? 'is-favorite' : ''}" data-tooltip="${isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                    </button>
                `;

                if (typeof attachModuleEditAction === 'function') {
                    attachModuleEditAction(moduleLink, node.path, API_BASE_URL);
                }

                moduleLink.addEventListener('click', (e) => {
                    if (e.target.closest('.favorite-btn') || e.target.closest('.tree-icon-btn')) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.target.closest('.favorite-btn')) {
                            toggleFavorite(node.path);
                        }
                        return;
                    }
                    e.preventDefault();
                    setActiveModule(node.path);
                    loadFormFields(node.path, node.name);
                });

                itemContainer.appendChild(moduleLink);
            }

            parentElement.appendChild(itemContainer);
        });
    }

    buildSubTree(nodes, treeContainer, 0, '');
    container.appendChild(treeContainer);

    if (typeof applySidebarExpandedToDOM === 'function') {
        applySidebarExpandedToDOM();
    }
}

/* ==========================================================================
   Dropdown customizado (substitui o popup nativo do <select> no Edge)
   ========================================================================== */
function closeCustomSelect(wrapper) {
    if (!wrapper) return;
    wrapper.classList.remove('open');
    const trigger = wrapper.querySelector('.custom-select-trigger');
    const menu = wrapper.querySelector('.custom-select-menu');
    const searchInput = wrapper.querySelector('.custom-select-search-input');
    if (searchInput) {
        searchInput.value = '';
    }
    wrapper.querySelectorAll('.custom-select-list [role="option"]').forEach(li => {
        li.classList.remove('is-filtered-out');
    });
    const emptyMsg = wrapper.querySelector('.custom-select-empty');
    if (emptyMsg) {
        emptyMsg.classList.add('hidden');
    }
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (menu) {
        menu.hidden = true;
        menu.style.position = '';
        menu.style.top = '';
        menu.style.left = '';
        menu.style.width = '';
        menu.style.bottom = '';
        menu.style.maxHeight = '';
        menu.style.zIndex = '';
    }
}

function closeAllCustomSelects(exceptWrapper = null) {
    document.querySelectorAll('.custom-select.open').forEach(wrapper => {
        if (wrapper !== exceptWrapper) {
            closeCustomSelect(wrapper);
        }
    });
}

function positionCustomSelectMenu(wrapper) {
    const trigger = wrapper.querySelector('.custom-select-trigger');
    const menu = wrapper.querySelector('.custom-select-menu');
    if (!trigger || !menu) return;

    const rect = trigger.getBoundingClientRect();
    const maxHeight = wrapper.classList.contains('is-multiple') ? 360 : 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < Math.min(maxHeight, menu.scrollHeight + 8) && spaceAbove > spaceBelow;

    menu.style.position = 'fixed';
    menu.style.left = `${Math.max(8, rect.left)}px`;
    menu.style.width = `${rect.width}px`;
    menu.style.maxHeight = `${maxHeight}px`;
    menu.style.zIndex = '80';

    if (openUp) {
        menu.style.top = 'auto';
        menu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    } else {
        menu.style.bottom = 'auto';
        menu.style.top = `${rect.bottom + 4}px`;
    }
}

function parseLookupName(type) {
    if (!type) return null;
    const match = String(type).match(/^(?:LOOKUP_MULTI|MULTILOOKUP|LOOKUP)\(([^)]+)\)/i);
    return match ? match[1].trim() : null;
}

function isLookupMultiType(type) {
    return /^(LOOKUP_MULTI|MULTILOOKUP)\(/i.test(type || '');
}

const CONTEXT_VALUE_RESOLVERS = {
    USER_NAME: () => {
        const identity = typeof getAuthIdentity === 'function' ? getAuthIdentity() : null;
        return identity?.username || '';
    },
    USER_TYPE: () => {
        const identity = typeof getAuthIdentity === 'function' ? getAuthIdentity() : null;
        return identity?.isAdmin ? 'Administrator' : 'Standard';
    }
};

function isContextField(field) {
    if (!field) return false;
    if (field.hidden) return true;
    return /^CONTEXT\(/i.test(field.type || '');
}

function resolveContextFieldValue(contextKey) {
    const key = String(contextKey || '').trim().toUpperCase();
    const resolver = CONTEXT_VALUE_RESOLVERS[key];
    return resolver ? resolver() : '';
}

function formatDateFieldValue(field, value) {
    if (!value || !field) return value;
    const typeUpper = String(field.type || '').toUpperCase();
    if (typeUpper !== 'DATE' && typeUpper !== 'DATETIME' && typeUpper !== 'TIMESTAMP') {
        return value;
    }
    if (/^\d{8}$/.test(value)) {
        return value;
    }
    if (field.size && field.size !== 8) {
        return value;
    }
    const isoMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        return `${isoMatch[1]}${isoMatch[2]}${isoMatch[3]}`;
    }
    return value;
}

function collectFormValues(includeEmpty = false) {
    const payload = {};
    const fieldByName = Object.fromEntries(currentFields.map(f => [f.field, f]));
    const inputs = dynamicForm.querySelectorAll('.form-control, .form-radio');

    inputs.forEach(input => {
        if (input.type === 'radio') {
            if (input.checked) {
                payload[input.name] = input.value;
            }
            return;
        }
        if (input.tagName === 'SELECT' && input.multiple) {
            const selectedValues = Array.from(input.selectedOptions).map(opt => opt.value);
            if (selectedValues.length > 0 || input.required || includeEmpty) {
                payload[input.name] = selectedValues.join(',');
            }
            return;
        }
        if (input.tagName === 'SELECT') {
            const resolvedValue = resolveSelectOptionValue(input, input.value) || input.value;
            if (resolvedValue !== '' || input.required || includeEmpty) {
                payload[input.name] = resolvedValue;
            }
            return;
        }
        if (input.value !== '' || input.required || includeEmpty) {
            const meta = fieldByName[input.name];
            payload[input.name] = (input.type === 'date' && meta)
                ? formatDateFieldValue(meta, input.value)
                : input.value;
        }
    });

    currentFields.forEach(field => {
        if (!isContextField(field)) return;
        const val = resolveContextFieldValue(field.contextKey);
        if (val !== '' || field.required || includeEmpty) {
            payload[field.field] = val;
        }
    });

    return payload;
}

function optionText(option) {
    if (option.value === undefined || option.value === null) return '';
    return String(option.value);
}

function optionCode(option) {
    if (option.code === undefined || option.code === null) return '';
    return String(option.code);
}

function parseStaticSelectOptions(fieldType) {
    const typeUpper = String(fieldType || '').toUpperCase();
    if (!typeUpper.startsWith('SINGLE')
        && !typeUpper.startsWith('MULTI')
        && !typeUpper.startsWith('MULTIPLE')) {
        return [];
    }
    const match = String(fieldType || '').match(/\(([^)]+)\)/);
    if (!match) return [];
    return match[1].split(/[,;|]/).map(opt => {
        const parts = opt.split('=');
        if (parts.length >= 2) {
            return {
                code: parts[0].trim(),
                label: parts.slice(1).join('=').trim()
            };
        }
        const text = opt.trim();
        return { code: text, label: text };
    });
}

function resolveStaticSelectDefault(field, defaultValue) {
    const raw = String(defaultValue ?? '').trim();
    if (!raw || !field) return raw;
    const options = parseStaticSelectOptions(field.type);
    for (const item of options) {
        if (item.code === raw || item.label === raw) {
            return item.code;
        }
    }
    return raw;
}

function resolveStaticSelectDefaults(field) {
    if (!field || !field.defaultValue) return [];
    return field.defaultValue
        .split(/[,;|]/)
        .map(part => resolveStaticSelectDefault(field, part.trim()))
        .filter(Boolean);
}

function resolveSelectOptionValue(select, desired) {
    const target = String(desired ?? '').trim();
    if (!target || !select) return '';
    const options = Array.from(select.options).filter(option => option.value !== '');
    if (options.some(option => option.value === target)) {
        return target;
    }
    const byLabel = options.find(option => String(option.text || '').trim() === target);
    return byLabel ? byLabel.value : '';
}

function applySelectDefaultValues(select, field) {
    if (!select || !field || !field.defaultValue) return;
    const typeUpper = String(field.type || '').toUpperCase();
    const defaults = (select.multiple || isLookupMultiType(field.type) || typeUpper.startsWith('MULTI') || typeUpper.startsWith('MULTIPLE'))
        ? resolveStaticSelectDefaults(field)
        : [resolveStaticSelectDefault(field, field.defaultValue)];

    if (select.multiple) {
        Array.from(select.options).forEach(option => {
            option.selected = defaults.includes(option.value);
        });
        return;
    }

    const resolved = defaults.map(code => resolveSelectOptionValue(select, code)).find(Boolean);
    if (resolved) {
        select.value = resolved;
    }
}

function isFormFieldFilled(fieldName) {
    const radios = dynamicForm.querySelectorAll(`input[type="radio"][name="${fieldName}"]`);
    if (radios.length > 0) {
        return Array.from(radios).some(radio => radio.checked);
    }

    const control = document.getElementById(`field_${fieldName}`) ||
        dynamicForm.querySelector(`select[name="${fieldName}"]`) ||
        dynamicForm.querySelector(`input[name="${fieldName}"]`) ||
        dynamicForm.querySelector(`textarea[name="${fieldName}"]`);

    if (!control) {
        const values = collectFormValues(true);
        const val = values[fieldName];
        return val !== undefined && String(val).trim() !== '';
    }

    if (control.tagName === 'SELECT' && control.multiple) {
        return Array.from(control.selectedOptions).some(option => option.value !== '');
    }

    return String(control.value || '').trim() !== '';
}

function focusFormField(fieldName) {
    const trigger = document.getElementById(`field_${fieldName}_trigger`);
    if (trigger) {
        trigger.focus();
        return;
    }

    const control = document.getElementById(`field_${fieldName}`) ||
        dynamicForm.querySelector(`[name="${fieldName}"]`);
    if (!control) return;

    if (control.classList.contains('custom-select-native')) {
        const wrapper = control.closest('.custom-select');
        const customTrigger = wrapper ? wrapper.querySelector('.custom-select-trigger') : null;
        if (customTrigger) {
            customTrigger.focus();
            return;
        }
    }

    control.focus();
    if (typeof control.reportValidity === 'function') {
        control.reportValidity();
    }
}

function validateLookupPrerequisites(select) {
    const lookupName = select.dataset.lookupName;
    if (!lookupName) return true;

    const lookupMeta = currentQueryLookups[lookupName];
    if (!lookupMeta || !Array.isArray(lookupMeta.dependsOn)) return true;

    const missing = [];
    lookupMeta.dependsOn.forEach(depField => {
        if (depField === select.name) return;
        const meta = currentFields.find(field => field.field === depField);
        if (!meta || !meta.required) return;
        if (!isFormFieldFilled(depField)) {
            missing.push({ field: depField, label: meta.label || depField });
        }
    });

    if (missing.length === 0) return true;

    showToast(
        'Lookup',
        `Preencha os campos obrigatórios antes: ${missing.map(item => item.label).join(', ')}`,
        'error'
    );
    focusFormField(missing[0].field);
    return false;
}

function fieldNamesEqual(a, b) {
    return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}

function getLookupDependsOn(field, lookupName) {
    if (field && Array.isArray(field.dependsOn) && field.dependsOn.length > 0) {
        return field.dependsOn;
    }
    const meta = lookupName ? currentQueryLookups[lookupName] : null;
    if (meta && Array.isArray(meta.dependsOn)) {
        return meta.dependsOn;
    }
    return [];
}

function getDependentLookupSelects(parentFieldName) {
    const dependents = [];
    if (!currentFields || !parentFieldName) return dependents;

    currentFields.forEach(field => {
        const lookupName = parseLookupName(field.type);
        if (!lookupName) return;

        const deps = getLookupDependsOn(field, lookupName);
        if (!deps.some(dep => fieldNamesEqual(dep, parentFieldName))) return;

        const select = dynamicForm.querySelector(`select[name="${field.field}"]`);
        if (!select || !select.dataset.lookupName) return;

        dependents.push({ field, select });
    });

    return dependents;
}

function getControlValue(control) {
    if (!control) return '';
    if (control.type === 'radio') {
        const checked = dynamicForm.querySelector(`input[type="radio"][name="${control.name}"]:checked`);
        return checked ? checked.value : '';
    }
    if (control.tagName === 'SELECT' && control.multiple) {
        return Array.from(control.selectedOptions).map(opt => opt.value).sort().join(',');
    }
    return String(control.value ?? '');
}

function getSelectValueSignature(select) {
    if (!select) return '';
    if (select.multiple) {
        return Array.from(select.selectedOptions).map(opt => opt.value).sort().join(',');
    }
    return String(select.value ?? '');
}

function resetLookupSelect(select) {
    if (!select) return;

    const field = currentFields.find(item => item.field === select.name);
    const isSingle = !select.multiple;
    const keepEmpty = isSingle && field && !field.required;

    select.innerHTML = '';
    if (keepEmpty) {
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.text = '';
        select.appendChild(emptyOption);
    }

    if (select.multiple) {
        Array.from(select.options).forEach(option => {
            option.selected = false;
        });
    } else {
        select.value = keepEmpty ? '' : '';
    }

    delete select.dataset.lookupLoaded;
    delete select.dataset.lookupLoading;

    const value = getControlValue(select);
    dynamicForm.querySelectorAll(`[name="${select.name}"]`).forEach(el => {
        el.dataset.prevValue = value;
    });

    select.dispatchEvent(new Event('options-updated', { bubbles: true }));
}

function clearDependentLookups(changedFieldName, visited = new Set()) {
    const key = String(changedFieldName || '');
    if (!key || visited.has(key)) return;
    visited.add(key);

    getDependentLookupSelects(changedFieldName).forEach(({ field, select }) => {
        if (visited.has(field.field)) return;
        resetLookupSelect(select);
        clearDependentLookups(field.field, visited);
    });
}

function snapshotFormControlValues() {
    if (!dynamicForm) return;

    const seen = new Set();
    dynamicForm.querySelectorAll('.form-control, .form-radio').forEach(control => {
        const name = control.name;
        if (!name || seen.has(name)) return;
        seen.add(name);
        const value = getControlValue(control);
        dynamicForm.querySelectorAll(`[name="${name}"]`).forEach(el => {
            el.dataset.prevValue = value;
        });
    });
}

function handleFormControlChange(event) {
    const control = event.target;
    if (!control || !dynamicForm.contains(control)) return;
    if (!control.classList.contains('form-control') && !control.classList.contains('form-radio')) return;

    const name = control.name;
    if (!name) return;

    const current = getControlValue(control);
    const prev = control.dataset.prevValue;
    dynamicForm.querySelectorAll(`[name="${name}"]`).forEach(el => {
        el.dataset.prevValue = current;
    });

    if (prev === undefined || prev === current) return;

    clearDependentLookups(name);
}

async function loadLookupOptions(select) {
    const lookupName = select.dataset.lookupName;
    if (!lookupName || !currentQueryPath || select.dataset.lookupLoading === 'true') return;
    if (!validateLookupPrerequisites(select)) return;

    const valueBefore = getSelectValueSignature(select);

    const previousValues = select.multiple
        ? Array.from(select.selectedOptions).map(opt => opt.value)
        : [select.value];

    select.dataset.lookupLoading = 'true';
    try {
        const response = await apiFetch(`${API_BASE_URL}/lookups/${currentQueryPath}?name=${encodeURIComponent(lookupName)}&field=${encodeURIComponent(select.name)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(collectFormValues(true))
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = errorText;
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.error) {
                    errorMessage = errorJson.error;
                }
            } catch (e) {
                // keep raw text
            }
            throw new Error(errorMessage || 'Falha ao carregar opções do lookup');
        }

        const result = await response.json();
        const options = Array.isArray(result.options) ? result.options : [];
        const keepEmpty = !select.multiple && !select.required;

        select.innerHTML = '';
        if (keepEmpty) {
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.text = '';
            select.appendChild(emptyOption);
        }

        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = optionCode(opt);
            option.text = optionText(opt) || option.value;
            select.appendChild(option);
        });

        if (select.multiple) {
            const resolvedPrevious = previousValues.map(val => resolveSelectOptionValue(select, val));
            Array.from(select.options).forEach(option => {
                option.selected = resolvedPrevious.includes(option.value);
            });
        } else {
            const field = currentFields.find(item => item.field === select.name);
            let resolved = previousValues[0]
                ? resolveSelectOptionValue(select, previousValues[0])
                : '';
            if (!resolved && field?.defaultValue) {
                resolved = resolveSelectOptionValue(select, field.defaultValue)
                    || resolveSelectOptionValue(select, resolveStaticSelectDefault(field, field.defaultValue));
            }
            if (resolved) {
                select.value = resolved;
            } else if (keepEmpty) {
                select.value = '';
            }
        }

        const valueAfter = getSelectValueSignature(select);
        select.dataset.lookupLoaded = 'true';

        select.dispatchEvent(new Event('options-updated', { bubbles: true }));
        if (valueBefore !== valueAfter) {
            dynamicForm.querySelectorAll(`[name="${select.name}"]`).forEach(el => {
                el.dataset.prevValue = valueAfter;
            });
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
    } catch (error) {
        console.error(error);
        showToast('Erro', error.message || 'Não foi possível carregar as opções do lookup.', 'error');
    } finally {
        delete select.dataset.lookupLoading;
    }
}

async function preloadLookupSelectLabels() {
    if (!currentFields || currentFields.length === 0) return;

    for (const field of currentFields) {
        const lookupName = parseLookupName(field.type);
        if (!lookupName) continue;

        const select = dynamicForm.querySelector(`select[name="${field.field}"]`);
        if (!select || select.dataset.lookupName !== lookupName) continue;

        const hasValue = select.multiple
            ? Array.from(select.selectedOptions).some(option => option.value !== '')
            : String(select.value || '').trim() !== '';
        if (!hasValue && !field.defaultValue) continue;
        if (!validateLookupPrerequisites(select)) continue;

        await loadLookupOptions(select);
    }

    snapshotFormControlValues();
}

function enhanceCustomSelect(select) {
    if (!select || select.dataset.customSelect === 'true') return;

    const isMultiple = Boolean(select.multiple);
    select.dataset.customSelect = 'true';

    const wrapper = document.createElement('div');
    wrapper.className = `custom-select${isMultiple ? ' is-multiple' : ''}`;
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    select.classList.add('custom-select-native');
    select.setAttribute('tabindex', '-1');
    select.setAttribute('aria-hidden', 'true');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';
    trigger.id = `${select.id}_trigger`;
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const valueSpan = document.createElement('span');
    valueSpan.className = 'custom-select-value';

    const chevron = document.createElement('span');
    chevron.className = 'custom-select-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    `;

    trigger.appendChild(valueSpan);
    trigger.appendChild(chevron);

    const menu = document.createElement('div');
    menu.className = 'custom-select-menu';
    menu.id = `${select.id}_menu`;
    menu.hidden = true;
    trigger.setAttribute('aria-controls', menu.id);

    if (isMultiple) {
        const actions = document.createElement('div');
        actions.className = 'custom-select-actions';

        const btnAll = document.createElement('button');
        btnAll.type = 'button';
        btnAll.className = 'custom-select-action';
        btnAll.textContent = 'Selecionar todos';
        btnAll.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            Array.from(select.options).forEach(option => {
                option.selected = true;
            });
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const btnNone = document.createElement('button');
        btnNone.type = 'button';
        btnNone.className = 'custom-select-action';
        btnNone.textContent = 'Limpar';
        btnNone.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            Array.from(select.options).forEach(option => {
                option.selected = false;
            });
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });

        actions.appendChild(btnAll);
        actions.appendChild(btnNone);
        menu.appendChild(actions);
    }

    const hasSearch = Boolean(select.dataset.lookupName);
    let searchInput = null;
    let emptySearchMessage = null;

    if (hasSearch) {
        wrapper.classList.add('has-search');
        const searchWrap = document.createElement('div');
        searchWrap.className = 'custom-select-search';

        searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.className = 'custom-select-search-input form-control';
        searchInput.placeholder = 'Buscar...';
        searchInput.autocomplete = 'off';
        searchInput.setAttribute('aria-label', 'Buscar opções');
        searchInput.addEventListener('click', (e) => e.stopPropagation());
        searchInput.addEventListener('keydown', (e) => e.stopPropagation());

        searchWrap.appendChild(searchInput);
        menu.appendChild(searchWrap);

        emptySearchMessage = document.createElement('div');
        emptySearchMessage.className = 'custom-select-empty hidden';
        emptySearchMessage.textContent = 'Nenhum resultado encontrado';
    }

    const list = document.createElement('ul');
    list.className = 'custom-select-list';
    list.setAttribute('role', 'listbox');
    if (isMultiple) {
        list.setAttribute('aria-multiselectable', 'true');
    }

    function emitChange() {
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function toggleOption(option) {
        if (isMultiple) {
            option.selected = !option.selected;
        } else {
            select.value = option.value;
        }
        emitChange();
        if (!isMultiple) {
            closeCustomSelect(wrapper);
            trigger.focus();
        }
    }

    function getVisibleListItems() {
        return Array.from(list.querySelectorAll('[role="option"]')).filter(li => !li.classList.contains('is-filtered-out'));
    }

    function applySearchFilter() {
        if (!searchInput) return;
        const query = searchInput.value.trim().toLowerCase();
        let visibleCount = 0;

        Array.from(list.querySelectorAll('[role="option"]')).forEach(li => {
            const haystack = li.dataset.searchText || '';
            const match = query === '' || haystack.includes(query);
            li.classList.toggle('is-filtered-out', !match);
            if (match) visibleCount += 1;
        });

        if (emptySearchMessage) {
            emptySearchMessage.classList.toggle('hidden', visibleCount > 0 || query === '');
        }
    }

    function rebuildList() {
        list.innerHTML = '';
        Array.from(select.options).forEach(option => {
            const li = document.createElement('li');
            li.setAttribute('role', 'option');
            li.dataset.value = option.value;
            li.dataset.searchText = `${option.value} ${option.text || option.value}`.toLowerCase();
            li.tabIndex = -1;
            if (!option.value) {
                li.classList.add('empty-option');
            }

            if (isMultiple) {
                const box = document.createElement('span');
                box.className = 'custom-select-check';
                box.setAttribute('aria-hidden', 'true');
                const label = document.createElement('span');
                label.className = 'custom-select-option-label';
                label.textContent = option.text || option.value;
                li.appendChild(box);
                li.appendChild(label);
            } else {
                li.textContent = option.text ? option.text : '—';
            }

            li.addEventListener('click', (e) => {
                e.preventDefault();
                toggleOption(option);
            });
            list.appendChild(li);
        });
        applySearchFilter();
        syncFromSelect();
    }

    menu.appendChild(list);
    if (emptySearchMessage) {
        menu.appendChild(emptySearchMessage);
    }

    if (searchInput) {
        searchInput.addEventListener('input', applySearchFilter);
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const first = getVisibleListItems()[0];
                if (first) first.focus();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeCustomSelect(wrapper);
                trigger.focus();
            }
        });
    }

    function getSelectedOptions() {
        return Array.from(select.options).filter(option => option.selected && option.value !== '');
    }

    function syncFromSelect() {
        const items = Array.from(list.querySelectorAll('[role="option"]'));
        const selectedOptions = getSelectedOptions();

        if (isMultiple) {
            if (selectedOptions.length === 0) {
                valueSpan.textContent = 'Selecione...';
                valueSpan.classList.add('placeholder');
            } else {
                valueSpan.textContent = selectedOptions.map(option => option.text || option.value).join(', ');
                valueSpan.classList.remove('placeholder');
            }
            items.forEach(li => {
                const option = Array.from(select.options).find(opt => opt.value === li.dataset.value);
                const isSelected = Boolean(option && option.selected);
                li.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                li.classList.toggle('selected', isSelected);
            });
        } else {
            const selected = select.options[select.selectedIndex];
            const hasValue = selected && selected.value !== '';
            if (hasValue) {
                valueSpan.textContent = selected.text;
            } else if (selected && selected.text) {
                valueSpan.textContent = selected.text;
            } else {
                valueSpan.textContent = 'Selecione...';
            }
            valueSpan.classList.toggle('placeholder', !hasValue);
            items.forEach(li => {
                const isSelected = li.dataset.value === select.value;
                li.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                li.classList.toggle('selected', isSelected);
            });
        }
        trigger.classList.remove('invalid');
    }

    select.addEventListener('change', syncFromSelect);
    select.addEventListener('invalid', () => {
        trigger.classList.add('invalid');
        trigger.focus();
    });

    async function openMenu() {
        if (select.dataset.lookupName) {
            if (!validateLookupPrerequisites(select)) {
                return;
            }
            valueSpan.textContent = 'Carregando...';
            valueSpan.classList.add('placeholder');
            await loadLookupOptions(select);
        }
        closeAllCustomSelects(wrapper);
        wrapper.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        menu.hidden = false;
        positionCustomSelectMenu(wrapper);
        if (searchInput) {
            searchInput.value = '';
            applySearchFilter();
            searchInput.focus();
        } else {
            const selected = list.querySelector('[aria-selected="true"]') || list.querySelector('[role="option"]');
            if (selected) selected.focus();
        }
    }

    trigger.addEventListener('click', async (e) => {
        e.preventDefault();
        if (wrapper.classList.contains('open')) {
            closeCustomSelect(wrapper);
        } else {
            await openMenu();
        }
    });

    trigger.addEventListener('keydown', async (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!wrapper.classList.contains('open')) {
                await openMenu();
            }
        }
    });

    menu.addEventListener('keydown', (e) => {
        const items = getVisibleListItems();
        const current = document.activeElement;
        const idx = items.indexOf(current);
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            (items[Math.min(idx + 1, items.length - 1)] || items[0]).focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            (items[Math.max(idx - 1, 0)] || items[0]).focus();
        } else if (e.key === 'Home') {
            e.preventDefault();
            items[0]?.focus();
        } else if (e.key === 'End') {
            e.preventDefault();
            items[items.length - 1]?.focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (current && current.getAttribute('role') === 'option') {
                current.click();
            }
        } else if (e.key === 'Escape' || e.key === 'Tab') {
            closeCustomSelect(wrapper);
            if (e.key !== 'Tab') {
                e.preventDefault();
                trigger.focus();
            }
        }
    });

    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);
    select.addEventListener('options-updated', rebuildList);
    rebuildList();
}

const FORM_MODULE_EDIT_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';

function adminCanEditSql() {
    if (typeof window.isAdminUser === 'function' && window.isAdminUser()) {
        return true;
    }
    const identity = typeof getAuthIdentity === 'function' ? getAuthIdentity() : null;
    return Boolean(identity && identity.isAdmin);
}

function activeFormModuleQueryPath() {
    const path = currentQueryPath || window.sqlformysActiveQueryPath;
    return typeof path === 'string' ? path.trim() : '';
}

function isFormModuleEditContextOpen() {
    if (!formContainer || formContainer.classList.contains('hidden')) {
        return false;
    }
    const sqlEditor = document.getElementById('sql-editor-container');
    if (sqlEditor && !sqlEditor.classList.contains('hidden')) {
        return false;
    }
    return Boolean(activeFormModuleQueryPath());
}

function openFormModuleSqlEditor() {
    const queryPath = activeFormModuleQueryPath();
    if (!queryPath || !adminCanEditSql()) {
        return false;
    }
    if (typeof window.openSqlEditor === 'function') {
        void window.openSqlEditor(API_BASE_URL, queryPath);
        return true;
    }
    showToast('Editor SQL', 'Painel administrativo indisponível.', 'error');
    return false;
}

function tryOpenFormModuleEditFromShortcut() {
    if (!isFormModuleEditContextOpen() || !adminCanEditSql()) {
        return false;
    }
    return openFormModuleSqlEditor();
}

function syncFormModuleEditButton(queryPath) {
    const formCard = document.getElementById('form-container');
    const header = formCard?.querySelector('.form-card-header');
    if (!header) return;

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

    const show = adminCanEditSql() && queryPath;
    btn.classList.toggle('hidden', !show);
    btn.setAttribute('aria-hidden', show ? 'false' : 'true');

    if (!show) {
        btn.onclick = null;
        return;
    }

    if (!btn.dataset.boundEdit) {
        btn.dataset.boundEdit = '1';
        btn.innerHTML = FORM_MODULE_EDIT_ICON;
    }

    btn.onclick = (e) => {
        e.preventDefault();
        openFormModuleSqlEditor();
    };
}

/* ==========================================================================
   Renderização do Formulário Dinâmico
   ========================================================================== */
function renderForm(queryPath, moduleTitle, fields, description = '', executeMode = '', server = '', timeout = 60, resultType = 'GRID') {
    // Atualizar títulos
    formTitle.innerText = moduleTitle;
    formSubtitle.innerText = queryPath.replace(/\//g, ' > ');

    // Atualizar descrição
    const descEl = document.getElementById('form-description');
    if (descEl) {
        if (description) {
            descEl.innerText = description;
            descEl.classList.remove('hidden');
        } else {
            descEl.classList.add('hidden');
        }
    }

    // Atualizar metadados (Server, ExecuteMode)
    const metaContainer = document.getElementById('form-meta-container');
    if (metaContainer) {
        metaContainer.innerHTML = '';
        let hasMeta = false;

        if (server) {
            const serverBadge = document.createElement('span');
            serverBadge.className = 'meta-badge server';
            serverBadge.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;">
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                    <line x1="6" y1="6" x2="6.01" y2="6"></line>
                    <line x1="6" y1="18" x2="6.01" y2="18"></line>
                </svg>
                <span style="vertical-align: middle;">Servidor: ${server}</span>
            `;
            metaContainer.appendChild(serverBadge);
            hasMeta = true;
        }

        if (executeMode) {
            const modeBadge = document.createElement('span');
            modeBadge.className = 'meta-badge execute-mode';
            modeBadge.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                <span style="vertical-align: middle;">Execução: ${executeMode}</span>
            `;
            metaContainer.appendChild(modeBadge);
            hasMeta = true;
        }

        if (timeout) {
            const timeoutBadge = document.createElement('span');
            timeoutBadge.className = 'meta-badge timeout';
            timeoutBadge.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span style="vertical-align: middle;">Timeout: ${timeout}s</span>
            `;
            metaContainer.appendChild(timeoutBadge);
            hasMeta = true;
        }

        const normalizedResultType = String(resultType || 'GRID').toUpperCase();
        if (normalizedResultType && normalizedResultType !== 'GRID') {
            const resultBadge = document.createElement('span');
            resultBadge.className = 'meta-badge result-type';
            resultBadge.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="3" y1="9" x2="21" y2="9"></line>
                </svg>
                <span style="vertical-align: middle;">Resultado: ${normalizedResultType}</span>
            `;
            metaContainer.appendChild(resultBadge);
            hasMeta = true;
        }

        if (hasMeta) {
            metaContainer.classList.remove('hidden');
        } else {
            metaContainer.classList.add('hidden');
        }
    }

    syncFormModuleEditButton(queryPath);
    if (typeof window.updateFormModuleEditAction === 'function') {
        window.updateFormModuleEditAction(queryPath, API_BASE_URL);
    }

    // Limpar form
    dynamicForm.innerHTML = '';

    btnExecute.disabled = false;

    const visibleFields = (fields || []).filter(field => !isContextField(field));
    if (!fields || fields.length === 0) {
        dynamicForm.innerHTML = '<p class="form-text">Nenhum campo retornado pela API para este módulo.</p>';
        return;
    }
    if (visibleFields.length === 0) {
        dynamicForm.innerHTML = '<p class="form-text">Este módulo não possui campos editáveis.</p>';
        return;
    }

    fields.forEach(field => {
        if (isContextField(field)) {
            return;
        }
        const group = document.createElement('div');
        group.className = 'form-group';

        const label = document.createElement('label');
        label.className = 'form-label';
        
        const labelText = document.createElement('span');
        labelText.innerText = field.label;
        label.appendChild(labelText);
        
        if (field.required) {
            const asterisk = document.createElement('span');
            asterisk.innerText = ' *';
            asterisk.style.color = 'var(--error-color)';
            label.appendChild(asterisk);
        }

        if (field.information) {
            const infoSpan = document.createElement('span');
            infoSpan.className = 'field-info-icon';
            infoSpan.setAttribute('data-tooltip', field.information);
            infoSpan.setAttribute('tabindex', '0');
            infoSpan.setAttribute('role', 'img');
            infoSpan.setAttribute('aria-label', 'Informações do campo');
            infoSpan.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
            `;
            label.appendChild(infoSpan);
        }

        // Se o tipo for SINGLE, MULTI/MULTIPLE ou LOOKUP, renderizar um select (Dropdown List)
        const typeUpper = field.type.toUpperCase();
        const lookupName = parseLookupName(field.type);
        const isLookup = Boolean(lookupName);
        const isSingle = typeUpper.startsWith('SINGLE') || (isLookup && !isLookupMultiType(field.type));
        const isMulti = typeUpper.startsWith('MULTI') || typeUpper.startsWith('MULTIPLE') || isLookupMultiType(field.type);

        if (isSingle || isMulti) {
            label.htmlFor = `field_${field.field}`;
            
            const select = document.createElement('select');
            select.id = `field_${field.field}`;
            select.name = field.field;
            select.className = 'form-control';
            select.required = field.required;

            if (isMulti) {
                select.multiple = true;
            }

            if (isLookup) {
                select.dataset.lookupName = lookupName;
            }

            // Se não for obrigatório, adicionar opção em branco (apenas para SINGLE)
            if (isSingle && !field.required) {
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.text = '';
                select.appendChild(emptyOption);
            }

            if (!isLookup) {
                // Exemplo de tipo: SINGLE(S=Simples,V=Vários) ou MULTI(S=Simples,V=Vários)
                const match = field.type.match(/\(([^)]+)\)/);
                if (match) {
                    const optionsStr = match[1];
                    const optionsList = optionsStr.split(/[,;|]/);
                    const defaultValues = resolveStaticSelectDefaults(field);

                    optionsList.forEach(opt => {
                        const parts = opt.split('=');
                        let val = '';
                        let text = '';
                        if (parts.length >= 2) {
                            val = parts[0].trim();
                            text = parts.slice(1).join('=').trim();
                        } else {
                            text = opt.trim();
                            val = text;
                            if (field.defaultValue && field.defaultValue.length === 1 && text.toUpperCase().startsWith(field.defaultValue.toUpperCase())) {
                                val = field.defaultValue;
                            }
                        }
                        const option = document.createElement('option');
                        option.value = val;
                        option.text = text;

                        if (isMulti) {
                            if (defaultValues.includes(val)) {
                                option.selected = true;
                            }
                        } else if (defaultValues.includes(val)) {
                            option.selected = true;
                        }
                        select.appendChild(option);
                    });
                }
            } else if (field.defaultValue) {
                const defaultValues = resolveStaticSelectDefaults(field);
                if (defaultValues.length === 0) {
                    defaultValues.push(String(field.defaultValue).trim());
                }
                defaultValues.forEach(code => {
                    const option = document.createElement('option');
                    option.value = code;
                    option.text = code;
                    option.selected = true;
                    select.appendChild(option);
                });
            }

            if (field.defaultValue) {
                applySelectDefaultValues(select, field);
            }

            group.appendChild(label);
            group.appendChild(select);
            dynamicForm.appendChild(group);
            enhanceCustomSelect(select);
            return;
        }

        // Se o tipo for CHAR e tamanho 1, renderizar 2 radio buttons: Sim (S) e Não (N)
        if (field.type.toUpperCase() === 'CHAR' && field.size === 1) {
            label.htmlFor = `field_${field.field}_S`;

            const radioGroup = document.createElement('div');
            radioGroup.className = 'radio-group';
            
            const labelSim = document.createElement('label');
            labelSim.className = 'radio-label';
            const radioSim = document.createElement('input');
            radioSim.type = 'radio';
            radioSim.id = `field_${field.field}_S`;
            radioSim.name = field.field;
            radioSim.value = 'S';
            radioSim.className = 'form-radio';
            radioSim.required = field.required;
            
            labelSim.appendChild(radioSim);
            labelSim.appendChild(document.createTextNode('Sim'));
            
            const labelNao = document.createElement('label');
            labelNao.className = 'radio-label';
            const radioNao = document.createElement('input');
            radioNao.type = 'radio';
            radioNao.id = `field_${field.field}_N`;
            radioNao.name = field.field;
            radioNao.value = 'N';
            radioNao.className = 'form-radio';
            radioNao.required = field.required;
            
            labelNao.appendChild(radioNao);
            labelNao.appendChild(document.createTextNode('Não'));
            
            radioGroup.appendChild(labelSim);
            radioGroup.appendChild(labelNao);
            
            // Definir seleção padrão
            if (field.defaultValue === 'S') {
                radioSim.checked = true;
            } else if (field.defaultValue === 'N') {
                radioNao.checked = true;
            }
            
            group.appendChild(label);
            group.appendChild(radioGroup);
            dynamicForm.appendChild(group);
            return;
        }

        label.htmlFor = `field_${field.field}`;
        let input;

        // Mapeamento básico de tipos SQL para HTML
        switch (field.type.toUpperCase()) {
            case 'DATE':
            case 'DATETIME':
            case 'TIMESTAMP':
                input = document.createElement('input');
                input.type = 'date';
                break;
            case 'INT':
            case 'INTEGER':
            case 'NUMERIC':
            case 'DECIMAL':
            case 'FLOAT':
                input = document.createElement('input');
                input.type = 'number';
                break;
            default: // VARCHAR, TEXT, etc
                input = document.createElement('input');
                input.type = 'text';
                if (field.size) {
                    input.maxLength = field.size;
                }
                break;
        }

        input.id = `field_${field.field}`;
        input.name = field.field;
        input.className = 'form-control';
        input.required = field.required;
        
        if (field.defaultValue) {
            input.value = field.defaultValue;
        }

        group.appendChild(label);
        group.appendChild(input);
        dynamicForm.appendChild(group);
    });

    snapshotFormControlValues();
    void preloadLookupSelectLabels();
}

/* ==========================================================================
   Ações dos Botões do Formulário
   ========================================================================== */
function handleCancel() {
    syncFormModuleEditButton(null);
    formContainer.classList.add('hidden');
    gridContainer.classList.add('hidden');
    emptyState.classList.remove('hidden');
    
    // Remover classe ativa do menu lateral e favoritos
    document.querySelectorAll('.module-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.favorite-item').forEach(item => item.classList.remove('active'));
    
    currentQueryPath = null;
    window.sqlformysActiveQueryPath = '';
    currentFields = [];
    currentQueryLookups = {};
    currentQueryResult = null;
    currentResultType = 'GRID';
    resetResultDocumentView();
    if (gridActions) {
        gridActions.classList.add('hidden');
    }
    if (gridSearchContainer) {
        gridSearchContainer.classList.add('hidden');
    }
    if (gridSearchInput) {
        gridSearchInput.value = '';
    }
}

function handleClear() {
    if (!currentFields || currentFields.length === 0) return;
    
    currentFields.forEach(field => {
        if (field.type.toUpperCase() === 'CHAR' && field.size === 1) {
            const radioSim = document.getElementById(`field_${field.field}_S`);
            const radioNao = document.getElementById(`field_${field.field}_N`);
            if (radioSim && radioNao) {
                radioSim.checked = field.defaultValue === 'S';
                radioNao.checked = field.defaultValue === 'N';
            }
        } else {
            const input = document.getElementById(`field_${field.field}`);
            if (input) {
                if (input.tagName === 'SELECT' && input.multiple) {
                    applySelectDefaultValues(input, field);
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (input.tagName === 'SELECT') {
                    applySelectDefaultValues(input, field);
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    input.value = field.defaultValue || '';
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }
    });

    snapshotFormControlValues();
}

function handleExecute() {
    if (!dynamicForm.checkValidity()) {
        dynamicForm.reportValidity();
        return;
    }

    executeQuery(collectFormValues(false));
}

/* ==========================================================================
   Renderização da Grid de Resultados
   ========================================================================== */
function normalizeGridCellValue(val) {
    if (val === null || val === undefined) return null;
    if (typeof val === 'object') return JSON.stringify(val);
    return val;
}

function formatGridCellForDisplay(val) {
    const normalized = normalizeGridCellValue(val);
    if (normalized === null) return '';
    return String(normalized);
}

function parseLocaleNumber(value) {
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    const raw = String(value).trim();
    if (raw === '') return null;
    if (/^-?\d+$/.test(raw)) return Number(raw);
    if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(raw) || /^-?\d+,\d+$/.test(raw)) {
        const parsed = Number(raw.replace(/\./g, '').replace(',', '.'));
        return Number.isNaN(parsed) ? null : parsed;
    }
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
        const parsed = Number(raw);
        return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
}

function isNumericGridValue(value) {
    return parseLocaleNumber(value) !== null;
}

function parseGridDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.getTime();
    }
    const raw = String(value).trim();
    if (raw === '') return null;

    if (/^\d{8}$/.test(raw)) {
        const y = Number(raw.slice(0, 4));
        const m = Number(raw.slice(4, 6));
        const d = Number(raw.slice(6, 8));
        const dt = new Date(y, m - 1, d);
        return Number.isNaN(dt.getTime()) ? null : dt.getTime();
    }

    const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (brMatch) {
        const dt = new Date(
            Number(brMatch[3]),
            Number(brMatch[2]) - 1,
            Number(brMatch[1]),
            Number(brMatch[4] || 0),
            Number(brMatch[5] || 0),
            Number(brMatch[6] || 0)
        );
        return Number.isNaN(dt.getTime()) ? null : dt.getTime();
    }

    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? null : parsed;
}

function isDateGridValue(value) {
    return parseGridDate(value) !== null;
}

function inferGridColumnType(column, rows) {
    const samples = [];
    for (const row of rows) {
        const value = normalizeGridCellValue(row[column]);
        if (value === null || value === '') continue;
        samples.push(value);
        if (samples.length >= 150) break;
    }
    if (samples.length === 0) return 'string';

    const booleanTokens = new Set(['true', 'false', 's', 'n', '0', '1', 'sim', 'nao', 'não', 'yes', 'no']);
    if (samples.every(value => booleanTokens.has(String(value).trim().toLowerCase()))) {
        return 'boolean';
    }
    if (samples.every(isNumericGridValue)) {
        return 'number';
    }
    if (samples.every(isDateGridValue)) {
        return 'date';
    }
    return 'string';
}

function inferGridColumnTypes(columns, rows) {
    const types = {};
    columns.forEach(column => {
        types[column] = inferGridColumnType(column, rows);
    });
    return types;
}

function booleanSortRank(value) {
    const token = String(value).trim().toLowerCase();
    if (['true', 's', '1', 'sim', 'yes'].includes(token)) return 1;
    if (['false', 'n', '0', 'nao', 'não', 'no'].includes(token)) return 0;
    return 0;
}

function compareGridCellValues(a, b, type) {
    const aEmpty = a === null || a === '';
    const bEmpty = b === null || b === '';
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;

    switch (type) {
        case 'number': {
            const numA = parseLocaleNumber(a);
            const numB = parseLocaleNumber(b);
            return (numA ?? 0) - (numB ?? 0);
        }
        case 'date': {
            const dateA = parseGridDate(a);
            const dateB = parseGridDate(b);
            return (dateA ?? 0) - (dateB ?? 0);
        }
        case 'boolean':
            return booleanSortRank(a) - booleanSortRank(b);
        default:
            return String(a).localeCompare(String(b), 'pt-BR', {
                sensitivity: 'base',
                numeric: true,
                ignorePunctuation: true
            });
    }
}

function getGridSearchTerm() {
    return gridSearchInput ? gridSearchInput.value.trim().toLowerCase() : '';
}

function filterGridRows(rows, columns) {
    const term = getGridSearchTerm();
    if (term === '') return rows;
    return rows.filter(row => {
        return columns.some(column => {
            return formatGridCellForDisplay(row[column]).toLowerCase().includes(term);
        });
    });
}

function sortGridRows(rows, columns) {
    if (!gridSortState.column) return rows;
    const column = gridSortState.column;
    const type = gridColumnTypes[column] || 'string';
    const direction = gridSortState.direction === 'desc' ? -1 : 1;
    return [...rows].sort((rowA, rowB) => {
        const cmp = compareGridCellValues(
            normalizeGridCellValue(rowA[column]),
            normalizeGridCellValue(rowB[column]),
            type
        );
        if (cmp !== 0) return cmp * direction;
        return 0;
    });
}

function getDisplayedGridRows() {
    if (!currentQueryResult || !currentQueryResult.columns) return [];
    const { columns, rows } = currentQueryResult;
    return sortGridRows(filterGridRows(rows, columns), columns);
}

function updateGridTitle() {
    const gridTitle = document.getElementById('grid-title');
    if (!gridTitle || !currentQueryResult) return;

    const totalCount = currentQueryResult.rows ? currentQueryResult.rows.length : 0;
    const visibleCount = getDisplayedGridRows().length;
    const term = getGridSearchTerm();

    if (term === '') {
        gridTitle.innerText = `Resultados (${totalCount.toLocaleString('pt-BR')})`;
    } else {
        gridTitle.innerText = `Resultados (${visibleCount.toLocaleString('pt-BR')} de ${totalCount.toLocaleString('pt-BR')})`;
    }
}

function updateGridSortHeaderState() {
    resultThead.querySelectorAll('.grid-sort-btn').forEach(btn => {
        const column = btn.dataset.column;
        btn.classList.remove('sorted-asc', 'sorted-desc');
        if (gridSortState.column === column) {
            btn.classList.add(gridSortState.direction === 'desc' ? 'sorted-desc' : 'sorted-asc');
            btn.setAttribute('aria-sort', gridSortState.direction === 'desc' ? 'descending' : 'ascending');
        } else {
            btn.setAttribute('aria-sort', 'none');
        }
    });
}

function handleGridSort(column) {
    if (gridSortState.column === column) {
        gridSortState.direction = gridSortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        gridSortState.column = column;
        gridSortState.direction = 'asc';
    }
    refreshGridTable();
}

function renderGridTableHead(columns) {
    resultThead.innerHTML = '';
    const trHead = document.createElement('tr');

    columns.forEach(column => {
        const th = document.createElement('th');
        th.scope = 'col';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'grid-sort-btn';
        btn.dataset.column = column;
        btn.setAttribute('aria-sort', 'none');
        btn.setAttribute('data-tooltip', `Ordenar por ${column}`);

        const label = document.createElement('span');
        label.className = 'grid-sort-label';
        label.textContent = column;

        const icon = document.createElement('span');
        icon.className = 'grid-sort-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = `
            <svg class="grid-sort-icon-neutral" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 9l4-4 4 4"></path>
                <path d="M8 15l4 4 4-4"></path>
            </svg>
        `;

        btn.appendChild(label);
        btn.appendChild(icon);
        btn.addEventListener('click', () => handleGridSort(column));
        th.appendChild(btn);
        trHead.appendChild(th);
    });

    resultThead.appendChild(trHead);
    updateGridSortHeaderState();
}

function renderGridTableBody(columns, rows) {
    resultTbody.innerHTML = '';
    rows.forEach(row => {
        const tr = document.createElement('tr');
        columns.forEach(column => {
            const td = document.createElement('td');
            td.textContent = formatGridCellForDisplay(row[column]);
            tr.appendChild(td);
        });
        resultTbody.appendChild(tr);
    });
}

function refreshGridTable() {
    if (!currentQueryResult || !currentQueryResult.columns) return;

    const columns = currentQueryResult.columns;
    const rows = getDisplayedGridRows();

    updateGridSortHeaderState();
    renderGridTableBody(columns, rows);
    updateGridTitle();

    const term = getGridSearchTerm();
    if (rows.length === 0 && term !== '') {
        resultTable.classList.add('hidden');
        gridEmptyState.classList.remove('hidden');
    } else {
        resultTable.classList.remove('hidden');
        gridEmptyState.classList.add('hidden');
    }
}

function resetResultDocumentView() {
    if (resultDocument) {
        resultDocument.innerHTML = '';
        resultDocument.classList.add('hidden');
        resultDocument.className = 'result-document hidden';
    }
    if (resultCardBody) {
        resultCardBody.classList.remove('result-document-mode');
    }
}

function resolveResultType(resultData, fallback) {
    const fromResult = resultData && resultData.resultType;
    if (fromResult) {
        return String(fromResult).toUpperCase();
    }
    if (fallback) {
        return String(fallback).toUpperCase();
    }
    return 'GRID';
}

function joinResultColumnContent(resultData) {
    if (!resultData || !resultData.rows || resultData.rows.length === 0) {
        return '';
    }
    let columnName = resultData.columns && resultData.columns.length > 0
        ? resultData.columns[0]
        : null;
    if (!columnName) {
        const keys = Object.keys(resultData.rows[0] || {});
        if (keys.length === 0) {
            return '';
        }
        columnName = keys[0];
    }
    return resultData.rows
        .map((row) => formatGridCellForDisplay(row[columnName]))
        .join('\n');
}

function setExecutionTimeBadge(duration, rowCount) {
    const gridTitle = document.getElementById('grid-title');
    const executionTimeEl = document.getElementById('execution-time');

    if (gridTitle) {
        if (rowCount != null && rowCount > 0) {
            gridTitle.innerText = `Resultados (${rowCount.toLocaleString('pt-BR')})`;
        } else {
            gridTitle.innerText = 'Resultados';
        }
    }

    if (executionTimeEl && duration !== null) {
        let timeStr = '';
        if (duration < 1000) {
            timeStr = `${duration.toFixed(0)} ms`;
        } else {
            timeStr = `${(duration / 1000).toFixed(2)} s`;
        }
        executionTimeEl.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            Tempo de execução: ${timeStr}
        `;
        executionTimeEl.classList.remove('hidden');
    } else if (executionTimeEl) {
        executionTimeEl.innerHTML = '';
        executionTimeEl.classList.add('hidden');
    }
}

function getMermaidTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default';
}

async function runMermaidIn(container) {
    if (typeof mermaid === 'undefined') {
        container.insertAdjacentHTML('beforeend', '<p class="form-text">Biblioteca Mermaid não carregada.</p>');
        return;
    }
    const theme = getMermaidTheme();
    const config = { startOnLoad: false, theme, securityLevel: 'loose' };
    if (!mermaidLibInitialized) {
        mermaid.initialize(config);
        mermaidLibInitialized = true;
    } else {
        mermaid.initialize(config);
    }
    const nodes = container.querySelectorAll('.mermaid');
    if (nodes.length === 0) {
        return;
    }
    try {
        await mermaid.run({ nodes });
    } catch (err) {
        console.error(err);
        showToast('Aviso', 'Falha ao renderizar diagrama Mermaid.', 'warning');
    }
}

function promoteMermaidCodeBlocks(container) {
    container.querySelectorAll('pre code.language-mermaid').forEach((code) => {
        const pre = code.parentElement;
        if (!pre) {
            return;
        }
        const div = document.createElement('div');
        div.className = 'mermaid';
        div.textContent = code.textContent;
        pre.replaceWith(div);
    });
}

async function renderMarkdownHtml(container, markdown, className) {
    if (typeof marked === 'undefined') {
        container.className = className;
        container.textContent = markdown;
        return;
    }
    marked.setOptions({ gfm: true });
    let html = marked.parse(markdown);
    if (typeof DOMPurify !== 'undefined') {
        html = DOMPurify.sanitize(html);
    }
    container.className = className;
    container.innerHTML = html;
}

async function renderMermaidBlock(container, source) {
    container.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'mermaid';
    div.textContent = source;
    container.appendChild(div);
    await runMermaidIn(container);
}

function renderHtmlResult(container, html) {
    container.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.className = 'result-html-frame';
    iframe.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms');
    iframe.srcdoc = html;
    container.appendChild(iframe);
}

async function renderResultByType(container, type, content) {
    const upper = String(type).toUpperCase();
    switch (upper) {
        case 'TEXT': {
            container.className = 'result-document result-text';
            container.textContent = '';
            const pre = document.createElement('pre');
            pre.className = 'result-text-pre';
            pre.textContent = content;
            container.appendChild(pre);
            break;
        }
        case 'HTML':
            container.className = 'result-document result-html';
            renderHtmlResult(container, content);
            break;
        case 'MARKDOWN':
            await renderMarkdownHtml(container, content, 'result-document result-prose');
            break;
        case 'MERMAID':
            container.className = 'result-document result-mermaid';
            await renderMermaidBlock(container, content);
            break;
        case 'DOCUMENT':
            await renderMarkdownHtml(container, content, 'result-document result-prose');
            promoteMermaidCodeBlocks(container);
            await runMermaidIn(container);
            break;
        default:
            container.className = 'result-document result-text';
            container.textContent = content;
            break;
    }
}

function renderQueryResult(resultData, duration = null) {
    currentQueryResult = resultData;
    const resultType = resolveResultType(resultData, currentResultType);
    gridContainer.classList.remove('hidden');

    if (resultType === 'GRID') {
        renderGrid(resultData, duration);
        return;
    }

    resetResultDocumentView();
    gridSortState = { column: null, direction: 'asc' };
    gridColumnTypes = {};
    resultThead.innerHTML = '';
    resultTbody.innerHTML = '';

    if (gridActions) {
        gridActions.classList.add('hidden');
    }
    if (gridSearchContainer) {
        gridSearchContainer.classList.add('hidden');
    }

    setExecutionTimeBadge(duration, null);

    const content = joinResultColumnContent(resultData);

    if (!content.trim()) {
        if (resultDocument) {
            resultDocument.classList.add('hidden');
        }
        resultTable.classList.add('hidden');
        gridEmptyState.classList.remove('hidden');
        return;
    }

    resultTable.classList.add('hidden');
    gridEmptyState.classList.add('hidden');

    if (resultCardBody) {
        resultCardBody.classList.add('result-document-mode');
    }
    if (resultDocument) {
        resultDocument.classList.remove('hidden');
        renderResultByType(resultDocument, resultType, content).catch((err) => {
            console.error(err);
            showToast('Erro', 'Falha ao renderizar o resultado.', 'error');
        });
    }
}

function renderGrid(resultData, duration = null) {
    currentQueryResult = resultData;
    gridSortState = { column: null, direction: 'asc' };
    gridColumnTypes = {};
    gridContainer.classList.remove('hidden');
    resetResultDocumentView();
    resultThead.innerHTML = '';
    resultTbody.innerHTML = '';

    if (!resultData || !resultData.columns || resultData.columns.length === 0 || !resultData.rows || resultData.rows.length === 0) {
        setExecutionTimeBadge(duration, null);
        resultTable.classList.add('hidden');
        gridEmptyState.classList.remove('hidden');
        if (gridActions) {
            gridActions.classList.add('hidden');
        }
        if (gridSearchContainer) {
            gridSearchContainer.classList.add('hidden');
        }
        return;
    }

    if (gridActions) {
        gridActions.classList.remove('hidden');
    }

    if (gridSearchContainer) {
        gridSearchContainer.classList.remove('hidden');
        if (gridSearchInput) {
            gridSearchInput.value = '';
        }
        if (clearGridSearchBtn) {
            clearGridSearchBtn.classList.add('hidden');
        }
    }

    setExecutionTimeBadge(duration, resultData.rows.length);

    resultTable.classList.remove('hidden');
    gridEmptyState.classList.add('hidden');

    gridColumnTypes = inferGridColumnTypes(resultData.columns, resultData.rows);
    renderGridTableHead(resultData.columns);
    renderGridTableBody(resultData.columns, resultData.rows);
}

function filterGrid() {
    if (!currentQueryResult) return;

    const value = gridSearchInput ? gridSearchInput.value.trim() : '';
    if (clearGridSearchBtn) {
        if (value !== '') {
            clearGridSearchBtn.classList.remove('hidden');
        } else {
            clearGridSearchBtn.classList.add('hidden');
        }
    }

    refreshGridTable();
}

/* ==========================================================================
   Tooltip customizado
   ========================================================================== */
let appTooltipEl = null;
let appTooltipTrigger = null;
let appTooltipShowTimer = null;
let appTooltipPlacement = 'top';

function getAppTooltipElement() {
    if (!appTooltipEl) {
        appTooltipEl = document.createElement('div');
        appTooltipEl.id = 'app-tooltip';
        appTooltipEl.className = 'app-tooltip app-tooltip--top';
        appTooltipEl.setAttribute('role', 'tooltip');
        document.body.appendChild(appTooltipEl);
    }
    return appTooltipEl;
}

function positionAppTooltip(trigger) {
    const tooltip = getAppTooltipElement();
    const rect = trigger.getBoundingClientRect();
    const margin = 10;
    const gap = 8;

    const layoutTooltip = (placement) => {
        tooltip.classList.remove('app-tooltip--top', 'app-tooltip--bottom');
        tooltip.classList.add(`app-tooltip--${placement}`);

        tooltip.style.left = '0px';
        tooltip.style.top = '0px';
        tooltip.style.visibility = 'hidden';
        tooltip.classList.add('is-visible');

        const tipRect = tooltip.getBoundingClientRect();
        const top = placement === 'top'
            ? rect.top - tipRect.height - gap
            : rect.bottom + gap;

        let left = rect.left + rect.width / 2;
        const half = tipRect.width / 2;
        if (left - half < margin) {
            left = margin + half;
        } else if (left + half > window.innerWidth - margin) {
            left = window.innerWidth - margin - half;
        }

        const arrowX = Math.min(
            Math.max(rect.left + rect.width / 2 - (left - half), 12),
            tipRect.width - 12
        );

        tooltip.style.setProperty('--tooltip-arrow-x', `${arrowX}px`);
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${Math.max(margin, top)}px`;
        tooltip.style.visibility = '';

        return { tipRect, top, placement };
    };

    let placement = appTooltipPlacement || 'top';
    let layout = layoutTooltip(placement);

    if (placement === 'top' && layout.top < margin) {
        placement = 'bottom';
        appTooltipPlacement = 'bottom';
        layout = layoutTooltip(placement);
    } else if (
        placement === 'bottom'
        && layout.top + layout.tipRect.height > window.innerHeight - margin
    ) {
        placement = 'top';
        appTooltipPlacement = 'top';
        layoutTooltip(placement);
    } else {
        appTooltipPlacement = placement;
    }
}

function shouldShowAppTooltip(trigger) {
    if (!trigger) return false;
    const text = trigger.getAttribute('data-tooltip');
    return Boolean(text && String(text).trim());
}

function hideAppTooltip() {
    clearTimeout(appTooltipShowTimer);
    appTooltipShowTimer = null;
    appTooltipTrigger = null;
    appTooltipPlacement = 'top';

    if (appTooltipEl) {
        appTooltipEl.classList.remove('is-visible');
        appTooltipEl.textContent = '';
    }
}

function showAppTooltip(trigger) {
    if (!shouldShowAppTooltip(trigger)) {
        hideAppTooltip();
        return;
    }
    const text = trigger.getAttribute('data-tooltip');
    if (!text) return;

    appTooltipTrigger = trigger;
    appTooltipPlacement = 'top';

    const tooltip = getAppTooltipElement();
    tooltip.textContent = text;
    positionAppTooltip(trigger);
}

function scheduleAppTooltip(trigger) {
    if (!shouldShowAppTooltip(trigger)) {
        hideAppTooltip();
        return;
    }
    if (appTooltipTrigger === trigger) return;

    clearTimeout(appTooltipShowTimer);
    hideAppTooltip();

    appTooltipShowTimer = setTimeout(() => {
        if (shouldShowAppTooltip(trigger)) {
            showAppTooltip(trigger);
        }
    }, 350);
}

function initAppTooltips() {
    getAppTooltipElement();

    document.body.addEventListener('mouseover', (e) => {
        const trigger = e.target.closest('[data-tooltip]');
        if (trigger) {
            scheduleAppTooltip(trigger);
        }
    });

    document.body.addEventListener('mouseout', (e) => {
        const trigger = e.target.closest('[data-tooltip]');
        if (trigger && !trigger.contains(e.relatedTarget)) {
            hideAppTooltip();
        }
    });

    document.body.addEventListener('focusin', (e) => {
        const trigger = e.target.closest('[data-tooltip]');
        if (trigger) {
            showAppTooltip(trigger);
        }
    });

    document.body.addEventListener('focusout', (e) => {
        const trigger = e.target.closest('[data-tooltip]');
        if (trigger && !trigger.contains(e.relatedTarget)) {
            hideAppTooltip();
        }
    });

    window.addEventListener('scroll', () => {
        if (appTooltipTrigger) {
            positionAppTooltip(appTooltipTrigger);
        }
    }, true);

    window.addEventListener('resize', () => {
        if (appTooltipTrigger) {
            positionAppTooltip(appTooltipTrigger);
        }
    });
}

/* ==========================================================================
   Funções de Exportação (CSV e Excel)
   ========================================================================== */
function getExportFilename(extension) {
    if (!currentQueryPath) return `dados_exportados.${extension}`;
    
    // Extrair o nome do arquivo do caminho (ex: "projeto/pasta/modulo.sql" -> "modulo")
    const parts = currentQueryPath.split('/');
    const lastPart = parts[parts.length - 1];
    const nameWithoutExt = lastPart.replace(/\.[^/.]+$/, "");
    
    // Formatar timestamp: YYYYMMDD_HHMMSS
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
    return `${nameWithoutExt}_${timestamp}.${extension}`;
}

function exportToCSV() {
    if (!currentQueryResult || !currentQueryResult.columns || currentQueryResult.columns.length === 0) {
        showToast('Exportar', 'Não há dados disponíveis para exportação.', 'error');
        return;
    }
    
    try {
        const columns = currentQueryResult.columns;
        const rows = getDisplayedGridRows();
        
        // BOM (Byte Order Mark) para UTF-8 (permite acentuação correta no Excel em PT-BR)
        let csvContent = '\uFEFF';
        
        // Cabeçalhos (envolvidos em aspas duplas, separados por vírgula)
        csvContent += columns.map(col => `"${col.replace(/"/g, '""')}"`).join(',') + '\r\n';
        
        // Linhas de dados
        rows.forEach(row => {
            const rowValues = columns.map(col => {
                let val = row[col];
                if (val === null || val === undefined) {
                    val = '';
                } else if (typeof val === 'object') {
                    val = JSON.stringify(val);
                } else {
                    val = String(val);
                }
                return `"${val.replace(/"/g, '""')}"`;
            });
            csvContent += rowValues.join(',') + '\r\n';
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const filename = getExportFilename('csv');
        
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        
        link.click();
        
        document.body.removeChild(link);
        showToast('Exportar', `Arquivo CSV exportado com sucesso: ${filename}`, 'success');
    } catch (error) {
        console.error('Erro ao exportar CSV:', error);
        showToast('Exportar', 'Erro ao exportar dados para CSV.', 'error');
    }
}

function exportToExcel() {
    if (!currentQueryResult || !currentQueryResult.columns || currentQueryResult.columns.length === 0) {
        showToast('Exportar', 'Não há dados disponíveis para exportação.', 'error');
        return;
    }
    
    if (typeof XLSX === 'undefined') {
        showToast('Exportar', 'Biblioteca Excel (SheetJS) não carregada.', 'error');
        return;
    }
    
    try {
        const columns = currentQueryResult.columns;
        const rows = getDisplayedGridRows();
        
        // Montar matriz 2D com cabeçalho + dados
        const sheetData = [columns];
        
        rows.forEach(row => {
            sheetData.push(columns.map(col => {
                let val = row[col];
                if (val === null || val === undefined) return '';
                if (typeof val === 'object') return JSON.stringify(val);
                return val;
            }));
        });
        
        // Criar pasta de trabalho do Excel (Workbook) e planilha (Worksheet)
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        const wb = XLSX.utils.book_new();
        
        XLSX.utils.book_append_sheet(wb, ws, "Resultados");
        
        const filename = getExportFilename('xlsx');
        XLSX.writeFile(wb, filename);
        
        showToast('Exportar', `Arquivo Excel exportado com sucesso: ${filename}`, 'success');
    } catch (error) {
        console.error('Erro ao exportar Excel:', error);
        showToast('Exportar', 'Erro ao exportar dados para Excel.', 'error');
    }
}

/* ==========================================================================
   Funções Auxiliares de Filtro
   ========================================================================== */
function filterTree(nodes, searchTerm) {
    if (!searchTerm) return nodes;
    
    const term = searchTerm.toLowerCase();
    
    function filterNode(node) {
        if (node.type === 'module') {
            const matches = node.name.toLowerCase().includes(term);
            return matches ? { ...node } : null;
        } else if (node.type === 'folder') {
            if (!node.children) return null;
            const filteredChildren = node.children
                .map(filterNode)
                .filter(child => child !== null);
                
            if (filteredChildren.length > 0) {
                return {
                    ...node,
                    children: filteredChildren
                };
            }
            return null;
        }
        return null;
    }
    
    return nodes.map(filterNode).filter(node => node !== null);
}

/* ==========================================================================
   Gerenciamento de Favoritos e pastas do menu lateral
   ========================================================================== */
function getFavorites() {
    if (typeof getFavoritesFromSettings === 'function') {
        return getFavoritesFromSettings();
    }
    return [];
}

function saveFavorites(favorites) {
    if (typeof saveFavoritesToSettings === 'function') {
        saveFavoritesToSettings(favorites);
    }
}

function collectTreeFolderIds(nodes, parentRel = '') {
    const ids = [];
    if (!nodes) return ids;
    nodes.forEach((node) => {
        if (node.type === 'folder') {
            const rel = parentRel ? `${parentRel}/${node.name}` : node.name;
            ids.push(`tree:${rel}`);
            ids.push(...collectTreeFolderIds(node.children, rel));
        }
    });
    return ids;
}

function collectAllSidebarFolderIds() {
    const ids = ['users', 'users:padrao', 'users:administradores'];
    const favContainer = document.getElementById('sidebar-favorites-container');
    if (favContainer && !favContainer.classList.contains('hidden')) {
        ids.push('favorites');
    }
    ids.push(...collectTreeFolderIds(allProjects));
    return ids;
}

function setAllSidebarFoldersExpanded(expand) {
    const ids = expand ? collectAllSidebarFolderIds() : [];
    if (typeof setSidebarExpandedAll === 'function') {
        setSidebarExpandedAll(ids);
    }
    const term = searchInput ? searchInput.value.trim() : '';
    if (term !== '') {
        const filtered = filterTree(allProjects, term);
        renderTree(filtered, treeNavigation, true);
    } else {
        renderTree(allProjects, treeNavigation, false);
    }
    if (typeof renderAdminUsersPanel === 'function') {
        renderAdminUsersPanel(API_BASE_URL);
    }
    renderFavorites();
    if (typeof applySidebarExpandedToDOM === 'function') {
        applySidebarExpandedToDOM();
    }
    updateExpandCollapseAllButton();
}

function updateExpandCollapseAllButton() {
    if (!toggleSidebarFoldersBtn) return;
    const anyOpen = typeof anySidebarFolderExpanded === 'function' && anySidebarFolderExpanded();
    const expand = !anyOpen;
    toggleSidebarFoldersBtn.setAttribute(
        'aria-label',
        expand ? 'Expandir todas as pastas' : 'Recolher todas as pastas'
    );
    toggleSidebarFoldersBtn.setAttribute('aria-expanded', expand ? 'false' : 'true');
    toggleSidebarFoldersBtn.title = expand ? 'Expandir todas as pastas' : 'Recolher todas as pastas';
    const iconExpand = toggleSidebarFoldersBtn.querySelector('.sidebar-folders-icon-expand');
    const iconCollapse = toggleSidebarFoldersBtn.querySelector('.sidebar-folders-icon-collapse');
    if (iconExpand) iconExpand.classList.toggle('hidden', !expand);
    if (iconCollapse) iconCollapse.classList.toggle('hidden', expand);
}

window.updateExpandCollapseAllButton = updateExpandCollapseAllButton;
window.setAllSidebarFoldersExpanded = setAllSidebarFoldersExpanded;

function initSidebarFolderControls() {
    if (favoritesToggleBtn && favoritesPanelEl) {
        favoritesToggleBtn.addEventListener('click', () => {
            const open = !favoritesPanelEl.classList.contains('open');
            if (typeof setSidebarFolderExpanded === 'function') {
                setSidebarFolderExpanded('favorites', open);
            }
        });
        if (typeof syncSidebarFolderPanel === 'function') {
            syncSidebarFolderPanel(favoritesPanelEl, favoritesToggleBtn, 'favorites');
        }
    }

    if (toggleSidebarFoldersBtn) {
        toggleSidebarFoldersBtn.addEventListener('click', () => {
            const expand = !(typeof anySidebarFolderExpanded === 'function' && anySidebarFolderExpanded());
            setAllSidebarFoldersExpanded(expand);
        });
        updateExpandCollapseAllButton();
    }
}

function toggleFavorite(path) {
    let favorites = getFavorites();
    const index = favorites.indexOf(path);
    if (index > -1) {
        favorites.splice(index, 1);
        showToast('Favoritos', 'Módulo removido dos favoritos.', 'success');
    } else {
        favorites.push(path);
        showToast('Favoritos', 'Módulo adicionado aos favoritos.', 'success');
    }
    saveFavorites(favorites);
    
    // Atualizar visualizações
    renderFavorites();
    
    // Re-renderizar a árvore para atualizar as estrelas
    const term = searchInput ? searchInput.value.trim() : '';
    if (term !== '') {
        const filtered = filterTree(allProjects, term);
        renderTree(filtered, treeNavigation, true);
    } else {
        renderTree(allProjects, treeNavigation, false);
    }
}

function getAllModulesMap(nodes) {
    const map = new Map();
    function traverse(nodeList) {
        if (!nodeList) return;
        nodeList.forEach(node => {
            if (node.type === 'module') {
                map.set(node.path, node);
            } else if (node.type === 'folder' && node.children) {
                traverse(node.children);
            }
        });
    }
    traverse(nodes);
    return map;
}

function setActiveModule(path) {
    // Remover classe ativa de todos
    document.querySelectorAll('.module-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.favorite-item').forEach(item => item.classList.remove('active'));
    
    // Adicionar classe ativa na árvore
    const treeLink = document.querySelector(`.tree-module-link[data-path="${CSS.escape(path)}"]`);
    if (treeLink) {
        treeLink.classList.add('active');
    }
    
    // Adicionar classe ativa nos favoritos
    const favoriteItem = document.querySelector(`.favorite-item[data-path="${CSS.escape(path)}"]`);
    if (favoriteItem) {
        favoriteItem.classList.add('active');
    }
}

function renderFavorites() {
    const container = document.getElementById('sidebar-favorites-container');
    const listContainer = document.getElementById('sidebar-favorites-list');
    if (!container || !listContainer) return;

    const favorites = getFavorites();
    
    if (favorites.length === 0) {
        container.classList.add('hidden');
        return;
    }
    
    container.classList.remove('hidden');
    listContainer.innerHTML = '';

    if (favoritesToggleBtn && favoritesPanelEl && typeof syncSidebarFolderPanel === 'function') {
        syncSidebarFolderPanel(favoritesPanelEl, favoritesToggleBtn, 'favorites');
    }
    
    const modulesMap = getAllModulesMap(allProjects);
    
    favorites.forEach(path => {
        const moduleNode = modulesMap.get(path);
        const itemEl = document.createElement('div');
        itemEl.dataset.path = path;
        
        if (moduleNode) {
            // Favorito disponível
            itemEl.className = 'favorite-item';
            itemEl.setAttribute('data-tooltip', moduleNode.name);
            if (currentQueryPath === path) {
                itemEl.classList.add('active');
            }
            
            itemEl.innerHTML = `
                <div class="favorite-item-info">
                    ${treeSqlModuleIconMarkup('margin-right: 8px; width: 14px; height: 14px;')}
                    <span class="favorite-item-title">${moduleNode.name}</span>
                </div>
                <button class="favorite-remove-btn" data-tooltip="Remover dos favoritos">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                </button>
            `;
            
            itemEl.addEventListener('click', (e) => {
                if (e.target.closest('.favorite-remove-btn')) return;
                setActiveModule(path);
                loadFormFields(path, moduleNode.name);
            });
        } else {
            // Favorito indisponível
            itemEl.className = 'favorite-item unavailable';
            const displayName = path.split('/').pop() || path;
            const unavailableTip = `Este módulo não está mais disponível no caminho: ${path}`;
            itemEl.setAttribute('data-tooltip', unavailableTip);
            
            itemEl.innerHTML = `
                <div class="favorite-item-info">
                    <svg class="tree-icon warning-icon" style="margin-right: 8px; width: 14px; height: 14px; color: var(--error-color);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    <span class="favorite-item-title">${displayName} (Indisponível)</span>
                </div>
                <button class="favorite-remove-btn" data-tooltip="Remover dos favoritos">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                </button>
            `;
        }
        
        const removeBtn = itemEl.querySelector('.favorite-remove-btn');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavorite(path);
            });
        }
        
        listContainer.appendChild(itemEl);
    });
}
