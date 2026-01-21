const CAPTURE_ALARM = "kvm-capture";
const CAPTURE_INTERVAL_MINUTES = 0.5;
const AGENT_URL = "http://localhost:3000/upload";

function setActiveBadge(isActive) {
  if (isActive) {
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#2e7d32" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

function ensureAlarm() {
  chrome.alarms.create(CAPTURE_ALARM, { periodInMinutes: CAPTURE_INTERVAL_MINUTES });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) {
    return;
  }
  const { targetTabId, targetWindowId } = await chrome.storage.local.get([
    "targetTabId",
    "targetWindowId"
  ]);
  const isSameTarget = targetTabId === tab.id && targetWindowId === tab.windowId;
  if (isSameTarget) {
    await chrome.storage.local.remove(["targetTabId", "targetWindowId"]);
    setActiveBadge(false);
    return;
  }
  await chrome.storage.local.set({
    targetTabId: tab.id,
    targetWindowId: tab.windowId
  });
  setActiveBadge(true);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.targetTabId || changes.targetWindowId) {
    chrome.storage.local.get(["targetTabId", "targetWindowId"]).then(({ targetTabId, targetWindowId }) => {
      setActiveBadge(Boolean(targetTabId && targetWindowId));
    });
  }
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
    setActiveBadge(false);
    return;
  }

  try {
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
  } catch (error) {
    console.error("Failed to capture or upload KVM screenshot", error);
  }
});
