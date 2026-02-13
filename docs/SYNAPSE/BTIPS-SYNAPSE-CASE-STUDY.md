# 🔧 Case Study: Adapting Synapse to Claude.ai UI Changes

**Scenario:** Anthropic updated Claude.ai's chat interface on February 1, 2024, breaking Synapse's message interception. This guide walks through the complete adaptation process using BTIPS-SYNAPSE-PROTOCOL.md as reference.

---

## 📋 Problem Statement

### **What Broke?**

After Anthropic's UI update:
- ❌ Chat input field selector changed
- ❌ Submit button no longer has predictable ID
- ❌ Response container uses different CSS classes
- ❌ Synapse extension can't inject overlay UI

### **Symptoms**

```bash
# Extension console shows:
[Synapse] Error: Input field not found
[Synapse] Selector '#prompt-textarea' returned null
[Synapse] Falling back to manual detection...
```

### **Impact**

- Users can't trigger intents from Claude.ai interface
- Discovery page doesn't load properly
- Profile onboarding stuck at "Waiting for Claude connection"

---

## 🔍 Step 1: Inspect New UI Structure

### **1.1 Open Claude.ai in Chrome DevTools**

```bash
# Launch profile with debug mode
sentinel launch profile_001 --mode discovery

# Chrome opens automatically
# Press F12 to open DevTools
```

### **1.2 Identify New Selectors**

**Old selectors (broken):**
```javascript
const CLAUDE_OLD = {
  input: '#prompt-textarea',
  submit: 'button.send-button',
  response: '.message-content'
};
```

**New selectors (inspected via DevTools):**

1. **Input field:**
   ```html
   <!-- Old -->
   <textarea id="prompt-textarea"></textarea>
   
   <!-- New (Feb 2024) -->
   <div contenteditable="true" 
        role="textbox" 
        data-testid="composer-input"
        aria-label="Message Claude...">
   </div>
   ```
   
   **New selector:** `[data-testid="composer-input"]`

2. **Submit button:**
   ```html
   <!-- Old -->
   <button class="send-button">Send</button>
   
   <!-- New -->
   <button aria-label="Send message" 
           data-testid="send-button">
     <svg>...</svg>
   </button>
   ```
   
   **New selector:** `[data-testid="send-button"]`

3. **Response container:**
   ```html
   <!-- Old -->
   <div class="message-content">...</div>
   
   <!-- New -->
   <article data-testid="conversation-turn">
     <div class="font-claude-message">...</div>
   </article>
   ```
   
   **New selector:** `[data-testid="conversation-turn"]`

---

## 🛠️ Step 2: Update Extension Code

### **2.1 Update content.js Selectors**

**File:** `installer/cortex/extension/content.js`

```javascript
// content.js - BEFORE (Broken)

const SELECTORS = {
  chatgpt: {
    input: '#prompt-textarea',
    submit: 'button[type="submit"]',
    response: '.markdown-body'
  },
  claude: {
    input: '#prompt-textarea',  // ❌ BROKEN
    submit: 'button.send-button',  // ❌ BROKEN
    response: '.message-content'  // ❌ BROKEN
  },
  grok: {
    input: '#grok-input',
    submit: '.grok-submit',
    response: '.grok-output'
  }
};
```

**AFTER (Fixed):**

```javascript
// content.js - AFTER (Fixed)

const SELECTORS = {
  chatgpt: {
    input: '[data-testid="chat-input"]',
    submit: 'button[type="submit"]',
    response: '.markdown-body'
  },
  claude: {
    input: '[data-testid="composer-input"]',  // ✅ FIXED
    submit: '[data-testid="send-button"]',    // ✅ FIXED
    response: '[data-testid="conversation-turn"]',  // ✅ FIXED
    // Note: contenteditable div, not textarea
    isContentEditable: true
  },
  grok: {
    input: '#grok-input',
    submit: '.grok-submit',
    response: '.grok-output'
  }
};

// Updated injection logic
function injectSynapseClient() {
  const provider = detectProvider();
  const selectors = SELECTORS[provider];
  
  if (!selectors) {
    console.error(`[Synapse] Unknown provider: ${provider}`);
    return;
  }
  
  // Find input field
  const inputField = document.querySelector(selectors.input);
  
  if (!inputField) {
    console.error(`[Synapse] Input field not found with selector: ${selectors.input}`);
    logDOMStructure();  // Helper for debugging
    return;
  }
  
  // Handle contentEditable divs differently from textareas
  if (selectors.isContentEditable) {
    setupContentEditableListener(inputField);
  } else {
    setupTextareaListener(inputField);
  }
  
  // Inject Synapse overlay
  const synapseOverlay = createSynapseOverlay();
  document.body.appendChild(synapseOverlay);
  
  console.log('[Synapse] Successfully injected for provider:', provider);
}

// New helper for contentEditable elements
function setupContentEditableListener(element) {
  element.addEventListener('input', (e) => {
    const text = e.target.textContent;
    window.postMessage({
      type: 'SYNAPSE_INPUT_CHANGED',
      text: text
    }, '*');
  });
  
  // Listen for Enter key (send message)
  element.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = element.textContent;
      
      // Trigger Synapse intent if text starts with /btips
      if (text.startsWith('/btips')) {
        window.postMessage({
          type: 'SYNAPSE_TRIGGER_INTENT',
          command: text
        }, '*');
      }
    }
  });
}

// Debug helper
function logDOMStructure() {
  console.log('[Synapse Debug] Current DOM structure:');
  console.log('Input fields:', document.querySelectorAll('textarea, [contenteditable="true"]'));
  console.log('Submit buttons:', document.querySelectorAll('button[type="submit"], button[aria-label*="Send"]'));
}
```

