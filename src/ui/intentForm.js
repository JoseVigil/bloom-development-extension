const vscode = acquireVsCodeApi();
let lastFocusedField = null;
let autoSaveTimer = null;
let isEditMode = false;

let listCounters = {
    currentBehavior: 0,
    desiredBehavior: 0
};

document.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
        lastFocusedField = e.target;
    }
});

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

    triggerAutoSave();
}

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

    triggerAutoSave();
}

function openFileInVSCode(filePath) {
    vscode.postMessage({
        command: 'openFileInVSCode',
        filePath: filePath
    });
}

function copyFilePath(filePath) {
    vscode.postMessage({
        command: 'copyFilePath',
        filePath: filePath
    });
}

function revealInFinder(filePath) {
    vscode.postMessage({
        command: 'revealInFinder',
        filePath: filePath
    });
}

function removeFile(filePath) {
    vscode.postMessage({
        command: 'removeFile',
        filePath: filePath
    });
}

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
    
    const newInput = itemDiv.querySelector('input');
    if (newInput) {
        newInput.focus();
        newInput.addEventListener('input', triggerAutoSave);
    }

    triggerAutoSave();
}

function removeListItem(itemId) {
    const item = document.getElementById(itemId);
    if (item) {
        item.remove();
        triggerAutoSave();
    }
}

function getListValues(listName) {
    const listContainer = document.getElementById(listName + 'List');
    const inputs = listContainer.querySelectorAll('input');
    return Array.from(inputs)
        .map(input => input.value.trim())
        .filter(v => v.length > 0);
}

function triggerAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        const updates = {
            problem: document.getElementById('problem').value,
            expectedOutput: document.getElementById('expectedOutput').value,
            currentBehavior: getListValues('currentBehavior'),
            desiredBehavior: getListValues('desiredBehavior'),
            considerations: document.getElementById('considerations').value
        };
        
        vscode.postMessage({
            command: 'autoSave',
            updates: updates
        });
        
        showAutoSaveIndicator();
    }, 2000);
}

function showAutoSaveIndicator() {
    const indicator = document.getElementById('autoSaveIndicator');
    indicator.textContent = '💾 Guardado ' + new Date().toLocaleTimeString();
    indicator.style.opacity = '1';

    setTimeout(() => {
        indicator.style.opacity = '0.6';
    }, 2000);
}

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

function updateTokenDisplay(tokens) {
    const tokenText = document.getElementById('tokenText');
    const tokenFill = document.getElementById('tokenFill');
    const tokenCounter = document.getElementById('tokenCounter');
    
    const percentage = tokens.percentage;
    const estimated = tokens.estimated.toLocaleString();
    const limit = tokens.limit.toLocaleString();
    
    tokenFill.style.width = Math.min(percentage, 100) + '%';
    
    if (percentage < 80) {
        tokenCounter.className = 'token-counter token-safe';
        tokenText.textContent = `📊 Token estimate: ${estimated} / ${limit} (${percentage.toFixed(1)}%)`;
    } else if (percentage < 100) {
        tokenCounter.className = 'token-counter token-warning';
        tokenText.textContent = `⚠️ Warning: ${estimated} / ${limit} (${percentage.toFixed(1)}%) - Consider removing files`;
    } else {
        tokenCounter.className = 'token-counter token-error';
        tokenText.textContent = `❌ Error: ${estimated} / ${limit} (${percentage.toFixed(1)}%) - Cannot generate, remove files`;
        document.getElementById('generateBtn').disabled = true;
    }
}

document.getElementById('intentForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    hideValidationErrors();

    const formData = {
        name: document.getElementById('name').value.trim(),
        problem: document.getElementById('problem').value.trim(),
        expectedOutput: document.getElementById('expectedOutput').value.trim(),
        currentBehavior: getListValues('currentBehavior'),
        desiredBehavior: getListValues('desiredBehavior'),
        considerations: document.getElementById('considerations').value.trim(),
        selectedFiles: []
    };

    vscode.postMessage({
        command: 'submit',
        data: formData
    });
});

function cancel() {
    if (confirm('¿Estás seguro de que quieres cancelar? Se perderán todos los cambios.')) {
        vscode.postMessage({ command: 'cancel' });
    }
}

