import type { ExecutiveSummary, GroupStat } from './types';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

const SUITE_LABELS: Record<string, string> = { demoqa: 'DemoQA', saucedemo: 'SauceDemo', api: 'API' };

function statTile(label: string, value: string, variant: 'default' | 'good' | 'critical' = 'default'): string {
  return `
    <div class="stat-tile">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value stat-value--${variant}">${value}</div>
    </div>`;
}

function compositionBar(summary: ExecutiveSummary): string {
  const segments: Array<{ label: string; count: number; varName: string }> = [
    { label: 'Passed', count: summary.passed, varName: '--status-good' },
    { label: 'Failed', count: summary.failed, varName: '--status-critical' },
    { label: 'Flaky', count: summary.flaky, varName: '--status-warning' },
    { label: 'Skipped', count: summary.skipped, varName: '--text-muted' },
  ].filter((s) => s.count > 0);

  const bar = segments
    .map((s) => `<div class="composition-segment" style="flex: ${s.count}; background: var(${s.varName});" title="${escapeHtml(s.label)}: ${s.count}"></div>`)
    .join('');

  const legend = segments
    .map(
      (s) =>
        `<div class="legend-item"><span class="legend-dot" style="background: var(${s.varName});"></span>${escapeHtml(s.label)} <strong>${s.count}</strong></div>`,
    )
    .join('');

  return `
    <section class="card">
      <h2>Overall result</h2>
      <div class="composition-bar">${bar}</div>
      <div class="legend-row">${legend}</div>
    </section>`;
}

function groupBarChart(title: string, stats: GroupStat[], labelMap?: Record<string, string>): string {
  if (stats.length === 0) return '';
  const rows = stats
    .map((s) => {
      const label = labelMap?.[s.label] ?? s.label;
      return `
      <div class="bar-row">
        <div class="bar-label">${escapeHtml(label)}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${s.passRate}%;"></div>
        </div>
        <div class="bar-value">${formatPercent(s.passRate)} <span class="bar-value-sub">(${s.passed}/${s.total})</span></div>
      </div>`;
    })
    .join('');

  return `
    <section class="card">
      <h2>${escapeHtml(title)}</h2>
      <div class="bar-chart">${rows}</div>
    </section>`;
}

function failuresSection(summary: ExecutiveSummary): string {
  if (summary.failures.length === 0) {
    return `
    <section class="card">
      <h2>Failures</h2>
      <div class="empty-state">
        <span class="empty-icon" style="color: var(--status-good);">&#10003;</span>
        All scenarios passed. Nothing to review.
      </div>
    </section>`;
  }

  const cards = summary.failures
    .map(
      (f) => `
      <div class="failure-card">
        <div class="failure-header">
          <span class="failure-status failure-status--${f.status}">${f.status === 'flaky' ? 'Flaky' : 'Failed'}</span>
          <span class="failure-title">${escapeHtml(f.title)}</span>
        </div>
        <div class="failure-meta">${escapeHtml(SUITE_LABELS[f.suite] ?? f.suite)} &middot; ${escapeHtml(f.project)}</div>
        ${f.errorMessage ? `<div class="failure-reason">${escapeHtml(f.errorMessage)}</div>` : ''}
      </div>`,
    )
    .join('');

  return `
    <section class="card">
      <h2>Failures (${summary.failures.length})</h2>
      <div class="failure-list">${cards}</div>
    </section>`;
}

