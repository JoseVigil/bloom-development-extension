// MutationObserver for DOM changes
let observer = null;
let observedElements = new Map();

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action } = message;
  
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
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
    sendResponse({ success: true, result });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
  
  return true;
});

// Click on element
function handleClick(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  
  element.click();
  return { clicked: true };
}

// Type text into element
function handleType(selector, text) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  
  // Set value
  element.value = text;
  
  // Trigger input events
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  
  return { typed: true, length: text.length };
}

// Set file for file input
function handleUploadFile(selector, filePath) {
  const element = document.querySelector(selector);
  if (!element || element.tagName !== 'INPUT' || element.type !== 'file') {
    throw new Error(`File input not found: ${selector}`);
  }
  
  // Note: Due to security restrictions, we can't directly set files
  // The native host will need to handle this through other means
  // This function serves as a placeholder for the architecture
  
  return { 
    ready: true, 
    note: "File upload requires native host coordination" 
  };
}

// Read DOM element data
function handleReadDom(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  
  return {
    tagName: element.tagName,
    id: element.id,
    className: element.className,
    textContent: element.textContent,
    innerHTML: element.innerHTML,
    attributes: Array.from(element.attributes).reduce((acc, attr) => {
      acc[attr.name] = attr.value;
      return acc;
    }, {}),
    boundingRect: element.getBoundingClientRect().toJSON()
  };
}

// Observe DOM changes
function handleObserveChanges(selector, enabled) {
  if (enabled) {
    const element = selector ? document.querySelector(selector) : document.body;
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    
    // Create observer if not exists
    if (!observer) {
      observer = new MutationObserver((mutations) => {
        const changes = mutations.map(mutation => ({
          type: mutation.type,
          target: {
            tagName: mutation.target.tagName,
            id: mutation.target.id,
            className: mutation.target.className
          },
          addedNodes: mutation.addedNodes.length,
          removedNodes: mutation.removedNodes.length,
          attributeName: mutation.attributeName,
          oldValue: mutation.oldValue
        }));
        
        // Send to background
        chrome.runtime.sendMessage({
          event: "dom_change",
          changes
        });
      });
    }
    
    // Start observing
    observer.observe(element, {
      childList: true,
      attributes: true,
      subtree: true,
      characterData: true,
      attributeOldValue: true,
      characterDataOldValue: true
    });
    
    observedElements.set(selector || "body", element);
    
    return { observing: true, selector: selector || "body" };
  } else {
    // Stop observing
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    observedElements.clear();
    
    return { observing: false };
  }
}

// Notify background when page loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    notifyPageReady();
  });
} else {
  notifyPageReady();
}

function notifyPageReady() {
  chrome.runtime.sendMessage({
    event: "content_ready",
    url: window.location.href
  });
}