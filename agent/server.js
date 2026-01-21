import dotenv from "dotenv";
import express from "express";
import fs from "fs/promises";
import path from "path";

dotenv.config();

const app = express();
app.use(express.json({ limit: "20mb" }));

const PORT = Number(process.env.PORT || 3000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const HOME_ASSISTANT_WEBHOOK_URL = process.env.HOME_ASSISTANT_WEBHOOK_URL;
const CAPTURE_DIR = process.env.CAPTURE_DIR || "captures";

let previousImageDataUrl = null;
let lastNotifiedFingerprint = null;

function requireEnv(value, name) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

function validateEnvironment() {
  requireEnv(OPENAI_API_KEY, "OPENAI_API_KEY");
  requireEnv(HOME_ASSISTANT_WEBHOOK_URL, "HOME_ASSISTANT_WEBHOOK_URL");
}

function dataUrlToBase64(dataUrl) {
  if (!dataUrl?.startsWith("data:image/")) {
    throw new Error("Expected a data URL for an image.");
  }
  return dataUrl.split(",")[1];
}

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function saveScreenshot(base64Data) {
  await fs.mkdir(CAPTURE_DIR, { recursive: true });
  const filename = `${timestampForFilename()}.png`;
  const filePath = path.join(CAPTURE_DIR, filename);
  await fs.writeFile(filePath, Buffer.from(base64Data, "base64"));
  return filePath;
}

async function callOpenAI({ currentImageDataUrl, previousImageDataUrl }) {
  requireEnv(OPENAI_API_KEY, "OPENAI_API_KEY");

  const body = {
    model: OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: [
              "You analyze two consecutive screenshots from a KVM display.",
              "Detect whether there is a new Microsoft Teams message, Teams call, or Outlook email notification that just appeared.",
              "Only notify for newly arrived items (not already present in the previous image).",
              "Return a strict JSON object with keys: notify (boolean), summary (string), fingerprint (string), sender (string), subject (string), time (string).",
              "fingerprint should uniquely identify the new item (e.g., sender + subject + time).",
              "If no new item, set notify=false and summary empty and sender/subject/time empty.",
              "Do not include any extra keys or formatting."
            ].join(" ")
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Previous screenshot"
          },
          {
            type: "input_image",
            image_url: previousImageDataUrl
          },
          {
            type: "input_text",
            text: "Current screenshot"
          },
          {
            type: "input_image",
            image_url: currentImageDataUrl
          }
        ]
      }
    ]
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const outputText = data.output?.[0]?.content?.[0]?.text;
  if (!outputText) {
    throw new Error("OpenAI response missing output text.");
  }

  console.log(`OpenAI raw response text: ${outputText}`);
  try {
    return JSON.parse(outputText);
  } catch (error) {
    throw new Error(`Failed to parse OpenAI JSON response: ${error.message}`);
  }
}

async function sendWebhook(payload) {
  requireEnv(HOME_ASSISTANT_WEBHOOK_URL, "HOME_ASSISTANT_WEBHOOK_URL");

  const response = await fetch(HOME_ASSISTANT_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Webhook failed: ${response.status} ${errorText}`);
  }
}

app.post("/upload", async (req, res) => {
  try {
    const { imageDataUrl } = req.body;
    if (!imageDataUrl) {
      return res.status(400).json({ error: "Missing imageDataUrl" });
    }

    console.log(`Received screenshot at ${new Date().toISOString()}`);
    const currentImageBase64 = dataUrlToBase64(imageDataUrl);
    const savedPath = await saveScreenshot(currentImageBase64);
    console.log(`Saved screenshot to ${savedPath}`);
    if (!previousImageDataUrl) {
      previousImageDataUrl = imageDataUrl;
      console.log("Stored initial screenshot; awaiting next frame for comparison.");
      return res.json({ status: "stored_initial" });
    }

    console.log("Sending screenshots to OpenAI for comparison.");
    const analysis = await callOpenAI({
      currentImageDataUrl: imageDataUrl,
      previousImageDataUrl
    });
    console.log("OpenAI analysis result:", analysis);

    if (analysis.notify && analysis.fingerprint !== lastNotifiedFingerprint) {
      console.log(`Notification triggered: ${analysis.summary}`);
      await sendWebhook({
        source: "kvm-watcher",
        summary: analysis.summary,
        fingerprint: analysis.fingerprint,
        sender: analysis.sender,
        subject: analysis.subject,
        time: analysis.time,
        timestamp: new Date().toISOString()
      });
      lastNotifiedFingerprint = analysis.fingerprint;
    } else if (analysis.notify) {
      console.log("Notification suppressed because fingerprint matches last notification.");
    } else {
      console.log("No new notification detected.");
    }

    previousImageDataUrl = imageDataUrl;
    return res.json({ status: "processed", notify: analysis.notify });
  } catch (error) {
    console.error("Error handling upload:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  try {
    validateEnvironment();
  } catch (error) {
    console.error("Configuration error:", error.message);
    process.exit(1);
  }
  console.log(`kvm-watcher agent listening on http://localhost:${PORT}`);
});
