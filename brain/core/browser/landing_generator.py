"""
Generador de landing pages estáticas para perfiles de Chrome.
Crea HTML/CSS/JS auto-contenidos sin dependencias externas.
Lee extensionId desde nucleus.json para inyectar en landing.
"""

import json
import os
import platform
import sys
from pathlib import Path
from typing import Dict, Any
from datetime import datetime


def generate_profile_landing(profile_path: Path, profile_data: Dict[str, Any]) -> None:
    """
    Genera landing page estática para un perfil.
    
    Args:
        profile_path: Path al directorio del perfil (e.g., profiles/abc-123/)
        profile_data: Dict con {id, alias, created_at, linked_account}
    """
    landing_dir = profile_path / "landing"
    landing_dir.mkdir(parents=True, exist_ok=True)
    
    # Leer Extension ID desde nucleus.json
    extension_id = _read_extension_id()
    
    # Generar archivos
    _generate_html(landing_dir, profile_data, extension_id)
    _generate_css(landing_dir)
    _generate_js(landing_dir)
    _generate_manifest(landing_dir, profile_data)


def _read_extension_id() -> str:
    """
    Lee extensionId desde nucleus.json en base_dir.
    
    Returns:
        Extension ID o 'PLACEHOLDER' si no existe
    """
    try:
        base_dir = _get_base_directory()
        nucleus_path = base_dir / "nucleus.json"
        
        if not nucleus_path.exists():
            print(f"⚠️  nucleus.json not found at: {nucleus_path}", file=sys.stderr)
            return 'PLACEHOLDER'
        
        with open(nucleus_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        extension_id = config.get('extensionId')
        
        if not extension_id:
            print("⚠️  extensionId not found in nucleus.json", file=sys.stderr)
            return 'PLACEHOLDER'
        
        print(f"✅ Extension ID loaded: {extension_id[:16]}...", file=sys.stderr)
        return extension_id
        
    except Exception as e:
        print(f"⚠️  Error reading extension ID: {e}", file=sys.stderr)
        return 'PLACEHOLDER'


def _get_base_directory() -> Path:
    """Determina el directorio base según el sistema operativo"""
    system = platform.system()
    
    if system == "Windows":
        localappdata = os.environ.get("LOCALAPPDATA")
        if not localappdata:
            raise RuntimeError("Variable LOCALAPPDATA no encontrada")
        return Path(localappdata) / "BloomNucleus"
    
    elif system == "Darwin":  # macOS
        home = Path.home()
        return home / "Library" / "Application Support" / "BloomNucleus"
    
    else:  # Linux y otros
        home = Path.home()
        return home / ".local" / "share" / "BloomNucleus"


def _generate_html(landing_dir: Path, profile_data: Dict[str, Any], extension_id: str) -> None:
    """Genera index.html con Extension ID real inyectado"""
    
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bloom - {profile_data.get('alias', 'Worker')}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app">
    <div class="loading">
      <div class="spinner"></div>
      <p>Initializing Cockpit...</p>
    </div>
  </div>

  <script>
    // Inject profile data
    window.BLOOM_PROFILE_DATA = {json.dumps({
        'id': profile_data.get('id'),
        'alias': profile_data.get('alias'),
        'role': 'Worker Profile',
        'created': profile_data.get('created_at'),
        'lastLaunch': datetime.now().isoformat(),
        'accounts': [],
        'stats': {
            'totalLaunches': 0,
            'uptime': '0h',
            'intentsCompleted': 0,
            'lastSync': None
        }
    }, indent=2)};
    
    // Extension ID (injected from nucleus.json)
    window.BLOOM_EXTENSION_ID = '{extension_id}';
  </script>
  
  <script src="script.js"></script>
</body>
</html>"""
    
    (landing_dir / "index.html").write_text(html_content, encoding='utf-8')


def _generate_css(landing_dir: Path) -> None:
    """Genera styles.css"""
    
    css_content = """* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: linear-gradient(135deg, #0f0f23 0%, #1a0b2e 50%, #0f0f23 100%);
  color: white;
  min-height: 100vh;
  overflow-x: hidden;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 20px;
}

.spinner {
  width: 60px;
  height: 60px;
  border: 4px solid rgba(147, 51, 234, 0.1);
  border-top-color: #9333ea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

#app {
  max-width: 1400px;
  margin: 0 auto;
  padding: 40px;
}

/* Header */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 60px;
}

