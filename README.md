# Entropy Monitor

> Tracks codebase disorder over time — coupling, duplication, and dead code visualized as health metrics.

## Install

```bash
npm install -g entropy-monitor
```

## Usage

```bash
# Scan any TypeScript project
entropy-monitor scan /path/to/your/project

# View entropy history
entropy-monitor history /path/to/your/project

# Compare two snapshots
entropy-monitor diff /path/to/your/project

# Generate HTML dashboard
entropy-monitor report /path/to/your/project

# CI gate — exits 1 on regression
entropy-monitor ci /path/to/your/project
```

## What it measures

| Metric | How |
|---|---|
| **Coupling** | Import graph analysis — fan-in, fan-out, instability per module |
| **Duplication** | AST-based clone detection via jscpd |
| **Dead code** | Unused exports, unused files, unresolved imports via knip |

Each metric produces a score from 0–100. Lower is healthier.

## Commands

```
scan [path]       Scan and record a snapshot
  --top <n>         Show top N files (default: 10)
  --skip-duplication
  --skip-deadcode
  --no-save

history [path]    Show entropy trend + spark chart
  --limit <n>       Number of snapshots (default: 20)

diff [path]       Compare two snapshots
  --from <id>
  --to <id>

report [path]     Generate HTML dashboard
  --out <file>      Output path (default: entropy-report.html)

ci [path]         CI gate — exits 1 on regression
  --max-overall <n>       Default: 70
  --max-coupling <n>      Default: 80
  --max-duplication <n>   Default: 60
  --max-deadcode <n>      Default: 60
  --max-delta <n>         Default: 10
```

## CI integration (GitHub Actions)

```yaml
- name: Scan codebase
  run: npx entropy-monitor scan .

- name: CI gate
  run: npx entropy-monitor ci . --max-overall 70 --max-delta 15
```

## License

MIT