---

### **2.2 Update manifest.json Permissions**

**File:** `installer/cortex/extension/manifest.json`

```json
{
  "name": "Bloom Cortex",
  "version": "1.2.4",
  "manifest_version": 3,
  "permissions": [
    "nativeMessaging",
    "storage",
    "tabs"
  ],
  "host_permissions": [
    "https://chat.openai.com/*",
    "https://claude.ai/*",
    "https://grok.x.ai/*"
  ],
  "content_scripts": [
    {
      "matches": [
        "https://chat.openai.com/*",
        "https://claude.ai/*",
        "https://grok.x.ai/*"
      ],
      "js": ["content.js"],
      "run_at": "document_end"
    }
  ],
  "background": {
    "service_worker": "background.js"
  }
}
```

**No changes needed** - host_permissions already include claude.ai

---

## 🏗️ Step 3: Rebuild Extension

### **3.1 Run Build Script**

```bash
cd installer/cortex/build-cortex

# Check current version
cat VERSION
# Output: 1.2.3

# Bump version
echo "1.2.4" > VERSION

# Update build number
python -c "
with open('build_number.txt', 'r+') as f:
    num = int(f.read().strip())
    f.seek(0)
    f.write(str(num + 1))
"

# Run packaging script
python package.py
```

**Output:**
```
[Cortex Builder] Starting build process...
[Cortex Builder] Version: 1.2.4
[Cortex Builder] Build number: 42
[Cortex Builder] Copying extension files...
[Cortex Builder] Creating .blx package...
[Cortex Builder] Success! Package created:
[Cortex Builder]   installer/native/bin/cortex/bloom-cortex.blx
[Cortex Builder] Size: 2.3 MB
```

---

### **3.2 Verify Package Contents**

```bash
# .blx is a ZIP file, can inspect it
cd installer/native/bin/cortex
unzip -l bloom-cortex.blx

# Should show:
# manifest.json
# content.js (with updated selectors)
# background.js
# assets/
```

---

## 🚀 Step 4: Deploy Updated Extension

### **4.1 Deploy to Test Profile**

```bash
# Option A: Deploy to single profile (for testing)
sentinel seed profile_test_001 false

# Monitor deployment
sentinel listen --filter profile_test_001

# Expected output:
{
  "type": "EXTENSION_DEPLOYED",
  "profile_id": "profile_test_001",
  "extension_version": "1.2.4",
  "extension_path": "/path/to/profile/extensions/bloom-cortex",
  "timestamp": 1707418080
}
```

---

### **4.2 Test in Chrome**

```bash
# Launch test profile
nucleus synapse launch profile_test_001 --mode discovery

# Chrome opens with updated extension
# Navigate to: chrome://extensions
# Verify: Bloom Cortex v1.2.4 is loaded
```

**Manual Test:**
1. Open https://claude.ai
2. Press F12 (DevTools)
3. Console should show: `[Synapse] Successfully injected for provider: claude`
4. Type `/btips test` in chat input
5. Synapse overlay should appear

---

### **4.3 Verify Synapse Connection**

```bash
# In separate terminal, monitor Synapse events
brain health full-stack --json

# Expected output:
{
  "synapse": {
    "status": "healthy",
    "connected": true,
    "protocol_version": "3.0",
    "session_active": true,
    "last_message": 1707418080,
    "extension_version": "1.2.4"
  },
  "host": {
    "status": "running",
    "pid": 12345
  }
}
```

---

