const vscode = acquireVsCodeApi();

// Funciones para listas
function addCurrentBehavior() { addListItem('currentBehavior', 'Describe el comportamiento actual'); }
function addDesiredBehavior() { addListItem('desiredBehavior', 'Describe el comportamiento deseado'); }
function addScope() { addListItem('scope', 'Define restricciones o límites'); }
function addTest() { addListItem('tests', 'Criterio de validación'); }

function addListItem(containerId, placeholder) {
    const container = document.getElementById(containerId);
    const div = document.createElement('div');
    div.className = 'list-item';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-remove';
    button.textContent = '×';
    button.onclick = function() { removeItem(button); };

    div.appendChild(input);
    div.appendChild(button);
    container.appendChild(div);
}

function removeItem(button) {
    const container = button.closest('.list-container');
    const items = container.querySelectorAll('.list-item');
    if (items.length > 1) {
        button.closest('.list-item').remove();
    }
}

function getListValues(containerId) {
    const container = document.getElementById(containerId);
    const inputs = container.querySelectorAll('input');
    return Array.from(inputs).map(i => i.value.trim()).filter(v => v.length > 0);
}

function cancel() {
    vscode.postMessage({ command: 'cancel' });
}

// SOLUCIÓN DEFINITIVA: insertFileName que NUNCA falla
let lastFocusedField = null;

// Capturamos foco en cualquier input/textarea
document.addEventListener('focusin', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        lastFocusedField = e.target;
    }
});

// También capturamos clics (por si el usuario hace clic sin soltar el foco)
document.addEventListener('click', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        lastFocusedField = e.target;
    }
});

// La función mágica que funciona SIEMPRE
function insertFileName(filename) {
    let target = lastFocusedField;

    // Si por algún motivo no tenemos último foco, intentamos con activeElement
    if (!target) {
        target = document.activeElement;
    }

    // Si todavía no hay nada, buscamos cualquier campo visible (fallback final)
    if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA')) {
        target = document.querySelector('input:focus, textarea:focus') ||
                 document.querySelector('input, textarea');
    }

    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        const start = target.selectionStart || 0;
        const end = target.selectionEnd || 0;
        const textToInsert = filename + ' '; // agrego un espacio para que quede lindo

        target.value = target.value.substring(0, start) + textToInsert + target.value.substring(end);
        target.selectionStart = target.selectionEnd = start + textToInsert.length;
        target.focus();

        // Disparamos evento input para que cualquier listener lo detecte
        target.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
        // Solo como último recurso mostramos error (esto NUNCA debería pasar ahora)
        const banner = document.getElementById('errorBanner');
        banner.textContent = 'Haz clic en un campo antes de insertar';
        banner.classList.add('visible');
        setTimeout(() => banner.classList.remove('visible'), 3000);
    }
}

// Evento de submit
document.getElementById('intentForm').addEventListener('submit', (e) => {
    e.preventDefault();
    document.querySelectorAll('.error-message').forEach(el => {
        el.classList.remove('visible'); el.textContent = '';
    });
    document.getElementById('errorBanner').classList.remove('visible');

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

    vscode.postMessage({ command: 'submit', data: formData });
});

// Listener para mensajes de validación/error
window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'validationErrors') {
        const banner = document.getElementById('errorBanner');
        banner.innerHTML = '<strong>Corrije los siguientes errores:</strong><ul>' +
            message.errors.map(err => '<li>' + err + '</li>').join('') + '</ul>';
        banner.classList.add('visible');
        window.scrollTo(0, 0);
    } else if (message.command === 'error') {
        document.getElementById('errorBanner').textContent = message.message;
        document.getElementById('errorBanner').classList.add('visible');
    }
});