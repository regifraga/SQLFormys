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
const toastContainer = document.getElementById('toast-container');
const searchInput = document.getElementById('search-modules');
const clearSearchBtn = document.getElementById('clear-search');

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

// Estado atual
let currentQueryPath = null;
let currentFields = [];
let allProjects = [];
let currentQueryResult = null;

/* ==========================================================================
   Inicialização
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // Carregar menu de projetos
    loadProjects();

    // Event Listeners
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });

    // Lógica de Redimensionamento da Sidebar
    let isResizing = false;

    if (sidebarResizer) {
        sidebarResizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isResizing = true;
            document.body.classList.add('is-resizing');
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            let newWidth = e.clientX;
            const minWidth = 200;
            const maxWidth = Math.min(600, window.innerWidth * 0.5);
            
            if (newWidth < minWidth) newWidth = minWidth;
            if (newWidth > maxWidth) newWidth = maxWidth;
            
            document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.classList.remove('is-resizing');
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
            if (searchInput && searchInput.value !== '') {
                clearSearch(false);
            }
            if (gridSearchInput && gridSearchInput.value !== '') {
                clearGridSearch(false);
            }
        }
    });

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
async function loadProjects() {
    try {
        const response = await fetch(`${API_BASE_URL}/projects`);
        if (!response.ok) throw new Error('Falha ao carregar estrutura de projetos');
        
        const data = await response.json();
        const projects = Array.isArray(data) ? data : (data.projects || []);
        const productName = (data && !Array.isArray(data)) ? data.productName : "";
        
        allProjects = projects;
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
    try {
        const response = await fetch(`${API_BASE_URL}/queries/${queryPath}`);
        if (!response.ok) throw new Error('Falha ao carregar campos do formulário');
        
        const data = await response.json();
        const fields = data.fields || [];
        const description = data.description || '';
        const executeMode = data.executeMode || '';
        const server = data.server || '';
        const timeout = data.timeout || 60;
        
        currentQueryPath = queryPath;
        currentFields = fields;

        renderForm(queryPath, moduleTitle, fields, description, executeMode, server, timeout);
        
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
        const response = await fetch(`${API_BASE_URL}/queries/${currentQueryPath}`, {
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
        showToast('Sucesso', msg, 'success');

        // Mostrar Grid com resultados
        renderGrid(result, duration);

    } catch (error) {
        console.error(error);
        // Formatar quebras de linha reais ou literais (\n) para tag <br> do HTML
        const formattedMsg = error.message.replace(/\\n|\n/g, '<br>');
        showToast('Erro de Execução', formattedMsg, 'error');
    } finally {
        // Habilitar botão novamente
        btnExecute.disabled = false;
        btnExecute.innerText = originalText;
    }
}

/* ==========================================================================
   Renderização do Menu Lateral em Árvore (Tree View)
   ========================================================================== */
