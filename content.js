let sidebarOpen = false; // Start with sidebar logically closed (hidden to the left)
let sidebarElement = null;
let chatContainerObserver = null;
let observerDebounceTimer = null;
let initialObserverSetupAttempted = false;
let scrapedMessagesCache = {};
let isScrapingInProgress = false;

function createSidebar() {
  if (document.getElementById('ai-studio-pruner-sidebar')) {
    return document.getElementById('ai-studio-pruner-sidebar');
  }

  sidebarElement = document.createElement('div');
  sidebarElement.id = 'ai-studio-pruner-sidebar';
  // The 'visible' class will be added/removed to control 'left' property via CSS

  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'pruner-content-wrapper';

  // Header
  const header = document.createElement('div');
  header.className = 'pruner-header';
  const title = document.createElement('h3');
  title.textContent = 'Message Pruner';
  const refreshButton = document.createElement('button');
  refreshButton.textContent = 'Refresh';
  refreshButton.className = 'pruner-refresh-btn';
  refreshButton.title = "Refresh list (for currently visible messages)";
  refreshButton.onclick = () => {
    scrapedMessagesCache = {};
    populateSidebar();
    attemptSetupChatContainerObserver();
  };
  header.appendChild(title);
  header.appendChild(refreshButton);
  contentWrapper.appendChild(header);

  // Bulk Actions Section
  const bulkActionsDiv = document.createElement('div');
  bulkActionsDiv.className = 'pruner-bulk-actions';

  const loadAllRow = document.createElement('div');
  loadAllRow.className = 'pruner-bulk-actions-row';
  const loadAllButton = document.createElement('button');
  loadAllButton.id = 'pruner-load-all-btn';
  loadAllButton.textContent = 'Load All Message Previews';
  loadAllButton.title = "Scrolls through chat to load all previews (can be slow)";
  loadAllButton.className = 'pruner-action-btn load-all';
  loadAllButton.style.width = "100%";
  loadAllButton.onclick = handleLoadAllMessages;
  loadAllRow.appendChild(loadAllButton);
  bulkActionsDiv.appendChild(loadAllRow);

  const selectAllRowCheck = document.createElement('div');
  selectAllRowCheck.className = 'pruner-bulk-actions-row';
  const selectAllLabel = document.createElement('label');
  selectAllLabel.htmlFor = 'pruner-select-all-checkbox';
  selectAllLabel.textContent = 'Select All:';
  const selectAllCheckbox = document.createElement('input');
  selectAllCheckbox.type = 'checkbox';
  selectAllCheckbox.id = 'pruner-select-all-checkbox';
  selectAllCheckbox.onchange = handleSelectAllToggle;
  selectAllRowCheck.appendChild(selectAllLabel);
  selectAllRowCheck.appendChild(selectAllCheckbox);
  bulkActionsDiv.appendChild(selectAllRowCheck);

  const deleteSelectedRow = document.createElement('div');
  deleteSelectedRow.className = 'pruner-bulk-actions-row';
  const deleteSelectedButton = document.createElement('button');
  deleteSelectedButton.id = 'pruner-delete-selected-btn';
  deleteSelectedButton.textContent = 'Delete Selected';
  deleteSelectedButton.className = 'pruner-action-btn delete';
  deleteSelectedButton.disabled = true;
  deleteSelectedButton.onclick = handleDeleteSelected;
  deleteSelectedRow.appendChild(deleteSelectedButton);
  bulkActionsDiv.appendChild(deleteSelectedRow);
  
  const rangeDeleteRow = document.createElement('div');
  rangeDeleteRow.className = 'pruner-bulk-actions-row';
  rangeDeleteRow.style.marginTop = '10px';
  const rangeLabel = document.createElement('label');
  rangeLabel.textContent = 'Delete from:';
  const startIndexInput = document.createElement('input');
  startIndexInput.type = 'number';
  startIndexInput.id = 'pruner-range-start';
  startIndexInput.placeholder = 'Start #';
  startIndexInput.min = "1";
  startIndexInput.oninput = updateDeleteRangeButtonState;
  const toLabel = document.createElement('label');
  toLabel.textContent = 'to:';
  const endIndexInput = document.createElement('input');
  endIndexInput.type = 'number';
  endIndexInput.id = 'pruner-range-end';
  endIndexInput.placeholder = 'End #';
  endIndexInput.min = "1";
  endIndexInput.oninput = updateDeleteRangeButtonState;
  const deleteRangeButton = document.createElement('button');
  deleteRangeButton.id = 'pruner-delete-range-btn';
  deleteRangeButton.textContent = 'Delete Range';
  deleteRangeButton.className = 'pruner-action-btn delete';
  deleteRangeButton.disabled = true;
  deleteRangeButton.onclick = handleDeleteRange;
  rangeDeleteRow.appendChild(rangeLabel);
  rangeDeleteRow.appendChild(startIndexInput);
  rangeDeleteRow.appendChild(toLabel);
  rangeDeleteRow.appendChild(endIndexInput);
  rangeDeleteRow.appendChild(deleteRangeButton);
  bulkActionsDiv.appendChild(rangeDeleteRow);
  contentWrapper.appendChild(bulkActionsDiv);

  const messageList = document.createElement('ul');
  messageList.className = 'pruner-message-list';
  contentWrapper.appendChild(messageList);
  
  sidebarElement.appendChild(contentWrapper); // Content first

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'pruner-toggle-visibility-btn';
  const arrowSpan = document.createElement('span');
  arrowSpan.className = 'arrow';
  // CSS will set the initial 'content' for the arrow based on :not(.visible)
  // Default to collapsed state icon if .visible is not yet added
  arrowSpan.textContent = 'keyboard_double_arrow_right'; 
  toggleBtn.appendChild(arrowSpan);
  toggleBtn.title = "Toggle Sidebar";
  toggleBtn.onclick = () => {
    sidebarOpen = !sidebarOpen;
    sidebarElement.classList.toggle('visible', sidebarOpen);
    // Arrow icon content is now fully handled by CSS
    if (sidebarOpen) {
        populateSidebar();
        attemptSetupChatContainerObserver();
    }
  };
  sidebarElement.appendChild(toggleBtn); // Toggle button after content wrapper

  document.body.appendChild(sidebarElement);
  return sidebarElement;
}

