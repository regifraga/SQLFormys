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
const btnWizardPrev = document.getElementById('btn-wizard-prev');
const btnWizardNext = document.getElementById('btn-wizard-next');
const wizardFooterDivider = document.getElementById('wizard-footer-divider');
const wizardStepperEl = document.getElementById('wizard-stepper');
const searchInput = document.getElementById('search-modules');
const clearSearchBtn = document.getElementById('clear-search');
const toggleSidebarFoldersBtn = document.getElementById('toggle-sidebar-folders');
const favoritesToggleBtn = document.getElementById('sidebar-favorites-toggle');
const favoritesPanelEl = document.getElementById('sidebar-favorites-panel');
const modulesToggleBtn = document.getElementById('sidebar-modules-toggle');
const modulesPanelEl = document.getElementById('sidebar-modules-panel');

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
let currentQueryKind = 'sql';
let currentFields = [];
let allProjects = [];
let currentQueryResult = null;
let gridSortState = { column: null, direction: 'asc' };
let gridColumnTypes = {};
let currentQueryLookups = {};
let currentResultType = 'GRID';
let mermaidLibInitialized = false;
let currentWizard = null;
let wizardStepIndex = 0;
let wizardStepResults = {};
let wizardStepRuntimeValues = {};
let wizardStepPanes = new Map();
let wizardResultStepLabel = '';
let wizardNavBusy = false;
const WIZARD_SUMMARY_STEP_ID = '__summary';
let formExecutionCount = 0;
let activeFormExecutionAbort = null;
let formExecutionIdleResolvers = [];
let formExecuteButtonLabel = '';
let currentExecutionDurationMs = null;
let currentConfirm = null;
let currentModuleMessages = [];
let wizardSummaryCanExecute = null;
let wizardSummaryGateMessage = '';

function isFormExecutionBusy() {
    return formExecutionCount > 0;
}

function notifyFormExecutionIdle() {
    if (formExecutionCount > 0) return;
    const resolvers = formExecutionIdleResolvers.splice(0);
    resolvers.forEach((resolve) => resolve());
}

function waitForFormExecutionIdle(timeoutMs = 120000) {
    if (!isFormExecutionBusy()) {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const idx = formExecutionIdleResolvers.indexOf(onIdle);
            if (idx >= 0) formExecutionIdleResolvers.splice(idx, 1);
            reject(new Error('Tempo esgotado ao aguardar o fim da execução.'));
        }, timeoutMs);
        function onIdle() {
            clearTimeout(timer);
            resolve();
        }
        formExecutionIdleResolvers.push(onIdle);
    });
}

function abortActiveFormExecution() {
    if (activeFormExecutionAbort) {
        activeFormExecutionAbort.abort();
    }
}

function syncFormExecutionLockState() {
    const busy = isFormExecutionBusy();
    const formEl = document.getElementById('form-container');
    if (formEl) {
        formEl.classList.toggle('form-execution-busy', busy);
        formEl.setAttribute('aria-busy', busy ? 'true' : 'false');
    }
    if (btnExecute) {
        const summaryBlocked = isOnWizardSummaryStep()
            && hasWizardSummaryStep()
            && wizardSummaryCanExecute === false;
        btnExecute.disabled = busy || summaryBlocked;
        if (busy && !btnExecute.classList.contains('hidden')) {
            btnExecute.innerText = 'Executando...';
            btnExecute.setAttribute('aria-disabled', 'true');
        } else if (!busy) {
            btnExecute.removeAttribute('aria-disabled');
            if (formExecuteButtonLabel) {
                btnExecute.innerText = formExecuteButtonLabel;
            }
        }
    }
    if (btnWizardNext) {
        btnWizardNext.disabled = busy || wizardNavBusy;
    }
    if (btnWizardPrev) {
        btnWizardPrev.disabled = busy || wizardNavBusy || wizardStepIndex <= 0;
    }
    if (btnClear) {
        btnClear.disabled = busy;
    }
    if (!busy && typeof syncWizardFooterButtons === 'function') {
        syncWizardFooterButtons();
    }
}

function beginFormExecution() {
    formExecutionCount += 1;
    if (formExecutionCount === 1) {
        activeFormExecutionAbort = new AbortController();
    }
    syncFormExecutionLockState();
}

function endFormExecution() {
    formExecutionCount = Math.max(0, formExecutionCount - 1);
    if (formExecutionCount === 0) {
        activeFormExecutionAbort = null;
    }
    syncFormExecutionLockState();
    notifyFormExecutionIdle();
}

function confirmAbortFormExecutionAndLeave() {
    if (!isFormExecutionBusy()) {
        return Promise.resolve(true);
    }
    if (typeof openAppModal !== 'function') {
        return Promise.resolve(false);
    }
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        openAppModal({
            title: 'Execução em andamento',
            body: 'Há uma execução em andamento neste módulo. Deseja cancelá-la completamente e sair?',
            primaryLabel: 'Cancelar execução e sair',
            secondaryLabel: 'Continuar executando',
            onPrimary: async () => {
                abortActiveFormExecution();
                try {
                    await waitForFormExecutionIdle();
                } catch (err) {
                    showToast('Aviso', err.message || 'Não foi possível aguardar o fim da execução.', 'warning');
                    finish(false);
                    return false;
                }
                finish(true);
                return true;
            },
            onSecondary: async () => {
                finish(false);
            }
        });
    });
}

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

    if (typeof initResultPins === 'function') {
        initResultPins();
    }
    if (typeof refreshResultPinsFromStorage === 'function') {
        refreshResultPinsFromStorage();
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
    if (btnWizardPrev) btnWizardPrev.addEventListener('click', handleWizardPrev);
    if (btnWizardNext) btnWizardNext.addEventListener('click', handleWizardNext);

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

    dynamicForm.addEventListener('input', (event) => {
        const control = event.target;
        if (!control || !dynamicForm.contains(control)) return;
        if (!control.classList.contains('form-control')) return;
        refreshInterpolatedTexts();
    });

    dynamicForm.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            if (e.ctrlKey) {
                handleCancel();
            } else {
                handleClear();
            }
        } else if (e.key === 'Enter') {
            const target = e.target;
            if (target && target.tagName === 'TEXTAREA') {
                return;
            }
            e.preventDefault();
            const wizardUsesNext = isWizardModule()
                && btnExecute
                && btnExecute.classList.contains('hidden')
                && btnWizardNext
                && !btnWizardNext.classList.contains('hidden');
            if (wizardUsesNext) {
                void handleWizardNext();
            } else {
                handleExecute();
            }
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
        if (!response.ok) throw new Error('Falha ao carregar estrutura de módulos');
        
        const data = await response.json();
        const projects = Array.isArray(data) ? data : (data.projects || []);
        const productName = (data && !Array.isArray(data)) ? data.productName : "";
        
        allProjects = projects;
        if (typeof renderAdminUsersPanel === 'function') {
            renderAdminUsersPanel(API_BASE_URL);
        }
        renderTree(projects, treeNavigation);
        syncModulesAccordion();
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
        showToast('Erro de Conexão', 'Não foi possível carregar a estrutura de módulos.', 'error');
    }
}

function normalizeModuleKind(kind) {
    const k = String(kind || 'sql').toLowerCase();
    if (k === 'sh' || k === 'ps1') return k;
    return 'sql';
}

