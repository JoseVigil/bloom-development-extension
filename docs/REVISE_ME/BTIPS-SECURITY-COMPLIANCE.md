# 🛡️ BTIPS Security & Compliance

## Executive Summary

**BTIPS is NOT a web scraping bot. BTIPS is NOT a credential harvester. BTIPS is NOT a ToS-violating automation tool.**

BTIPS (Bloom Technical Intent Package) is a **governance-first, compliance-native** system for human-AI collaboration that respects provider policies, maintains transparent audit trails, and enforces strict role-based access control. In an era where tools like "Computer Use" agents and browser automation frameworks operate in legal gray areas, BTIPS establishes a **gold standard for responsible AI tooling**.

---

## 🎯 Core Security Principles

### 1. Policy Compliance by Design

BTIPS treats AI provider Terms of Service as **hard constraints**, not suggestions:

- **No credential automation**: Credentials are stored in Chrome's native secure storage (Vault), never in plaintext or environment variables
- **No session hijacking**: Profile launches use legitimate OAuth flows, not cookie theft or session replay
- **No headless scraping**: All browser instances run in **visible, user-controlled mode** with full Chrome UI
- **No rate limit circumvention**: Intent execution respects provider rate limits and displays visible progress to the user
- **No account sharing**: Each profile represents a single, authenticated human identity with explicit permissions

**Anti-Pattern Comparison:**

| Feature | ClawBot/Automation Tools | BTIPS |
|---------|-------------------------|-------|
| Browser Mode | Headless (invisible) | Visible UI (user present) |
| Credentials | Plaintext env vars | Chrome Secure Vault |
| Session Handling | Cookie theft | OAuth + Handshake |
| User Presence | Simulated/faked | Genuine human-in-loop |
| Audit Trail | None or obfuscated | Immutable intent logs |

---

### 2. Governance Model: Master → Architect → Specialist

BTIPS implements a **three-tier role hierarchy** that mirrors enterprise security models:

#### **Master Role** (Organization Owner)
- **Capabilities:**
  - Initialize Nucleus (one per organization)
  - Grant/revoke team member access
  - Unlock Vault (cryptographic authority)
  - Execute `alfred` governance commands
  - Authorize Temporal workflows
  
- **Restrictions:**
  - Cannot bypass audit trail
  - Cannot execute intents in Projects (delegation only)
  - Cannot delete historical intents (immutability)

#### **Architect Role** (Technical Lead)
- **Capabilities:**
  - Create/manage Projects
  - Execute `exp` (exploration) and `cor` (coordination) intents
  - Review and approve `dev` intents from Specialists
  - Configure Project-level policies
  
- **Restrictions:**
  - Cannot access Vault without Master approval
  - Cannot modify Nucleus governance rules
  - Limited to assigned Projects

#### **Specialist Role** (Developer)
- **Capabilities:**
  - Execute `dev` (development) intents in assigned Projects
  - Create `doc` (documentation) intents
  - Submit `inf` (information) queries
  
- **Restrictions:**
  - No Nucleus access
  - No Project creation
  - No Vault access
  - Intents require Architect review for sensitive operations

**Enforcement Mechanism:**

```
nucleus.json (in AppData/Local/BloomNucleus/config/)
{
  "organization": "example-org",
  "master": {
    "github_id": "alice",
    "vault_authority": true
  },
  "team": [
    { "github_id": "bob", "role": "architect", "projects": ["project-alpha"] },
    { "github_id": "charlie", "role": "specialist", "projects": ["project-beta"] }
  ]
}
```

Any command execution validates:
1. User identity (via GitHub OAuth)
2. Role permissions (read from `nucleus.json`)
3. Project scope (if applicable)
4. Vault state (locked/unlocked)

---

### 3. Vault Architecture: Chrome-Native Secure Storage

Unlike tools that store API keys in `.env` files or cloud services, BTIPS leverages **Chrome's OS-level credential storage**:

#### **Storage Mechanism**
- **Windows:** DPAPI (Data Protection API) - encrypted with user's Windows password
- **macOS:** Keychain - encrypted with system keychain
- **Linux:** Secret Service API (gnome-keyring/kwallet) - encrypted with user password

#### **Access Protocol**
1. **Vault Unlock** (Master only):
   ```bash
   nucleus vault-unlock
   ```
   - Prompts Chrome Master Profile for biometric/password auth
   - Establishes temporary session token
   - Token expires after 30 minutes of inactivity

2. **Key Request Flow**:
   ```
   Brain (needs API key) 
     ↓
   → Requests key from Sentinel
     ↓
   → Sentinel forwards to Nucleus
     ↓
   → Nucleus validates Vault state
     ↓
   → Nucleus queries Chrome Extension (Cortex)
     ↓
   → Cortex retrieves from Chrome Secure Storage
     ↓
   → Key returned via encrypted channel
     ↓
   → Brain uses key (never persisted)
   ```

