(function() {
    const vscode = acquireVsCodeApi();

    let profiles = [];
    let intents = [];
    let mappings = [];

    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.command) {
            case 'profilesDetected':
                profiles = message.profiles;
                renderProfiles();
                updateProfileSelects();
                break;
            case 'intentsLoaded':
                intents = message.intents;
                updateIntentSelect();
                break;
            case 'mappingsLoaded':
                mappings = message.mappings;
                renderMappings();
                break;
            case 'mappingSaved':
                showNotification('success', 'Mapping saved successfully');
                closeModal();
                requestMappings();
                break;
            case 'mappingDeleted':
                showNotification('success', 'Mapping deleted');
                requestMappings();
                break;
            case 'connectionTested':
                handleConnectionTestResult(message);
                break;
        }
    });

    document.getElementById('scanButton').addEventListener('click', () => {
        vscode.postMessage({ command: 'scanProfiles' });
        showLoading('profilesContainer');
    });

    document.getElementById('addMappingButton').addEventListener('click', () => {
        openModal();
    });

    document.getElementById('closeModalButton').addEventListener('click', closeModal);
    document.getElementById('cancelMappingButton').addEventListener('click', closeModal);

    document.getElementById('saveMappingButton').addEventListener('click', () => {
        const intentId = document.getElementById('intentSelect').value;
        const profileName = document.getElementById('profileSelect').value;
        const claudeAccount = document.getElementById('claudeAccountSelect').value;
        const chatgptAccount = document.getElementById('chatgptAccountSelect').value;
        const grokAccount = document.getElementById('grokAccountSelect').value;

        if (!intentId || !profileName) {
            showNotification('error', 'Please select intent and profile');
            return;
        }

        vscode.postMessage({
            command: 'saveIntentMapping',
            data: {
                intentId: intentId,
                profileName: profileName,
                aiAccounts: {
                    claude: claudeAccount || undefined,
                    chatgpt: chatgptAccount || undefined,
                    grok: grokAccount || undefined
                }
            }
        });
    });

    document.getElementById('profileSelect').addEventListener('change', (e) => {
        const selectedProfile = profiles.find(p => p.name === e.target.value);
        if (selectedProfile) {
            updateAccountSelects(selectedProfile);
        }
    });

    // ==================== RENDER FUNCTIONS ====================

    function renderProfiles() {
        const container = document.getElementById('profilesContainer');

        if (profiles.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">User</span>
                    <p>No profiles detectados</p>
                    <p class="empty-hint">Haz click en "Scan Profiles" para detectar automáticamente</p>
                </div>
            `;
            return;
        }

        container.innerHTML = profiles.map(profile => `
            <div class="profile-card">
                <div class="profile-header">
                    <div>
                        <div class="profile-name">User ${escapeHtml(profile.name)}</div>
                        <div class="profile-path">${escapeHtml(profile.path)}</div>
                    </div>
                </div>
                <div class="profile-accounts">
                    ${profile.accounts && profile.accounts.length > 0 
                        ? profile.accounts.map(acc => `
                            <span class="account-badge ${acc.provider.toLowerCase()}">
                                ${getProviderIcon(acc.provider)} ${escapeHtml(acc.email || acc.name || 'Logged in')}
                            </span>
                        `).join('')
                        : '<span class="account-badge" style="opacity:0.6">No accounts detected</span>'
                    }
                </div>
            </div>
        `).join('');
        
        hideLoading('profilesContainer');
    }

    function renderMappings() {
        const container = document.getElementById('mappingsContainer');

        if (mappings.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">Settings</span>
                    <p>No hay configuraciones de intent</p>
                    <p class="empty-hint">Crea un intent primero, luego asígnale un profile aquí</p>
                </div>
            `;
            return;
        }

        container.innerHTML = mappings.map(mapping => {
            const profile = profiles.find(p => p.name === mapping.profileName) || {};
            const intentName = intents.find(i => i.id === mapping.intentId)?.name || mapping.intentId;

            return `
                <div class="mapping-card">
                    <div class="mapping-field">
                        <div class="mapping-label">Intent</div>
                        <div class="mapping-value">${escapeHtml(intentName)}</div>
                    </div>
                    <div class="mapping-field">
                        <div class="mapping-label">Profile</div>
                        <div class="mapping-value">User ${escapeHtml(mapping.profileName)}</div>
                    </div>
                    <div class="mapping-field">
                        <div class="mapping-label">Cuentas asignadas</div>
                        <div class="mapping-value">
                            ${mapping.aiAccounts.claude ? `<span class="account-badge claude">Claude</span>` : ''}
                            ${mapping.aiAccounts.chatgpt ? `<span class="account-badge chatgpt">ChatGPT</span>` : ''}
                            ${mapping.aiAccounts.grok ? `<span class="account-badge grok">Grok</span>` : ''}
                            ${!mapping.aiAccounts.claude && !mapping.aiAccounts.chatgpt && !mapping.aiAccounts.grok ? '<em>None</em>' : ''}
                        </div>
                    </div>
                    <div class="mapping-actions">
                        <button class="btn btn-danger btn-sm" onclick="deleteMapping('${mapping.intentId}')">
                            Delete
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ==================== MODAL & SELECTS ====================

    function openModal() {
        requestIntents();
        document.getElementById('addMappingModal').style.display = 'flex';
        document.getElementById('intentSelect').value = '';
        document.getElementById('profileSelect').value = '';
        clearAccountSelects();
    }

    function closeModal() {
        document.getElementById('addMappingModal').style.display = 'none';
    }

    function updateIntentSelect() {
        const select = document.getElementById('intentSelect');
        select.innerHTML = '<option value="">Select an intent...</option>';
        intents.forEach(intent => {
            const option = document.createElement('option');
            option.value = intent.id;
            option.textContent = intent.name;
            select.appendChild(option);
        });
    }

    function updateProfileSelects() {
        const select = document.getElementById('profileSelect');
        select.innerHTML = '<option value="">Select a profile...</option>';
        profiles.forEach(profile => {
            const option = document.createElement('option');
            option.value = profile.name;
            option.textContent = profile.name;
            select.appendChild(option);
        });
    }

    function updateAccountSelects(selectedProfile) {
        clearAccountSelects();

        const accounts = selectedProfile.accounts || [];

        const claudeAcc = accounts.find(a => a.provider === 'claude');
        const chatgptAcc = accounts.find(a => a.provider === 'chatgpt');
        const grokAcc = accounts.find(a => a.provider === 'grok');

        populateSelect('claudeAccountSelect', claudeAcc ? [claudeAcc] : []);
        populateSelect('chatgptAccountSelect', chatgptAcc ? [chatgptAcc] : []);
        populateSelect('grokAccountSelect', grokAcc ? [grokAcc] : []);
    }

    function clearAccountSelects() {
        populateSelect('claudeAccountSelect', []);
        populateSelect('chatgptAccountSelect', []);
        populateSelect('grokAccountSelect', []);
    }

    function populateSelect(selectId, accounts) {
        const select = document.getElementById(selectId);
        select.innerHTML = '<option value="">No account detected</option>';

        accounts.forEach(acc => {
            const option = document.createElement('option');
            option.value = acc.email || acc.name;
            option.textContent = acc.email || acc.name || 'Logged in';
            select.appendChild(option);
        });

        if (accounts.length > 0) {
            select.value = accounts[0].email || accounts[0].name;
        }
    }

    // ==================== UTILITIES ====================

    function requestIntents() {
        vscode.postMessage({ command: 'loadIntents' });
    }

    function requestMappings() {
        vscode.postMessage({ command: 'loadMappings' });
    }

    window.deleteMapping = function(intentId) {
        if (confirm('¿Eliminar esta configuración de intent?')) {
            vscode.postMessage({
                command: 'deleteMapping',
                intentId: intentId
            });
        }
    };

    function handleConnectionTestResult(message) {
        // Puedes expandirlo más adelante si querés mostrar feedback visual
        console.log('Connection test:', message);
    }

    function showNotification(type, text) {
        // Implementación simple (puedes mejorarla con toast bonitos)
        const notification = document.createElement('div');
        notification.className = `status-indicator ${type}`;
        notification.textContent = text;
        notification.style.position = 'fixed';
        notification.style.top = '20px';
        notification.style.right = '20px';
        notification.style.zIndex = '10000';
        notification.style.padding = '12px 20px';
        notification.style.borderRadius = '6px';
        notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 4000);
    }

    function showLoading(containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '<div class="empty-state"><span class="empty-icon">Loading...</span><p>Escaneando perfiles...</p></div>';
        }
    }

    function hideLoading(containerId) {
        // No hacemos nada especial, renderProfiles ya lo reemplaza
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function getProviderIcon(provider) {
        switch (provider.toLowerCase()) {
            case 'claude': return 'Claude';
            case 'chatgpt': return 'ChatGPT';
            case 'grok': return 'Grok';
            default: return 'AI';
        }
    }

    // Inicialización
    requestIntents();
    requestMappings();

})();