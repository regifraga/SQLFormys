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

// Elementos da Grid
const gridContainer = document.getElementById('grid-container');
const resultThead = document.getElementById('result-thead');
const resultTbody = document.getElementById('result-tbody');
const gridEmptyState = document.getElementById('grid-empty-state');
const resultTable = document.getElementById('result-table');

// Estado atual
let currentQueryPath = null;
let currentFields = [];

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
});

/* ==========================================================================
   Funções de Rede (API)
   ========================================================================== */
async function loadProjects() {
    try {
        const response = await fetch(`${API_BASE_URL}/projects`);
        if (!response.ok) throw new Error('Falha ao carregar estrutura de projetos');
        
        const data = await response.json();
        renderTree(data, treeNavigation);
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
        
        const fields = await response.json();
        
        currentQueryPath = queryPath;
        currentFields = fields;

        renderForm(queryPath, moduleTitle, fields);
        
        // Esconder empty state e grid antiga, mostrar form
        emptyState.classList.add('hidden');
        gridContainer.classList.add('hidden');
        formContainer.classList.remove('hidden');

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
        
        // Tentar formatar a resposta se for JSON para a notificação
        let msg = result.message || 'Operação realizada com sucesso.';
        showToast('Sucesso', msg, 'success');

        // Mostrar Grid com resultados
        renderGrid(result);

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
function renderTree(nodes, container) {
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

                // Nível 0 aberto por padrão
                if (level === 0) {
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
                moduleLink.style.paddingLeft = `${16 + (level * 16)}px`;
                moduleLink.innerHTML = `
                    <svg class="tree-icon module-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    <span class="tree-title">${node.name}</span>
                `;

                moduleLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    document.querySelectorAll('.module-link').forEach(l => l.classList.remove('active'));
                    moduleLink.classList.add('active');

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
function renderForm(queryPath, moduleTitle, fields) {
    // Atualizar títulos
    formTitle.innerText = moduleTitle;
    formSubtitle.innerText = queryPath.replace(/\//g, ' > ');

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
        label.htmlFor = `field_${field.field}`;
        label.innerText = field.label;
        if (field.required) {
            label.classList.add('required');
        }

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
    
    // Remover classe ativa do menu lateral
    document.querySelectorAll('.module-link').forEach(l => l.classList.remove('active'));
    
    currentQueryPath = null;
    currentFields = [];
}

function handleClear() {
    if (!currentFields || currentFields.length === 0) return;
    
    currentFields.forEach(field => {
        const input = document.getElementById(`field_${field.field}`);
        if (input) {
            input.value = field.defaultValue || '';
        }
    });
}

function handleExecute() {
    if (!dynamicForm.checkValidity()) {
        dynamicForm.reportValidity();
        return;
    }

    const payload = {};
    const inputs = dynamicForm.querySelectorAll('.form-control');
    
    inputs.forEach(input => {
        // Só enviar se tiver valor ou se for requirido
        if (input.value !== '' || input.required) {
            payload[input.name] = input.value;
        }
    });

    // Validar se payload está vazio? Deixar o backend validar.
    executeQuery(payload);
}

/* ==========================================================================
   Renderização da Grid de Resultados
   ========================================================================== */
function renderGrid(resultData) {
    gridContainer.classList.remove('hidden');
    resultThead.innerHTML = '';
    resultTbody.innerHTML = '';

    if (!resultData || !resultData.columns || resultData.columns.length === 0 || !resultData.rows || resultData.rows.length === 0) {
        resultTable.classList.add('hidden');
        gridEmptyState.classList.remove('hidden');
        return;
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
