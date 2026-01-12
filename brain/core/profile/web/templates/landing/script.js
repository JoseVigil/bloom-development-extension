let connectionCheckInterval;

document.addEventListener('DOMContentLoaded', () => {
  initializeCockpit();
});

async function initializeCockpit() {
  const profile = window.BLOOM_PROFILE_DATA;
  
  if (!profile) {
    console.error('Profile data not injected');
    return;
  }

  renderCockpit(profile);
  startConnectionChecks();
}

function renderCockpit(profile) {
  const app = document.getElementById('app');
  
  app.innerHTML = `
    <div class="header">
      <div class="identity">
        <div class="avatar">B</div>
        <div>
          <h1>${profile.alias}</h1>
          <p class="role">${profile.role}</p>
        </div>
      </div>
      
      <div class="status-bar">
        <div class="status-item">
          <div class="status-dot checking" id="extension-status"></div>
          <span>Extension</span>
        </div>
        <div class="status-item">
          <div class="status-dot checking" id="host-status"></div>
          <span>Native Host</span>
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-header">
          <span>📊</span>
          <span>Total Launches</span>
        </div>
        <div class="stat-value">${profile.stats.totalLaunches}</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-header">
          <span>⏱️</span>
          <span>Uptime</span>
        </div>
        <div class="stat-value">${profile.stats.uptime}</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-header">
          <span>✅</span>
          <span>Intents Done</span>
        </div>
        <div class="stat-value">${profile.stats.intentsCompleted}</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-header">
          <span>⚡</span>
          <span>Last Sync</span>
        </div>
        <div class="stat-value" style="font-size: 18px;">
          ${profile.stats.lastSync ? new Date(profile.stats.lastSync).toLocaleTimeString() : 'Never'}
        </div>
      </div>
    </div>

    <div class="content-grid">
      <div class="content-card">
        <h2>🔗 Linked Accounts</h2>
        <div class="accounts-list" id="accounts-list"></div>
      </div>

      <div class="content-card">
        <h2>⚡ Quick Actions</h2>
        <div class="actions-grid">
          <button class="action-btn" onclick="executeCommand('nucleus sync')">
            <div class="icon">🛡️</div>
            <div class="title">Sync Nucleus</div>
            <div class="subtitle">Update projects</div>
          </button>
          
          <button class="action-btn" onclick="executeCommand('intent list')">
            <div class="icon">📋</div>
            <div class="title">View Intents</div>
            <div class="subtitle">Active tasks</div>
          </button>
          
          <button class="action-btn" onclick="executeCommand('health full-stack')">
            <div class="icon">✅</div>
            <div class="title">Health Check</div>
            <div class="subtitle">System status</div>
          </button>
          
          <button class="action-btn" onclick="executeCommand('profile list')">
            <div class="icon">👤</div>
            <div class="title">All Profiles</div>
            <div class="subtitle">Manage workers</div>
          </button>
        </div>
      </div>
    </div>

    <div class="system-info">
      <div>Profile ID: <span>${profile.id}</span></div>
      <div>Created: <span>${new Date(profile.created).toLocaleDateString()}</span></div>
      <div>Last Launch: <span>${new Date(profile.lastLaunch).toLocaleString()}</span></div>
    </div>
  `;

  renderAccounts(profile.accounts);
}

function renderAccounts(accounts) {
  const list = document.getElementById('accounts-list');
  
  if (!accounts || accounts.length === 0) {
    list.innerHTML = '<p style="color: #94a3b8;">No accounts linked yet</p>';
    return;
  }

  list.innerHTML = accounts.map(account => `
    <div class="account-item">
      <div class="account-avatar">${account.provider[0].toUpperCase()}</div>
      <div class="account-info">
        <div class="account-provider">${account.provider}</div>
        <div class="account-email">${account.email || account.username}</div>
      </div>
      <div class="account-status"></div>
    </div>
  `).join('');
}

function startConnectionChecks() {
  checkConnections();
  connectionCheckInterval = setInterval(checkConnections, 5000);
}

async function checkConnections() {
  const extensionDot = document.getElementById('extension-status');
  const hostDot = document.getElementById('host-status');
  
  if (!extensionDot || !hostDot) return;

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage(
        window.BLOOM_EXTENSION_ID,
        { action: 'ping' },
        (response) => {
          if (chrome.runtime.lastError) {
            extensionDot.className = 'status-dot';
          } else {
            extensionDot.className = 'status-dot connected';
          }
        }
      );

      chrome.runtime.sendMessage(
        window.BLOOM_EXTENSION_ID,
        { action: 'checkHost' },
        (response) => {
          if (chrome.runtime.lastError || !response?.hostConnected) {
            hostDot.className = 'status-dot';
          } else {
            hostDot.className = 'status-dot connected';
          }
        }
      );
    } else {
      extensionDot.className = 'status-dot';
      hostDot.className = 'status-dot';
    }
  } catch (err) {
    console.error('Connection check failed:', err);
  }
}

function executeCommand(command) {
  console.log('Executing command:', command);
  
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage(
      window.BLOOM_EXTENSION_ID,
      {
        action: 'executeBrainCommand',
        command: command
      },
      (response) => {
        console.log('Command response:', response);
        if (response?.success) {
          alert('Command executed successfully!');
        } else {
          alert('Command failed: ' + (response?.error || 'Unknown error'));
        }
      }
    );
  } else {
    console.warn('Chrome runtime not available');
    alert('[MOCK] Would execute: ' + command);
  }
}

window.addEventListener('beforeunload', () => {
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
  }
});