// Native Messaging Connection
let nativePort = null;
const HOST_NAME = "com.bloom.nucleus.bridge";
const controlledTabs = new Map();

// Connect to native host
function connectToNativeHost() {
  try {
    nativePort = chrome.runtime.connectNative(HOST_NAME);
    
    nativePort.onMessage.addListener((message) => {
      handleHostMessage(message);
    });
    
    nativePort.onDisconnect.addListener(() => {
      console.error("Native host disconnected:", chrome.runtime.lastError);
      nativePort = null;
      // Attempt reconnection after 2 seconds
      setTimeout(connectToNativeHost, 2000);
    });
    
    console.log("Connected to native host");
  } catch (error) {
    console.error("Failed to connect to native host:", error);
    setTimeout(connectToNativeHost, 2000);
  }
}

// Send message to native host
function sendToHost(message) {
  if (nativePort) {
    nativePort.postMessage(message);
  } else {
    console.error("No native port available");
  }
}

// Handle messages from native host
async function handleHostMessage(message) {
  const { id, command, payload } = message;
  
  try {
    let result;
    
    switch (command) {
      case "open_tab":
        result = await openTab(payload);
        break;
      case "navigate":
        result = await navigate(payload);
        break;
      case "exec_js":
        result = await execJs(payload);
        break;
      case "get_html":
        result = await getHtml(payload);
        break;
      case "click":
        result = await click(payload);
        break;
      case "type":
        result = await type(payload);
        break;
      case "upload_file":
        result = await uploadFile(payload);
        break;
      case "read_dom":
        result = await readDom(payload);
        break;
      case "observe_changes":
        result = await observeChanges(payload);
        break;
    case "claude.download_artifact":
        result = await downloadClaudeArtifact(payload);
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
    
    sendToHost({
      id,
      status: "ok",
      result
    });
  } catch (error) {
    sendToHost({
      id,
      status: "error",
      result: { message: error.message }
    });
  }
}

// Command implementations
async function openTab(payload) {
  const { url } = payload;
  const tab = await chrome.tabs.create({ url, active: false });
  controlledTabs.set(tab.id, { url, created: Date.now() });
  return { tabId: tab.id };
}

async function navigate(payload) {
  const { tabId, url } = payload;
  await chrome.tabs.update(tabId, { url });
  return { tabId };
}

async function execJs(payload) {
  const { tabId, code } = payload;
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: new Function(code),
  });
  return { result: results[0]?.result };
}

async function getHtml(payload) {
  const { tabId } = payload;
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.documentElement.outerHTML,
  });
  return { html: results[0]?.result };
}

async function click(payload) {
  const { tabId, selector } = payload;
  const response = await chrome.tabs.sendMessage(tabId, {
    action: "click",
    selector
  });
  return response;
}

async function type(payload) {
  const { tabId, selector, text } = payload;
  const response = await chrome.tabs.sendMessage(tabId, {
    action: "type",
    selector,
    text
  });
  return response;
}

async function uploadFile(payload) {
  const { tabId, selector, filePath } = payload;
  const response = await chrome.tabs.sendMessage(tabId, {
    action: "upload_file",
    selector,
    filePath
  });
  return response;
}

async function readDom(payload) {
  const { tabId, selector } = payload;
  const response = await chrome.tabs.sendMessage(tabId, {
    action: "read_dom",
    selector
  });
  return response;
}

async function observeChanges(payload) {
  const { tabId, selector, enabled } = payload;
  const response = await chrome.tabs.sendMessage(tabId, {
    action: "observe_changes",
    selector,
    enabled
  });
  return response;
}

// Listen for tab events
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (controlledTabs.has(tabId) && changeInfo.status === "complete") {
    sendToHost({
      id: crypto.randomUUID(),
      event: "page_loaded",
      payload: { tabId, url: tab.url }
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (controlledTabs.has(tabId)) {
    controlledTabs.delete(tabId);
    sendToHost({
      id: crypto.randomUUID(),
      event: "tab_closed",
      payload: { tabId }
    });
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.event === "dom_change") {
    sendToHost({
      id: crypto.randomUUID(),
      event: "dom_change",
      payload: {
        tabId: sender.tab.id,
        changes: message.changes
      }
    });
  }
  return true;
});

async function downloadClaudeArtifact(payload) {
  const { tabId } = payload;
  
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Find artifact container
      const artifact = document.querySelector('[data-testid="artifact-root"]');
      if (!artifact) {
        return { error: "No artifact found" };
      }

      // Get artifact type and content
      const codeBlock = artifact.querySelector('pre code');
      const reactRoot = artifact.querySelector('[data-testid="react-artifact"]');
      const htmlFrame = artifact.querySelector('iframe');
      
      let content = '';
      let type = '';
      let language = '';
      
      if (codeBlock) {
        // Code artifact
        content = codeBlock.textContent;
        type = 'code';
        const langClass = codeBlock.className.match(/language-(\w+)/);
        language = langClass ? langClass[1] : 'text';
      } else if (reactRoot) {
        // React artifact - get from script tag
        const scriptTag = document.querySelector('script[type="application/json"]');
        if (scriptTag) {
          content = scriptTag.textContent;
          type = 'react';
        }
      } else if (htmlFrame) {
        // HTML artifact
        content = htmlFrame.srcdoc || '';
        type = 'html';
      }
      
      // Get title
      const titleEl = document.querySelector('[data-testid="artifact-title"]') || 
                      artifact.closest('.artifact-container')?.querySelector('.font-semibold');
      const title = titleEl?.textContent || 'artifact';
      
      return {
        content,
        type,
        language,
        title,
        timestamp: Date.now()
      };
    }
  });
  
  return result[0]?.result;
}

// Initialize connection on startup
connectToNativeHost();