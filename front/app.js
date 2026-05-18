const API_BASE_URL = (window.ENV && window.ENV.API_BASE_URL) ? window.ENV.API_BASE_URL : 'http://localhost:8080/api';


// Elementos do DOM
const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('toggle-sidebar');
const projectAccordion = document.getElementById('project-accordion');
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
let currentProject = null;
let currentModule = null;
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
        if (!response.ok) throw new Error('Falha ao carregar projetos');
        
        const data = await response.json();
        renderAccordion(data);
    } catch (error) {
        console.error(error);
        projectAccordion.innerHTML = '<div class="loading-state" style="color: var(--error-color);">Erro ao carregar menu.</div>';
        showToast('Erro de Conexão', 'Não foi possível carregar a lista de projetos.', 'error');
    }
}

async function loadFormFields(projectName, moduleName) {
    try {
        const response = await fetch(`${API_BASE_URL}/queries/${projectName}/${moduleName}`);
        if (!response.ok) throw new Error('Falha ao carregar campos do formulário');
        
        const fields = await response.json();
        
        currentProject = projectName;
        currentModule = moduleName;
        currentFields = fields;

        renderForm(projectName, moduleName, fields);
        
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
        const response = await fetch(`${API_BASE_URL}/queries/${currentProject}/${currentModule}`, {
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
   Renderização do Menu Lateral (Acordeão)
   ========================================================================== */
function renderAccordion(projects) {
    projectAccordion.innerHTML = ''; // Limpar loading state

    if (!projects || projects.length === 0) {
        projectAccordion.innerHTML = '<div class="loading-state">Nenhum projeto encontrado.</div>';
        return;
    }

    projects.forEach((proj, index) => {
        // Criar item do acordeão
        const item = document.createElement('div');
        item.className = 'accordion-item';

        // Cabeçalho (Projeto)
        const header = document.createElement('button');
        header.className = 'accordion-header';
        
        // Expandir o primeiro por padrão
        if (index === 0) {
            header.classList.add('active');
        }

        header.innerHTML = `
            <svg class="project-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span class="accordion-title">${proj.project}</span>
            <svg class="accordion-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
        `;

        // Conteúdo (Módulos)
        const content = document.createElement('div');
        content.className = `accordion-content ${index === 0 ? 'open' : ''}`;
        
        const moduleList = document.createElement('ul');
        moduleList.className = 'module-list';

        proj.modules.forEach(mod => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.className = 'module-link';
            link.innerText = mod;
            
            link.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Remover active de todos os links
                document.querySelectorAll('.module-link').forEach(l => l.classList.remove('active'));
                link.classList.add('active');

                loadFormFields(proj.project, mod);
            });

            li.appendChild(link);
            moduleList.appendChild(li);
        });

        content.appendChild(moduleList);

        // Lógica de click no Header
        header.addEventListener('click', () => {
            const isOpen = content.classList.contains('open');
            
            // Fechar todos
            document.querySelectorAll('.accordion-content').forEach(c => c.classList.remove('open'));
            document.querySelectorAll('.accordion-header').forEach(h => h.classList.remove('active'));

            if (!isOpen) {
                content.classList.add('open');
                header.classList.add('active');
            }
        });

        item.appendChild(header);
        item.appendChild(content);
        projectAccordion.appendChild(item);
    });
}

/* ==========================================================================
   Renderização do Formulário Dinâmico
   ========================================================================== */
function renderForm(projectName, moduleName, fields) {
    // Atualizar títulos
    formTitle.innerText = moduleName;
    formSubtitle.innerText = `${projectName} > ${moduleName}`;

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
        label.innerText = field.label + (field.required ? ' *' : '');

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
    
    currentProject = null;
    currentModule = null;
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
