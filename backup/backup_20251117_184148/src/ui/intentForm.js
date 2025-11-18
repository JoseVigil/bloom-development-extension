// VSCode API
const vscode = acquireVsCodeApi();
let lastFocusedField = null;
let autoSaveTimer = null;

// Capturar último campo enfocado
document.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
        lastFocusedField = e.target;
    }
});

// Formateo de texto
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

// Insertar nombre de archivo en cursor
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

// Abrir preview de archivo
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

// Auto-save draft
function saveDraft() {
    const formData = {
        name: document.getElementById('name').value,
        problem: document.getElementById('problem').value,
        notes: document.getElementById('notes').value
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

// Cargar draft al abrir
function loadDraft() {
    const state = vscode.getState();
    if (state && state.draft) {
        document.getElementById('name').value = state.draft.name || '';
        document.getElementById('problem').value = state.draft.problem || '';
        document.getElementById('notes').value = state.draft.notes || '';

        document.getElementById('autoSaveIndicator').textContent = 
            '📂 Draft cargado de ' + new Date(state.lastSaved).toLocaleString();
    }
}

// Auto-save cada 30 segundos
setInterval(saveDraft, 30000);

// Auto-save al escribir (debounced)
document.getElementById('problem').addEventListener('input', () => {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(saveDraft, 2000);
    
    // Enable/disable generate button
    const hasContent = document.getElementById('problem').value.length > 20;
    document.getElementById('generateBtn').disabled = !hasContent;
});

document.getElementById('name').addEventListener('input', () => {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(saveDraft, 2000);
});

document.getElementById('notes').addEventListener('input', () => {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(saveDraft, 2000);
});

// Submit form
document.getElementById('intentForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = {
        name: document.getElementById('name').value.trim(),
        problem: document.getElementById('problem').value.trim(),
        notes: document.getElementById('notes').value.trim()
    };

    vscode.postMessage({
        command: 'submit',
        data: formData
    });

    // Limpiar draft después de generar
    vscode.setState({});
});

function cancel() {
    vscode.postMessage({ command: 'cancel' });
}

// Recibir contenido de archivo
window.addEventListener('message', event => {
    const message = event.data;
    
    if (message.command === 'showFileContent') {
        document.getElementById('previewContent').textContent = message.content;
    } else if (message.command === 'setFiles') {
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
    }
});

// Cargar draft al iniciar
loadDraft();