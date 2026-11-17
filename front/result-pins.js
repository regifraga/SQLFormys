/**
 * Pins de resultado: snapshot local (até 10), badge no form e preview copiável.
 */
const LS_RESULT_PINS_PREFIX = 'sqlformys_result_pins';
const MAX_PINNED_RESULTS = 10;
const MAX_PIN_ROWS = 200;
const MAX_PIN_JSON_BYTES = 200 * 1024;

let pinsCache = [];
let selectedPinId = null;
let selectedPreviewRowIndex = null;
let pinsPopoverOpen = false;
let pinsDocClickBound = false;
let pinsEscapeBound = false;
let lastFormFieldForPinFill = null;
let formFieldPinTrackBound = false;

function pinsEscapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function pinsStorageKey() {
    const id = typeof getAuthIdentity === 'function' ? getAuthIdentity() : null;
    const username = id && id.username ? String(id.username).trim() : '';
    if (!username) {
        return LS_RESULT_PINS_PREFIX;
    }
    const safe = username.toLowerCase().replace(/[^a-z0-9@._\\-]/gi, '_');
    return `${LS_RESULT_PINS_PREFIX}:${safe}`;
}

function readPinsFromStorage() {
    try {
        const raw = localStorage.getItem(pinsStorageKey());
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function persistPins() {
    try {
        localStorage.setItem(pinsStorageKey(), JSON.stringify(pinsCache));
        return true;
    } catch (e) {
        console.error(e);
        if (typeof showToast === 'function') {
            showToast('Pins', 'Não foi possível salvar os pins (armazenamento cheio ou indisponível).', 'error');
        }
        return false;
    }
}

function formatGridCell(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
        try {
            return JSON.stringify(val);
        } catch {
            return String(val);
        }
    }
    return String(val);
}

function normalizeResultType(type) {
    return String(type || 'GRID').toUpperCase();
}

function resultFingerprint(queryPath, resultData, resultType) {
    const type = normalizeResultType(resultType);
    const payload = {
        queryPath: queryPath || '',
        resultType: type,
        columns: resultData && resultData.columns ? resultData.columns : [],
        rows: resultData && resultData.rows ? resultData.rows : []
    };
    return JSON.stringify(payload);
}

function cloneResultForPin(resultData, resultType) {
    const type = normalizeResultType(resultType);
    let columns = Array.isArray(resultData?.columns) ? [...resultData.columns] : [];
    let rows = Array.isArray(resultData?.rows)
        ? resultData.rows.map((row) => (row && typeof row === 'object' ? { ...row } : row))
        : [];
    let truncated = false;

    if (rows.length > MAX_PIN_ROWS) {
        rows = rows.slice(0, MAX_PIN_ROWS);
        truncated = true;
    }

    const shrinkToByteLimit = () => {
        let snapshot = { columns, rows, resultType: type };
        let encoded = JSON.stringify(snapshot);
        while (encoded.length > MAX_PIN_JSON_BYTES && rows.length > 1) {
            rows = rows.slice(0, Math.max(1, Math.floor(rows.length * 0.85)));
            truncated = true;
            snapshot = { columns, rows, resultType: type };
            encoded = JSON.stringify(snapshot);
        }
        return { columns, rows, truncated };
    };

    const shrunk = shrinkToByteLimit();
    return {
        columns: shrunk.columns,
        rows: shrunk.rows,
        resultType: type,
        truncated: truncated || shrunk.truncated
    };
}

function isResultPinnable(resultData, resultType) {
    const type = normalizeResultType(resultType);
    if (!resultData) return false;
    if (type === 'GRID') {
        return (
            Array.isArray(resultData.columns) &&
            resultData.columns.length > 0 &&
            Array.isArray(resultData.rows) &&
            resultData.rows.length > 0
        );
    }
  const rows = resultData.rows;
    if (!rows || rows.length === 0) return false;
    let columnName = resultData.columns && resultData.columns.length > 0 ? resultData.columns[0] : null;
    if (!columnName) {
        const keys = Object.keys(rows[0] || {});
        if (keys.length === 0) return false;
        columnName = keys[0];
    }
    const text = rows.map((row) => formatGridCell(row[columnName])).join('\n').trim();
    return text.length > 0;
}

function findPinByFingerprint(fp) {
    return pinsCache.find((p) => p.fingerprint === fp) || null;
}

function formatPinListTime(iso) {
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return '';
    }
}

