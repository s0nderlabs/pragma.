---
title: Pragma Documentation Hub
---

# 📖 Pragma Documentation

**Pragma** is a natural-language interface for delegated blockchain operations on Monad testnet. Execute swaps, transfers, and wraps through an AI-powered CLI and web console.

---

## 🚀 Quick Start

New to Pragma? Follow these steps:

1. **[Install & Configure](getting-started/install.md)** → Set up the monorepo and environment variables
2. **[Onboard a HybridDelegator](getting-started/onboarding.md)** → Deploy your smart account and issue a delegation
3. Choose your interface:
   - **[CLI Basics](getting-started/cli.md)** → Command-line REPL and scripted commands
   - **[Web Console](getting-started/web.md)** → Browser-based chat interface

---

## 🎯 Learn by Doing

Execute your first operations:

| Flow | Description | Documentation |
|------|-------------|---------------|
| **Swap** | Exchange tokens using Monorail aggregator | [Swap Guide](flows/swap.md) |
| **Wrap/Unwrap** | Convert MON ↔ WMON | [Wrap Guide](flows/wrap-unwrap.md) |
| **Transfer** | Send native MON or ERC-20 tokens | [Transfer Guide](flows/transfer.md) |

---

## 🎮 User Guides

### Web App
- **[Complete Web UI Walkthrough](guides/web-ui-guide.md)** → Comprehensive guide to every UI element, user journey, and feature

### CLI
- **[CLI Basics](getting-started/cli.md)** → REPL vs command mode, meta commands, workflows
- **[CLI Command Reference](reference/cli-reference.md)** → Every command with options and examples

---

## 🏗️ Deep Dives

### Architecture & System Design
- **[Architecture Overview](reference/architecture.md)** → Monorepo layout, dependencies, data flow
- **[Glossary](reference/glossary.md)** → Key terminology and concepts

### System Layers
Each stage of the execution pipeline:

| Layer | Documentation |
|-------|---------------|
| **Intent Engine** | [Intent Engine](system-layers/intent-engine.md) - Parse natural language → canonical intents |
| **Policy & Safety** | [Policy & Safety](system-layers/policy-and-safety.md) - Safe vs Normal modes, caveats, caps |
| **Routing & Quotes** | [Routing & Quotes](system-layers/routing-quotes.md) - Monorail Pathfinder integration |
| **Simulation & Preview** | [Simulation & Preview](system-layers/simulation-preview.md) - eth_call validation, drift detection |
| **Execution** | [Execution](system-layers/execution.md) - DTK redemption, UserOperations, bundlers |
| **Receipts & Observability** | [Receipts & Observability](system-layers/receipts-observability.md) - Logs, receipts, HyperSync |
| **Error Handling** | [Error Catalog](system-layers/errors.md) - Canonical error codes and remediation |

---

## 📚 Reference

### API & Commands
- **[API Reference](reference/api-reference.md)** → Next.js API routes for web app
- **[CLI Command Reference](reference/cli-reference.md)** → Full command listing with options
- **[Testing](reference/testing.md)** → Playwright test suite and coverage

### Configuration & Troubleshooting
- **[Provider Configuration](appendix/providers.md)** → Environment variables for Web3Auth, Pimlico, Monorail, Envio, OpenAI
- **[Troubleshooting](appendix/troubleshooting.md)** → Common issues and fixes

---

## 🔮 Future

- **[Roadmap](appendix/future-roadmap.md)** → Directional milestones beyond Horizon 1

---

## 📖 Documentation Structure

```
docs/
├── README.md                    ← You are here
├── overview.md                  → High-level feature summary
├── getting-started/             → Installation and onboarding
├── guides/                      → Comprehensive walkthroughs
├── flows/                       → Operation-specific guides
├── system-layers/               → Technical deep dives
├── reference/                   → API, CLI, architecture, testing
└── appendix/                    → Providers, troubleshooting, roadmap
```

---

## 🎓 Recommended Reading Paths

### For End Users
1. Overview → Install → Onboard → Web UI Guide → Swap Flow
2. Try the web console at `http://localhost:3000`

### For Developers
1. Architecture → System Layers → CLI Reference → API Reference
2. Read `CLAUDE.md` for contribution guidelines

### For Troubleshooting
1. Error Catalog → Troubleshooting → Provider Configuration
2. Use `pragma status` and `pragma delegation:list` for diagnostics

---

**Need help?** Start with the [Overview](overview.md) or jump to [Troubleshooting](appendix/troubleshooting.md).