function handleSidebarToggleRequest() {
  sidebarElement = createSidebar(); // Ensure it's created
  sidebarOpen = !sidebarOpen;
  sidebarElement.classList.toggle('visible', sidebarOpen);
  // Arrow icon content is handled by CSS based on .visible class
  if (sidebarOpen) {
      populateSidebar();
      attemptSetupChatContainerObserver();
  }
}

async function handleLoadAllMessages() {
  if (isScrapingInProgress) {
    alert("Loading already in progress. Please wait.");
    return;
  }
  isScrapingInProgress = true;
  scrapedMessagesCache = {}; 

  const loadAllBtn = document.getElementById('pruner-load-all-btn');
  if (loadAllBtn) {
    loadAllBtn.textContent = 'Loading...';
    loadAllBtn.disabled = true;
  }

  const messageListElement = sidebarElement.querySelector('.pruner-message-list');
  let statusElement = document.getElementById('pruner-status-message');
  if (!statusElement) {
    statusElement = document.createElement('div');
    statusElement.id = 'pruner-status-message';
    messageListElement.insertAdjacentElement('beforebegin', statusElement);
  }
  statusElement.textContent = "Loading all message previews... please wait.";

  const allTurnElements = Array.from(document.querySelectorAll('ms-chat-turn'));
  if (allTurnElements.length === 0) {
    statusElement.textContent = "No messages found in chat.";
    setTimeout(() => { if(statusElement) statusElement.remove(); }, 3000);
    if (loadAllBtn) {
        loadAllBtn.textContent = 'Load All Message Previews';
        loadAllBtn.disabled = false;
    }
    isScrapingInProgress = false;
    return;
  }

  for (let i = 0; i < allTurnElements.length; i++) {
    const turnElement = allTurnElements[i];
    if (!turnElement.dataset.prunerId) {
        turnElement.dataset.prunerId = `pruner-turn-${i}`;
    }
    const turnId = turnElement.dataset.prunerId;

    turnElement.scrollIntoView({ behavior: 'auto', block: 'center' });

    try {
      const roleElement = turnElement.querySelector('[data-turn-role]');
      const role = roleElement ? roleElement.getAttribute('data-turn-role') : 'Unknown';
      const text = await waitForContentAndScrape(turnElement, role, 3000);
      scrapedMessagesCache[turnId] = text;
    } catch (error) {
      console.warn(`AI Studio Pruner: Timeout or error scraping turn ${i + 1}:`, error);
      scrapedMessagesCache[turnId] = "[Error loading snippet]";
    }
    
    statusElement.textContent = `Loading previews... (${i + 1}/${allTurnElements.length})`;
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  isScrapingInProgress = false;
  if (statusElement) statusElement.remove();
  if (loadAllBtn) {
    loadAllBtn.textContent = 'Load All Message Previews';
    loadAllBtn.disabled = false;
  }
  populateSidebar(true); 
  console.log("AI Studio Pruner: Finished loading all message previews.");
}

function waitForContentAndScrape(turnElement, role, timeoutMs) {
  return new Promise((resolve, reject) => {
    let initialText = getMessageSnippet(turnElement, role);
    if (initialText && !initialText.startsWith("[No text") && !initialText.startsWith("[Error") && !initialText.startsWith("[Media")) {
      resolve(initialText);
      return;
    }

    const observer = new MutationObserver((mutationsList, obs) => {
      const newText = getMessageSnippet(turnElement, role);
      if (newText && !newText.startsWith("[No text") && !newText.startsWith("[Error") && !newText.startsWith("[Media")) {
        obs.disconnect();
        clearTimeout(timeoutHandle);
        resolve(newText);
      }
    });

    observer.observe(turnElement, { childList: true, subtree: true, characterData: true });

    const timeoutHandle = setTimeout(() => {
      observer.disconnect();
      const fallbackText = getMessageSnippet(turnElement, role); 
      resolve(fallbackText);
    }, timeoutMs);
  });
}

function getMessageSnippet(turnElement, role) {
  if (!turnElement) return "[Error: Turn element not found]";

  let text = "";
  let contentSourceElement = null;

  const userSelectors = [
    '.user-prompt-container ms-text-chunk textarea', 
    '.user-prompt-container ms-text-chunk ms-cmark-node',
    '.user-prompt-container ms-cmark-node',
    '.user-prompt-container ms-text-chunk', 
  ];
  const modelSelectors = [
    '.model-prompt-container ms-text-chunk ms-cmark-node',
    '.model-prompt-container ms-cmark-node',
    '.model-prompt-container ms-text-chunk', 
  ];
  const generalSelectors = [ 
    'ms-cmark-node',
    'ms-text-chunk textarea',
    'ms-text-chunk',
    '.turn-content > div > div',
    '.turn-content'
  ];

  let selectorsToUse = generalSelectors;
  if (role.toLowerCase() === 'user') {
    selectorsToUse = userSelectors.concat(generalSelectors);
  } else if (role.toLowerCase() === 'model') {
    selectorsToUse = modelSelectors.concat(generalSelectors);
  }

  for (const selector of selectorsToUse) {
    contentSourceElement = turnElement.querySelector(selector);
    if (contentSourceElement) {
      const clone = contentSourceElement.cloneNode(true);
      clone.querySelectorAll('button, mat-icon, .material-symbols-outlined, ms-thought-chunk, .actions-container, .turn-footer, ms-chat-turn-options, ms-prompt-feedback, .model-run-time-pill, .feedback-container, .header, .info-container, script, style')
           .forEach(el => el.remove());
      text = (clone.tagName === 'TEXTAREA') ? clone.value : clone.textContent;
      text = text ? text.trim() : "";
      if (text) break; 
    }
  }
  
  if (!text) {
    const turnClone = turnElement.cloneNode(true);
    const selectorsToRemoveFromTurn = [
      '.actions-container', '.turn-footer', 'ms-chat-turn-options', 
      'ms-prompt-feedback', '.model-run-time-pill', '.feedback-container', 
      '.header', '.info-container', 
      'ms-thought-chunk', 'ms-add-chunk-menu', 'run-button',
      'button', 'mat-icon', '.material-symbols-outlined',
      'script', 'style'
    ];
    selectorsToRemoveFromTurn.forEach(selector => {
      turnClone.querySelectorAll(selector).forEach(el => el.remove());
    });
    text = turnClone.textContent ? turnClone.textContent.trim() : "";
  }
  
  const patternsToClean = [
    /\b(more_vert|edit|thumb_up|thumb_down|cached|content_copy|add_circle|send|refresh|close|tune|menu|key|history|videocam|graphic_eq|extension|open_in_new|settings|save|share|compare_arrows|expand_less|expand_more|chevron_right|prompt_spark|lightbulb|palette|code|play_arrow|stop|download|upload|visibility|visibility_off|search|filter_list|delete|info|warning|error|check_circle|cancel|arrow_drop_down|arrow_drop_up|arrow_back|arrow_forward|first_page|last_page|drag_handle|view_module|view_list|apps|thoughts|assignment)\b/gi,
    new RegExp(`^${role}\\s*\\(\\d+\\)\\s*`, 'i'), 
    /^\s*\(\d+\)\s*/, 
    /\s\(\d+\)$/, 
    /\s\s+/g 
  ];

  for (const pattern of patternsToClean) {
    text = text.replace(pattern, ' ').trim(); 
  }
  text = text.trim();

  if (!text) {
    if (turnElement.querySelector('ms-prompt-chunk[id*="-"], img, video, audio')) {
        return "[Media content or non-text chunk]";
    }
    return "[No text content found]";
  }

  const lines = text.split('\n').filter(line => line.trim() !== '');
  const firstFewLines = lines.slice(0, 3).join('\n'); 
  
  return firstFewLines.substring(0, 150) + (lines.join('\n').length > 150 ? '...' : '');
}

function populateSidebar(useCache = false) {
  if (!sidebarOpen || !sidebarElement) return;

  const messageList = sidebarElement.querySelector('.pruner-message-list');
  if (!messageList) return;
  messageList.innerHTML = ''; 
  
  const selectAllCheckbox = document.getElementById('pruner-select-all-checkbox');
  if (selectAllCheckbox) selectAllCheckbox.checked = false;
  updateDeleteSelectedButtonState();

  const chatTurns = document.querySelectorAll('ms-chat-turn');
  const startIndexInput = document.getElementById('pruner-range-start');
  const endIndexInput = document.getElementById('pruner-range-end');
  if (startIndexInput) startIndexInput.max = chatTurns.length;
  if (endIndexInput) endIndexInput.max = chatTurns.length;
  updateDeleteRangeButtonState();

  chatTurns.forEach((turnElement, index) => {
    if (!turnElement.dataset.prunerId) { 
        turnElement.dataset.prunerId = `pruner-turn-${index}`;
    }
    const turnId = turnElement.dataset.prunerId;

    const roleElement = turnElement.querySelector('[data-turn-role]');
    const role = roleElement ? roleElement.getAttribute('data-turn-role') : 'Unknown';
    
    let snippet;
    if (useCache && typeof scrapedMessagesCache[turnId] === 'string') {
        snippet = scrapedMessagesCache[turnId];
    } else {
        snippet = getMessageSnippet(turnElement, role);
        if (!useCache || typeof scrapedMessagesCache[turnId] === 'undefined') { 
            scrapedMessagesCache[turnId] = snippet;
        }
    }
    
    const listItem = document.createElement('li');
    listItem.className = 'pruner-message-item';
    listItem.turnElement = turnElement; 

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'pruner-message-checkbox';
    checkbox.dataset.turnIndex = index; 
    checkbox.onchange = updateDeleteSelectedButtonState;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'pruner-message-content';

    const roleSpan = document.createElement('div');
    roleSpan.className = `pruner-message-role ${role.toLowerCase()}`;
    
    const roleIcon = document.createElement('span');
    roleIcon.className = 'role-icon';
    roleIcon.textContent = (role.toLowerCase() === 'user') ? 'person' : 'smart_toy';
    
    const roleText = document.createElement('span');
    roleText.textContent = `${role} (${index + 1})`;
    
    roleSpan.appendChild(roleIcon);
    roleSpan.appendChild(roleText);

    const snippetP = document.createElement('p');
    snippetP.className = 'pruner-message-snippet';
    if (snippet.startsWith("[No text") || snippet.startsWith("[Error") || snippet.startsWith("[Media")) {
        snippetP.classList.add('no-content');
    }
    snippetP.textContent = snippet;

    contentDiv.appendChild(roleSpan);
    contentDiv.appendChild(snippetP);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'pruner-delete-btn';
    deleteButton.textContent = 'delete_sweep'; 
    deleteButton.title = "Delete this message";
    deleteButton.onclick = (e) => {
        e.stopPropagation(); 
        handleDelete(turnElement);
    };
    
    listItem.appendChild(checkbox);
    listItem.appendChild(contentDiv);
    listItem.appendChild(deleteButton);
    messageList.appendChild(listItem);
  });
}

async function handleDelete(turnElement) { 
  if (!turnElement) {
      console.error("AI Studio Pruner: Invalid turnElement passed to handleDelete.");
      return false;
  }

  const moreOptionsButton = turnElement.querySelector('ms-chat-turn-options button[aria-label="Open options"], ms-chat-turn-options button[aria-label*="More options"]');

  if (!moreOptionsButton) {
    console.error('AI Studio Pruner: Could not find "more options" button for this turn.');
    return false;
  }

  moreOptionsButton.click();
  await new Promise(resolve => setTimeout(resolve, 250)); 

  let deleteMenuItem = null;
  const menuContainers = document.querySelectorAll('.cdk-overlay-pane, .mat-mdc-menu-panel'); 
  
  menuContainers.forEach(container => {
    if (deleteMenuItem) return; 
    const items = container.querySelectorAll('.mat-mdc-menu-item, .mat-menu-item, [role="menuitem"]');
    items.forEach(item => {
      if (item.textContent.trim().toLowerCase().includes('delete')) {
        if (item.offsetParent !== null) { 
           deleteMenuItem = item;
        }
      }
    });
  });
  
  if (!deleteMenuItem) {
      deleteMenuItem = document.querySelector('button[aria-label*="Delete turn"], button[data-test-id*="delete-turn"]');
  }

  if (!deleteMenuItem) {
    console.error('AI Studio Pruner: Could not find "Delete" menu item.');
    if (moreOptionsButton.getAttribute('aria-expanded') === 'true') {
        moreOptionsButton.click(); 
    }
    return false;
  }

  deleteMenuItem.click();
  await new Promise(resolve => setTimeout(resolve, 500)); 
  return true;
}

function handleSelectAllToggle(event) {
    const isChecked = event.target.checked;
    const checkboxes = sidebarElement.querySelectorAll('.pruner-message-checkbox');
    checkboxes.forEach(checkbox => checkbox.checked = isChecked);
    updateDeleteSelectedButtonState();
}

function updateDeleteSelectedButtonState() {
    const deleteSelectedBtn = document.getElementById('pruner-delete-selected-btn');
    if (deleteSelectedBtn) {
        const checkedCheckboxes = sidebarElement.querySelectorAll('.pruner-message-checkbox:checked');
        deleteSelectedBtn.disabled = checkedCheckboxes.length === 0;
    }
}

function updateDeleteRangeButtonState() {
    const deleteRangeBtn = document.getElementById('pruner-delete-range-btn');
    const startInput = document.getElementById('pruner-range-start');
    const endInput = document.getElementById('pruner-range-end');
    if (deleteRangeBtn && startInput && endInput) {
        const startIndex = parseInt(startInput.value, 10);
        const endIndex = parseInt(endInput.value, 10);
        const allListItems = Array.from(sidebarElement.querySelectorAll('.pruner-message-list .pruner-message-item'));
        deleteRangeBtn.disabled = isNaN(startIndex) || isNaN(endIndex) || startIndex < 1 || endIndex < startIndex || endIndex > allListItems.length;
    }
}


async function handleDeleteSelected() {
    const checkboxes = sidebarElement.querySelectorAll('.pruner-message-checkbox:checked');
    if (checkboxes.length === 0) {
        alert("No messages selected for deletion.");
        return;
    }

    const confirmation = confirm(`Are you sure you want to delete ${checkboxes.length} selected message(s)?`);
    if (!confirmation) return;

    const turnsToDelete = [];
    checkboxes.forEach(checkbox => {
        const listItem = checkbox.closest('.pruner-message-item');
        if (listItem && listItem.turnElement) {
            turnsToDelete.push(listItem.turnElement);
        }
    });

    for (const turn of turnsToDelete.reverse()) {
        await handleDelete(turn); 
    }
    populateSidebar(true);
}

async function handleDeleteRange() {
    const startInput = document.getElementById('pruner-range-start');
    const endInput = document.getElementById('pruner-range-end');
    const startIndex = parseInt(startInput.value, 10);
    const endIndex = parseInt(endInput.value, 10);

    const allListItems = Array.from(sidebarElement.querySelectorAll('.pruner-message-list .pruner-message-item'));

    if (isNaN(startIndex) || isNaN(endIndex) || startIndex < 1 || endIndex < startIndex || endIndex > allListItems.length) {
        alert(`Invalid range. Please enter numbers between 1 and ${allListItems.length}, with start <= end.`);
        return;
    }
    
    const confirmation = confirm(`Are you sure you want to delete messages from ${startIndex} to ${endIndex}?`);
    if (!confirmation) return;

    const turnsToDelete = [];
    for (let i = endIndex - 1; i >= startIndex - 1; i--) { 
        if (allListItems[i] && allListItems[i].turnElement) {
            turnsToDelete.push(allListItems[i].turnElement);
        }
    }

    for (const turn of turnsToDelete.reverse()) { 
        await handleDelete(turn);
    }
    populateSidebar(true);
    startInput.value = '';
    endInput.value = '';
}

function setupChatContainerObserver() {
  if (chatContainerObserver && chatContainerObserver._targetFound) {
    return;
  }
  if (chatContainerObserver) {
    chatContainerObserver.disconnect();
  }

  const chatContainer = document.querySelector('ms-chat-session ms-autoscroll-container > div'); 
  
  if (chatContainer) {
    chatContainerObserver = new MutationObserver((mutationsList, observer) => {
      for(const mutation of mutationsList) {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
              let newTurnAdded = false;
              mutation.addedNodes.forEach(node => {
                  if (node.nodeName === 'MS-CHAT-TURN' || (node.querySelector && node.querySelector('ms-chat-turn'))) {
                      newTurnAdded = true;
                  }
              });
              if (newTurnAdded && sidebarOpen) { 
                  clearTimeout(observerDebounceTimer);
                  observerDebounceTimer = setTimeout(() => populateSidebar(false), 300);
              }
              break; 
          }
      }
    });
    chatContainerObserver.observe(chatContainer, { childList: true, subtree: false }); 
    chatContainerObserver._targetFound = true; 
  } else {
    if (initialObserverSetupAttempted) { 
        console.warn("AI Studio Pruner: Chat container for MutationObserver still not found. Auto-refresh on new messages might not work.");
    }
    if (chatContainerObserver) chatContainerObserver._targetFound = false;
  }
  initialObserverSetupAttempted = true;
}

function attemptSetupChatContainerObserver() {
    setupChatContainerObserver(); 
    setTimeout(() => {
        if (!chatContainerObserver || !chatContainerObserver._targetFound) {
            setupChatContainerObserver();
        }
    }, 2000); 
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "TOGGLE_SIDEBAR_VISIBILITY") {
    handleSidebarToggleRequest();
    sendResponse({status: "Sidebar visibility toggled"});
  }
  return true; 
});

sidebarElement = createSidebar(); 
// Default state is now handled by CSS (left: -310px)
// sidebarOpen remains false initially.

window.addEventListener('load', () => {
    setTimeout(attemptSetupChatContainerObserver, 1500); 
});

console.log("AI Studio Message Pruner content script loaded and initialized.");