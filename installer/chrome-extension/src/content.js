// ============================================================================
// BLOOM NUCLEUS BRIDGE - CONTENT SCRIPT v2.0
// Multi-Signal Detector + Slave Mode + Protocol Extractor
// ============================================================================

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  DETECTION: {
    DOM_STABLE_THRESHOLD_MS: 2000,
    SCROLL_LOCK_THRESHOLD_MS: 1500,
    NETWORK_IDLE_THRESHOLD_MS: 1000,
    BUTTON_CHECK_INTERVAL_MS: 500,
    MAX_DETECTION_TIME_MS: 300000  // 5 minutos timeout
  },
  
  CHUNKING: {
    MAX_CHUNK_SIZE_BYTES: 900 * 1024,  // 900KB safety margin
    COMPRESSION_THRESHOLD_BYTES: 10 * 1024  // 10KB
  },
  
  SLAVE_MODE: {
    AUTO_SCROLL_INTERVAL_MS: 1000,
    OVERLAY_Z_INDEX: 999998
  }
};

// ============================================================================
// SLAVE MODE CLASS
// ============================================================================
class SlaveMode {
  constructor() {
    this.isLocked = false;
    this.overlayId = 'bloom-slave-overlay';
    this.scrollInterval = null;
    this.currentIntentId = null;
    this.currentIntentName = null;
  }
  
  setIntentInfo(intentId, intentName) {
    this.currentIntentId = intentId;
    this.currentIntentName = intentName;
  }
  
  enable() {
    if (this.isLocked) return;
    
    console.log('[Bloom SlaveMode] Activating...');
    
    // 1. Bloquear interacción del usuario
    document.body.style.pointerEvents = 'none';
    document.body.style.userSelect = 'none';
    
    // 2. Inyectar overlay visual
    this.injectOverlay();
    
    // 3. Activar auto-scroll
    this.enableAutoScroll();
    
    // 4. Notificar al background
    chrome.runtime.sendMessage({
      event: 'slave_mode_enabled',
      intent_id: this.currentIntentId,
      timestamp: Date.now()
    });
    
    this.isLocked = true;
    console.log('[Bloom SlaveMode] Active');
  }
  
  injectOverlay() {
    // Remover overlay anterior si existe
    const existing = document.getElementById(this.overlayId);
    if (existing) existing.remove();
    
    const overlay = document.createElement('div');
    overlay.id = this.overlayId;
    overlay.innerHTML = `
      <!-- Background tint -->
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 255, 136, 0.03);
        backdrop-filter: blur(1px);
        z-index: ${CONFIG.SLAVE_MODE.OVERLAY_Z_INDEX};
        pointer-events: none;
      "></div>
      
      <!-- Status Badge -->
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.95);
        padding: 16px 24px;
        border-radius: 12px;
        border: 2px solid #00ff88;
        z-index: ${CONFIG.SLAVE_MODE.OVERLAY_Z_INDEX + 1};
        font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
        color: #00ff88;
        box-shadow: 0 0 30px rgba(0, 255, 136, 0.4);
        min-width: 280px;
      ">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          <div style="
            width: 12px;
            height: 12px;
            background: #00ff88;
            border-radius: 50%;
            animation: bloom-pulse 1.5s infinite;
          "></div>
          <span style="font-size: 15px; font-weight: bold; letter-spacing: 1px;">
            🤖 BLOOM OPERATING
          </span>
        </div>
        
        <div style="
          font-size: 11px;
          opacity: 0.7;
          margin-bottom: 8px;
          padding-left: 24px;
          line-height: 1.6;
        ">
          <div>Intent: <span style="color: #fff;">${this.currentIntentName || 'Loading...'}</span></div>
          <div>Mode: <span style="color: #fff;">Autonomous</span></div>
          <div>Status: <span style="color: #ffaa00;">Processing...</span></div>
        </div>
        
        <button id="bloom-take-control" style="
          margin-top: 12px;
          padding: 8px 16px;
          width: 100%;
          background: transparent;
          border: 1px solid #00ff88;
          color: #00ff88;
          border-radius: 6px;
          cursor: pointer;
          font-size: 11px;
          font-weight: bold;
          letter-spacing: 0.5px;
          pointer-events: auto;
          transition: all 0.2s;
        " onmouseover="this.style.background='rgba(0, 255, 136, 0.1)'" 
           onmouseout="this.style.background='transparent'">
          ⚙️ TAKE MANUAL CONTROL
        </button>
      </div>
      
      <style>
        @keyframes bloom-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.9); }
        }
      </style>
    `;
    
    document.body.appendChild(overlay);
    
    // Handler del botón de control manual
    document.getElementById('bloom-take-control').onclick = () => {
      this.disable();
    };
  }
  