3. **Transparency Layer**:
   - Every Vault access logs to telemetry:
     ```json
     {
       "event": "VAULT_KEY_REQUEST",
       "key_id": "openai_api_key",
       "requester": "brain.exe",
       "profile_id": "profile_001",
       "timestamp": 1707418080,
       "granted": true
     }
     ```
   - Conductor UI shows **Vault Shield** indicator when credentials are in use
   - User can revoke access at any time via `nucleus vault-lock`

#### **Anti-Theft Properties**
- Keys never touch filesystem (RAM only)
- No network transmission (local TCP only)
- Encrypted at rest by OS
- Requires physical machine access + user auth
- Audit trail prevents silent exfiltration

---

### 4. Synapse Protocol: 3-Phase Handshake Security

The **Synapse Protocol** is BTIPS's proprietary communication layer between Extension and System. Unlike traditional WebSockets or HTTP, Synapse enforces **cryptographic validation** before any operation:

#### **Phase 1: Extension → Host (Capability Discovery)**
```typescript
// Cortex (Chrome Extension) initiates
synapseClient.send({
  type: "HANDSHAKE_INIT",
  extension_id: "bloom-cortex-v1.2.3",
  protocol_version: "3.0",
  capabilities: ["intent_execution", "vault_access", "profile_launch"]
})
```

#### **Phase 2: Host → Extension (Identity Validation)**
```cpp
// bloom-host.exe validates
{
  "type": "HANDSHAKE_ACK",
  "host_version": "2.1.0",
  "session_token": "sha256(extension_id + timestamp + nonce)",
  "allowed_operations": ["READ_INTENT", "WRITE_ARTIFACT"]
}
```

#### **Phase 3: Host → Brain (Channel Activation)**
```python
# Brain confirms readiness
{
  "type": "CHANNEL_READY",
  "profile_id": "profile_001",
  "session_token": "...",  # Same token from Phase 2
  "timestamp": 1707418080
}
```

**Security Properties:**
- **Mutual authentication**: Both sides prove identity
- **Session tokens**: Prevent replay attacks
- **Version compatibility**: Blocks mismatched components
- **Graceful degradation**: Incompatible versions refuse connection (no silent failures)

**Failure Modes:**
- Extension version mismatch → Connection refused, user notified
- Host process not running → Graceful retry with backoff
- Session token expired → Re-authentication required
- Capabilities insufficient → Operation blocked, logged

---

### 5. Immutable Audit Trail

Every technical action in BTIPS produces an **immutable intent record**:

#### **Intent Structure**
```json
{
  "intent_id": "dev_2024-02-08_001",
  "type": "dev",
  "project": "project-alpha",
  "author": {
    "github_id": "charlie",
    "role": "specialist"
  },
  "created_at": 1707418080,
  "state": "completed",
  "input": {
    "task": "Implement user authentication",
    "context": ["src/auth/", "docs/security.md"]
  },
  "output": {
    "files_modified": ["src/auth/login.ts", "src/auth/session.ts"],
    "artifacts": ["auth-session-diagram.png"],
    "test_results": "PASS (12/12)"
  },
  "approvals": [
    {
      "architect": "bob",
      "timestamp": 1707419000,
      "decision": "approved"
    }
  ],
  "signature": "sha256(...)"  # Prevents tampering
}
```

#### **Audit Properties**
- **Append-only**: Intents cannot be deleted, only marked as superseded
- **Cryptographic integrity**: SHA-256 signature prevents modification
- **Time-bound**: Timestamps anchored to system clock (synced via NTP)
- **Attributable**: Every action tied to authenticated GitHub identity
- **Searchable**: Full-text search across all historical intents

#### **Compliance Use Cases**
- **ISO 27001**: Demonstrates change management controls
- **SOC 2**: Proves access control and monitoring
- **GDPR**: Right to be forgotten (user can request redaction, but history preserved)
- **HIPAA**: Audit trail for PHI access (if applicable)

---

### 6. Transparent Execution vs. Black Box Automation

BTIPS deliberately **rejects stealth mode** in favor of observable, governable execution:

| Aspect | Black Box Tools | BTIPS |
|--------|----------------|-------|
| Browser Visibility | Hidden (headless) | Always visible |
| User Awareness | None (runs in background) | Real-time event stream |
| Progress Indication | Silent or fake | Live telemetry in Conductor/Cockpit |
| Error Handling | Silent failures | Explicit error events + logs |
| Credential Access | Invisible | Vault Shield UI indicator |
| Network Activity | Unmonitored | Logged in telemetry streams |

**Example: Intent Execution Visibility**

When a `dev` intent runs:
1. **Conductor UI** shows:
   - Intent ID and description
   - Current state (planning → executing → validating)
   - Progress bar (0-100%)
   - Files being modified in real-time
   - AI model calls with token counts

2. **Sentinel Cockpit** (TUI) displays:
   - Event stream with timestamps
   - Brain → Host → Cortex communication
   - Vault access indicators
   - Resource usage (CPU/RAM/Network)

3. **Filesystem** records:
   - Intent JSON in `.bloom/.intents/`
   - Execution logs in `AppData/Local/BloomNucleus/logs/`
   - Telemetry JSON in `logs/telemetry.json`

