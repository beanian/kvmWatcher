# KVM Watcher Extension

## Setup

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `extension` folder.
4. Navigate to your KVM web UI tab.
5. Click the extension icon to mark the current tab as the capture target.

The extension will capture the tab every 30 seconds and POST screenshots to `http://localhost:3000/upload`.