export function renderExecutiveReport(summary: ExecutiveSummary): string {
  const generatedAt = new Date(summary.generatedAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test executive report</title>
<style>
  :root {
    color-scheme: light;
    --surface-1: #fcfcfb;
    --page-plane: #f9f9f7;
    --text-primary: #0b0b0b;
    --text-secondary: #52514e;
    --text-muted: #898781;
    --gridline: #e1e0d9;
    --border: rgba(11,11,11,0.10);
    --accent: #2a78d6;
    --status-good: #0ca30c;
    --status-warning: #fab219;
    --status-critical: #d03b3b;
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])) {
      color-scheme: dark;
      --surface-1: #1a1a19;
      --page-plane: #0d0d0d;
      --text-primary: #ffffff;
      --text-secondary: #c3c2b7;
      --text-muted: #898781;
      --gridline: #2c2c2a;
      --border: rgba(255,255,255,0.10);
      --accent: #3987e5;
      --status-good: #0ca30c;
      --status-warning: #fab219;
      --status-critical: #d03b3b;
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --surface-1: #1a1a19;
    --page-plane: #0d0d0d;
    --text-primary: #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted: #898781;
    --gridline: #2c2c2a;
    --border: rgba(255,255,255,0.10);
    --accent: #3987e5;
    --status-good: #0ca30c;
    --status-warning: #fab219;
    --status-critical: #d03b3b;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--page-plane);
    color: var(--text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 24px;
  }
  .page { max-width: 960px; margin: 0 auto; }
  header { margin-bottom: 24px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .subtitle { color: var(--text-secondary); font-size: 14px; }

  .kpi-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }
  .stat-tile {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
  }
  .stat-label { font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; }
  .stat-value { font-size: 32px; font-weight: 600; }
  .stat-value--good { color: var(--status-good); }
  .stat-value--critical { color: var(--status-critical); }

  .card {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 16px;
  }
  .card h2 { font-size: 15px; margin: 0 0 16px; color: var(--text-secondary); font-weight: 600; }

  .composition-bar {
    display: flex;
    height: 24px;
    border-radius: 4px;
    overflow: hidden;
    gap: 2px;
    background: var(--surface-1);
  }
  .composition-segment { height: 100%; }
  .legend-row { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 12px; font-size: 13px; color: var(--text-secondary); }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .legend-item strong { color: var(--text-primary); }

  .bar-chart { display: flex; flex-direction: column; gap: 14px; }
  .bar-row { display: grid; grid-template-columns: 110px 1fr auto; align-items: center; gap: 12px; }
  .bar-label { font-size: 13px; color: var(--text-secondary); }
  .bar-track { height: 20px; background: var(--gridline); border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; background: var(--accent); border-radius: 0 4px 4px 0; }
  .bar-value { font-size: 13px; font-weight: 600; white-space: nowrap; }
  .bar-value-sub { font-weight: 400; color: var(--text-muted); }

  .empty-state { display: flex; align-items: center; gap: 10px; color: var(--text-secondary); font-size: 14px; padding: 8px 0; }
  .empty-icon { font-size: 18px; font-weight: 700; }

  .failure-list { display: flex; flex-direction: column; gap: 10px; }
  .failure-card { border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
  .failure-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .failure-status { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 2px 8px; border-radius: 999px; color: #fff; }
  .failure-status--failed { background: var(--status-critical); }
  .failure-status--flaky { background: var(--status-warning); color: #1a1a19; }
  .failure-title { font-size: 14px; font-weight: 600; }
  .failure-meta { font-size: 12px; color: var(--text-muted); margin-bottom: 6px; }
  .failure-reason { font-size: 13px; color: var(--text-secondary); }

  footer { color: var(--text-muted); font-size: 12px; margin-top: 24px; line-height: 1.6; }
</style>
</head>
<body>
  <div class="page">
    <header>
      <h1>Automated testing executive report</h1>
      <div class="subtitle">Generated on ${escapeHtml(generatedAt)}</div>
    </header>

    <div class="kpi-row">
      ${statTile('Pass rate', formatPercent(summary.passRate), summary.passRate >= 90 ? 'good' : summary.passRate < 70 ? 'critical' : 'default')}
      ${statTile('Scenarios run', String(summary.total))}
      ${statTile('Failed', String(summary.failed), summary.failed > 0 ? 'critical' : 'good')}
      ${statTile('Total duration', formatDuration(summary.durationMs))}
    </div>

    ${compositionBar(summary)}
    ${groupBarChart('Pass rate by area', summary.bySuite, SUITE_LABELS)}
    ${groupBarChart('Pass rate by browser', summary.byBrowser)}
    ${failuresSection(summary)}

    <footer>
      This report summarizes the automated run for a quick read. Full technical detail
      (traces, screenshots, stack traces) is available in the Playwright and Cucumber reports for the engineering team.
    </footer>
  </div>
</body>
</html>`;
}