function renderTree(nodes, container, isSearching = false) {
    container.innerHTML = ''; // Limpar loading state

    if (!nodes || nodes.length === 0) {
        container.innerHTML = '<div class="loading-state">Nenhum projeto encontrado.</div>';
        return;
    }

    const treeContainer = document.createElement('div');
    treeContainer.className = 'tree-root';

    // Função auxiliar recursiva
    function buildSubTree(nodeList, parentElement, level = 0) {
        nodeList.forEach(node => {
            const itemContainer = document.createElement('div');
            itemContainer.className = 'tree-node-container';

            if (node.type === 'folder') {
                const folderHeader = document.createElement('button');
                folderHeader.className = 'tree-folder-header';
                folderHeader.style.paddingLeft = `${16 + (level * 16)}px`;
                folderHeader.innerHTML = `
                    <svg class="tree-icon folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span class="tree-title">${node.name}</span>
                    <svg class="tree-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                `;

                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'tree-folder-content';

                // Nível 0 aberto por padrão ou todos abertos se buscando
                if (level === 0 || isSearching) {
                    childrenContainer.classList.add('open');
                    folderHeader.classList.add('active');
                }

                if (node.children && node.children.length > 0) {
                    buildSubTree(node.children, childrenContainer, level + 1);
                }

                folderHeader.addEventListener('click', () => {
                    const isOpen = childrenContainer.classList.contains('open');
                    if (isOpen) {
                        childrenContainer.classList.remove('open');
                        folderHeader.classList.remove('active');
                    } else {
                        childrenContainer.classList.add('open');
                        folderHeader.classList.add('active');
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
                
                const isFav = getFavorites().includes(node.path);
                const isActive = (node.path === currentQueryPath);
                if (isActive) {
                    moduleLink.classList.add('active');
                }
                
                moduleLink.innerHTML = `
                    <div class="tree-module-info">
                        <svg class="tree-icon module-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        <span class="tree-title">${node.name}</span>
                    </div>
                    <button class="favorite-btn ${isFav ? 'is-favorite' : ''}" title="${isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                    </button>
                `;

                moduleLink.addEventListener('click', (e) => {
                    if (e.target.closest('.favorite-btn')) {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFavorite(node.path);
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

    buildSubTree(nodes, treeContainer, 0);
    container.appendChild(treeContainer);
}

/* ==========================================================================
   Renderização do Formulário Dinâmico
   ========================================================================== */
function renderForm(queryPath, moduleTitle, fields, description = '', executeMode = '', server = '', timeout = 60) {
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

        if (hasMeta) {
            metaContainer.classList.remove('hidden');
        } else {
            metaContainer.classList.add('hidden');
        }
    }

    // Limpar form
    dynamicForm.innerHTML = '';

    btnExecute.disabled = false;

    if (!fields || fields.length === 0) {
        dynamicForm.innerHTML = '<p class="form-text">Nenhum campo retornado pela API para este módulo.</p>';
        return;
    }

    fields.forEach(field => {
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
            infoSpan.title = field.information;
            infoSpan.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
            `;
            label.appendChild(infoSpan);
        }

        // Se o tipo for SINGLE ou MULTI/MULTIPLE, renderizar um select (Dropdown List)
        const typeUpper = field.type.toUpperCase();
        const isSingle = typeUpper.startsWith('SINGLE');
        const isMulti = typeUpper.startsWith('MULTI') || typeUpper.startsWith('MULTIPLE');

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

            // Se não for obrigatório, adicionar opção em branco (apenas para SINGLE)
            if (isSingle && !field.required) {
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.text = '';
                select.appendChild(emptyOption);
            }

            // Exemplo de tipo: SINGLE(S=Simples,V=Vários) ou MULTI(S=Simples,V=Vários)
            // Extrair o conteúdo entre parênteses
            const match = field.type.match(/\(([^)]+)\)/);
            if (match) {
                const optionsStr = match[1];
                // Dividir pelas opções usando regex para suportar , ou ; ou |
                const optionsList = optionsStr.split(/[,;|]/);

                if (isMulti) {
                    select.size = Math.min(5, optionsList.length);
                }

                // Fatiar valores padrão se for multi-select
                const defaultValues = field.defaultValue ? field.defaultValue.split(/[,;|]/).map(d => d.trim()) : [];

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
                        // Fallback: se o valor padrão tem tamanho 1 (ex: 'N') e o texto começa com ele (ex: 'Nenhum'), assume o valor padrão
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
                    } else {
                        if (field.defaultValue && val === field.defaultValue) {
                            option.selected = true;
                        }
                    }
                    select.appendChild(option);
                });
            }

            // Se houver defaultValue e for SINGLE, definir no select como valor final
            if (isSingle && field.defaultValue) {
                select.value = field.defaultValue;
            }

            group.appendChild(label);
            group.appendChild(select);
            dynamicForm.appendChild(group);
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
}

/* ==========================================================================
   Ações dos Botões do Formulário
   ========================================================================== */
function handleCancel() {
    formContainer.classList.add('hidden');
    gridContainer.classList.add('hidden');
    emptyState.classList.remove('hidden');
    
    // Remover classe ativa do menu lateral e favoritos
    document.querySelectorAll('.module-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.favorite-item').forEach(item => item.classList.remove('active'));
    
    currentQueryPath = null;
    currentFields = [];
    currentQueryResult = null;
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
                    const defaultValues = field.defaultValue ? field.defaultValue.split(/[,;|]/).map(d => d.trim()) : [];
                    Array.from(input.options).forEach(option => {
                        option.selected = defaultValues.includes(option.value);
                    });
                } else {
                    input.value = field.defaultValue || '';
                }
            }
        }
    });
}

function handleExecute() {
    if (!dynamicForm.checkValidity()) {
        dynamicForm.reportValidity();
        return;
    }

    const payload = {};
    const inputs = dynamicForm.querySelectorAll('.form-control, .form-radio');
    
    inputs.forEach(input => {
        if (input.type === 'radio') {
            if (input.checked) {
                payload[input.name] = input.value;
            }
        } else if (input.tagName === 'SELECT' && input.multiple) {
            const selectedValues = Array.from(input.selectedOptions).map(opt => opt.value);
            if (selectedValues.length > 0 || input.required) {
                payload[input.name] = selectedValues.join(',');
            }
        } else {
            // Só enviar se tiver valor ou se for requirido
            if (input.value !== '' || input.required) {
                payload[input.name] = input.value;
            }
        }
    });

    // Validar se payload está vazio? Deixar o backend validar.
    executeQuery(payload);
}

/* ==========================================================================
   Renderização da Grid de Resultados
   ========================================================================== */
function renderGrid(resultData, duration = null) {
    currentQueryResult = resultData;
    gridContainer.classList.remove('hidden');
    resultThead.innerHTML = '';
    resultTbody.innerHTML = '';

    const gridTitle = document.getElementById('grid-title');
    const executionTimeEl = document.getElementById('execution-time');

    if (!resultData || !resultData.columns || resultData.columns.length === 0 || !resultData.rows || resultData.rows.length === 0) {
        if (gridTitle) {
            gridTitle.innerText = 'Resultados';
        }
        if (executionTimeEl) {
            executionTimeEl.innerHTML = '';
            executionTimeEl.classList.add('hidden');
        }
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

    if (gridTitle) {
        gridTitle.innerText = `Resultados (${resultData.rows.length.toLocaleString('pt-BR')})`;
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
        executionTimeEl.classList.add('hidden');
    }

    resultTable.classList.remove('hidden');
    gridEmptyState.classList.add('hidden');

    // Usar as colunas retornadas pela API para manter a ordem do banco
    const columns = resultData.columns;
    const rows = resultData.rows;

    // Renderizar Cabeçalho
    const trHead = document.createElement('tr');
    columns.forEach(col => {
        const th = document.createElement('th');
        th.innerText = col;
        trHead.appendChild(th);
    });
    resultThead.appendChild(trHead);

    // Renderizar Linhas
    rows.forEach(row => {
        const tr = document.createElement('tr');
        columns.forEach(col => {
            const td = document.createElement('td');
            // Formatar se for objeto/null
            let val = row[col];
            if (val === null || val === undefined) val = '';
            else if (typeof val === 'object') val = JSON.stringify(val);
            
            td.innerText = val;
            tr.appendChild(td);
        });
        resultTbody.appendChild(tr);
    });
}

function filterGrid() {
    if (!currentQueryResult) return;
    const value = gridSearchInput ? gridSearchInput.value.trim() : '';
    const term = value.toLowerCase();
    
    // Mostrar/esconder botão de limpar
    if (clearGridSearchBtn) {
        if (value !== '') {
            clearGridSearchBtn.classList.remove('hidden');
        } else {
            clearGridSearchBtn.classList.add('hidden');
        }
    }
    
    const rows = resultTbody.querySelectorAll('tr');
    let visibleCount = 0;
    
    rows.forEach(tr => {
        let match = false;
        tr.querySelectorAll('td').forEach(td => {
            if (td.textContent.toLowerCase().includes(term)) {
                match = true;
            }
        });
        
        if (term === '' || match) {
            tr.classList.remove('hidden');
            visibleCount++;
        } else {
            tr.classList.add('hidden');
        }
    });

    const gridTitle = document.getElementById('grid-title');
    if (gridTitle) {
        const totalCount = currentQueryResult.rows ? currentQueryResult.rows.length : 0;
        if (term === '') {
            gridTitle.innerText = `Resultados (${totalCount.toLocaleString('pt-BR')})`;
        } else {
            gridTitle.innerText = `Resultados (${visibleCount.toLocaleString('pt-BR')} de ${totalCount.toLocaleString('pt-BR')})`;
        }
    }

    if (visibleCount === 0 && term !== '') {
        resultTable.classList.add('hidden');
        gridEmptyState.classList.remove('hidden');
    } else {
        resultTable.classList.remove('hidden');
        gridEmptyState.classList.add('hidden');
    }
}

/* ==========================================================================
   Sistema de Notificações (Toasts)
   ========================================================================== */
function showToast(title, message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' 
        ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
        : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--error-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';

    toast.innerHTML = `
        ${icon}
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;

    toastContainer.appendChild(toast);

    // Remover após 5 segundos
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => {
            toast.remove();
        }, 300); // Tempo da animação CSS
    }, 5000);
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
        let rows = currentQueryResult.rows;
        
        // Filtrar apenas o que está visível na grid
        const searchValue = gridSearchInput ? gridSearchInput.value.trim() : '';
        if (searchValue !== '') {
            const term = searchValue.toLowerCase();
            rows = rows.filter(row => {
                return columns.some(col => {
                    let val = row[col];
                    if (val === null || val === undefined) val = '';
                    else if (typeof val === 'object') val = JSON.stringify(val);
                    else val = String(val);
                    return val.toLowerCase().includes(term);
                });
            });
        }
        
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
        let rows = currentQueryResult.rows;
        
        // Filtrar apenas o que está visível na grid
        const searchValue = gridSearchInput ? gridSearchInput.value.trim() : '';
        if (searchValue !== '') {
            const term = searchValue.toLowerCase();
            rows = rows.filter(row => {
                return columns.some(col => {
                    let val = row[col];
                    if (val === null || val === undefined) val = '';
                    else if (typeof val === 'object') val = JSON.stringify(val);
                    else val = String(val);
                    return val.toLowerCase().includes(term);
                });
            });
        }
        
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
   Gerenciamento de Favoritos (LocalStorage)
   ========================================================================== */
function getFavorites() {
    try {
        const stored = localStorage.getItem('sqlformys_favorites');
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('Erro ao ler favoritos do LocalStorage', e);
        return [];
    }
}

function saveFavorites(favorites) {
    try {
        localStorage.setItem('sqlformys_favorites', JSON.stringify(favorites));
    } catch (e) {
        console.error('Erro ao salvar favoritos no LocalStorage', e);
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
    
    const modulesMap = getAllModulesMap(allProjects);
    
    favorites.forEach(path => {
        const moduleNode = modulesMap.get(path);
        const itemEl = document.createElement('div');
        itemEl.dataset.path = path;
        
        if (moduleNode) {
            // Favorito disponível
            itemEl.className = 'favorite-item';
            if (currentQueryPath === path) {
                itemEl.classList.add('active');
            }
            
            itemEl.innerHTML = `
                <div class="favorite-item-info">
                    <svg class="tree-icon module-icon" style="margin-right: 8px; width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                    <span class="favorite-item-title" title="${moduleNode.name}">${moduleNode.name}</span>
                </div>
                <button class="favorite-remove-btn" title="Remover dos favoritos">
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
            itemEl.title = `Este módulo não está mais disponível no caminho: ${path}`;
            
            const displayName = path.split('/').pop() || path;
            
            itemEl.innerHTML = `
                <div class="favorite-item-info">
                    <svg class="tree-icon warning-icon" style="margin-right: 8px; width: 14px; height: 14px; color: var(--error-color);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    <span class="favorite-item-title" title="${path}">${displayName} (Indisponível)</span>
                </div>
                <button class="favorite-remove-btn" title="Remover dos favoritos">
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
