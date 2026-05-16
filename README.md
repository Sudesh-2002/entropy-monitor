# Entropy Monitor

> Your codebase has a heartbeat. This tool measures it.

Entropy Monitor scans any codebase and tracks **disorder over time** — tangled imports, copy-pasted blocks, and dead exports — surfaced as a single health score you can trend, diff, and gate in CI.

![npm](https://img.shields.io/npm/v/entropy-monitor?style=flat-square&color=7c3aed)
![node](https://img.shields.io/badge/node-%3E%3D20-22c55e?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

---

## Install

```bash
npm install -g entropy-monitor
```

Or run without installing:

```bash
npx entropy-monitor scan .
```

---

## What it measures

| Metric | How it works | Tool used |
|---|---|---|
| **Coupling** | Builds an import graph — measures fan-in, fan-out, and instability per module | Custom AST walker |
| **Duplication** | Detects copy-pasted blocks across files | jscpd |
| **Dead code** | Finds unused exports, unused files, unresolved imports | knip |

Each metric scores **0–100**. Lower is healthier. They average into one **Overall Entropy** score.

---

## Supported languages

| Language | Coupling | Duplication | Dead code |
|---|---|---|---|
| TypeScript | ✅ | ✅ | ✅ |
| JavaScript | ✅ | ✅ | ✅ |
| Python | ✅ | ✅ | — |
| Java | ✅ | ✅ | — |
| Go | ✅ | ✅ | — |
| Ruby | ✅ | ✅ | — |
| C / C++ | ✅ | ✅ | — |

Languages are **auto-detected** from your project files. Override with `--lang`:

```bash
entropy-monitor scan . --lang python
entropy-monitor scan . --lang typescript,python
```

---

## Quick start

```bash
# Scan your project
entropy-monitor scan .

# View history over time
entropy-monitor history .

# Compare two snapshots
entropy-monitor diff .

# Generate an interactive HTML dashboard
entropy-monitor report .

# CI gate — exits 1 if entropy is too high
entropy-monitor ci .
```

---

## Commands

### `scan [path]`

Scans the codebase and records a snapshot.

```bash
entropy-monitor scan .
entropy-monitor scan /path/to/project
entropy-monitor scan . --lang python
entropy-monitor scan . --skip-duplication
entropy-monitor scan . --skip-deadcode
entropy-monitor scan . --no-save
entropy-monitor scan . --json
entropy-monitor scan . --top 20
```

| Flag | Default | Description |
|---|---|---|
| `--lang <languages>` | auto | Comma-separated languages: `typescript,python,java,go,ruby,cpp` |
| `--top <n>` | `10` | Show top N coupled files |
| `--skip-duplication` | — | Skip jscpd analysis (faster) |
| `--skip-deadcode` | — | Skip knip analysis (faster) |
| `--no-save` | — | Print results without saving to history |
| `--json` | — | Output raw JSON — useful for scripting and editor integrations |

**Example output:**

```
✔ Coupling analysis done
✔ Duplication analysis done
✔ Dead code analysis done

═══════════════════════════════════════
  Entropy Monitor Report
═══════════════════════════════════════

  Overall entropy:    23/100  ███░░░░░░░░░░░░░░░░░░
  Coupling score:     46/100
  Duplication score:   0/100  (0% dup lines)
  Dead code score:     0/100  (0 issues)

  Files scanned:      12
  Total lines:        840
  Unused exports:     0
  Unused files:       0
  Unresolved imports: 0
  Snapshot ID:        #7
```

---

### `history [path]`

Shows entropy trend as a table and spark chart.

```bash
entropy-monitor history .
entropy-monitor history . --limit 50
```

| Flag | Default | Description |
|---|---|---|
| `--limit <n>` | `20` | Number of snapshots to show |

**Example output:**

```
  Entropy History
  ────────────────────────────────────────────────────────────────────────
  #    Date                  Overall  Coupling  Dup   Dead  Branch
  ────────────────────────────────────────────────────────────────────────
    1  May 14, 10:00 AM       18/100    46/100   0/100  0/100  main
    2  May 14, 11:30 AM       22/100    46/100   4/100  0/100  main
    3  May 14, 02:00 PM       18/100    46/100   0/100  0/100  feature/auth

  Trend (overall entropy):
  ▂▃▂
  oldest  latest
```

---

### `diff [path]`

Compares two snapshots and shows what changed.

```bash
entropy-monitor diff .
entropy-monitor diff . --from 1 --to 5
```

| Flag | Default | Description |
|---|---|---|
| `--from <id>` | second latest | Snapshot ID to compare from |
| `--to <id>` | latest | Snapshot ID to compare to |

---

### `report [path]`

Generates a standalone HTML dashboard with interactive Chart.js graphs.

```bash
entropy-monitor report .
entropy-monitor report . --out ./reports/health.html
entropy-monitor report . --limit 100
```

| Flag | Default | Description |
|---|---|---|
| `--out <file>` | `entropy-report.html` | Output file path |
| `--limit <n>` | `50` | Max snapshots to include |

Open the generated file in any browser — no server needed.

---

### `ci [path]`

Fails with exit code 1 if entropy exceeds thresholds or regresses. Use in GitHub Actions, GitLab CI, or any pipeline.

```bash
entropy-monitor ci .
entropy-monitor ci . --max-overall 60
entropy-monitor ci . --max-coupling 80 --max-duplication 40
entropy-monitor ci . --max-delta 10
```

| Flag | Default | Description |
|---|---|---|
| `--max-overall <n>` | `70` | Fail if overall score exceeds this |
| `--max-coupling <n>` | — | Fail if coupling score exceeds this |
| `--max-duplication <n>` | — | Fail if duplication score exceeds this |
| `--max-deadcode <n>` | — | Fail if dead code score exceeds this |
| `--max-delta <n>` | `10` | Fail if score increased by more than this since last scan |

---

## CI integration

### GitHub Actions

```yaml
name: Entropy Monitor

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  entropy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Scan codebase
        run: npx entropy-monitor scan . --skip-duplication

      - name: CI gate
        run: npx entropy-monitor ci . --max-overall 70 --max-delta 10

      - name: Generate report
        run: npx entropy-monitor report . --out entropy-report.html

      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: entropy-report
          path: entropy-report.html
```

---

## How snapshots work

Every `scan` writes a row to `.entropy-monitor/history.db` — a local SQLite file in your project root. It stores:

- All three scores
- Raw counts (files, lines, duplicate lines, unused exports)
- Git SHA and branch name
- Timestamp

The database file is excluded from git via `.gitignore` automatically.

---

## JSON output

Use `--json` for scripting or editor integrations:

```bash
entropy-monitor scan . --json --skip-duplication --skip-deadcode
```

```json
{
  "overallScore": 46,
  "couplingScore": 46,
  "duplicationScore": 0,
  "deadcodeScore": 0,
  "totalFiles": 5,
  "totalLines": 0,
  "duplicateLines": 0,
  "duplicateBlocks": 0,
  "unusedExports": 0,
  "unusedFiles": 0,
  "unresolvedImports": 0,
  "languages": ["auto-detected"],
  "snapshotId": 4,
  "scannedAt": 1715000000000
}
```

---

## VS Code extension

Install the companion VS Code extension for live scores in your editor:

```bash
code --install-extension sudeshhansika.codebase-entropy
```

Or search **Codebase Entropy** in the Extensions panel.

---

## Requirements

- Node.js 20 or higher
- The target project must be accessible on the local filesystem

---

## License

MIT © Sudesh Hansika

---

## Links

- [npm package](https://www.npmjs.com/package/entropy-monitor)
- [VS Code extension](https://marketplace.visualstudio.com/items?itemName=sudeshhansika.codebase-entropy)
- [GitHub repository](https://github.com/sudesh-2002/entropy-monitor)
- [Report an issue](https://github.com/sudesh-2002/entropy-monitor/issues)