function joinPinDocumentContent(pin) {
    const rows = pin.rows || [];
    if (!rows.length) return '';
    let columnName = pin.columns && pin.columns.length > 0 ? pin.columns[0] : null;
    if (!columnName) {
        const keys = Object.keys(rows[0] || {});
        columnName = keys[0] || null;
    }
    if (!columnName) return '';
    return rows.map((row) => formatGridCell(row[columnName])).join('\n');
}

function getPinRowCount(pin) {
    return Array.isArray(pin.rows) ? pin.rows.length : 0;
}

function isPinFillableFormField(el) {
    const form = document.getElementById('dynamic-form');
    if (!form || !el || !form.contains(el)) return false;
    const tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') return false;
    const type = el.type ? String(el.type).toLowerCase() : '';
    if (type === 'checkbox' || type === 'radio' || type === 'file' || type === 'button' || type === 'hidden') {
        return false;
    }
    return true;
}

function rememberPinFillFormField(el) {
    if (isPinFillableFormField(el)) {
        lastFormFieldForPinFill = el;
    }
}

function capturePinFillFormFieldBeforePinsInteraction() {
    const form = document.getElementById('dynamic-form');
    const active = document.activeElement;
    if (isPinFillableFormField(active)) {
        lastFormFieldForPinFill = active;
        return;
    }
    if (lastFormFieldForPinFill && form && form.contains(lastFormFieldForPinFill)) {
        return;
    }
}

function resolvePinFillFormField() {
    const form = document.getElementById('dynamic-form');
    if (!form) return null;

    const candidates = [lastFormFieldForPinFill, document.activeElement];
    for (const el of candidates) {
        if (el && document.contains(el) && isPinFillableFormField(el)) {
            return el;
        }
    }
    return null;
}

function tryFillFocusedFormField(text) {
    const el = resolvePinFillFormField();
    if (!el) return false;
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    try {
        el.focus({ preventScroll: true });
    } catch {
        /* ignore */
    }
    return true;
}

function bindFormFieldPinTracking() {
    if (formFieldPinTrackBound) return;
    const form = document.getElementById('dynamic-form');
    if (!form) return;
    formFieldPinTrackBound = true;
    form.addEventListener(
        'focusin',
        (e) => {
            rememberPinFillFormField(e.target);
        },
        true
    );
}

async function copyPinValue(text) {
    const copyFn = typeof copyTextToClipboard === 'function' ? copyTextToClipboard : null;
    if (!copyFn) return false;
    const ok = await copyFn(text);
    if (ok && typeof showToast === 'function') {
        showToast('Copiado', 'Valor copiado para a área de transferência.', 'success', { persist: false });
    } else if (!ok && typeof showToast === 'function') {
        showToast('Copiar', 'Não foi possível copiar.', 'error', { persist: false });
    }
    return ok;
}

function removePinById(id, options = {}) {
    const before = pinsCache.length;
    pinsCache = pinsCache.filter((p) => p.id !== id);
    if (pinsCache.length === before) return;
    persistPins();
    if (!options.silent && typeof showToast === 'function') {
        showToast('Pins', 'Pin removido.', 'info', { persist: false });
    }
    if (selectedPinId === id) {
        selectedPinId = pinsCache.length ? pinsCache[0].id : null;
        selectedPreviewRowIndex = null;
    }
    renderPinsPopoverContent();
    syncFormPinsDock();
    if (typeof syncResultPinButton === 'function') {
        syncResultPinButton(lastResultPinContext);
    }
}