  enableAutoScroll() {
    this.scrollInterval = setInterval(() => {
      if (this.isLocked) {
        const isAtBottom = (window.innerHeight + window.scrollY) >= document.body.scrollHeight - 100;
        if (!isAtBottom) {
          window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
          });
        }
      }
    }, CONFIG.SLAVE_MODE.AUTO_SCROLL_INTERVAL_MS);
  }
  
  disable() {
    console.log('[Bloom SlaveMode] Deactivating...');
    
    // Restaurar interacción
    document.body.style.pointerEvents = '';
    document.body.style.userSelect = '';
    
    // Remover overlay
    const overlay = document.getElementById(this.overlayId);
    if (overlay) overlay.remove();
    
    // Detener auto-scroll
    if (this.scrollInterval) {
      clearInterval(this.scrollInterval);
      this.scrollInterval = null;
    }
    
    // Notificar al background
    chrome.runtime.sendMessage({
      event: 'manual_intervention',
      intent_id: this.currentIntentId,
      timestamp: Date.now()
    });
    
    this.isLocked = false;
    console.log('[Bloom SlaveMode] Inactive');
  }
  
  onBeforeUnload() {
    if (this.isLocked) {
      console.warn('[Bloom SlaveMode] Browser closing during active operation');
      
      chrome.runtime.sendMessage({
        event: 'interrupted',
        intent_id: this.currentIntentId,
        timestamp: Date.now(),
        reason: 'browser_close'
      });
    }
  }
}

// ============================================================================
// MULTI-SIGNAL COMPLETION DETECTOR
// ============================================================================
class CompletionDetector {
  constructor() {
    this.signals = {
      dom_stable: false,
      button_state: false,
      scroll_lock: false,
      network_idle: false,
      token_warning: false
    };
    
    this.timers = {
      dom: null,
      scroll: null,
      network: null,
      button: null
    };
    
    this.lastScrollHeight = 0;
    this.lastDomMutation = Date.now();
    this.startTime = Date.now();
    
    this.observers = {
      dom: null,
      network: null
    };
  }
  
  start(onComplete, onTokenWarning) {
    console.log('[Bloom Detector] Starting multi-signal detection...');
    
    this.onComplete = onComplete;
    this.onTokenWarning = onTokenWarning;
    
    // 1. DOM Mutation Observer
    this.startDomObserver();
    
    // 2. Scroll Height Monitor
    this.startScrollMonitor();
    
    // 3. Button State Monitor
    this.startButtonMonitor();
    
    // 4. Network Activity Monitor
    this.startNetworkMonitor();
    
    // 5. Token Warning Detector
    this.startTokenWarningDetector();
    
    // 6. Timeout Safety
    this.startTimeoutSafety();
  }
  
  stop() {
    console.log('[Bloom Detector] Stopping...');
    
    // Clear all timers
    Object.values(this.timers).forEach(timer => {
      if (timer) clearInterval(timer);
    });
    
    // Disconnect observers
    if (this.observers.dom) this.observers.dom.disconnect();
  }
  
