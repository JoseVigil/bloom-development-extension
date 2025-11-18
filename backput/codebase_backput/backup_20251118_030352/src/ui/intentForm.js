// VSCode API
const vscode = acquireVsCodeApi();
let lastFocusedField = null;
let autoSaveTimer = null;

// Contadores para IDs únicos de items en listas
let listCounters = {
    currentBehavior: 0,
    desiredBehavior: 0
};

// Capturar último campo enfocado
document.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
        lastFocusedField = e.target;
    }
});

// ===== FORMATEO DE TEXTO =====
function formatText(type) {
    const textarea = lastFocusedField || document.getElementById('problem');
    if (!textarea || textarea.tagName !== 'TEXTAREA') return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    let formatted = selected;

    switch(type) {
        case 'bold':
            formatted = `**${selected}**`;
            break;
        case 'italic':
            formatted = `*${selected}*`;
            break;
        case 'code':
            formatted = `\`\`\`\n${selected}\n\`\`\``;
            break;
        case 'list':
            formatted = selected.split('\n').map(line => line ? `- ${line}` : '').join('\n');
            break;
    }

    textarea.value = textarea.value.substring(0, start) + formatted + textarea.value.substring(end);
    textarea.selectionStart = start;
    textarea.selectionEnd = start + formatted.length;
    textarea.focus();

    saveDraft();
}

// ===== MANEJO DE ARCHIVOS =====
function insertFileName(filename) {
    const target = lastFocusedField || document.getElementById('problem');
    if (!target || (target.tagName !== 'TEXTAREA' && target.tagName !== 'INPUT')) {
        alert('Haz click en un campo de texto primero');
        return;
    }

    const start = target.selectionStart || 0;
    const end = target.selectionEnd || 0;
    const text = filename + ' ';

    target.value = target.value.substring(0, start) + text + target.value.substring(end);
    target.selectionStart = target.selectionEnd = start + text.length;
    target.focus();

    saveDraft();
}

function openFilePreview(filename) {
    vscode.postMessage({
        command: 'getFileContent',
        filename: filename
    });

    document.getElementById('previewPanel').classList.add('visible');
    document.getElementById('previewTitle').textContent = `📄 ${filename}`;
}

function closePreview() {
    document.getElementById('previewPanel').classList.remove('visible');
}

// ===== LISTAS DINÁMICAS =====
function addListItem(listName) {
    const listContainer = document.getElementById(listName + 'List');
    const itemId = listName + '_' + listCounters[listName]++;
    
    const itemDiv = document.createElement('div');
    itemDiv.className = 'list-item';
    itemDiv.id = itemId;
    itemDiv.innerHTML = `
        <input type="text" placeholder="Escribir aquí..." />
        <button type="button" class="btn-remove" onclick="removeListItem('${itemId}')" title="Eliminar">×</button>
    `;
    
    listContainer.appendChild(itemDiv);
    
    // Focus en el input recién creado
    const newInput = itemDiv.querySelector('input');
    if (newInput) {
        newInput.focus();
        // Auto-save al escribir en listas
        newInput.addEventListener('input', () => {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = setTimeout(saveDraft, 2000);
        });
    }

    saveDraft();
}

function removeListItem(itemId) {
    const item = document.getElementById(itemId);
    if (item) {
        item.remove();
        saveDraft();
    }
}

function getListValues(listName) {
    const listContainer = document.getElementById(listName + 'List');
    const inputs = listContainer.querySelectorAll('input');
    return Array.from(inputs)
        .map(input => input.value.trim())
        .filter(v => v.length > 0);
}

// ===== AUTO-SAVE DRAFT =====
function saveDraft() {
    const formData = {
        name: document.getElementById('name').value,
        problem: document.getElementById('problem').value,
        expectedOutput: document.getElementById('expectedOutput').value,
        currentBehavior: getListValues('currentBehavior'),
        desiredBehavior: getListValues('desiredBehavior'),
        considerations: document.getElementById('considerations').value
    };

    const state = vscode.getState() || {};
    state.draft = formData;
    state.lastSaved = new Date().toISOString();
    vscode.setState(state);

    showAutoSaveIndicator();
}

function showAutoSaveIndicator() {
    const indicator = document.getElementById('autoSaveIndicator');
    indicator.textContent = '💾 Draft guardado ' + new Date().toLocaleTimeString();
    indicator.style.opacity = '1';

    setTimeout(() => {
        indicator.style.opacity = '0.6';
    }, 2000);
}