.identity {
  display: flex;
  align-items: center;
  gap: 20px;
}

.avatar {
  width: 80px;
  height: 80px;
  border-radius: 20px;
  background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  font-weight: bold;
  box-shadow: 0 8px 32px rgba(147, 51, 234, 0.4);
}

.identity h1 {
  font-size: 48px;
  font-weight: 800;
  background: linear-gradient(135deg, #a78bfa 0%, #f472b6 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 5px;
}

.identity .role {
  color: #94a3b8;
  font-size: 18px;
}

.status-bar {
  display: flex;
  gap: 20px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  backdrop-filter: blur(10px);
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ef4444;
  animation: pulse 2s infinite;
}

.status-dot.connected {
  background: #22c55e;
  animation: none;
}

.status-dot.checking {
  background: #eab308;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
  margin-bottom: 60px;
}

.stat-card {
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 20px;
  padding: 30px;
  backdrop-filter: blur(10px);
}

.stat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  color: #94a3b8;
  font-size: 14px;
}

.stat-value {
  font-size: 36px;
  font-weight: 700;
}

/* Content Grid */
.content-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
}

.content-card {
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 20px;
  padding: 30px;
  backdrop-filter: blur(10px);
}

.content-card h2 {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 30px;
  font-size: 20px;
}

/* Accounts List */
.accounts-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.account-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 12px;
}

.account-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}

.account-info {
  flex: 1;
}

.account-provider {
  font-weight: 500;
  text-transform: capitalize;
}

.account-email {
  color: #94a3b8;
  font-size: 14px;
}

.account-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
}

/* Quick Actions */
.actions-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.action-btn {
  padding: 20px;
  background: rgba(147, 51, 234, 0.1);
  border: 1px solid rgba(147, 51, 234, 0.2);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.action-btn:hover {
  background: rgba(147, 51, 234, 0.2);
  transform: translateY(-2px);
}

.action-btn .icon {
  font-size: 24px;
  margin-bottom: 8px;
}

.action-btn .title {
  font-weight: 600;
  margin-bottom: 4px;
}

.action-btn .subtitle {
  color: #94a3b8;
  font-size: 12px;
}

/* System Info */
.system-info {
  margin-top: 24px;
  padding: 20px;
  background: rgba(15, 23, 42, 0.3);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 20px;
  display: flex;
  justify-content: space-between;
  color: #94a3b8;
  font-size: 14px;
  font-family: 'Courier New', monospace;
}

.system-info span {
  color: #cbd5e1;
}"""
    
    (landing_dir / "styles.css").write_text(css_content, encoding='utf-8')


def _generate_js(landing_dir: Path) -> None:
    """Genera script.js"""
    
    js_content = """// Bloom Profile Cockpit
// Auto-generated landing page script

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
});"""
    
    (landing_dir / "script.js").write_text(js_content, encoding='utf-8')


def _generate_manifest(landing_dir: Path, profile_data: Dict[str, Any]) -> None:
    """Genera manifest.json con metadata del perfil"""
    
    manifest = {
        "version": "1.0.0",
        "generated": datetime.now().isoformat(),
        "profile": {
            "id": profile_data.get('id'),
            "alias": profile_data.get('alias'),
            "role": "Worker Profile",
            "created": profile_data.get('created_at'),
            "lastLaunch": datetime.now().isoformat()
        },
        "accounts": [],
        "stats": {
            "totalLaunches": 0,
            "uptime": "0h",
            "intentsCompleted": 0,
            "lastSync": None
        }
    }
    
    (landing_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding='utf-8'
    )