  startDomObserver() {
    this.observers.dom = new MutationObserver(() => {
      this.lastDomMutation = Date.now();
      this.signals.dom_stable = false;
    });
    
    this.observers.dom.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    // Check stability
    this.timers.dom = setInterval(() => {
      const elapsed = Date.now() - this.lastDomMutation;
      if (elapsed >= CONFIG.DETECTION.DOM_STABLE_THRESHOLD_MS) {
        if (!this.signals.dom_stable) {
          console.log('[Bloom Detector] ✓ DOM stable');
          this.signals.dom_stable = true;
          this.checkCompletion();
        }
      }
    }, 500);
  }
  
  startScrollMonitor() {
    this.lastScrollHeight = document.body.scrollHeight;
    
    this.timers.scroll = setInterval(() => {
      const currentHeight = document.body.scrollHeight;
      
      if (currentHeight === this.lastScrollHeight) {
        if (!this.signals.scroll_lock) {
          console.log('[Bloom Detector] ✓ Scroll locked');
          this.signals.scroll_lock = true;
          this.checkCompletion();
        }
      } else {
        this.signals.scroll_lock = false;
        this.lastScrollHeight = currentHeight;
      }
    }, CONFIG.DETECTION.SCROLL_LOCK_THRESHOLD_MS);
  }
  
  startButtonMonitor() {
    // Selectores para botones de "Stop" en diferentes AIs
    const stopSelectors = [
      'button[aria-label*="Stop"]',
      'button[aria-label*="stop"]',
      'button[data-testid="stop-button"]',
      'button[data-testid="stop-generation"]',
      'button:has(svg[data-icon="stop"])'
    ];
    
    // Selectores de botones que indican completitud
    const doneSelectors = [
      'button[aria-label*="Regenerate"]',
      'button[aria-label*="regenerate"]',
      'button[data-testid="regenerate-button"]',
      'button:has(svg[data-icon="refresh"])'
    ];
    
    this.timers.button = setInterval(() => {
      let hasStopButton = false;
      let hasDoneButton = false;
      
      for (const selector of stopSelectors) {
        const btn = document.querySelector(selector);
        if (btn && !btn.disabled && btn.offsetParent !== null) {
          hasStopButton = true;
          break;
        }
      }
      
      for (const selector of doneSelectors) {
        const btn = document.querySelector(selector);
        if (btn && btn.offsetParent !== null) {
          hasDoneButton = true;
          break;
        }
      }
      
      // Si NO hay botón Stop O hay botón Done = completado
      const isComplete = !hasStopButton || hasDoneButton;
      
      if (isComplete && !this.signals.button_state) {
        console.log('[Bloom Detector] ✓ Button state changed (complete)');
        this.signals.button_state = true;
        this.checkCompletion();
      } else if (!isComplete) {
        this.signals.button_state = false;
      }
      
    }, CONFIG.DETECTION.BUTTON_CHECK_INTERVAL_MS);
  }
  
  startNetworkMonitor() {
    // Monitorear requests activos
    let activeRequests = 0;
    
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      activeRequests++;
      return originalFetch.apply(this, args).finally(() => {
        activeRequests--;
      });
    };
    