function addPinFromContext(ctx) {
    if (!ctx || !isResultPinnable(ctx.resultData, ctx.resultType)) return false;

    const fp = resultFingerprint(ctx.queryPath, ctx.resultData, ctx.resultType);
    const existing = findPinByFingerprint(fp);
    if (existing) {
        removePinById(existing.id, { silent: true });
        if (typeof showToast === 'function') {
            showToast('Pins', 'Resultado desfixado.', 'info', { persist: false });
        }
        return true;
    }

    if (pinsCache.length >= MAX_PINNED_RESULTS) {
        if (typeof showToast === 'function') {
            showToast(
                'Pins',
                `Limite de ${MAX_PINNED_RESULTS} pins atingido. Remova um pin no formulário antes de fixar outro.`,
                'warning'
            );
        }
        return false;
    }

    const cloned = cloneResultForPin(ctx.resultData, ctx.resultType);
    const pin = {
        id: `pin_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        queryPath: ctx.queryPath || '',
        moduleTitle: ctx.moduleTitle || ctx.queryPath || 'Resultado',
        resultType: cloned.resultType,
        columns: cloned.columns,
        rows: cloned.rows,
        durationMs: ctx.durationMs != null ? Math.round(Number(ctx.durationMs)) : null,
        pinnedAt: new Date().toISOString(),
        truncated: Boolean(cloned.truncated),
        fingerprint: fp
    };

    pinsCache.unshift(pin);
    if (!persistPins()) {
        pinsCache.shift();
        return false;
    }

    selectedPinId = pin.id;
    selectedPreviewRowIndex = null;
    if (typeof showToast === 'function') {
        showToast('Pins', 'Resultado fixado. Consulte em Pins no formulário.', 'success', { persist: false });
    }
    syncFormPinsDock();
    renderPinsPopoverContent();
    return true;
}

let lastResultPinContext = null;

function syncResultPinButton(ctx) {
    lastResultPinContext = ctx || null;
    const btn = document.getElementById('btn-pin-result');
    if (!btn) return;

    const hasPinnable =
        ctx &&
        ctx.resultData &&
        isResultPinnable(ctx.resultData, ctx.resultType);

    if (!hasPinnable) {
        btn.classList.add('hidden');
        btn.disabled = true;
        btn.classList.remove('is-pinned');
        btn.setAttribute('aria-pressed', 'false');
        return;
    }

    btn.classList.remove('hidden');
    btn.disabled = false;
    const fp = resultFingerprint(ctx.queryPath, ctx.resultData, ctx.resultType);
    const pinned = Boolean(findPinByFingerprint(fp));
    btn.classList.toggle('is-pinned', pinned);
    btn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
    const label = pinned ? 'Desfixar' : 'Fixar';
    btn.setAttribute('data-tooltip', `${label} resultado para consulta no formulário`);
    const textEl = btn.querySelector('.btn-pin-label');
    if (textEl) textEl.textContent = label;
}

function closePinsPopover() {
    const popover = document.getElementById('form-pins-popover');
    const badge = document.getElementById('form-pins-badge');
    if (popover) popover.classList.add('hidden');
    if (badge) badge.setAttribute('aria-expanded', 'false');
    pinsPopoverOpen = false;
}

function openPinsPopover() {
    const popover = document.getElementById('form-pins-popover');
    const badge = document.getElementById('form-pins-badge');
    const formContainer = document.getElementById('form-container');
    if (!popover || !badge || !formContainer || formContainer.classList.contains('hidden')) return;

    capturePinFillFormFieldBeforePinsInteraction();
    bindFormFieldPinTracking();

    if (typeof closeUserMenuDropdown === 'function') closeUserMenuDropdown();
    if (typeof closeNotificationsPanel === 'function') closeNotificationsPanel();

    if (!selectedPinId && pinsCache.length) {
        selectedPinId = pinsCache[0].id;
    }
    renderPinsPopoverContent();
    popover.classList.remove('hidden');
    badge.setAttribute('aria-expanded', 'true');
    pinsPopoverOpen = true;
}

function togglePinsPopover() {
    if (pinsPopoverOpen) {
        closePinsPopover();
    } else {
        openPinsPopover();
    }
}

function syncFormPinsDock() {
    const dock = document.getElementById('form-pins-dock');
    const badge = document.getElementById('form-pins-badge');
    const formContainer = document.getElementById('form-container');
    if (!dock || !badge) return;

    const formVisible = formContainer && !formContainer.classList.contains('hidden');
    const count = pinsCache.length;

    if (!formVisible || count === 0) {
        dock.classList.add('hidden');
        closePinsPopover();
        return;
    }

    dock.classList.remove('hidden');
    const countEl = badge.querySelector('.form-pins-count');
    if (countEl) countEl.textContent = String(count);
    badge.setAttribute(
        'aria-label',
        count === 1 ? '1 pin de resultado. Expandir para consultar.' : `${count} pins de resultado. Expandir para consultar.`
    );
}

function resetPinPreviewShell(container) {
    container.className = 'pins-preview';
    container.innerHTML = '';
    return container;
}

function appendPinPreviewInner(container, className = '') {
    const inner = document.createElement('div');
    inner.className = ['pins-preview-inner', className].filter(Boolean).join(' ');
    container.appendChild(inner);
    return inner;
}

async function renderPinDocumentPreview(container, pin) {
    const type = normalizeResultType(pin.resultType);
    const content = joinPinDocumentContent(pin);
    resetPinPreviewShell(container);

    if (!content.trim()) {
        const inner = appendPinPreviewInner(container, 'pins-preview-document');
        inner.textContent = 'Sem conteúdo.';
        return;
    }

    if (type === 'HTML') {
        const inner = appendPinPreviewInner(container, 'pins-preview-document pins-preview-html');
        const iframe = document.createElement('iframe');
        iframe.className = 'result-html-frame pins-preview-html-frame';
        iframe.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms');
        iframe.srcdoc = content;
        inner.appendChild(iframe);
        return;
    }

    if ((type === 'MARKDOWN' || type === 'DOCUMENT') && typeof renderMarkdownHtml === 'function') {
        const inner = appendPinPreviewInner(container, 'pins-preview-document pins-preview-prose');
        await renderMarkdownHtml(inner, content, 'pins-preview-document pins-preview-prose');
        if (type === 'DOCUMENT' && typeof promoteMermaidCodeBlocks === 'function') {
            promoteMermaidCodeBlocks(inner);
            if (typeof runMermaidIn === 'function') {
                await runMermaidIn(inner);
            }
        }
        return;
    }

    if (type === 'MERMAID' && typeof renderMermaidBlock === 'function') {
        const inner = appendPinPreviewInner(container, 'pins-preview-document pins-preview-mermaid');
        await renderMermaidBlock(inner, content);
        return;
    }

    const inner = appendPinPreviewInner(container, 'pins-preview-document pins-preview-text');
    const pre = document.createElement('pre');
    pre.className = 'pins-preview-pre';
    pre.textContent = content;
    inner.appendChild(pre);
}

function renderPinGridPreview(container, pin) {
    const columns = pin.columns || [];
    const rows = pin.rows || [];
    resetPinPreviewShell(container);

    if (!columns.length || !rows.length) {
        const inner = appendPinPreviewInner(container, 'pins-preview-grid-wrap');
        inner.textContent = 'Sem dados na grade.';
        return;
    }

    const wrap = appendPinPreviewInner(container, 'pins-preview-grid-wrap');
    const table = document.createElement('table');
    table.className = 'data-table pins-preview-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    columns.forEach((col) => {
        const th = document.createElement('th');
        th.textContent = col;
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');
        tr.dataset.rowIndex = String(rowIndex);
        if (selectedPreviewRowIndex === rowIndex) {
            tr.classList.add('is-selected');
        }
        tr.addEventListener('click', (e) => {
            if (e.target.closest('td')) return;
            selectedPreviewRowIndex = rowIndex;
            table.querySelectorAll('tbody tr.is-selected').forEach((r) => r.classList.remove('is-selected'));
            tr.classList.add('is-selected');
        });

        columns.forEach((col) => {
            const td = document.createElement('td');
            const cellText = formatGridCell(row[col]);
            td.textContent = cellText;
            td.title = cellText;
            td.addEventListener('click', (e) => {
                e.stopPropagation();
                selectedPreviewRowIndex = rowIndex;
                table.querySelectorAll('tbody tr.is-selected').forEach((r) => r.classList.remove('is-selected'));
                tr.classList.add('is-selected');
                const filled = tryFillFocusedFormField(cellText);
                if (filled) {
                    if (typeof copyTextToClipboard === 'function') {
                        copyTextToClipboard(cellText);
                    }
                    if (typeof showToast === 'function') {
                        showToast('Campo', 'Valor copiado e preenchido no campo em foco.', 'success', { persist: false });
                    }
                } else {
                    copyPinValue(cellText);
                }
            });
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
}

function renderPinsPopoverContent() {
    const listEl = document.getElementById('form-pins-list');
    const previewEl = document.getElementById('form-pins-preview');
    const previewActions = document.getElementById('form-pins-preview-actions');
    const truncatedNote = document.getElementById('form-pins-truncated-note');
    if (!listEl || !previewEl) return;

    if (!pinsCache.length) {
        listEl.innerHTML = '<p class="pins-list-empty">Nenhum pin fixado.</p>';
        previewEl.innerHTML = '';
        if (previewActions) previewActions.classList.add('hidden');
        if (truncatedNote) truncatedNote.classList.add('hidden');
        return;
    }

    if (!selectedPinId || !pinsCache.some((p) => p.id === selectedPinId)) {
        selectedPinId = pinsCache[0].id;
        selectedPreviewRowIndex = null;
    }

    listEl.innerHTML = pinsCache
        .map((pin) => {
            const active = pin.id === selectedPinId ? ' is-active' : '';
            const title = pin.moduleTitle || pin.queryPath || 'Resultado';
            const path = pin.queryPath ? pinsEscapeHtml(pin.queryPath) : '';
            const meta = [
                normalizeResultType(pin.resultType),
                formatPinListTime(pin.pinnedAt),
                `${getPinRowCount(pin)} linha(s)`
            ].join(' · ');
            return `
                <button type="button" class="pins-list-item${active}" data-pin-id="${pinsEscapeHtml(pin.id)}" title="${pinsEscapeHtml(title)}">
                    <span class="pins-list-item-title">${pinsEscapeHtml(title)}</span>
                    ${path ? `<span class="pins-list-item-path">${path}</span>` : ''}
                    <span class="pins-list-item-meta">${pinsEscapeHtml(meta)}</span>
                </button>
            `;
        })
        .join('');

    const pin = pinsCache.find((p) => p.id === selectedPinId);
    if (!pin) return;

    const type = normalizeResultType(pin.resultType);
    if (type === 'GRID') {
        renderPinGridPreview(previewEl, pin);
    } else {
        renderPinDocumentPreview(previewEl, pin).catch((err) => {
            console.error(err);
            resetPinPreviewShell(previewEl);
            previewEl.textContent = 'Falha ao renderizar o preview.';
        });
    }

    if (previewActions) previewActions.classList.remove('hidden');
    if (truncatedNote) {
        truncatedNote.classList.toggle('hidden', !pin.truncated);
    }

    const btnCopyText = document.getElementById('form-pins-copy-text');
    const btnCopyRow = document.getElementById('form-pins-copy-row');
    const btnRemove = document.getElementById('form-pins-remove');

    if (btnCopyRow) {
        const showRow = type === 'GRID';
        btnCopyRow.classList.toggle('hidden', !showRow);
    }

    if (btnCopyText) {
        btnCopyText.onclick = () => {
            const text = type === 'GRID' ? '' : joinPinDocumentContent(pin);
            const full = type === 'GRID'
                ? (pin.rows || [])
                    .map((row) => (pin.columns || []).map((c) => formatGridCell(row[c])).join('\t'))
                    .join('\n')
                : text;
            copyPinValue(full || text);
        };
    }

    if (btnCopyRow) {
        btnCopyRow.onclick = () => {
            const idx = selectedPreviewRowIndex != null ? selectedPreviewRowIndex : 0;
            const row = (pin.rows || [])[idx];
            if (!row) {
                if (typeof showToast === 'function') {
                    showToast('Pins', 'Selecione uma linha na grade.', 'warning', { persist: false });
                }
                return;
            }
            const line = (pin.columns || []).map((c) => formatGridCell(row[c])).join('\t');
            copyPinValue(line);
        };
    }

    if (btnRemove) {
        btnRemove.onclick = () => removePinById(pin.id);
    }
}

function handlePinResultButtonClick() {
    if (!lastResultPinContext) return;
    addPinFromContext(lastResultPinContext);
    syncResultPinButton(lastResultPinContext);
}

function refreshResultPinsFromStorage() {
    pinsCache = readPinsFromStorage();
    if (!pinsCache.some((p) => p.id === selectedPinId)) {
        selectedPinId = pinsCache.length ? pinsCache[0].id : null;
        selectedPreviewRowIndex = null;
    }
    syncFormPinsDock();
    if (pinsPopoverOpen) {
        renderPinsPopoverContent();
    }
    syncResultPinButton(lastResultPinContext);
}

function initResultPins() {
    pinsCache = readPinsFromStorage();

    const btnPin = document.getElementById('btn-pin-result');
    if (btnPin && !btnPin.dataset.bound) {
        btnPin.dataset.bound = '1';
        btnPin.addEventListener('click', () => handlePinResultButtonClick());
    }

    const badge = document.getElementById('form-pins-badge');
    if (badge && !badge.dataset.bound) {
        badge.dataset.bound = '1';
        badge.addEventListener('mousedown', () => {
            capturePinFillFormFieldBeforePinsInteraction();
        });
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePinsPopover();
        });
    }

    const popoverInteract = document.getElementById('form-pins-popover');
    if (popoverInteract && !popoverInteract.dataset.pinFillCaptureBound) {
        popoverInteract.dataset.pinFillCaptureBound = '1';
        popoverInteract.addEventListener('mousedown', () => {
            capturePinFillFormFieldBeforePinsInteraction();
        });
    }

    bindFormFieldPinTracking();

    const listEl = document.getElementById('form-pins-list');
    if (listEl && !listEl.dataset.bound) {
        listEl.dataset.bound = '1';
        listEl.addEventListener('click', (e) => {
            const item = e.target.closest('[data-pin-id]');
            if (!item) return;
            e.stopPropagation();
            e.preventDefault();
            selectedPinId = item.getAttribute('data-pin-id');
            selectedPreviewRowIndex = null;
            renderPinsPopoverContent();
        });
    }

    const popoverEl = document.getElementById('form-pins-popover');
    if (popoverEl && !popoverEl.dataset.bound) {
        popoverEl.dataset.bound = '1';
        popoverEl.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    if (!pinsDocClickBound) {
        pinsDocClickBound = true;
        document.addEventListener('click', (e) => {
            if (!pinsPopoverOpen) return;
            const dock = document.getElementById('form-pins-dock');
            if (!dock) return;
            const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
            const insideDock = path.includes(dock) || dock.contains(e.target);
            if (!insideDock) {
                closePinsPopover();
            }
        });
    }

    if (!pinsEscapeBound) {
        pinsEscapeBound = true;
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && pinsPopoverOpen) {
                closePinsPopover();
            }
        });
    }

    syncFormPinsDock();
}

window.initResultPins = initResultPins;
window.refreshResultPinsFromStorage = refreshResultPinsFromStorage;
window.syncResultPinButton = syncResultPinButton;
window.syncFormPinsDock = syncFormPinsDock;