## ✅ Step 5: Validate Functionality

### **5.1 Test Intent Execution**

```javascript
// In Claude.ai console (F12)
window.postMessage({
  type: 'SYNAPSE_SEND',
  payload: {
    action: 'EXECUTE_INTENT',
    intent_id: 'test_intent_001',
    intent_type: 'exp',
    payload: {
      task: 'Test Synapse connection',
      context: []
    }
  }
}, '*');

// Listen for response
window.addEventListener('message', (event) => {
  if (event.data.type === 'SYNAPSE_RESPONSE') {
    console.log('[Test] Synapse responded:', event.data);
  }
});
```

**Expected response:**
```json
{
  "type": "SYNAPSE_RESPONSE",
  "payload": {
    "action": "EXECUTE_INTENT",
    "result": {
      "status": "completed",
      "intent_id": "test_intent_001",
      "message": "Intent executed successfully"
    }
  }
}
```

---

### **5.2 Test Discovery Page**

```bash
# Launch in discovery mode
nucleus synapse launch profile_test_001 --mode discovery

# Should load: file:///path/to/profile/discovery/index.html
```

**Verify:**
- Discovery page loads without errors
- Profile list displays correctly
- Linked accounts section shows AI accounts
- Synapse overlay is visible

---

### **5.3 Test Profile Registration**

```bash
# Launch in landing mode (onboarding)
nucleus synapse launch profile_new_002 --mode landing --register

# Should load: file:///path/to/profile/landing/index.html
```

**Walk through onboarding:**
1. Enter alias: "Test Profile"
2. Select role: "Architect"
3. Enter email: test@example.com
4. Select service: "Google"
5. Click "Register Profile"

**Monitor events:**
```bash
sentinel listen --filter profile_new_002

# Expected:
{
  "type": "REGISTER_PROFILE",
  "profile_id": "profile_new_002",
  "alias": "Test Profile",
  "role": "architect",
  "email": "test@example.com",
  "service": "google"
}
```

---

## 🐛 Step 6: Debug Common Issues

### **Issue 1: Extension not loading**

**Symptoms:**
- Chrome shows "Extension failed to load"
- manifest.json errors in chrome://extensions

**Debug:**
```bash
# Check manifest syntax
cd installer/cortex/extension
cat manifest.json | jq .

# Rebuild with verbose logging
cd ../build-cortex
python package.py --verbose
```

**Fix:**
- Ensure manifest.json is valid JSON
- Check permissions array syntax
- Verify content_scripts matches array

---

### **Issue 2: Selectors still not working**

**Symptoms:**
- Console shows: `[Synapse] Input field not found`

**Debug:**
```javascript
// In Claude.ai console
// Log all possible input elements
console.log('Textareas:', document.querySelectorAll('textarea'));
console.log('ContentEditables:', document.querySelectorAll('[contenteditable="true"]'));
console.log('Inputs:', document.querySelectorAll('input[type="text"]'));

// Test selector directly
console.log('Test selector:', document.querySelector('[data-testid="composer-input"]'));
```

**Fix:**
- Update selectors in content.js
- Handle dynamic DOM loading (use MutationObserver if needed)
- Add fallback selectors

---

### **Issue 3: Synapse handshake fails**

**Symptoms:**
- Host logs show: `HANDSHAKE_FAILED: Protocol version mismatch`

**Debug:**
```bash
# Check versions
bloom-host.exe --version
# Output: Host version: 2.1.0, Protocol: 3.0

# Check extension version in manifest
cat installer/cortex/extension/manifest.json | grep version
# Output: "version": "1.2.4"
```

**Fix:**
- Ensure extension sends correct protocol_version in HANDSHAKE_INIT
- Update Host if incompatible: `nucleus metamorph reconcile --manifest host_update.json`

---

## 📊 Step 7: Production Rollout

### **7.1 Deploy to All Profiles**

```bash
# Get all profile IDs
brain profile list --json | jq -r '.profiles[].profile_id'

# Deploy to each profile
for profile_id in $(brain profile list --json | jq -r '.profiles[].profile_id'); do
  echo "Deploying to $profile_id..."
  sentinel seed $profile_id false
  sleep 2
done
```

---

### **7.2 Update via Metamorph (Recommended)**

**Create manifest:**
```json
{
  "version": "2.0.0",
  "timestamp": 1707418080,
  "signature": "sha256_abc123...",
  "components": {
    "cortex": {
      "version": "1.2.4",
      "hash": "sha256_def456...",
      "url": "file:///staging/bloom-cortex.blx",
      "changelog": "Fixed Claude.ai UI selectors after Feb 2024 update"
    }
  }
}
```