    this.timers.network = setInterval(() => {
      if (activeRequests === 0) {
        if (!this.signals.network_idle) {
          console.log('[Bloom Detector] ✓ Network idle');
          this.signals.network_idle = true;
          this.checkCompletion();
        }
      } else {
        this.signals.network_idle = false;
      }
    }, CONFIG.DETECTION.NETWORK_IDLE_THRESHOLD_MS);
  }
  
  startTokenWarningDetector() {
    // Detectar modals de límite de tokens
    const warningSelectors = [
      'text="out of free messages"',
      'text="Has alcanzado tu límite"',
      'text="You\'re out of"',
      'div:has-text("upgrade")',
      'div:has-text("Actualiza")'
    ];
    
    const checkWarnings = setInterval(() => {
      for (const selector of warningSelectors) {
        // Búsqueda simple por texto
        const elements = Array.from(document.querySelectorAll('div, span, p'));
        const hasWarning = elements.some(el => {
          const text = el.textContent.toLowerCase();
          return text.includes('out of') || 
                 text.includes('límite') || 
                 text.includes('upgrade') ||
                 text.includes('actualiza');
        });
        
        if (hasWarning && !this.signals.token_warning) {
          console.warn('[Bloom Detector] ⚠️ Token limit detected!');
          this.signals.token_warning = true;
          
          // Capturar mensaje exacto
          const warningEl = elements.find(el => {
            const text = el.textContent.toLowerCase();
            return text.includes('out of') || text.includes('límite');
          });
          
          const warningText = warningEl ? warningEl.textContent : 'Token limit reached';
          
          if (this.onTokenWarning) {
            this.onTokenWarning(warningText);
          }
          
          clearInterval(checkWarnings);
          return;
        }
      }
    }, 1000);
  }
  
  startTimeoutSafety() {
    setTimeout(() => {
      const elapsed = Date.now() - this.startTime;
      if (elapsed >= CONFIG.DETECTION.MAX_DETECTION_TIME_MS) {
        console.warn('[Bloom Detector] ⏱️ Timeout reached, forcing completion');
        this.forceComplete();
      }
    }, CONFIG.DETECTION.MAX_DETECTION_TIME_MS);
  }
  
  checkCompletion() {
    const signalCount = Object.values(this.signals).filter(v => v === true).length;
    const totalSignals = Object.keys(this.signals).length;
    
    console.log(`[Bloom Detector] Signals: ${signalCount}/${totalSignals}`, this.signals);
    
    // Condiciones de completitud:
    // CRITICAL: button_state O token_warning
    // + Al menos 2 de: dom_stable, scroll_lock, network_idle
    
    const hasCriticalSignal = this.signals.button_state || this.signals.token_warning;
    const supportSignals = [
      this.signals.dom_stable,
      this.signals.scroll_lock,
      this.signals.network_idle
    ].filter(v => v).length;
    
    if (hasCriticalSignal && supportSignals >= 2) {
      console.log('[Bloom Detector] ✅ Completion confirmed!');
      this.stop();
      
      if (this.onComplete) {
        this.onComplete(this.signals);
      }
    }
  }
  
  forceComplete() {
    this.stop();
    if (this.onComplete) {
      this.onComplete(this.signals);
    }
  }
}

// ============================================================================
// RESPONSE EXTRACTOR (Bloom Protocol)
// ============================================================================
class ResponseExtractor {
  constructor(intentId, intentName, pipelineStage, provider) {
    this.intentId = intentId;
    this.intentName = intentName;
    this.pipelineStage = pipelineStage;
    this.provider = provider;
  }
  
  extract() {
    console.log('[Bloom Extractor] Extracting response...');
    
    const response = {
      bloom_protocol: {
        version: "1.0",
        intent_id: this.intentId,
        intent_type: "dev",  // TODO: Get from payload
        intent_name: this.intentName,
        pipeline_stage: this.pipelineStage,
        completion_status: "complete",
        requires_user_decision: false,
        downloaded_at: new Date().toISOString()
      },
      
      metadata: {
        ai_provider: this.provider,
        ai_model: this.detectModel(),
        conversation_id: this.extractConversationId(),
        conversation_url: window.location.href,
        profile_used: "Unknown",  // Será llenado por background.js
        profile_directory: "Unknown",
        tokens_used: 0,
        tokens_remaining: 0,
        can_complete_task: true,
        next_available_at: null,
        processing_time_seconds: 0
      },
      
      token_management: {
        had_token_warning: false,
        warning_message: null,
        continuity_prompt: null,
        rotation_suggested: false,
        next_provider_queue: ["gemini", "grok", "chatgpt"]
      },
      
      questions: {
        has_questions: false,
        auto_answerable: false,
        count: 0,
        items: []
      },
      
      content: {
        type: "code_delivery",
        conversational_summary: "",
        files: [],
        files_total: 0,
        files_created: 0,
        files_updated: 0,
        files_deleted: 0
      },
      
      validation: {
        protocol_valid: true,
        checksum: "",
        total_size_bytes: 0,
        chunked: false,
        total_chunks: 1
      },
      
      debug_info: {
        extension_version: "2.0.0",
        detection_signals: {},
        slave_mode_active: true,
        download_attempts: 1,
        retry_count: 0
      }
    };
    
    // Extraer contenido conversacional
    response.content.conversational_summary = this.extractConversationalText();
    
    // Extraer archivos de código
    response.content.files = this.extractCodeFiles();
    response.content.files_total = response.content.files.length;
    
    // Detectar preguntas
    const questions = this.extractQuestions();
    if (questions.length > 0) {
      response.questions.has_questions = true;
      response.questions.count = questions.length;
      response.questions.items = questions;
      response.content.type = "briefing_questions";
    }
    
    // Calcular checksum
    response.validation.checksum = this.calculateChecksum(response);
    response.validation.total_size_bytes = JSON.stringify(response).length;
    
    console.log('[Bloom Extractor] Extraction complete', response);
    
    return response;
  }
  
