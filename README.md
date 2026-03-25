# Mac Stats Viewer

A lightweight, real-time system monitoring dashboard for macOS — running entirely in your browser. No Electron, no heavy frameworks, just Node.js + vanilla JavaScript.

![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green) ![Express](https://img.shields.io/badge/Express-4.18-blue) ![Platform](https://img.shields.io/badge/platform-macOS-lightgrey) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## Overview

Mac Stats Viewer is a minimal alternative to Activity Monitor. It spins up a local Express server that reads live system data from native macOS commands (`sysctl`, `vm_stat`, `ps`, `netstat`, `pmset`, `ioreg`, `df`) and serves them as JSON. The browser frontend polls every 3 seconds and renders the data in a clean, dark-themed dashboard with real-time charts — no build step, no config, no dependencies beyond Express.

---

## Features

| Category | Details |
|---|---|
| **CPU** | Usage % (user + system split), per-core load average, top processes by CPU, 2-min history chart |
| **Memory** | Active / wired / compressed / cached / free breakdown, swap usage, memory pressure indicator, donut chart |
| **Disk** | Used vs. available space for the main APFS volume with color-coded progress bar |
| **Network** | Real-time download/upload speeds per physical interface (filters out loopback and VPN tunnels) |
| **Battery** | Charge %, charging status, time remaining or time to full, health, cycle count |
| **System Info** | Hostname, macOS version, CPU model, core count, total RAM, uptime, load average (1 / 5 / 15 min) |
| **Processes** | Top 5 by CPU and top 5 by memory with real MB values |

All charts retain the last **40 data points** (~2 minutes of history).

---

## Requirements

- macOS (all features rely on macOS-native CLI tools)
- Node.js 18 or later
- npm

> Works on both **Apple Silicon** (M1/M2/M3/M4) and **Intel** Macs.

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/rohit-yadav5/mac-stats-viewer.git
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

Each call to `/api/stats` runs the following async collectors in parallel:

| Function | Command(s) | Description |
|---|---|---|
| `getSystemInfo()` | `sysctl`, `sw_vers` | Hostname, OS version, CPU model, RAM — cached after the first call |
| `getCPU()` | `os.cpus()`, `ps` | Delta-based CPU usage (user + system) and top processes by CPU |
| `getMemory()` | `vm_stat`, `sysctl`, `memory_pressure` | Page-based memory breakdown, swap, and pressure status |
| `getDisk()` | `df -kl` | Main APFS volume usage and availability |
| `getNetwork()` | `netstat -i -b` | Per-interface byte totals converted to per-second speeds |
| `getBattery()` | `pmset`, `ioreg` | Charge %, status, time remaining, health, cycle count |
| `getProcesses()` | `ps` | Top 5 processes sorted by CPU and by resident memory |

### Frontend (`public/index.html`)

Single-file frontend with no build tooling:

- **CSS Grid** layout — 3-column adaptive dashboard
- **Chart.js** (loaded from CDN) — line charts for CPU and memory history, donut chart for memory breakdown
- **Fetch polling** — calls `/api/stats` every 3 seconds and updates the DOM in place
- **macOS aesthetic** — SF Pro Text font stack, dark background, accent colors matching macOS system UI

---

## API Reference

`GET /api/stats` returns a JSON object with this shape:

```json
{
  "system": {
    "hostname":  "MacBook-Pro.local",
    "platform":  "macOS 14.5",
    "model":     "MacBookPro18,1",
    "arch":      "arm64",
    "cpuModel":  "Apple M2 Pro",
    "cpuCores":  12,
    "totalRam":  "16.0 GB",
    "uptime":    "2h 30m",
    "loadAvg":   ["1.20", "1.40", "1.50"]
  },
  "cpu": {
    "user":          9.1,
    "sys":           5.2,
    "idle":          85.7,
    "used":          14.3,
    "psNormalized":  14.3
  },
  "memory": {
    "total":           17179869184,
    "totalFmt":        "16.0 GB",
    "used":            8589934592,
    "usedFmt":         "8.0 GB",
    "available":       6442450944,
    "availableFmt":    "6.0 GB",
    "free":            1073741824,
    "freeFmt":         "1.0 GB",
    "wired":           2147483648,
    "wiredFmt":        "2.0 GB",
    "active":          4294967296,
    "activeFmt":       "4.0 GB",
    "inactive":        5368709120,
    "inactiveFmt":     "5.0 GB",
    "compressed":      2147483648,
    "compressedFmt":   "2.0 GB",
    "percent":         50.0,
    "availPct":        37.5,
    "pressure":        "normal",
    "swap": {
      "total":         3221225472,
      "used":          1073741824,
      "totalFmt":      "3.0 GB",
      "usedFmt":       "1.0 GB",
      "percent":       33.3
    }
  },
  "disk": [
    {
      "mount":     "/System/Volumes/Data",
      "total":     499963174912,
      "totalFmt":  "465.6 GB",
      "used":      215023288320,
      "usedFmt":   "200.3 GB",
      "avail":     267519762432,
      "availFmt":  "249.1 GB",
      "percent":   44
    }
  ],
  "network": [
    {
      "name":         "en0",
      "speedIn":      125000,
      "speedInFmt":   "122.1 KB/s",
      "speedOut":     8192,
      "speedOutFmt":  "8.0 KB/s",
      "totalIn":      "12.3 GB",
      "totalOut":     "4.1 GB"
    }
  ],
  "battery": {
    "percent":        87,
    "status":         "discharging",
    "timeRemaining":  "3:42",
    "timeLabel":      "Time left",
    "charging":       false,
    "onAC":           false,
    "healthy":        true,
    "cycleCount":     145
  },
  "processes": {
    "byCPU": [
      { "pid": "1234", "cpu": 14.2, "memMB": 512.0, "name": "Xcode" }
    ],
    "byMem": [
      { "pid": "5678", "cpu": 0.1, "memMB": 2048.0, "name": "Simulator" }
    ]
  },
  "timestamp": 1711234567890
}
```

> `battery` is `null` on a desktop Mac with no battery attached.

---

## How It Works

```
Browser (every 3s)
    │
    │  GET /api/stats
    ▼
Express Server (port 3000)
    │
    ├── getSystemInfo()   →  sysctl hw.model, sw_vers
    ├── getCPU()          →  os.cpus() delta + ps -axco pcpu
    ├── getMemory()       →  vm_stat, sysctl vm.swapusage, memory_pressure
    ├── getDisk()         →  df -kl
    ├── getNetwork()      →  netstat -i -b
    ├── getBattery()      →  pmset -g batt, ioreg AppleSmartBattery
    └── getProcesses()    →  ps -axco pid,pcpu,rss,comm
    │
    │  JSON response
    ▼
Frontend updates charts and stat cards in place
```

CPU usage is calculated as the **delta** between two consecutive snapshots of `os.cpus()` times, giving accurate per-interval percentages rather than lifetime averages. Memory page counts from `vm_stat` are multiplied by the actual page size reported in the output (4 096 bytes on Intel, 16 384 bytes on Apple Silicon).

---

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Start the server with `node server.js` |
| `npm run dev` | Start with `node --watch` for auto-reload during development |

The server listens on port **3000** by default. Override with the `PORT` environment variable:

```bash
PORT=8080 npm start
```

---

## Limitations

- **macOS only** — relies entirely on macOS system commands. Will not work on Linux or Windows.
- **Single user, local only** — designed to run on your own machine. The server binds to all interfaces on the configured port; do not expose it to a public or shared network without adding an authentication layer.
- **No historical persistence** — chart history exists only in the browser tab. Closing or refreshing the tab resets all graphs.
- **Desktop Macs** — battery info is omitted (`null`) when no battery is present.
