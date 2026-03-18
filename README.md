# Mac Stats Viewer

A lightweight, real-time system monitoring dashboard for macOS — running entirely in your browser. No Electron, no heavy frameworks, just Node.js + vanilla JavaScript.

![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green) ![Express](https://img.shields.io/badge/Express-4.18-blue) ![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)

---

## Overview

Mac Stats Viewer is a minimal alternative to Activity Monitor. It spins up a local Express server that reads live system data from native macOS commands (`sysctl`, `vm_stat`, `ps`, `netstat`, `pmset`, `ioreg`, `df`) and serves them as JSON. The browser frontend polls every 3 seconds and renders the data in a clean, dark-themed dashboard with real-time charts.

---

## Features

| Category | Details |
|---|---|
| **CPU** | Usage % (user + system split), per-core load, top processes by CPU |
| **Memory** | Active / wired / compressed / cached / free breakdown, swap info, donut chart |
| **Disk** | Used vs available space for the main volume |
| **Network** | Real-time download/upload speeds per physical interface |
| **Battery** | Charge %, time remaining, health status, cycle count |
| **System Info** | Hostname, macOS version, CPU model, core count, total RAM, uptime, load average |

All charts retain the last **40 data points** (~2 minutes of history).

---

## Requirements

- macOS (all features rely on macOS-native CLI tools)
- Node.js 18 or later
- npm

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/your-username/mac-stats-viewer.git
cd mac-stats-viewer
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the server

```bash
# Production
npm start

# Development (auto-restarts on file changes)
npm run dev
```

### 4. Open the dashboard

```
http://localhost:3000
```

That's it. No build step, no environment variables required.

---

## Project Structure

```
mac-stats-viewer/
├── public/
│   └── index.html       # Frontend — dashboard UI, charts, polling logic
├── server.js            # Backend — Express server + macOS data collection
├── package.json
└── package-lock.json
```

### Backend (`server.js`)

The server exposes two routes:

| Route | Description |
|---|---|
| `GET /` | Serves the frontend dashboard |
| `GET /api/stats` | Returns a JSON snapshot of all system metrics |

Each call to `/api/stats` runs several async functions in parallel:

- `getSystemInfo()` — cached on first call (hostname, OS version, CPU model, RAM)
- `getCPU()` — delta-based CPU usage using `os.cpus()` + top processes via `ps`
- `getMemory()` — parses `vm_stat` output into human-readable numbers
- `getDisk()` — runs `df` to get volume usage
- `getNetwork()` — parses `netstat -i` and computes per-second rates
- `getBattery()` — reads `pmset -g batt` and `ioreg` for detailed battery info
- `getProcesses()` — returns top 5 processes by CPU and memory via `ps`

### Frontend (`public/index.html`)

Single-file frontend with no build tooling:

- **CSS Grid** layout — 3-column adaptive dashboard
- **Chart.js** (loaded from CDN) — line charts for CPU/network, donut chart for memory
- **Fetch polling** — calls `/api/stats` every 3 seconds and updates the DOM in place
- **macOS aesthetic** — SF Pro Text font stack, dark background, accent colors matching macOS system UI

---

## API Reference

`GET /api/stats` returns a JSON object with this shape:

```json
{
  "system": {
    "hostname": "MacBook-Pro.local",
    "os": "macOS 14.5",
    "cpu": "Apple M2 Pro",
    "cores": 12,
    "totalMemory": 16,
    "uptime": 86400,
    "loadAvg": [1.2, 1.4, 1.5]
  },
  "cpu": {
    "usage": 14.3,
    "user": 9.1,
    "system": 5.2
  },
  "memory": {
    "total": 16384,
    "active": 4200,
    "wired": 2100,
    "compressed": 800,
    "cached": 3000,
    "free": 6284,
    "swapUsed": 0,
    "swapTotal": 2048
  },
  "disk": {
    "total": 494384,
    "used": 210000,
    "free": 284384,
    "percent": 42.5
  },
  "network": {
    "en0": { "download": 1240, "upload": 340 }
  },
  "battery": {
    "percent": 87,
    "charging": false,
    "timeRemaining": "3:42",
    "health": "Normal",
    "cycleCount": 145
  },
  "processes": {
    "byCPU": [...],
    "byMemory": [...]
  }
}
```

---

## How It Works

```
Browser (every 3s)
    │
    │  GET /api/stats
    ▼
Express Server (port 3000)
    │
    ├── getSystemInfo()   →  sysctl, uname
    ├── getCPU()          →  os.cpus(), ps aux
    ├── getMemory()       →  vm_stat
    ├── getDisk()         →  df -k
    ├── getNetwork()      →  netstat -i
    ├── getBattery()      →  pmset -g batt, ioreg
    └── getProcesses()    →  ps aux --sort
    │
    │  JSON response
    ▼
Frontend updates charts and stat cards in place
```

---

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Start the server (production) |
| `npm run dev` | Start with `--watch` flag for auto-reload during development |

---

## Limitations

- **macOS only** — relies entirely on macOS system commands. Will not work on Linux or Windows.
- **Single user** — designed for local use on your own machine.
- **No auth** — the server binds to `localhost` only, but there is no authentication layer. Do not expose it to a public network.

---

## License

MIT