  detectModel() {
    // Heurística simple para detectar modelo
    const url = window.location.href;
    if (url.includes('claude.ai')) return 'claude-sonnet-4';
    if (url.includes('gemini')) return 'gemini-2.0-flash';
    if (url.includes('chat.openai')) return 'gpt-4';
    return 'unknown';
  }
  
  extractConversationId() {
    const url = window.location.href;
    const match = url.match(/\/chat\/([a-zA-Z0-9-]+)/);
    return match ? match[1] : 'unknown';
  }
  
  extractConversationalText() {
    // Selectores para el último mensaje de la AI
    const messageSelectors = [
      'div[data-testid="conversation-turn"]:last-child',
      'div[class*="message"]:last-child',
      'article:last-child'
    ];
    
    for (const selector of messageSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        // Extraer solo texto, sin código
        const clone = element.cloneNode(true);
        clone.querySelectorAll('pre, code').forEach(el => el.remove());
        return clone.textContent.trim();
      }
    }
    
    return "No conversational text extracted";
  }
  
  extractCodeFiles() {
    const files = [];
    const codeBlocks = document.querySelectorAll('pre code');
    
    console.log(`[Bloom Extractor] Found ${codeBlocks.length} code blocks`);
    
    codeBlocks.forEach((block, index) => {
      const content = block.textContent;
      if (!content || content.trim().length === 0) return;
      
      // Detectar lenguaje
      const className = block.className || '';
      let language = 'txt';
      let extension = 'txt';
      
      if (className.includes('language-')) {
        language = className.split('language-')[1].split(' ')[0];
        extension = language;
      }
      
      // Intentar detectar path del archivo (antes del bloque de código)
      let filePath = null;
      const preElement = block.closest('pre');
      if (preElement && preElement.previousElementSibling) {
        const prevText = preElement.previousElementSibling.textContent;
        const pathMatch = prevText.match(/(?:File:|Path:|`)([\w\/\.-]+\.\w+)/i);
        if (pathMatch) {
          filePath = pathMatch[1];
        }
      }
      
      // Si no se detectó path, usar genérico
      if (!filePath) {
        filePath = `generated/file_${index + 1}.${extension}`;
      }
      
      const file = {
        index: files.length + 1,
        path: filePath,
        action: "create",  // Default, puede ser update si detectamos
        file_ref: `${String(files.length + 1).padStart(3, '0')}_${filePath.replace(/\//g, '_')}`,
        content_type: "plain_text",
        size_bytes: content.length,
        lines_count: content.split('\n').length,
        hash_before: null,
        hash_after: this.simpleHash(content),
        change_summary: `Code block ${index + 1}`
      };
      
      files.push({
        metadata: file,
        content: content
      });
    });
    
    return files.map(f => f.metadata);  // Solo metadata en el JSON principal
  }
  
  extractQuestions() {
    const questions = [];
    
    // Buscar patrones de preguntas
    const questionPatterns = [
      /\?\s*$/,
      /^¿/,
      /\d+\.\s*.+\?/,
      /Question \d+:/i,
      /Pregunta \d+:/i
    ];
    
    const paragraphs = document.querySelectorAll('p, div[class*="message"]');
    
    paragraphs.forEach((p, index) => {
      const text = p.textContent.trim();
      
      for (const pattern of questionPatterns) {
        if (pattern.test(text)) {
          questions.push({
            id: questions.length + 1,
            text: text,
            context: "",
            required: true,
            suggested_answer: null,
            answer_type: "text",
            options: []
          });
          break;
        }
      }
    });
    
    return questions;
  }
  
  simpleHash(str) {
    // Hash simple para demo (en producción usar SHA256)
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
  
  calculateChecksum(obj) {
    // Simplified checksum (en producción usar crypto API)
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return this.simpleHash(str);
  }
}

// ============================================================================
// MAIN HANDLER: AI SUBMIT WITH DOWNLOAD
// ============================================================================
const slaveMode = new SlaveMode();
let currentDetector = null;

async function handleAiSubmit(payload) {
  const { text, context_files, intent_id, intent_name, pipeline_stage, provider } = payload;
  
  console.log('[Bloom Driver] Starting submit with download...', {
    intent_id,
    text_len: text?.length,
    files: context_files?.length
  });
  
  // 1. Configurar Slave Mode
  slaveMode.setIntentInfo(intent_id, intent_name);
  slaveMode.enable();
  
  try {
    // 2. Realizar submit (código existente)
    await performSubmit(text, context_files);
    
    // 3. Iniciar detección de completitud
    await waitForCompletion(intent_id, intent_name, pipeline_stage, provider);
    
  } catch (error) {
    console.error('[Bloom Driver] Error:', error);
    slaveMode.disable();
    throw error;
  }
}

async function performSubmit(text, context_files) {
  // [CÓDIGO EXISTENTE DE handleAiSubmit - no cambiar]
  const editor = findEditor();
  if (!editor) throw new Error("INPUT_NOT_FOUND");
  
  editor.focus();
  await sleep(200);
  
  if (context_files && context_files.length > 0) {
    await uploadFiles(editor, context_files);
    await sleep(1500);
  }
  
  if (text) {
    await injectText(editor, text);
    await sleep(800);
  }
  
  const sendButton = findSendButton();
  if (!sendButton) throw new Error("SUBMIT_BTN_NOT_FOUND");
  if (sendButton.disabled) throw new Error("SUBMIT_BTN_DISABLED");
  
  sendButton.click();
  console.log('[Bloom Driver] Submit completed');
}

function waitForCompletion(intentId, intentName, pipelineStage, provider) {
  return new Promise((resolve, reject) => {
    currentDetector = new CompletionDetector();
    
    currentDetector.start(
      // onComplete callback
      async (signals) => {
        console.log('[Bloom Driver] Response completed, extracting...');
        
        try {
          // Extraer respuesta
          const extractor = new ResponseExtractor(intentId, intentName, pipelineStage, provider);
          const response = extractor.extract();
          
          // Agregar signals al debug_info
          response.debug_info.detection_signals = signals;
          
          // Enviar al background para chunking y forward al Host
          await sendResponseToHost(response);
          
          // Desactivar Slave Mode
          slaveMode.disable();
          
          resolve(response);
          
        } catch (error) {
          console.error('[Bloom Driver] Extraction error:', error);
          slaveMode.disable();
          reject(error);
        }
      },
      
      // onTokenWarning callback
      (warningMessage) => {
        console.warn('[Bloom Driver] Token warning detected:', warningMessage);
        
        // Notificar inmediatamente para rotación
        chrome.runtime.sendMessage({
          event: 'token_warning',
          intent_id: intentId,
          message: warningMessage,
          timestamp: Date.now()
        });
      }
    );
  });
}

async function sendResponseToHost(response) {
  console.log('[Bloom Driver] Sending response to host...');
  
  const responseStr = JSON.stringify(response);
  const sizeBytes = responseStr.length;
  
  console.log(`[Bloom Driver] Response size: ${sizeBytes} bytes`);
  
  if (sizeBytes <= CONFIG.CHUNKING.MAX_CHUNK_SIZE_BYTES) {
    // Envío directo (no chunking)
    chrome.runtime.sendMessage({
      action: 'download_response',
      payload: response,
      chunked: false
    });
  } else {
    // Chunking necesario (background.js se encargará)
    chrome.runtime.sendMessage({
      action: 'download_response_large',
      payload: response,
      chunked: true,
      size_bytes: sizeBytes
    });
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function findEditor() {
  const selectors = [
    'div[contenteditable="true"]',
    'div[role="textbox"]',
    'fieldset [contenteditable="true"]',
    '.ProseMirror'
  ];
  
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function findSendButton() {
  const selectors = [
    'button[aria-label="Send Message"]',
    'button[aria-label="Send message"]',
    'button[data-testid="send-button"]'
  ];
  
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  
  // Fallback: buscar botón con SVG
  return document.querySelector('button:has(svg)');
}

async function uploadFiles(editor, files) {
  const dataTransfer = new DataTransfer();
  
  for (const f of files) {
    let mimeType = 'text/plain';
    if (f.name.endsWith('.json')) mimeType = 'application/json';
    if (f.name.endsWith('.js')) mimeType = 'text/javascript';
    if (f.name.endsWith('.py')) mimeType = 'text/x-python';
    
    const file = new File([f.content], f.name, { type: mimeType });
    dataTransfer.items.add(file);
  }
  
  const dropEvent = new DragEvent('drop', {
    bubbles: true,
    cancelable: true,
    view: window,
    dataTransfer: dataTransfer
  });
  
  editor.dispatchEvent(dropEvent);
}

async function injectText(editor, text) {
  const success = document.execCommand('insertText', false, text);
  if (!success) {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true, 
      cancelable: true, 
      clipboardData: data
    });
    editor.dispatchEvent(pasteEvent);
  }
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// MESSAGE LISTENER
// ============================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action } = message;

  (async () => {
    try {
      let result;
      switch (action) {
        case "click": 
          result = handleClick(message.selector); 
          break;
        case "type": 
          result = handleType(message.selector, message.text); 
          break;
        case "upload_file": 
          result = handleUploadFile(message.selector, message.filePath); 
          break;
        case "read_dom": 
          result = handleReadDom(message.selector); 
          break;
        case "observe_changes": 
          result = handleObserveChanges(message.selector, message.enabled); 
          break;
        
        case "ai.submit":
          result = await handleAiSubmit(message.payload);
          break;
          
        default:
          throw new Error(`Unknown action: ${action}`);
      }
      sendResponse({ success: true, result });
    } catch (error) {
      console.error("[Bloom Content] Error:", error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
});

// Legacy handlers
function handleClick(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  element.click();
  return { clicked: true };
}

function handleType(selector, text) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  element.value = text;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  return { typed: true };
}

function handleUploadFile(selector, filePath) { 
  return { ready: true }; 
}

function handleReadDom(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  return { 
    tagName: element.tagName, 
    innerHTML: element.innerHTML 
  };
}

function handleObserveChanges(selector, enabled) { 
  return { observing: enabled }; 
}

// ============================================================================
// INITIALIZATION
// ============================================================================
if (document.readyState === "loading") { 
  document.addEventListener("DOMContentLoaded", notifyPageReady); 
} else { 
  notifyPageReady(); 
}

function notifyPageReady() { 
  chrome.runtime.sendMessage({ 
    event: "content_ready", 
    url: window.location.href 
  }); 
}

// Bloom visual indicator
const ribbon = document.createElement('div');
Object.assign(ribbon.style, {
  position: 'fixed',
  top: '0',
  left: '0',
  width: '100%',
  height: '5px',
  backgroundColor: '#00ff88',
  zIndex: '999999',
  boxShadow: '0 0 10px #00ff88'
});
document.body.appendChild(ribbon);

// Window unload handler for recovery
window.addEventListener('beforeunload', () => {
  slaveMode.onBeforeUnload();
});