function deleteIntent() {
    vscode.postMessage({ command: 'deleteIntent' });
}

function updateGenerateButton() {
    const hasName = document.getElementById('name').value.length > 0;
    const hasProblem = document.getElementById('problem').value.length > 20;
    const hasOutput = document.getElementById('expectedOutput').value.length > 10;
    
    document.getElementById('generateBtn').disabled = !(hasName && hasProblem && hasOutput);
}

document.getElementById('problem').addEventListener('input', () => {
    triggerAutoSave();
    updateGenerateButton();
});

document.getElementById('name').addEventListener('input', () => {
    triggerAutoSave();
    updateGenerateButton();
});

document.getElementById('expectedOutput').addEventListener('input', () => {
    triggerAutoSave();
    updateGenerateButton();
});

document.getElementById('considerations').addEventListener('input', triggerAutoSave);

window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.command) {
        case 'setFiles':
            renderFilePills(message.files);
            break;
            
        case 'updateTokens':
            updateTokenDisplay(message.tokens);
            break;
            
        case 'loadExistingIntent':
            loadExistingIntentData(message.data);
            break;
            
        case 'validationErrors':
            showValidationErrors(message.errors);
            break;
            
        case 'error':
            alert('Error: ' + message.message);
            break;
    }
});

function renderFilePills(files) {
    const container = document.getElementById('filePills');
    
    if (!files || files.length === 0) {
        container.innerHTML = '<p class="help-text">No hay archivos seleccionados</p>';
        return;
    }
    
    container.innerHTML = files.map(file => `
        <div class="file-pill">
            <button type="button" class="file-btn file-name" onclick="insertFileName('${file.filename}')" title="Insertar nombre">
                📄 ${file.filename}
            </button>
            <button type="button" class="file-btn" onclick="openFileInVSCode('${file.relativePath}')" title="Abrir en VSCode">
                🔗
            </button>
            <button type="button" class="file-btn" onclick="copyFilePath('${file.relativePath}')" title="Copiar path">
                📋
            </button>
            <button type="button" class="file-btn" onclick="revealInFinder('${file.relativePath}')" title="Mostrar en Finder/Explorer">
                📂
            </button>
            <button type="button" class="file-btn file-remove" onclick="removeFile('${file.relativePath}')" title="Remover">
                ❌
            </button>
        </div>
    `).join('');
}

function loadExistingIntentData(data) {
    isEditMode = true;
    
    document.getElementById('name').value = data.name || '';
    document.getElementById('name').disabled = true;
    
    document.getElementById('problem').value = data.content.problem || '';
    document.getElementById('expectedOutput').value = data.content.expectedOutput || '';
    document.getElementById('considerations').value = data.content.considerations || '';
    
    if (data.content.currentBehavior && Array.isArray(data.content.currentBehavior)) {
        data.content.currentBehavior.forEach(value => {
            addListItem('currentBehavior');
            const items = document.getElementById('currentBehaviorList').querySelectorAll('.list-item');
            const lastItem = items[items.length - 1];
            if (lastItem) {
                lastItem.querySelector('input').value = value;
            }
        });
    }

    if (data.content.desiredBehavior && Array.isArray(data.content.desiredBehavior)) {
        data.content.desiredBehavior.forEach(value => {
            addListItem('desiredBehavior');
            const items = document.getElementById('desiredBehaviorList').querySelectorAll('.list-item');
            const lastItem = items[items.length - 1];
            if (lastItem) {
                lastItem.querySelector('input').value = value;
            }
        });
    }
    
    const generateBtn = document.getElementById('generateBtn');
    if (data.status === 'completed') {
        generateBtn.textContent = '🔄 Regenerar Intent';
    }
    
    const deleteBtn = document.getElementById('deleteBtn');
    deleteBtn.style.display = 'block';
}

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('intentForm').dispatchEvent(new Event('submit'));
    }
    
    if (e.key === 'Escape') {
        cancel();
    }
});

addListItem('currentBehavior');
addListItem('desiredBehavior');
updateGenerateButton();

const deleteBtn = document.getElementById('deleteBtn');
deleteBtn.style.display = 'none';