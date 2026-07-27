# SRE Agent

Standalone Agentic Workflow Platform — build autonomous agents that get things done.

## Quick Start

```bash
git clone https://github.com/LoveFleming/sre-agent.git
cd sre-agent
npm install
npm run build
npm start
```

Server runs on `http://localhost:4200`.

## Configuration

Copy the template and fill in your API keys:

```bash
cp data/config/providers.json data/config/providers.local.json
```

Edit `providers.local.json` — replace `***` with your real API keys. The `.local.json` file is gitignored.

## Development

```bash
npm run dev   # starts both server (4200) and UI dev server (4201)
```

## Features

- **Agentic Workflow Runner** — autonomous LLM + tool loop
- **MCP Hub** — extensible tool providers
- **Execution Logger** — step-by-step trace with token/duration tracking
- **Web UI** — workflow editor, live runs, execution logs, tool browser, chat