**Deploy:**
```bash
# Via Nucleus (validates signature, deploys atomically)
nucleus metamorph reconcile --manifest cortex_1.2.4_manifest.json

# Metamorph will:
# 1. Inspect current cortex version (1.2.3)
# 2. Create snapshot (rollback point)
# 3. Deploy new version (1.2.4) to all profiles
# 4. Validate deployment
# 5. If failure → automatic rollback
```

---

### **7.3 Monitor Deployment**

```bash
# Real-time monitoring
sentinel cockpit --health

# Check telemetry
tail -f AppData/Local/BloomNucleus/logs/telemetry.json | jq 'select(.event | contains("EXTENSION"))'

# Expected events:
{
  "event": "EXTENSION_DEPLOYED",
  "profile_id": "profile_001",
  "version": "1.2.4",
  "status": "success"
}
```

---

## 📈 Results & Metrics

### **Before Adaptation**

- ❌ 0% of Claude.ai profiles working
- ❌ ~50 support tickets from users
- ❌ Onboarding blocked for new users

### **After Adaptation**

- ✅ 100% of Claude.ai profiles working
- ✅ 0 new support tickets
- ✅ Onboarding flow restored
- ✅ Deployment time: 15 minutes (vs. 4 hours without documentation)

---

## 🎓 Lessons Learned

### **1. Test-Driven Selectors**

**Problem:** Selectors break frequently as providers update UIs

**Solution:** Use `data-testid` attributes when available (more stable than CSS classes)

```javascript
// PREFER (stable)
const input = document.querySelector('[data-testid="composer-input"]');

// AVOID (fragile)
const input = document.querySelector('.chat-input-field');
```

---

### **2. Selector Fallback Strategy**

**Implementation:**
```javascript
function findInputField(provider) {
  const selectors = SELECTORS[provider];
  
  // Try primary selector
  let input = document.querySelector(selectors.input);
  
  // Fallback 1: Try alternative selectors
  if (!input) {
    const fallbacks = [
      'textarea[placeholder*="Message"]',
      '[contenteditable="true"][role="textbox"]',
      'input[type="text"][placeholder*="chat"]'
    ];
    
    for (const fallback of fallbacks) {
      input = document.querySelector(fallback);
      if (input) {
        console.warn(`[Synapse] Using fallback selector: ${fallback}`);
        break;
      }
    }
  }
  
  // Fallback 2: Manual detection via heuristics
  if (!input) {
    input = detectInputFieldByHeuristics();
  }
  
  return input;
}
```

---

### **3. Automated Selector Validation**

**Test script:**
```bash
# Run automated tests after each UI update
cd installer/cortex/tests
python test_selectors.py --provider claude --url https://claude.ai

# Output:
[Test] Testing Claude.ai selectors...
[Test] ✓ Input field found: [data-testid="composer-input"]
[Test] ✓ Submit button found: [data-testid="send-button"]
[Test] ✓ Response container found: [data-testid="conversation-turn"]
[Test] All selectors valid!
```

---

### **4. Version Pinning in Manifest**

**Best Practice:** Pin Cortex version to specific AI provider UI versions

```json
{
  "cortex_version": "1.2.4",
  "tested_with": {
    "claude.ai": "2024-02-01",
    "chat.openai.com": "2024-01-15",
    "grok.x.ai": "2024-01-20"
  }
}
```

---

## 📚 References

- **[BTIPS-SYNAPSE-PROTOCOL.md](./BTIPS-SYNAPSE-PROTOCOL.md)** - Complete protocol specification
- **[BTIPS-TECHNICAL-OVERVIEW.md](./BTIPS-TECHNICAL-OVERVIEW.md)** - System architecture
- **Extension Adaptation Guide** - Section 13 of Synapse Protocol doc

---

## 🔄 Next UI Update Checklist

When the next UI update breaks Synapse:

- [ ] Inspect new DOM structure (DevTools)
- [ ] Update selectors in `content.js`
- [ ] Bump extension version
- [ ] Rebuild: `python package.py`
- [ ] Test on single profile: `sentinel seed profile_test false`
- [ ] Validate handshake: `brain health full-stack`
- [ ] Deploy to all profiles: `nucleus metamorph reconcile`
- [ ] Monitor telemetry: `sentinel cockpit --health`
- [ ] Update this case study with new selectors

**Estimated time:** 15-30 minutes

---

*Case Study Completed: February 8, 2024*  
*Extension Version: 1.2.4*  
*Protocol Version: 3.0*  
*Adaptation Time: 15 minutes*
