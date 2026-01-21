const CAPTURE_ALARM = "kvm-capture";
const CAPTURE_INTERVAL_MINUTES = 0.5;
const AGENT_URL = "http://localhost:3000/upload";

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(CAPTURE_ALARM, { periodInMinutes: CAPTURE_INTERVAL_MINUTES });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) {
    return;
  }
  await chrome.storage.local.set({
    targetTabId: tab.id,
    targetWindowId: tab.windowId
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== CAPTURE_ALARM) {
    return;
  }

  const { targetTabId, targetWindowId } = await chrome.storage.local.get([
    "targetTabId",
    "targetWindowId"
  ]);

  if (!targetTabId || !targetWindowId) {
    return;
  }

  try {
    await chrome.tabs.get(targetTabId);
  } catch {
    await chrome.storage.local.remove(["targetTabId", "targetWindowId"]);
    return;
  }

  const imageDataUrl = await chrome.tabs.captureVisibleTab(targetWindowId, {
    format: "png"
  });

  await fetch(AGENT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ imageDataUrl })
  });
});
