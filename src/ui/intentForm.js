// VSCode API
const vscode = acquireVsCodeApi();

// Contadores para IDs únicos de items en listas
let listCounters = {
    currentBehavior: 0,
    desiredBehavior: 0,
    scope: 0,
    tests: 0
};

/**
 * Agrega un nuevo item a una lista dinámica
 */
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
    }
}

/**
 * Elimina un item de una lista dinámica
 */
function removeListItem(itemId) {
    const item = document.getElementById(itemId);
    if (item) {
        item.remove();
    }
}

/**
 * Obtiene todos los valores de una lista dinámica
 */
function getListValues(listName) {
    const listContainer = document.getElementById(listName + 'List');
    const inputs = listContainer.querySelectorAll('input');
    return Array.from(inputs)
        .map(input => input.value.trim())
        .filter(v => v.length > 0);
}

/**
 * Inserta el nombre de un archivo en el campo activo
 */
function insertFileName(filename) {
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
        const start = activeElement.selectionStart;
        const end = activeElement.selectionEnd;
        const text = activeElement.value;
        activeElement.value = text.substring(0, start) + filename + text.substring(end);
        activeElement.focus();
        activeElement.selectionStart = activeElement.selectionEnd = start + filename.length;
    }
}

/**
 * Cancela y cierra el formulario
 */
function cancel() {
    if (confirm('¿Estás seguro de que quieres cancelar? Se perderán todos los cambios.')) {
        vscode.postMessage({ command: 'cancel' });
    }
}

/**
 * Muestra los errores de validación
 */
function showValidationErrors(errors) {
    const errorDiv = document.getElementById('errorMessage');
    const errorList = document.getElementById('errorList');
    
    errorList.innerHTML = errors.map(err => `<li>${err}</li>`).join('');
    errorDiv.style.display = 'block';
    
    // Scroll suave hacia los errores
    errorDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Oculta los errores de validación
 */
function hideValidationErrors() {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.style.display = 'none';
}

/**
 * Maneja el envío del formulario
 */
document.getElementById('intentForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    hideValidationErrors();
    
    const formData = {
        name: document.getElementById('name').value.trim(),
        problem: document.getElementById('problem').value.trim(),
        context: document.getElementById('context').value.trim(),
        currentBehavior: getListValues('currentBehavior'),
        desiredBehavior: getListValues('desiredBehavior'),
        objective: document.getElementById('objective').value.trim(),
        scope: getListValues('scope'),
        considerations: document.getElementById('considerations').value.trim(),
        tests: getListValues('tests'),
        expectedOutput: document.getElementById('expectedOutput').value.trim()
    };
    
    vscode.postMessage({
        command: 'submit',
        data: formData
    });
});

/**
 * Maneja mensajes del host (VSCode)
 */
window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.command) {
        case 'validationErrors':
            showValidationErrors(message.errors);
            break;
            
        case 'error':
            alert('Error: ' + message.message);
            break;
            
        case 'success':
            // Podrías agregar animación de éxito aquí
            break;
    }
});

/**
 * Inicialización al cargar la página
 */
document.addEventListener('DOMContentLoaded', () => {
    // Agregar items iniciales a las listas
    addListItem('currentBehavior');
    addListItem('desiredBehavior');
    addListItem('scope');
    
    // Focus en el primer campo
    document.getElementById('name').focus();
});

/**
 * Atajos de teclado
 */
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