function loadDraft() {
    const state = vscode.getState();
    if (state && state.draft) {
        const draft = state.draft;
        
        document.getElementById('name').value = draft.name || '';
        document.getElementById('problem').value = draft.problem || '';
        document.getElementById('expectedOutput').value = draft.expectedOutput || '';
        document.getElementById('considerations').value = draft.considerations || '';

        // Restaurar listas
        if (draft.currentBehavior && Array.isArray(draft.currentBehavior)) {
            draft.currentBehavior.forEach(value => {
                addListItem('currentBehavior');
                const items = document.getElementById('currentBehaviorList').querySelectorAll('.list-item');
                const lastItem = items[items.length - 1];
                if (lastItem) {
                    lastItem.querySelector('input').value = value;
                }
            });
        }

        if (draft.desiredBehavior && Array.isArray(draft.desiredBehavior)) {
            draft.desiredBehavior.forEach(value => {
                addListItem('desiredBehavior');
                const items = document.getElementById('desiredBehaviorList').querySelectorAll('.list-item');
                const lastItem = items[items.length - 1];
                if (lastItem) {
                    lastItem.querySelector('input').value = value;
                }
            });
        }

        document.getElementById('autoSaveIndicator').textContent = 
            '📂 Draft cargado de ' + new Date(state.lastSaved).toLocaleString();
    } else {
        // Agregar items iniciales si no hay draft
        addListItem('currentBehavior');
        addListItem('desiredBehavior');
    }
}

// ===== VALIDACIÓN =====
function showValidationErrors(errors) {
    const errorDiv = document.getElementById('errorMessage');
    const errorList = document.getElementById('errorList');
    
    errorList.innerHTML = errors.map(err => `<li>${err}</li>`).join('');
    errorDiv.style.display = 'block';
    
    errorDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hideValidationErrors() {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.style.display = 'none';
}

// ===== SUBMIT FORM =====
document.getElementById('intentForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    hideValidationErrors();

    // Obtener archivos seleccionados
    const selectedFiles = [];
    const filePills = document.querySelectorAll('.file-pill button[onclick^="insertFileName"]');
    filePills.forEach(btn => {
        const match = btn.getAttribute('onclick').match(/insertFileName\('([^']+)'\)/);
        if (match) {
            selectedFiles.push(match[1]);
        }
    });

    const formData = {
        name: document.getElementById('name').value.trim(),
        problem: document.getElementById('problem').value.trim(),
        expectedOutput: document.getElementById('expectedOutput').value.trim(),
        currentBehavior: getListValues('currentBehavior'),
        desiredBehavior: getListValues('desiredBehavior'),
        considerations: document.getElementById('considerations').value.trim(),
        selectedFiles: selectedFiles
    };

    vscode.postMessage({
        command: 'submit',
        data: formData
    });

    // Limpiar draft después de generar
    vscode.setState({});
});

function cancel() {
    if (confirm('¿Estás seguro de que quieres cancelar? Se perderán todos los cambios.')) {
        vscode.postMessage({ command: 'cancel' });
    }
}

// ===== AUTO-SAVE INTERVALS =====
setInterval(saveDraft, 30000);

// Auto-save al escribir (debounced)
document.getElementById('problem').addEventListener('input', () => {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(saveDraft, 2000);
    
    // Enable/disable generate button
    updateGenerateButton();
});

document.getElementById('name').addEventListener('input', () => {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(saveDraft, 2000);
    updateGenerateButton();
});

document.getElementById('expectedOutput').addEventListener('input', () => {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(saveDraft, 2000);
    updateGenerateButton();
});

document.getElementById('considerations').addEventListener('input', () => {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(saveDraft, 2000);
});

function updateGenerateButton() {
    const hasName = document.getElementById('name').value.length > 0;
    const hasProblem = document.getElementById('problem').value.length > 20;
    const hasOutput = document.getElementById('expectedOutput').value.length > 10;
    
    document.getElementById('generateBtn').disabled = !(hasName && hasProblem && hasOutput);
}

// ===== MENSAJES DEL HOST =====
window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.command) {
        case 'showFileContent':
            document.getElementById('previewContent').textContent = message.content;
            break;
            
        case 'setFiles':
            const container = document.getElementById('filePills');
            container.innerHTML = message.files.map(filename => `
                <span class="file-pill">
                    <button type="button" onclick="insertFileName('${filename}')" style="background:none;border:none;color:inherit;cursor:pointer;">
                        📄 ${filename}
                    </button>
                    <button type="button" class="file-link" onclick="openFilePreview('${filename}')" title="Ver archivo">
                        🔗
                    </button>
                </span>
            `).join('');
            break;
            
        case 'validationErrors':
            showValidationErrors(message.errors);
            break;
            
        case 'error':
            alert('Error: ' + message.message);
            break;
    }
});

// ===== ATAJOS DE TECLADO =====
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter para enviar
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('intentForm').dispatchEvent(new Event('submit'));
    }
    
    // Escape para cancelar
    if (e.key === 'Escape') {
        cancel();
    }
});

// ===== INICIALIZACIÓN =====
loadDraft();
updateGenerateButton();