function moduleKindQueryParam(kind) {
    return `?kind=${encodeURIComponent(normalizeModuleKind(kind))}`;
}

function queriesApiUrl(queryPath, kind) {
    return `${API_BASE_URL}/queries/${queryPath}${moduleKindQueryParam(kind)}`;
}

function queriesExecuteUrl(queryPath, kind, stepId = '', namedQuery = '', wizardFinal = false) {
    let url = queriesApiUrl(queryPath, kind);
    if (stepId) {
        url += `&step=${encodeURIComponent(stepId)}`;
    }
    if (namedQuery) {
        url += `&namedQuery=${encodeURIComponent(namedQuery)}`;
    }
    if (wizardFinal) {
        url += '&wizardFinal=1';
    }
    return url;
}

function isWizardModule() {
    return Boolean(currentWizard && Array.isArray(currentWizard.steps) && currentWizard.steps.length > 0);
}

function hasWizardSummaryStep() {
    return Boolean(isWizardModule() && currentWizard.summary);
}

function wizardUiStepCount() {
    if (!isWizardModule()) return 0;
    return currentWizard.steps.length + (hasWizardSummaryStep() ? 1 : 0);
}

function isWizardSummaryIndex(index) {
    return hasWizardSummaryStep() && index === currentWizard.steps.length;
}

function isOnWizardSummaryStep() {
    return isWizardSummaryIndex(wizardStepIndex);
}

function getLastWizardRealStepMeta() {
    if (!isWizardModule()) return null;
    const steps = currentWizard.steps;
    return steps.length ? steps[steps.length - 1] : null;
}

function getWizardSummaryStepMeta() {
    if (!hasWizardSummaryStep()) return null;
    return {
        id: WIZARD_SUMMARY_STEP_ID,
        label: currentWizard.summary.label || 'Resumo',
        fieldNames: [],
        hasQuery: false
    };
}

function getWizardStepMeta(index) {
    if (!isWizardModule()) return null;
    if (isWizardSummaryIndex(index)) {
        return getWizardSummaryStepMeta();
    }
    return currentWizard.steps[index] || null;
}

function getCurrentWizardStepMeta() {
    return getWizardStepMeta(wizardStepIndex);
}

function resetWizardState() {
    wizardSummaryCanExecute = null;
    wizardSummaryGateMessage = '';
    currentWizard = null;
    wizardStepIndex = 0;
    wizardStepResults = {};
    wizardStepRuntimeValues = {};
    wizardStepPanes = new Map();
    wizardResultStepLabel = '';
    if (wizardStepperEl) {
        wizardStepperEl.innerHTML = '';
        wizardStepperEl.classList.add('hidden');
    }
    syncWizardFooterButtons();
}

function syncWizardFooterButtons() {
    if (!btnWizardPrev || !btnWizardNext || !btnExecute) return;
    if (!isWizardModule()) {
        btnWizardPrev.classList.add('hidden');
        btnWizardNext.classList.add('hidden');
        btnExecute.classList.remove('hidden');
        if (wizardFooterDivider) {
            wizardFooterDivider.classList.add('hidden');
        }
        return;
    }
    const uiCount = wizardUiStepCount();
    const onSummary = isOnWizardSummaryStep();
    const lastUi = wizardStepIndex >= uiCount - 1;
    const showExecute = onSummary || (!hasWizardSummaryStep() && lastUi);
    btnWizardPrev.classList.toggle('hidden', wizardStepIndex <= 0);
    btnWizardNext.classList.toggle('hidden', showExecute);
    btnExecute.classList.toggle('hidden', !showExecute);
    if (wizardFooterDivider) {
        wizardFooterDivider.classList.toggle('hidden', !isWizardModule());
    }
}

