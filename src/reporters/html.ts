import fs from 'node:fs';
import path from 'node:path';
import type { SnapshotRow } from '../store/db.js';

export function generateHtmlReport(
  rows: SnapshotRow[],
  outputPath: string
): void {
  const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp);

  const labels = sorted.map(r =>
    new Date(r.timestamp).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  );

  const overall    = sorted.map(r => r.overall_score);
  const coupling   = sorted.map(r => r.coupling_score);
  const duplication = sorted.map(r => r.duplication_score);
  const deadcode   = sorted.map(r => r.deadcode_score);

  const latest = sorted[sorted.length - 1];
  const prev   = sorted[sorted.length - 2];

  const trend = (curr: number, old?: number) => {
    if (!old) return '';
    const d = curr - old;
    if (d === 0) return '<span class="badge neutral">±0</span>';
    if (d > 0)   return `<span class="badge worse">+${d}</span>`;
    return `<span class="badge better">${d}</span>`;
  };

  const scoreClass = (s: number) =>
    s < 30 ? 'good' : s < 60 ? 'warn' : 'bad';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Entropy Monitor — Dashboard</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0f1117; --surface: #1a1d27; --border: #2a2d3a;
    --text: #e2e4ed; --muted: #8b8fa8;
    --good: #22c55e; --warn: #f59e0b; --bad: #ef4444;
    --blue: #6366f1; --teal: #14b8a6; --pink: #ec4899; --amber: #f59e0b;
  }
  body { background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; padding: 2rem; }
  h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.25rem; }
  .subtitle { color: var(--muted); font-size: 0.875rem; margin-bottom: 2rem; }

  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; }
  .card-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
  .card-value { font-size: 2rem; font-weight: 700; line-height: 1; }
  .card-sub { font-size: 0.8rem; color: var(--muted); margin-top: 0.4rem; display: flex; align-items: center; gap: 0.4rem; }
  .good { color: var(--good); }
  .warn { color: var(--warn); }
  .bad  { color: var(--bad); }

  .badge { font-size: 0.75rem; font-weight: 600; padding: 0.1rem 0.4rem; border-radius: 4px; }
  .badge.better  { background: #14532d; color: var(--good); }
  .badge.worse   { background: #450a0a; color: var(--bad); }
  .badge.neutral { background: #1e293b; color: var(--muted); }

  .bar-wrap { background: #1e2130; border-radius: 4px; height: 6px; margin-top: 0.6rem; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; transition: width 0.6s ease; }

  .chart-section { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem; }
  .chart-title { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; }
  .chart-wrap { position: relative; height: 300px; }

  .table-section { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
  th { text-align: left; color: var(--muted); font-weight: 500; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); }
  td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #1e2130; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #1e2130; }

  .pill { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 99px; font-size: 0.75rem; font-weight: 600; }
  .pill.good { background: #14532d; color: var(--good); }
  .pill.warn { background: #451a03; color: var(--warn); }
  .pill.bad  { background: #450a0a; color: var(--bad); }

  footer { color: var(--muted); font-size: 0.75rem; text-align: center; margin-top: 2rem; }
</style>
</head>
<body>

<h1>Entropy Monitor</h1>
<p class="subtitle">Generated ${new Date().toLocaleString()} &nbsp;·&nbsp; ${sorted.length} snapshot${sorted.length !== 1 ? 's' : ''}</p>

<!-- Score cards -->
<div class="cards">
  <div class="card">
    <div class="card-label">Overall Entropy</div>
    <div class="card-value ${scoreClass(latest.overall_score)}">${latest.overall_score}<span style="font-size:1rem;font-weight:400;color:var(--muted)">/100</span></div>
    <div class="card-sub">${trend(latest.overall_score, prev?.overall_score)} vs previous scan</div>
    <div class="bar-wrap"><div class="bar-fill" style="width:${latest.overall_score}%;background:${latest.overall_score < 30 ? 'var(--good)' : latest.overall_score < 60 ? 'var(--warn)' : 'var(--bad)'}"></div></div>
  </div>
  <div class="card">
    <div class="card-label">Coupling</div>
    <div class="card-value ${scoreClass(latest.coupling_score)}">${latest.coupling_score}<span style="font-size:1rem;font-weight:400;color:var(--muted)">/100</span></div>
    <div class="card-sub">${trend(latest.coupling_score, prev?.coupling_score)} ${latest.total_files} files</div>
    <div class="bar-wrap"><div class="bar-fill" style="width:${latest.coupling_score}%;background:var(--blue)"></div></div>
  </div>
  <div class="card">
    <div class="card-label">Duplication</div>
    <div class="card-value ${scoreClass(latest.duplication_score)}">${latest.duplication_score}<span style="font-size:1rem;font-weight:400;color:var(--muted)">/100</span></div>
    <div class="card-sub">${trend(latest.duplication_score, prev?.duplication_score)} ${latest.duplicate_lines} dup lines</div>
    <div class="bar-wrap"><div class="bar-fill" style="width:${latest.duplication_score}%;background:var(--teal)"></div></div>
  </div>
  <div class="card">
    <div class="card-label">Dead Code</div>
    <div class="card-value ${scoreClass(latest.deadcode_score)}">${latest.deadcode_score}<span style="font-size:1rem;font-weight:400;color:var(--muted)">/100</span></div>
    <div class="card-sub">${trend(latest.deadcode_score, prev?.deadcode_score)} ${latest.unused_exports} unused exports</div>
    <div class="bar-wrap"><div class="bar-fill" style="width:${latest.deadcode_score}%;background:var(--pink)"></div></div>
  </div>
</div>

<!-- Trend chart -->
<div class="chart-section">
  <div class="chart-title">Entropy over time</div>
  <div class="chart-wrap">
    <canvas id="trendChart"></canvas>
  </div>
</div>

<!-- Breakdown chart -->
<div class="chart-section">
  <div class="chart-title">Score breakdown (latest snapshot)</div>
  <div class="chart-wrap" style="height:220px">
    <canvas id="breakdownChart"></canvas>
  </div>
</div>

<!-- History table -->
<div class="table-section">
  <div class="chart-title" style="margin-bottom:1rem">Snapshot history</div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Date</th><th>Branch</th><th>SHA</th>
        <th>Overall</th><th>Coupling</th><th>Duplication</th><th>Dead code</th>
        <th>Files</th><th>Lines</th>
      </tr>
    </thead>
    <tbody>
      ${[...sorted].reverse().map(r => `
      <tr>
        <td style="color:var(--muted)">${r.id}</td>
        <td style="color:var(--muted);white-space:nowrap">${new Date(r.timestamp).toLocaleString()}</td>
        <td>${r.git_branch ? `<span style="color:var(--blue)">${r.git_branch}</span>` : '<span style="color:var(--muted)">—</span>'}</td>
        <td style="font-family:monospace;color:var(--muted)">${r.git_sha ?? '—'}</td>
        <td><span class="pill ${scoreClass(r.overall_score)}">${r.overall_score}</span></td>
        <td><span class="pill ${scoreClass(r.coupling_score)}">${r.coupling_score}</span></td>
        <td><span class="pill ${scoreClass(r.duplication_score)}">${r.duplication_score}</span></td>
        <td><span class="pill ${scoreClass(r.deadcode_score)}">${r.deadcode_score}</span></td>
        <td>${r.total_files}</td>
        <td>${r.total_lines}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>

<footer>Entropy Monitor &nbsp;·&nbsp; lower is healthier &nbsp;·&nbsp; 0 = pristine · 100 = chaos</footer>

<script>
const labels = ${JSON.stringify(labels)};
const overall = ${JSON.stringify(overall)};
const coupling = ${JSON.stringify(coupling)};
const duplication = ${JSON.stringify(duplication)};
const deadcode = ${JSON.stringify(deadcode)};

const defaults = {
  tension: 0.4,
  pointRadius: 3,
  pointHoverRadius: 5,
  borderWidth: 2,
  fill: false,
};

Chart.defaults.color = '#8b8fa8';
Chart.defaults.borderColor = '#2a2d3a';
Chart.defaults.font.family = 'system-ui, sans-serif';

new Chart(document.getElementById('trendChart'), {
  type: 'line',
  data: {
    labels,
    datasets: [
      { label: 'Overall', data: overall,     borderColor: '#e2e4ed', backgroundColor: 'rgba(226,228,237,0.08)', fill: true, ...defaults },
      { label: 'Coupling', data: coupling,   borderColor: '#6366f1', ...defaults },
      { label: 'Duplication', data: duplication, borderColor: '#14b8a6', ...defaults },
      { label: 'Dead code', data: deadcode,  borderColor: '#ec4899', ...defaults },
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      y: { min: 0, max: 100, grid: { color: '#2a2d3a' }, ticks: { callback: v => v + '/100' } },
      x: { grid: { color: '#2a2d3a' } }
    },
    plugins: {
      legend: { position: 'top' },
      tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y + '/100' } }
    }
  }
});

new Chart(document.getElementById('breakdownChart'), {
  type: 'bar',
  data: {
    labels: ['Coupling', 'Duplication', 'Dead code'],
    datasets: [{
      label: 'Score',
      data: [coupling.at(-1), duplication.at(-1), deadcode.at(-1)],
      backgroundColor: ['#6366f1cc', '#14b8a6cc', '#ec4899cc'],
      borderColor:     ['#6366f1',   '#14b8a6',   '#ec4899'],
      borderWidth: 1,
      borderRadius: 6,
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { min: 0, max: 100, grid: { color: '#2a2d3a' }, ticks: { callback: v => v + '/100' } },
      x: { grid: { display: false } }
    },
    plugins: { legend: { display: false } }
  }
});
</script>
</body>
</html>`;

  fs.writeFileSync(outputPath, html, 'utf-8');
}