**User Control:**
- Press `Ctrl+C` in Sentinel → Graceful shutdown
- Click "Stop Intent" in Conductor → Immediate termination
- Lock Vault → All API calls fail-safe
- Close Chrome profile → Host detects and halts

---

## 🚨 Anti-Pattern Detection

BTIPS actively **monitors for and prevents** common automation abuses:

### Prohibited Operations
1. **Credential Harvesting**
   - ❌ Reading cookies from other profiles
   - ❌ Exporting session tokens
   - ❌ Scraping login forms
   - ✅ Using only OAuth-granted credentials in current profile

2. **Rate Limit Circumvention**
   - ❌ Creating multiple accounts to bypass limits
   - ❌ Rotating IP addresses
   - ❌ Spoofing user agents
   - ✅ Respecting provider rate limits with exponential backoff

3. **Content Scraping**
   - ❌ Downloading entire websites
   - ❌ Bypassing paywalls
   - ❌ Extracting private content
   - ✅ Using official APIs or user-authorized actions

4. **Session Manipulation**
   - ❌ Cookie injection
   - ❌ LocalStorage tampering
   - ❌ DOM manipulation to fake user actions
   - ✅ Genuine user interactions via Cortex extension

### Detection Mechanisms
```python
# Example: Brain monitors for suspicious patterns
def validate_intent_safety(intent):
    if intent.contains_credential_export():
        raise ComplianceViolation("Credential export blocked")
    
    if intent.exceeds_rate_limit(provider="openai"):
        return throttle_intent(intent, delay=60)
    
    if intent.targets_unauthorized_url():
        raise SecurityException("URL not in allowed domains")
    
    return proceed(intent)
```

---

## 🔐 Compliance Certifications & Standards

### Current Alignment
- **OWASP Top 10**: No SQL injection, XSS, CSRF vulnerabilities (uses parameterized queries, CSP headers)
- **CWE Top 25**: No hardcoded credentials, insecure deserialization, or path traversal
- **NIST Cybersecurity Framework**: Implements Identify, Protect, Detect, Respond, Recover controls

### Roadmap
- **SOC 2 Type II**: Formal audit in progress (Q3 2025)
- **ISO 27001**: Information security management system (Q4 2025)
- **GDPR Compliance**: Data processing agreements for EU users (Q2 2025)

---

## 📊 Security Metrics Dashboard

BTIPS exposes real-time security telemetry:

```bash
nucleus alfred status --json
```

**Output:**
```json
{
  "vault": {
    "state": "UNLOCKED",
    "keys_in_use": 3,
    "last_access": "2024-02-08T14:30:00Z",
    "active_sessions": ["profile_001"]
  },
  "governance": {
    "master_active": true,
    "team_members": 5,
    "pending_approvals": 2
  },
  "integrity": {
    "filesystem_hash": "a1b2c3d4...",
    "last_audit": "2024-02-08T12:00:00Z",
    "anomalies_detected": 0
  },
  "temporal": {
    "workflows_active": 8,
    "failed_workflows": 0,
    "queue_depth": 12
  }
}
```

---

## 🛠️ Developer Guidelines for Compliant Extensions

If you're building on BTIPS:

### DO:
✅ Use Synapse Protocol for all Extension ↔ System communication  
✅ Request Vault keys through Nucleus (never hardcode)  
✅ Log all operations to telemetry streams  
✅ Implement exponential backoff for API calls  
✅ Display user-visible progress indicators  
✅ Fail-safe on Vault lock or session expiry  

### DON'T:
❌ Access browser storage outside Cortex extension  
❌ Cache credentials in RAM longer than needed  
❌ Bypass role-based access controls  
❌ Execute intents without user-visible confirmation  
❌ Modify intent history files directly  
❌ Run headless browser instances  

---

## 🎓 Educational Use Cases

BTIPS is **designed for responsible AI development**:

- **Academic Research**: Study AI-human collaboration with full audit trails
- **Corporate Training**: Teach governance best practices
- **Compliance Demonstrations**: Show auditors how AI tooling can be transparent
- **Red Team Testing**: Safely simulate attack scenarios with rollback capability

---

## 📞 Security Contact

Report vulnerabilities to: **security@bloom.dev**  
PGP Key: `0x1234ABCD` (available on keybase.io/bloom)

**Response SLA:**
- Critical: 24 hours
- High: 72 hours
- Medium: 1 week
- Low: Best effort

---

## 📜 Legal Disclaimer

BTIPS is provided "as-is" for lawful use only. Users are responsible for:
- Complying with AI provider Terms of Service
- Obtaining necessary licenses/permissions
- Ensuring team members follow governance policies
- Maintaining secure Vault practices

Misuse of BTIPS (e.g., credential theft, ToS violation, unauthorized access) is strictly prohibited and may result in:
- Revocation of Master role
- Reporting to affected providers
- Legal action (where applicable)

**BTIPS is not liable for user violations of third-party policies.**

---

*Last Updated: February 8, 2024*  
*Version: 1.0*  
*Governance Model: Master/Architect/Specialist v3.0*