function renderWizardStepper() {
    if (!wizardStepperEl || !isWizardModule()) return;
    const steps = currentWizard.steps;
    const uiSteps = steps.slice();
    if (hasWizardSummaryStep()) {
        uiSteps.push(getWizardSummaryStepMeta());
    }
    const current = getCurrentWizardStepMeta();
    wizardStepperEl.innerHTML = '';
    wizardStepperEl.classList.remove('hidden');

    const summary = document.createElement('p');
    summary.className = 'wizard-stepper-summary';
    const currentLabel = current ? wizardStepDisplayLabel(current) : '';
    summary.innerHTML = `Etapa <strong>${wizardStepIndex + 1}</strong> de <strong>${uiSteps.length}</strong>${currentLabel ? ` - <strong>${escapeHtml(currentLabel)}</strong>` : ''}`;
    wizardStepperEl.appendChild(summary);

    const track = document.createElement('div');
    track.className = 'wizard-stepper-track';
    track.setAttribute('role', 'list');

    uiSteps.forEach((step, idx) => {
        const isComplete = idx < wizardStepIndex;
        const isCurrent = idx === wizardStepIndex;
        const labelText = wizardStepDisplayLabel(step);

        const item = document.createElement(isComplete ? 'button' : 'div');
        item.className = 'wizard-stepper-item';
        if (isComplete) {
            item.type = 'button';
            item.classList.add('is-complete', 'is-clickable');
            item.setAttribute('aria-label', `Voltar para etapa ${idx + 1}: ${labelText}`);
            item.title = `Voltar para: ${labelText}`;
            item.addEventListener('click', () => goToWizardStep(idx));
        } else {
            item.setAttribute('role', 'listitem');
        }
        if (isCurrent) item.classList.add('is-current');

        const circle = document.createElement('div');
        circle.className = 'wizard-step-circle';
        if (isComplete) {
            circle.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        } else {
            circle.textContent = String(idx + 1);
        }
        if (isCurrent) {
            circle.setAttribute('aria-current', 'step');
        }

        const label = document.createElement('span');
        label.className = 'wizard-step-label';
        label.textContent = labelText;
        if (isComplete) {
            label.setAttribute('aria-hidden', 'true');
        }

        item.appendChild(circle);
        item.appendChild(label);
        track.appendChild(item);
    });

    wizardStepperEl.appendChild(track);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateWizardStepVisibility() {
    if (!isWizardModule()) return;
    const current = getCurrentWizardStepMeta();
    wizardStepPanes.forEach((pane, stepId) => {
        const show = current && current.id === stepId;
        pane.classList.toggle('hidden', !show);
    });
    if (isOnWizardSummaryStep()) {
        gridContainer.classList.add('hidden');
        currentQueryResult = null;
        void renderWizardSummary();
    }
    refreshInterpolatedTexts();
    syncWizardFooterButtons();
}

function setupWizardPanes() {
    wizardStepPanes = new Map();
    if (!isWizardModule()) {
        if (wizardStepperEl) {
            wizardStepperEl.classList.add('hidden');
            wizardStepperEl.innerHTML = '';
        }
        return;
    }
    currentWizard.steps.forEach((step) => {
        const pane = document.createElement('div');
        pane.className = 'wizard-step-pane hidden';
        pane.id = `wizard-pane-${step.id}`;
        pane.dataset.stepId = step.id;
        dynamicForm.appendChild(pane);
        wizardStepPanes.set(step.id, pane);
    });
    if (hasWizardSummaryStep()) {
        const summaryPane = document.createElement('div');
        summaryPane.className = 'wizard-step-pane hidden';
        summaryPane.id = `wizard-pane-${WIZARD_SUMMARY_STEP_ID}`;
        summaryPane.dataset.stepId = WIZARD_SUMMARY_STEP_ID;
        dynamicForm.appendChild(summaryPane);
        wizardStepPanes.set(WIZARD_SUMMARY_STEP_ID, summaryPane);
    }
    wizardStepIndex = 0;
    wizardStepResults = {};
}

function wizardFieldMount(field) {
    if (!isWizardModule()) return dynamicForm;
    const stepId = field.stepId || field.step_id;
    if (stepId && wizardStepPanes.has(stepId)) {
        return wizardStepPanes.get(stepId);
    }
    const names = getCurrentWizardStepMeta()?.fieldNames;
    if (names && names.includes(field.field)) {
        const step = currentWizard.steps.find(s => (s.fieldNames || []).includes(field.field));
        if (step && wizardStepPanes.has(step.id)) {
            return wizardStepPanes.get(step.id);
        }
    }
    return dynamicForm;
}

function getWizardPaneForStep(stepId) {
    return wizardStepPanes.get(stepId) || null;
}

function validateWizardStepAt(index) {
    if (isWizardSummaryIndex(index)) return true;
    const step = getWizardStepMeta(index);
    if (!step) return true;
    const pane = getWizardPaneForStep(step.id);
    if (!pane) return true;
    const controls = pane.querySelectorAll('input, select, textarea');
    for (const control of controls) {
        if (!control.checkValidity()) {
            control.reportValidity();
            return false;
        }
    }
    return true;
}

function setWizardResultTitle(label) {
    wizardResultStepLabel = label || '';
    const gridTitle = document.getElementById('grid-title');
    if (gridTitle && wizardResultStepLabel) {
        gridTitle.innerText = `Resultados - ${wizardResultStepLabel}`;
    }
}

function restoreWizardStepResult(stepId) {
    const cached = wizardStepResults[stepId];
    if (!cached) {
        gridContainer.classList.add('hidden');
        currentQueryResult = null;
        return;
    }
    const step = currentWizard.steps.find(s => s.id === stepId);
    setWizardResultTitle(step ? wizardStepDisplayLabel(step) : '');
    void renderQueryResult(cached.data, cached.duration);
}

async function runWizardStepQuery(stepMeta) {
    const payload = collectFormValues(false);
    await executeQuery(payload, {
        stepId: stepMeta.id,
        stepLabel: wizardStepDisplayLabel(stepMeta),
        skipButtonLock: true
    });
    if (currentQueryResult) {
        wizardStepResults[stepMeta.id] = {
            data: currentQueryResult,
            duration: null
        };
        const row = currentQueryResult.rows?.[0];
        if (row && typeof row === 'object') {
            Object.keys(row).forEach((key) => {
                const val = row[key];
                if (val !== undefined && val !== null) {
                    wizardStepRuntimeValues[key] = val;
                }
            });
            refreshInterpolatedTexts();
        }
    }
}

async function handleWizardNext() {
    if (!isWizardModule() || wizardNavBusy || isFormExecutionBusy()) return;
    if (!validateWizardStepAt(wizardStepIndex)) return;

    const step = getCurrentWizardStepMeta();
    if (!step || step.id === WIZARD_SUMMARY_STEP_ID) return;

    wizardNavBusy = true;
    if (btnWizardNext) btnWizardNext.disabled = true;

    try {
        if (step.hasQuery) {
            await runWizardStepQuery(step);
            if (currentQueryResult?.messages?.length) {
                await drainRuntimeMessages(currentQueryResult);
            }
        }
        const mayLeave = await drainStaticMessages('exit', step.id, { allowCancel: true });
        if (!mayLeave) return;
        if (wizardStepIndex < wizardUiStepCount() - 1) {
            wizardStepIndex += 1;
            updateWizardStepVisibility();
            const next = getCurrentWizardStepMeta();
            if (next && next.id !== WIZARD_SUMMARY_STEP_ID) {
                await drainStaticMessages('enter', next.id);
            }
        }
    } finally {
        wizardNavBusy = false;
        if (btnWizardNext) btnWizardNext.disabled = false;
        syncFormExecutionLockState();
    }
}

function handleWizardPrev() {
    if (!isWizardModule() || wizardStepIndex <= 0) return;
    goToWizardStep(wizardStepIndex - 1);
}

function goToWizardStep(targetIndex) {
    if (!isWizardModule() || wizardNavBusy) return;
    if (targetIndex < 0 || targetIndex >= wizardUiStepCount()) return;
    if (targetIndex >= wizardStepIndex) return;

    wizardStepIndex = targetIndex;
    updateWizardStepVisibility();
    const step = getCurrentWizardStepMeta();
    if (step && step.id !== WIZARD_SUMMARY_STEP_ID) {
        restoreWizardStepResult(step.id);
        void drainStaticMessages('enter', step.id);
    }
}

async function openModuleSqlEditorOnLoadFailure(queryPath, moduleKind = 'sql') {
    if (!queryPath || typeof adminCanEditSql !== 'function' || !adminCanEditSql()) {
        return false;
    }
    if (typeof window.openSqlEditor !== 'function') {
        return false;
    }
    const kind = normalizeModuleKind(moduleKind);
    currentQueryPath = queryPath;
    currentQueryKind = kind;
    window.sqlformysActiveQueryPath = queryPath;
    window.sqlformysActiveQueryKind = kind;
    currentFields = [];
    currentQueryLookups = {};
    currentWizard = null;
    await window.openSqlEditor(API_BASE_URL, queryPath, undefined, kind);
    return true;
}

async function loadFormFields(queryPath, moduleTitle, moduleKind = 'sql') {
    if (isFormExecutionBusy()) {
        const canLeave = await confirmAbortFormExecutionAndLeave();
        if (!canLeave) return;
    }
    if (typeof confirmCloseSqlEditorIfNeeded === 'function') {
        const canProceed = await confirmCloseSqlEditorIfNeeded();
        if (!canProceed) return;
    } else if (typeof closeSqlEditor === 'function') {
        closeSqlEditor();
    }
    document.getElementById('sql-editor-container')?.classList.add('hidden');
    try {
        const kind = normalizeModuleKind(moduleKind);
        const response = await apiFetch(queriesApiUrl(queryPath, kind));
        if (!response.ok) throw new Error('Falha ao carregar campos do formulário');
        
        const data = await response.json();
        const resolvedKind = normalizeModuleKind(data.kind || kind);
        const fields = data.fields || [];
        const description = data.description || '';
        const executeMode = data.executeMode || '';
        const server = resolvedKind === 'sql' ? (data.server || '') : '';
        const timeout = data.timeout || 60;
        const defaultResultType = resolvedKind === 'sql' ? 'GRID' : 'TEXT';
        currentResultType = String(data.resultType || defaultResultType).toUpperCase();
        
        currentQueryPath = queryPath;
        currentQueryKind = resolvedKind;
        window.sqlformysActiveQueryPath = queryPath;
        window.sqlformysActiveQueryKind = resolvedKind;
        currentFields = fields;
        currentQueryLookups = data.lookups || {};
        currentWizard = data.wizard || null;
        currentConfirm = data.confirm || null;
        currentModuleMessages = Array.isArray(data.messages) ? data.messages : [];
        wizardSummaryCanExecute = null;
        wizardSummaryGateMessage = '';
        wizardStepIndex = 0;
        wizardStepResults = {};
        wizardStepRuntimeValues = {};
        wizardResultStepLabel = '';

        resetResultDocumentView();
        renderForm(queryPath, moduleTitle, fields, description, executeMode, server, timeout, currentResultType);
        
        // Esconder empty state e grid antiga, mostrar form
        emptyState.classList.add('hidden');
        gridContainer.classList.add('hidden');
        formContainer.classList.remove('hidden');
        if (typeof syncResultPinButton === 'function') {
            syncResultPinButton(null);
        }
        if (typeof syncFormPinsDock === 'function') {
            syncFormPinsDock();
        }

        void afterModuleFormReady();

        if (executeMode.toUpperCase() === 'AUTO' && !isWizardModule() && !currentConfirm) {
            handleExecute();
        }

    } catch (error) {
        console.error(error);
        const openedEditor = await openModuleSqlEditorOnLoadFailure(queryPath, moduleKind);
        if (openedEditor) {
            showToast(
                'Módulo com erro',
                'Não foi possível carregar o formulário deste módulo. O editor foi aberto para correção; a execução permanece indisponível até o arquivo ser corrigido.',
                'warning'
            );
        } else {
            showToast('Erro', 'Falha ao carregar os campos do módulo selecionado.', 'error');
        }
    }
}

function createApiError(errorText, fallbackMessage) {
    let errorMessage = errorText;
    let debugQuery;
    try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error) {
            errorMessage = errorJson.error;
        }
        if (errorJson.debug_query) {
            debugQuery = errorJson.debug_query;
        }
    } catch (_e) {
        // mantém texto puro
    }
    const err = new Error(errorMessage || fallbackMessage);
    if (debugQuery) {
        err.debugQuery = debugQuery;
    }
    return err;
}

