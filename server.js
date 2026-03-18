'use strict';

const express = require('express');
const { exec, spawn } = require('child_process');
const os   = require('os');
const path = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function run(cmd, timeout = 6000) {
  return new Promise(resolve => {
    exec(cmd, { timeout }, (err, stdout) => {
      if (err) console.error(`[run] "${cmd}" →`, err.message);
      resolve(stdout?.trim() ?? '');
    });
  });
}

function runSpawn(bin, args = []) {
  return new Promise(resolve => {
    const proc = spawn(bin, args);
    let out = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.on('close', () => resolve(out.trim()));
    proc.on('error', e => { console.error(`[spawn] ${bin}:`, e.message); resolve(''); });
  });
}

function fmtBytes(n) {
  if (!n || n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return (n / 1024 ** i).toFixed(1) + ' ' + u[i];
}

function fmtUptime(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

// ── System Info (cached) ──────────────────────────────────────────────────────

let _sysCache = null;

async function getSystemInfo() {
  if (!_sysCache) {
    const [model, osVer] = await Promise.all([
      run('sysctl -n hw.model'),
      run('sw_vers -productVersion'),
    ]);
    const cpus = os.cpus();
    _sysCache = {
      platform: 'macOS ' + osVer,
      model:    model || 'Mac',
      arch:     os.arch(),
      cpuModel: cpus[0]?.model?.replace(/\s+/g, ' ').trim() || 'Unknown',
      cpuCores: cpus.length,
      totalRam: fmtBytes(os.totalmem()),
    };
  }
  return {
    ..._sysCache,
    hostname: os.hostname(),
    uptime:   fmtUptime(os.uptime()),
    loadAvg:  os.loadavg().map(v => v.toFixed(2)),
  };
}

// ── CPU ───────────────────────────────────────────────────────────────────────

let _prevCpuTimes = null;

async function getCPU() {
  const cur    = os.cpus().map(c => ({ ...c.times }));
  const psOut  = await run("ps -A -o %cpu | awk 'NR>1{s+=$1}END{printf \"%.1f\",s}'");
  const psNorm = parseFloat(Math.min(100, (parseFloat(psOut) || 0) / os.cpus().length).toFixed(1));

  if (!_prevCpuTimes) {
    _prevCpuTimes = cur;
    return { user: 0, sys: 0, idle: parseFloat((100 - psNorm).toFixed(1)), used: psNorm, psNormalized: psNorm };
  }

  let aggU = 0, aggS = 0, aggI = 0;
  cur.forEach((c, idx) => {
    const p  = _prevCpuTimes[idx];
    const du = c.user - p.user, dn = c.nice - p.nice;
    const ds = c.sys  - p.sys,  di = c.idle - p.idle, dr = c.irq - p.irq;
    aggU += du + dn; aggS += ds + dr; aggI += di;
  });
  _prevCpuTimes = cur;

  const grand = aggU + aggS + aggI;
  if (grand <= 0) return { user: 0, sys: 0, idle: 100, used: 0, psNormalized: psNorm };
  const user = parseFloat((aggU / grand * 100).toFixed(1));
  const sys  = parseFloat((aggS / grand * 100).toFixed(1));
  return {
    user, sys,
    idle:  parseFloat((aggI / grand * 100).toFixed(1)),
    used:  parseFloat((user + sys).toFixed(1)),
    psNormalized: psNorm,
  };
}

// ── Memory ────────────────────────────────────────────────────────────────────

async function getMemory() {
  const [vmOut, pressOut, swapOut] = await Promise.all([
    run('vm_stat'),
    run('memory_pressure 2>/dev/null'),
    run('sysctl vm.swapusage'),
  ]);

  const total = os.totalmem(), PAGE = 4096;
  const get   = key => { const m = vmOut.match(new RegExp(key + ':\\s+(\\d+)')); return m ? parseInt(m[1]) * PAGE : 0; };

  const wired      = get('Pages wired down');
  const active     = get('Pages active');
  const inactive   = get('Pages inactive');
  const compressed = get('Pages occupied by compressor');
  const free       = get('Pages free');
  const speculative= get('Pages speculative');

  // "used" = actively occupied (matches Activity Monitor "Memory Used")
  const used      = wired + active + compressed;
  // "available" = what apps can actually claim right now (free + reclaimable cache)
  const available = free + inactive + speculative;

  // Swap: "vm.swapusage: total = 3072.00M  used = 2944.00M  free = 128.00M"
  const parseMB = str => {
    const m = str?.match(/([\d.]+)\s*([MmGg])/);
    if (!m) return 0;
    return parseFloat(m[1]) * (m[2].toUpperCase() === 'G' ? 1024 * 1024 * 1024 : 1024 * 1024);
  };
  const swapTotal = parseMB(swapOut.match(/total\s*=\s*([\d.]+\s*\w)/)?.[1]);
  const swapUsed  = parseMB(swapOut.match(/used\s*=\s*([\d.]+\s*\w)/)?.[1]);
  const swapPct   = swapTotal > 0 ? parseFloat((swapUsed / swapTotal * 100).toFixed(1)) : 0;

  const lower    = pressOut.toLowerCase();
  const pressure = lower.includes('critical') ? 'critical' : lower.includes('warn') ? 'warning' : 'normal';

  return {
    total, totalFmt: fmtBytes(total),
    used,  usedFmt:  fmtBytes(used),
    available, availableFmt: fmtBytes(available),
    free,  freeFmt:  fmtBytes(free),
    wired, wiredFmt: fmtBytes(wired),
    active, activeFmt: fmtBytes(active),
    inactive, inactiveFmt: fmtBytes(inactive),
    compressed, compressedFmt: fmtBytes(compressed),
    percent:   parseFloat((used      / total * 100).toFixed(1)),
    availPct:  parseFloat((available / total * 100).toFixed(1)),
    pressure,
    swap: { total: swapTotal, used: swapUsed, totalFmt: fmtBytes(swapTotal), usedFmt: fmtBytes(swapUsed), percent: swapPct },
  };
}

// ── Disk ──────────────────────────────────────────────────────────────────────
// Only the user-data APFS volume — the sealed system volume (/) is read-only
// macOS infrastructure and not meaningful to show.

async function getDisk() {
  const out = await run('df -kl');
  if (!out) return [];
  const rows = out.split('\n').slice(1)
    .filter(l => l.startsWith('/dev/'))
    .map(l => {
      const p     = l.split(/\s+/);
      const total = parseInt(p[1]) * 1024;
      const used  = parseInt(p[2]) * 1024;
      const avail = parseInt(p[3]) * 1024;
      const mount = p.slice(8).join(' ').trim() || '/';
      return { mount, total, totalFmt: fmtBytes(total), used, usedFmt: fmtBytes(used), avail, availFmt: fmtBytes(avail), percent: parseInt(p[4]) || 0 };
    })
    .filter(d => d.total > 0);

  // Prefer the user-data volume; fall back to root
  const data = rows.find(d => d.mount === '/System/Volumes/Data');
  const root = rows.find(d => d.mount === '/');
  return [data || root].filter(Boolean);
}

// ── Network ───────────────────────────────────────────────────────────────────
// Skip loopback, VPN tunnels and other virtual interfaces — only show
// physical adapters (en*, pdp_ip*).

const VIRTUAL_IFACE = /^(lo|utun|gif|stf|awdl|p2p|bridge|llw|anpi|ap\d|XHC|ppp|ipsec)/;

let _prevNet = null, _prevNetTime = null;

async function getNetwork() {
  const out = await runSpawn('/usr/sbin/netstat', ['-i', '-b']);
  const now = Date.now();
  if (!out) return [];

  const seen = new Set(), raw = [];
  out.split('\n').slice(1).forEach(line => {
    const p = line.split(/\s+/);
    if (p.length < 10) return;
    const name = p[0];
    if (seen.has(name) || VIRTUAL_IFACE.test(name)) return;
    seen.add(name);
    const bytesIn = parseInt(p[6]) || 0, bytesOut = parseInt(p[9]) || 0;
    if (!bytesIn && !bytesOut) return;
    raw.push({ name, bytesIn, bytesOut });
  });

  const dt     = _prevNetTime ? (now - _prevNetTime) / 1000 : null;
  const ifaces = raw.map(i => {
    let speedIn = 0, speedOut = 0;
    if (dt && _prevNet?.[i.name]) {
      speedIn  = Math.max(0, (i.bytesIn  - _prevNet[i.name].bytesIn)  / dt);
      speedOut = Math.max(0, (i.bytesOut - _prevNet[i.name].bytesOut) / dt);
    }
    return {
      name: i.name,
      speedIn, speedInFmt:  fmtBytes(speedIn)  + '/s',
      speedOut, speedOutFmt: fmtBytes(speedOut) + '/s',
      totalIn:  fmtBytes(i.bytesIn),
      totalOut: fmtBytes(i.bytesOut),
    };
  });

  _prevNet = {};
  raw.forEach(i => { _prevNet[i.name] = { bytesIn: i.bytesIn, bytesOut: i.bytesOut }; });
  _prevNetTime = now;

  const withSpeed = ifaces.filter(i => i.speedIn > 0 || i.speedOut > 0);
  return (withSpeed.length ? withSpeed : ifaces).slice(0, 2);
}

// ── Battery ───────────────────────────────────────────────────────────────────

async function getBattery() {
  const [battOut, cycleOut] = await Promise.all([
    run('pmset -g batt'),
    run('ioreg -r -c AppleSmartBattery | grep \'"CycleCount"\''),
  ]);
  if (!battOut) return null;

  const pct   = battOut.match(/(\d+)%/);
  const stat  = battOut.match(/;\s*(.+?)\s*;/);
  const time  = battOut.match(/(\d+:\d+)\s+remaining/);
  const charg = battOut.includes('charging');
  const cycle = cycleOut.match(/"CycleCount"\s*=\s*(\d+)/);

  return {
    percent:       pct   ? parseInt(pct[1])   : null,
    status:        stat  ? stat[1].trim()      : 'unknown',
    timeRemaining: time  ? time[1]             : null,
    timeLabel:     charg ? 'Time to full'      : 'Time left',
    charging:      charg,
    onAC:          battOut.includes('AC Power'),
    healthy:       !battOut.toLowerCase().includes('service'),
    cycleCount:    cycle ? parseInt(cycle[1])  : null,
  };
}

// ── Processes ─────────────────────────────────────────────────────────────────
// Use RSS (resident memory in KB) instead of %mem so we can show real MB values.

async function getProcesses() {
  const [cpuOut, memOut] = await Promise.all([
    run('ps -axco pid,pcpu,rss,comm -r | head -8'),
    run('ps -axco pid,pcpu,rss,comm -m | head -8'),
  ]);
  const parse = out => out.split('\n').slice(1).filter(Boolean).map(line => {
    const p   = line.trim().split(/\s+/);
    const rss = parseInt(p[2]) || 0;          // KB
    return {
      pid:   p[0],
      cpu:   parseFloat(p[1]) || 0,
      memMB: parseFloat((rss / 1024).toFixed(rss < 10240 ? 1 : 0)),
      name:  p.slice(3).join(' ').substring(0, 28),
    };
  });
  return { byCPU: parse(cpuOut), byMem: parse(memOut) };
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/stats', async (_req, res) => {
  try {
    const [system, cpu, memory, disk, network, battery, processes] = await Promise.all([
      getSystemInfo(), getCPU(), getMemory(), getDisk(), getNetwork(), getBattery(), getProcesses(),
    ]);
    res.json({ system, cpu, memory, disk, network, battery, processes, timestamp: Date.now() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  Mac Stats Dashboard → http://localhost:${PORT}\n`);
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT',  () => process.exit(0));
