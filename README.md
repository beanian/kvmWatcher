# kvmWatcher

This repo contains a Chrome extension and a local desktop agent that capture screenshots from a KVM web UI, send them to GPT-4o-mini for comparison, and notify a Home Assistant webhook when new Teams or Outlook notifications appear.

## Components

- `extension/`: Chrome extension that captures the KVM tab every 30 seconds.
- `agent/`: Node.js service that compares screenshots with GPT-4o-mini and triggers the webhook.

## Local Agent Setup

```bash
cd agent
npm install
cp .env.example .env
npm start
```

Environment variables:

- `OPENAI_API_KEY`: OpenAI API key.
- `OPENAI_MODEL`: defaults to `gpt-4o-mini`.
- `HOME_ASSISTANT_WEBHOOK_URL`: Home Assistant webhook endpoint.
- `PORT`: optional, defaults to `3000`.

## Chrome Extension Setup

See `extension/README.md` for the detailed steps to load the extension in Chrome.