async function executeQuery(payload, options = {}) {
    if (isFormExecutionBusy()) {
        return;
    }
    const skipExecuteLabel = options.skipButtonLock === true;
    const stepId = options.stepId || '';
    const stepLabel = options.stepLabel || '';
    const wizardFinal = options.wizardFinal === true;

    if (!skipExecuteLabel && btnExecute) {
        formExecuteButtonLabel = btnExecute.innerText || 'Executar';
    }

    beginFormExecution();
    const requestSignal = activeFormExecutionAbort ? activeFormExecutionAbort.signal : undefined;

    currentQueryResult = null;
    currentExecutionDurationMs = null;
    if (typeof syncResultPinButton === 'function') {
        syncResultPinButton(null);
    }

    // Limpar tempo de execução anterior
    const executionTimeEl = document.getElementById('execution-time');
    if (executionTimeEl) {
        executionTimeEl.innerHTML = '';
        executionTimeEl.classList.add('hidden');
    }

    const startTime = performance.now();

    try {
        const response = await apiFetch(queriesExecuteUrl(currentQueryPath, currentQueryKind, stepId, '', wizardFinal), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: requestSignal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw createApiError(errorText, 'Erro ao processar a requisição');
        }

        const result = await response.json();
        const endTime = performance.now();
        const duration = endTime - startTime;
        currentExecutionDurationMs = duration;

        // Tentar formatar a resposta se for JSON para a notificação
        let msg = result.message || 'Operação realizada com sucesso.';
        showToast('Sucesso', msg, 'success', { context: currentQueryPath || undefined });

        if (stepLabel) {
            setWizardResultTitle(stepLabel);
        }
        await renderQueryResult(result, duration);

    } catch (error) {
        if (error && error.name === 'AbortError') {
            showToast('Execução cancelada', 'A execução foi interrompida.', 'info', { context: currentQueryPath || undefined });
            throw error;
        }
        console.error(error);
        const errMsg = error.message || 'Erro ao processar a requisição';
        showToast('Erro de Execução', errMsg, 'error', {
            context: currentQueryPath || undefined,
            debugQuery: error.debugQuery,
            debugKind: normalizeModuleKind(currentQueryKind),
        });
        throw error;
    } finally {
        endFormExecution();
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

function treeShModuleIconMarkup(inlineStyle = '') {
    const styleAttr = inlineStyle ? ` style="${inlineStyle}"` : '';
    return `<svg class="tree-icon module-icon sh-module-icon"${styleAttr} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="4 17 10 11 4 5"></polyline>
        <line x1="12" y1="19" x2="20" y2="19"></line>
    </svg>`;
}

function treePs1ModuleIconMarkup(inlineStyle = '') {
    const styleAttr = inlineStyle ? ` style="${inlineStyle}"` : '';
    return `<svg class="tree-icon module-icon ps1-module-icon"${styleAttr} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
        <line x1="6" y1="8" x2="10" y2="8"></line>
        <line x1="6" y1="12" x2="14" y2="12"></line>
        <path d="M15 7h3v3h-3z"></path>
    </svg>`;
}

function treeModuleIconMarkup(kind, inlineStyle = '') {
    const k = normalizeModuleKind(kind);
    if (k === 'sh') return treeShModuleIconMarkup(inlineStyle);
    if (k === 'ps1') return treePs1ModuleIconMarkup(inlineStyle);
    return treeSqlModuleIconMarkup(inlineStyle);
}

function renderTree(nodes, container, isSearching = false) {
    container.innerHTML = ''; // Limpar loading state

    if (typeof isAdminUser === 'function' && isAdminUser()) {
        if (typeof appendTreeAdminRootBar === 'function') {
            appendTreeAdminRootBar(container, API_BASE_URL);
        }
    }

    if (!nodes || nodes.length === 0) {
        if (container.children.length === 0) {
            container.innerHTML = '<div class="loading-state">Nenhum módulo encontrado.</div>';
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
                if (node.library) {
                    folderHeader.classList.add('tree-folder-library');
                }
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
                const folderIcon = node.library
                    ? `<svg class="tree-icon folder-icon library-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>`
                    : `<svg class="tree-icon folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>`;
                folderHeader.innerHTML = `
                    ${folderIcon}
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
                    attachFolderAdminActions(folderHeader, folderRel, node.name, API_BASE_URL, !!node.library);
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
                moduleLink.dataset.kind = normalizeModuleKind(node.kind);
                moduleLink.style.paddingLeft = `${16 + (level * 16)}px`;
                moduleLink.setAttribute('data-tooltip', node.name);
                
                const isFav = getFavorites().includes(node.path);
                const isActive = (node.path === currentQueryPath);
                if (isActive) {
                    moduleLink.classList.add('active');
                }
                
                moduleLink.innerHTML = `
                    <div class="tree-module-info">
                        ${treeModuleIconMarkup(node.kind)}
                        <span class="tree-title">${node.name}</span>
                    </div>
                    <button class="favorite-btn ${isFav ? 'is-favorite' : ''}" data-tooltip="${isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                    </button>
                `;

                if (typeof attachModuleEditAction === 'function') {
                    attachModuleEditAction(moduleLink, node.path, node.kind, API_BASE_URL);
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
                    loadFormFields(node.path, node.name, node.kind);
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
    if (!match) return null;
    const inner = match[1].trim();
    const comma = inner.indexOf(',');
    return (comma >= 0 ? inner.slice(0, comma) : inner).trim() || null;
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

const INTERPOLATE_TOKEN_RE = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

function getKnownFormFieldNames() {
    const names = (currentFields || []).map(field => field.field);
    Object.keys(wizardStepRuntimeValues || {}).forEach((key) => {
        if (!names.includes(key)) {
            names.push(key);
        }
    });
    return names;
}

function interpolateTemplate(text, values, knownFields) {
    const template = text == null ? '' : String(text);
    if (!template.includes('{{')) {
        return template;
    }
    const known = new Set(knownFields || getKnownFormFieldNames());
    return template.replace(INTERPOLATE_TOKEN_RE, (match, name) => {
        if (!known.has(name)) {
            return match;
        }
        if (!values || values[name] === undefined || values[name] === null) {
            return '';
        }
        return String(values[name]);
    });
}

function wizardStepDisplayLabel(step) {
    if (!step) return '';
    const raw = step.label || step.id || '';
    return interpolateTemplate(raw, collectFormValues(true), getKnownFormFieldNames());
}

function formatWizardFieldDisplayValue(field) {
    if (!field) return '—';
    const typeUpper = String(field.type || '').toUpperCase();
    if (typeUpper === 'CHAR' && field.size === 1) {
        const radioSim = document.getElementById(`field_${field.field}_S`);
        const radioNao = document.getElementById(`field_${field.field}_N`);
        if (radioSim?.checked) return 'Sim';
        if (radioNao?.checked) return 'Não';
        return '—';
    }
    const select = document.getElementById(`field_${field.field}`);
    if (select && select.tagName === 'SELECT') {
        if (select.multiple) {
            const texts = Array.from(select.selectedOptions)
                .filter(opt => opt.value !== '')
                .map(opt => opt.text);
            return texts.length ? texts.join(', ') : '—';
        }
        const opt = select.selectedOptions[0];
        if (!opt || opt.value === '') return '—';
        return opt.text || opt.value;
    }
    const input = document.getElementById(`field_${field.field}`);
    if (input) {
        const raw = input.value;
        if (raw === '' || raw === undefined || raw === null) return '—';
        return String(raw);
    }
    const values = collectFormValues(true);
    const val = values[field.field];
    if (val === undefined || val === null || String(val).trim() === '') return '—';
    return String(val);
}

function findWizardFieldByName(fieldName) {
    const key = String(fieldName || '').toUpperCase();
    return currentFields.find(f => String(f.field || '').toUpperCase() === key) || null;
}

function appendWizardSummaryTable(parent, fields) {
    const table = document.createElement('table');
    table.className = 'wizard-review-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th scope="col">Campo</th><th scope="col">Valor</th></tr>';
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    const values = collectFormValues(true);
    const known = getKnownFormFieldNames();
    fields.forEach((field) => {
        const tr = document.createElement('tr');
        const labelTd = document.createElement('td');
        labelTd.className = 'wizard-review-label';
        labelTd.textContent = interpolateTemplate(field.label || field.field, values, known);
        const valueTd = document.createElement('td');
        valueTd.className = 'wizard-review-value';
        valueTd.textContent = formatWizardFieldDisplayValue(field);
        tr.appendChild(labelTd);
        tr.appendChild(valueTd);
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    parent.appendChild(table);
}

function appendWizardSummaryQueryGrid(parent, resultData) {
    const columns = Array.isArray(resultData?.columns) ? resultData.columns : [];
    const rows = Array.isArray(resultData?.rows) ? resultData.rows : [];
    if (!columns.length || !rows.length) {
        const empty = document.createElement('p');
        empty.className = 'wizard-review-empty';
        empty.textContent = 'Nenhum registro para exibir.';
        parent.appendChild(empty);
        return;
    }
    const table = document.createElement('table');
    table.className = 'wizard-review-table data-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    columns.forEach((col) => {
        const th = document.createElement('th');
        th.scope = 'col';
        th.textContent = col;
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach((row) => {
        const tr = document.createElement('tr');
        columns.forEach((col) => {
            const td = document.createElement('td');
            td.textContent = formatGridCellForDisplay(row[col]);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    parent.appendChild(table);
}

async function fetchNamedQueryPreview(queryName) {
    const response = await apiFetch(
        queriesExecuteUrl(currentQueryPath, currentQueryKind, '', queryName),
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(collectFormValues(true))
        }
    );
    if (!response.ok) {
        const errorText = await response.text();
        throw createApiError(errorText, 'Falha ao carregar preview da QUERY');
    }
    return response.json();
}

async function renderWizardSummary() {
    const pane = getWizardPaneForStep(WIZARD_SUMMARY_STEP_ID);
    if (!pane || !isWizardModule()) return;
    pane.innerHTML = '';
    wizardSummaryCanExecute = null;
    wizardSummaryGateMessage = '';

    const wrap = document.createElement('div');
    wrap.className = 'wizard-review';
    const intro = document.createElement('p');
    intro.className = 'wizard-review-intro';
    intro.textContent = 'Revise os dados antes de executar.';
    wrap.appendChild(intro);

    const summaryQueryName = String(currentWizard.summary?.queryName || '').trim();
    const validateQueryName = String(currentWizard.summary?.validateQueryName || '').trim();
    const gateBannerHost = document.createElement('div');
    gateBannerHost.className = 'wizard-summary-gate-host';
    wrap.appendChild(gateBannerHost);

    const showGateBanner = () => {
        if (wizardSummaryCanExecute !== false || !wizardSummaryGateMessage) return;
        const banner = document.createElement('div');
        banner.className = 'wizard-summary-gate-banner';
        banner.setAttribute('role', 'status');
        banner.textContent = interpolateTemplate(
            wizardSummaryGateMessage,
            collectFormValues(true),
            getKnownFormFieldNames()
        );
        gateBannerHost.appendChild(banner);
    };

    if (summaryQueryName || validateQueryName) {
        const section = document.createElement('section');
        section.className = 'wizard-review-section';
        const loading = document.createElement('p');
        loading.className = 'wizard-review-loading';
        loading.textContent = 'Carregando…';
        section.appendChild(loading);
        wrap.appendChild(section);
        try {
            const [previewData, validateData] = await Promise.all([
                summaryQueryName ? fetchNamedQueryPreview(summaryQueryName) : Promise.resolve(null),
                validateQueryName ? fetchNamedQueryPreview(validateQueryName) : Promise.resolve(null),
            ]);
            loading.remove();
            if (previewData && summaryQueryName) {
                appendWizardSummaryQueryGrid(section, previewData);
            } else {
                section.remove();
            }
            applyWizardSummaryExecuteGate(previewData, validateData);
            showGateBanner();
        } catch (err) {
            if (section.isConnected) {
                loading.textContent = err?.message || 'Não foi possível carregar a consulta de resumo.';
            }
            if (validateQueryName) {
                wizardSummaryCanExecute = false;
                wizardSummaryGateMessage = err?.message || 'Falha na validação.';
                syncFormExecutionLockState();
                showGateBanner();
            }
        }
        if (summaryQueryName) {
            pane.appendChild(wrap);
            return;
        }
    }

    const summarySubset = Array.isArray(currentWizard.summary?.fieldNames)
        ? currentWizard.summary.fieldNames
        : [];

    if (summarySubset.length > 0) {
        const section = document.createElement('section');
        section.className = 'wizard-review-section';
        const fields = summarySubset
            .map(name => findWizardFieldByName(name))
            .filter(f => f && !isContextField(f) && !f.hidden);
        if (fields.length) {
            appendWizardSummaryTable(section, fields);
            wrap.appendChild(section);
        }
    } else {
        currentWizard.steps.forEach((stepMeta) => {
            const stepFields = currentFields.filter((f) => {
                if (isContextField(f) || f.hidden) return false;
                const sid = f.stepId || f.step_id;
                return sid === stepMeta.id || (stepMeta.fieldNames || []).includes(f.field);
            });
            if (!stepFields.length) return;

            const section = document.createElement('section');
            section.className = 'wizard-review-section';
            const heading = document.createElement('h3');
            heading.className = 'wizard-review-step-title';
            heading.textContent = wizardStepDisplayLabel(stepMeta);
            section.appendChild(heading);
            appendWizardSummaryTable(section, stepFields);
            wrap.appendChild(section);
        });
    }
    pane.appendChild(wrap);
    if (!validateQueryName && !summaryQueryName) {
        wizardSummaryCanExecute = null;
        syncFormExecutionLockState();
    } else if (validateQueryName && wizardSummaryCanExecute === null) {
        showGateBanner();
    }
}

function refreshInterpolatedTexts() {
    const values = collectFormValues(true);
    const known = getKnownFormFieldNames();
    dynamicForm.querySelectorAll('[data-label-template]').forEach(el => {
        el.textContent = interpolateTemplate(el.dataset.labelTemplate, values, known);
    });
    dynamicForm.querySelectorAll('[data-tooltip-template]').forEach(el => {
        const resolved = interpolateTemplate(el.dataset.tooltipTemplate, values, known);
        el.setAttribute('data-tooltip', resolved);
        el.setAttribute('aria-label', resolved ? `Informações: ${resolved}` : 'Informações do campo');
    });
    const gateBanner = dynamicForm.querySelector('.wizard-summary-gate-banner');
    if (gateBanner && wizardSummaryGateMessage) {
        gateBanner.textContent = interpolateTemplate(wizardSummaryGateMessage, values, known);
    }
    if (isWizardModule()) {
        renderWizardStepper();
    }
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

    const runtime = wizardStepRuntimeValues || {};
    Object.keys(runtime).forEach((key) => {
        const val = runtime[key];
        if (val === undefined || val === null) return;
        if (includeEmpty || String(val).trim() !== '') {
            payload[key] = val;
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

    refreshInterpolatedTexts();

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
        const response = await apiFetch(`${API_BASE_URL}/lookups/${currentQueryPath}?name=${encodeURIComponent(lookupName)}&field=${encodeURIComponent(select.name)}&kind=${encodeURIComponent(normalizeModuleKind(currentQueryKind))}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(collectFormValues(true))
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw createApiError(errorText, 'Falha ao carregar opções do lookup');
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
        showToast('Erro', error.message || 'Não foi possível carregar as opções do lookup.', 'error', {
            context: currentQueryPath || undefined,
            debugQuery: error.debugQuery,
            debugKind: normalizeModuleKind(currentQueryKind),
        });
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
        const kind = window.sqlformysActiveQueryKind || currentQueryKind || 'sql';
        void window.openSqlEditor(API_BASE_URL, queryPath, undefined, kind);
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
        btn.setAttribute('aria-label', 'Editar módulo');
        btn.setAttribute('data-tooltip', 'Editar módulo');
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

        const moduleKind = normalizeModuleKind(currentQueryKind);
        if (moduleKind !== 'sql') {
            const kindBadge = document.createElement('span');
            kindBadge.className = `meta-badge module-kind kind-${moduleKind}`;
            const label = moduleKind === 'sh' ? 'Shell' : 'PowerShell';
            kindBadge.textContent = `Tipo: ${label}`;
            metaContainer.appendChild(kindBadge);
            hasMeta = true;
        }

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

    if (typeof syncFormPinsDock === 'function') {
        syncFormPinsDock();
    }

    syncFormModuleEditButton(queryPath);
    if (typeof window.updateFormModuleEditAction === 'function') {
        window.updateFormModuleEditAction(queryPath, API_BASE_URL);
    }

    // Limpar form
    dynamicForm.innerHTML = '';
    setupWizardPanes();

    formExecuteButtonLabel = 'Executar';
    if (!isFormExecutionBusy()) {
        btnExecute.disabled = false;
        btnExecute.innerText = 'Executar';
    }
    syncExecuteConfirmButtonStyle();

    const visibleFields = (fields || []).filter(field => !isContextField(field));
    if (!fields || fields.length === 0) {
        dynamicForm.innerHTML = '<p class="form-text">Nenhum campo retornado pela API para este módulo.</p>';
        syncWizardFooterButtons();
        return;
    }
    if (visibleFields.length === 0) {
        dynamicForm.innerHTML = '<p class="form-text">Este módulo não possui campos editáveis.</p>';
        syncWizardFooterButtons();
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
        labelText.className = 'field-label-text';
        labelText.dataset.labelTemplate = field.label || '';
        labelText.textContent = field.label || '';
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
            infoSpan.dataset.tooltipTemplate = field.information;
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
            wizardFieldMount(field).appendChild(group);
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
            wizardFieldMount(field).appendChild(group);
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
        wizardFieldMount(field).appendChild(group);
    });

    snapshotFormControlValues();
    void preloadLookupSelectLabels();
    if (isWizardModule()) {
        updateWizardStepVisibility();
    } else {
        refreshInterpolatedTexts();
        if (wizardStepperEl) {
            wizardStepperEl.classList.add('hidden');
            wizardStepperEl.innerHTML = '';
        }
        syncWizardFooterButtons();
    }
}

/* ==========================================================================
   Ações dos Botões do Formulário
   ========================================================================== */
async function handleCancel() {
    if (isFormExecutionBusy()) {
        const canLeave = await confirmAbortFormExecutionAndLeave();
        if (!canLeave) return;
    }
    syncFormModuleEditButton(null);
    formContainer.classList.add('hidden');
    gridContainer.classList.add('hidden');
    emptyState.classList.remove('hidden');
    
    // Remover classe ativa do menu lateral e favoritos
    document.querySelectorAll('.module-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.favorite-item').forEach(item => item.classList.remove('active'));
    
    currentQueryPath = null;
    currentQueryKind = 'sql';
    window.sqlformysActiveQueryKind = 'sql';
    window.sqlformysActiveQueryPath = '';
    currentFields = [];
    currentQueryLookups = {};
    currentModuleMessages = [];
    currentQueryResult = null;
    currentResultType = 'GRID';
    resetWizardState();
    resetResultDocumentView();
    currentExecutionDurationMs = null;
    if (typeof syncResultPinButton === 'function') {
        syncResultPinButton(null);
    }
    if (typeof syncFormPinsDock === 'function') {
        syncFormPinsDock();
    }
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

    const stepMeta = isWizardModule() ? getCurrentWizardStepMeta() : null;
    const fieldFilter = stepMeta
        ? (field) => !isContextField(field) && ((field.stepId || field.step_id) === stepMeta.id || (stepMeta.fieldNames || []).includes(field.field))
        : (field) => true;
    
    currentFields.forEach(field => {
        if (!fieldFilter(field)) return;
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
    refreshInterpolatedTexts();
}

function userMessageModalCopy(meta) {
    const type = String((meta && meta.type) || 'WARNING').toUpperCase();
    const custom = meta && meta.message ? String(meta.message).trim() : '';
    const body = custom
        ? interpolateTemplate(custom, collectFormValues(true), getKnownFormFieldNames())
        : '';
    const titles = { CONFIRM: 'Confirmar', WARNING: 'Atenção', DANGER: 'Cuidado' };
    const tones = { CONFIRM: 'confirm', WARNING: 'warning', DANGER: 'danger' };
    return {
        title: titles[type] || titles.WARNING,
        body: body || ' ',
        tone: tones[type] || tones.WARNING,
    };
}

function filterStaticMessages(when, stepId) {
    return (currentModuleMessages || []).filter((m) => {
        if (String(m.when || '').toLowerCase() !== String(when).toLowerCase()) return false;
        if (when === 'enter' || when === 'exit') {
            return String(m.stepId || '') === String(stepId || '');
        }
        return true;
    });
}

function promptUserMessage(meta, options = {}) {
    const allowCancel = options.allowCancel === true;
    if (typeof openAppModal !== 'function') {
        return Promise.resolve(true);
    }
    const copy = userMessageModalCopy(meta);
  const primaryLabel = options.primaryLabel || (allowCancel ? 'Continuar' : 'OK');
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        openAppModal({
            title: copy.title,
            body: copy.body,
            primaryLabel,
            secondaryLabel: allowCancel ? 'Cancelar' : '',
            hideSecondary: !allowCancel,
            tone: copy.tone,
            onPrimary: async () => {
                finish(true);
                return true;
            },
            onSecondary: async () => {
                finish(false);
            },
        });
    });
}

async function drainStaticMessages(when, stepId, options = {}) {
    const list = filterStaticMessages(when, stepId);
    const whenNorm = String(when).toLowerCase();
    const hardBlockWhen = whenNorm === 'exit' || whenNorm === 'finish';

    for (const msg of list) {
        let effective = msg;
        let skip = false;
        let validationFailed = false;

        const validateName = String(msg.validateQueryName || msg.ValidateQueryName || '').trim();
        if (validateName) {
            try {
                const validateData = await fetchNamedQueryPreview(validateName);
                const canExec = resolveSummaryCanExecuteFromResult(validateData, true);
                const runtime = validateData?.messages?.[0];
                const runtimeText = String(runtime?.message || '').trim();
                const hasRuntimeText = runtimeText !== '';
                if (canExec === true && !hasRuntimeText) {
                    // Validação OK sem solicitação dinâmica: não exibe o texto estático (CONFIRM etc.)
                    skip = true;
                } else if (canExec !== true) {
                    validationFailed = true;
                    const rt = String(runtime?.type || '').toUpperCase();
                    const validTypes = { CONFIRM: 1, WARNING: 1, DANGER: 1 };
                    effective = {
                        ...msg,
                        type: validTypes[rt] ? rt : 'WARNING',
                        message: runtimeText || 'Validação não permitiu continuar.',
                    };
                } else {
                    effective = mergeValidatedUserMessage(msg, validateData);
                }
            } catch (err) {
                validationFailed = true;
                effective = {
                    ...msg,
                    type: 'WARNING',
                    message: err?.message || 'Falha na validação.',
                };
            }
        }

        if (skip) continue;

        const allowCancel = options.allowCancel === true || whenNorm === 'exit' || whenNorm === 'finish';
        const promptAllowCancel = validationFailed ? false : allowCancel;
        const ok = await promptUserMessage(effective, { allowCancel: promptAllowCancel });

        if (validationFailed && hardBlockWhen) {
            return false;
        }
        if (!ok) return false;
    }
    return true;
}

async function drainRuntimeMessages(result) {
    const msgs = result?.messages || [];
    for (const msg of msgs) {
        await promptUserMessage(msg, { allowCancel: false });
    }
}

async function afterModuleFormReady() {
    await drainStaticMessages('load');
    if (isWizardModule()) {
        const step = getCurrentWizardStepMeta();
        if (step && step.id !== WIZARD_SUMMARY_STEP_ID) {
            await drainStaticMessages('enter', step.id);
        }
    }
}

function resolveSummaryCanExecuteFromResult(data, strictValidate) {
    if (!data) {
        return strictValidate ? false : null;
    }
    if (data.canExecute === true) return true;
    if (data.canExecute === false) return false;
    if (strictValidate) {
        return false;
    }
    return null;
}

function mergeValidatedUserMessage(staticMsg, validateData) {
    const runtime = validateData?.messages?.[0];
    const validTypes = { CONFIRM: 1, WARNING: 1, DANGER: 1 };
    let type = String(staticMsg?.type || 'WARNING').toUpperCase();
    if (runtime?.type) {
        const rt = String(runtime.type).toUpperCase();
        if (validTypes[rt]) type = rt;
    }
    const runtimeText = String(runtime?.message || '').trim();
    const message = runtimeText || String(staticMsg?.message || '').trim();
    return { ...staticMsg, type, message };
}

function applyWizardSummaryExecuteGate(previewData, validateData) {
    const validateName = String(currentWizard?.summary?.validateQueryName || '').trim();
    let allow = true;
    let gateMsg = '';
    if (validateName) {
        const verdict = resolveSummaryCanExecuteFromResult(validateData, true);
        if (verdict !== true) {
            allow = false;
            gateMsg = validateData?.messages?.[0]?.message
                || 'Validação não permitiu a execução.';
        }
    } else if (String(currentWizard?.summary?.queryName || '').trim()) {
        const verdict = resolveSummaryCanExecuteFromResult(previewData, false);
        if (verdict === false) {
            allow = false;
            gateMsg = previewData?.messages?.[0]?.message || 'Execução não permitida pelos dados do resumo.';
        }
    }
    wizardSummaryCanExecute = allow;
    wizardSummaryGateMessage = allow ? '' : gateMsg;
    syncFormExecutionLockState();
    return allow;
}

function defaultExecuteConfirmMessage(type) {
    const t = String(type || 'CONFIRM').toUpperCase();
    if (t === 'WARNING') return 'Esta ação pode ter efeitos indesejados. Deseja continuar?';
    if (t === 'DANGER') return 'Esta ação é destrutiva e pode não ser revertida. Deseja continuar?';
    return 'Deseja realmente executar este módulo?';
}

function executeConfirmModalCopy(meta) {
    const type = String((meta && meta.type) || 'CONFIRM').toUpperCase();
    const custom = meta && meta.message ? String(meta.message).trim() : '';
    const body = custom
        ? interpolateTemplate(custom, collectFormValues(true), getKnownFormFieldNames())
        : defaultExecuteConfirmMessage(type);
    const titles = { CONFIRM: 'Confirmar', WARNING: 'Atenção', DANGER: 'Cuidado' };
    const primaryLabels = { CONFIRM: 'Executar', WARNING: 'Executar', DANGER: 'Executar mesmo assim' };
    const tones = { CONFIRM: 'confirm', WARNING: 'warning', DANGER: 'danger' };
    return {
        title: titles[type] || titles.CONFIRM,
        body,
        primaryLabel: primaryLabels[type] || primaryLabels.CONFIRM,
        tone: tones[type] || tones.CONFIRM,
    };
}

function syncExecuteConfirmButtonStyle() {
    if (!btnExecute) return;
    btnExecute.classList.remove('execute-confirm-warning', 'execute-confirm-danger');
    const type = currentConfirm && currentConfirm.type
        ? String(currentConfirm.type).toUpperCase()
        : '';
    if (type === 'WARNING') {
        btnExecute.classList.add('execute-confirm-warning');
    } else if (type === 'DANGER') {
        btnExecute.classList.add('execute-confirm-danger');
    }
}

function promptExecuteConfirmation() {
    if (!currentConfirm) {
        return Promise.resolve(true);
    }
    if (typeof openAppModal !== 'function') {
        return Promise.resolve(true);
    }
    const copy = executeConfirmModalCopy(currentConfirm);
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        openAppModal({
            title: copy.title,
            body: copy.body,
            primaryLabel: copy.primaryLabel,
            secondaryLabel: 'Cancelar',
            tone: copy.tone,
            onPrimary: async () => {
                finish(true);
                return true;
            },
            onSecondary: async () => {
                finish(false);
            },
        });
    });
}

async function handleExecute() {
    if (isFormExecutionBusy()) return;
    const finishOk = await drainStaticMessages('finish', undefined, { allowCancel: true });
    if (!finishOk) return;
    if (isWizardModule()) {
        if (!validateWizardStepAt(wizardStepIndex)) return;
        if (isOnWizardSummaryStep() && wizardSummaryCanExecute === false) {
            const gateText = wizardSummaryGateMessage
                ? interpolateTemplate(
                    wizardSummaryGateMessage,
                    collectFormValues(true),
                    getKnownFormFieldNames()
                )
                : 'A validação do resumo não permite executar.';
            showToast('Execução bloqueada', gateText, 'warning');
            return;
        }
        const confirmed = await promptExecuteConfirmation();
        if (!confirmed) return;
        let step = getCurrentWizardStepMeta();
        if (isOnWizardSummaryStep()) {
            step = getLastWizardRealStepMeta();
        }
        if (!step) return;
        const wizardFinal = isOnWizardSummaryStep() && hasWizardSummaryStep();
        try {
            await executeQuery(collectFormValues(false), {
                stepId: step.id,
                stepLabel: wizardStepDisplayLabel(step),
                wizardFinal,
                suppressRuntimeMessages: true
            });
            wizardStepResults[step.id] = { data: currentQueryResult, duration: null };
            if (currentQueryResult?.messages?.length) {
                await drainRuntimeMessages(currentQueryResult);
            }
            focusResultCardIfReturned();
        } catch (_err) {
            // toast já exibido
        }
        return;
    }
    if (!dynamicForm.checkValidity()) {
        dynamicForm.reportValidity();
        return;
    }

    const confirmed = await promptExecuteConfirmation();
    if (!confirmed) return;
    try {
        await executeQuery(collectFormValues(false), { suppressRuntimeMessages: true });
        if (currentQueryResult?.messages?.length) {
            await drainRuntimeMessages(currentQueryResult);
        }
        focusResultCardIfReturned();
    } catch (_err) {
        // toast já exibido
    }
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

    const titleBase = wizardResultStepLabel ? `Resultados - ${wizardResultStepLabel}` : 'Resultados';
    if (term === '') {
        gridTitle.innerText = `${titleBase} (${totalCount.toLocaleString('pt-BR')})`;
    } else {
        gridTitle.innerText = `${titleBase} (${visibleCount.toLocaleString('pt-BR')} de ${totalCount.toLocaleString('pt-BR')})`;
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

function queryResultHasReturnedData(resultData) {
    if (!resultData) {
        return false;
    }
    const resultType = resolveResultType(resultData, currentResultType);
    if (resultType === 'GRID') {
        const rows = resultData.rows;
        return Array.isArray(rows) && rows.length > 0;
    }
    return joinResultColumnContent(resultData).trim().length > 0;
}

function focusResultCardIfReturned() {
    if (!queryResultHasReturnedData(currentQueryResult)) {
        return;
    }
    if (!gridContainer || gridContainer.classList.contains('hidden')) {
        return;
    }
    requestAnimationFrame(() => {
        gridContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        try {
            gridContainer.focus({ preventScroll: true });
        } catch {
            /* ignore */
        }
    });
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
        const titleBase = wizardResultStepLabel ? `Resultados - ${wizardResultStepLabel}` : 'Resultados';
        if (rowCount != null && rowCount > 0) {
            gridTitle.innerText = `${titleBase} (${rowCount.toLocaleString('pt-BR')})`;
        } else {
            gridTitle.innerText = titleBase;
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

async function renderQueryResult(resultData, duration = null) {
    currentQueryResult = resultData;
    const resultType = resolveResultType(resultData, currentResultType);
    gridContainer.classList.remove('hidden');

    if (resultType === 'GRID') {
        renderGrid(resultData, duration);
        pushActiveResultPinSync(duration);
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
        try {
            await renderResultByType(resultDocument, resultType, content);
        } catch (err) {
            console.error(err);
            showToast('Erro', 'Falha ao renderizar o resultado.', 'error');
        }
    }

    pushActiveResultPinSync(duration);
}

function pushActiveResultPinSync(duration = currentExecutionDurationMs) {
    if (typeof syncResultPinButton !== 'function') return;
    syncResultPinButton({
        queryPath: currentQueryPath,
        moduleTitle: formTitle ? formTitle.innerText : '',
        resultData: currentQueryResult,
        resultType: resolveResultType(currentQueryResult, currentResultType),
        durationMs: duration
    });
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
    const ids = ['users', 'users:padrao', 'users:administradores', 'modules'];
    const favContainer = document.getElementById('sidebar-favorites-container');
    if (favContainer && !favContainer.classList.contains('hidden')) {
        ids.push('favorites');
    }
    ids.push(...collectTreeFolderIds(allProjects));
    return ids;
}

function syncModulesAccordion() {
    if (modulesPanelEl && modulesToggleBtn && typeof syncSidebarFolderPanel === 'function') {
        syncSidebarFolderPanel(modulesPanelEl, modulesToggleBtn, 'modules');
    }
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
window.isFormExecutionBusy = isFormExecutionBusy;
window.confirmAbortFormExecutionAndLeave = confirmAbortFormExecutionAndLeave;

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

    if (modulesToggleBtn && modulesPanelEl) {
        modulesToggleBtn.addEventListener('click', () => {
            const open = !modulesPanelEl.classList.contains('open');
            if (typeof setSidebarFolderExpanded === 'function') {
                setSidebarFolderExpanded('modules', open);
            }
        });
        syncModulesAccordion();
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
                    ${treeModuleIconMarkup(moduleNode.kind, 'margin-right: 8px; width: 14px; height: 14px;')}
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
                loadFormFields(path, moduleNode.name, moduleNode.kind);
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
