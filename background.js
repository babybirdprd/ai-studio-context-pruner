chrome.action.onClicked.addListener((tab) => {
  if (tab.url && tab.url.startsWith("https://aistudio.google.com/")) {
    chrome.tabs.sendMessage(tab.id, {
      type: "TOGGLE_SIDEBAR_VISIBILITY" // More specific action name
    });
  }
});