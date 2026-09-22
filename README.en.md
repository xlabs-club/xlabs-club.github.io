# xlabs-club.github.io

[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/xlabs-club/xlabs-club.github.io/.github%2Fworkflows%2Fgh-pages.yml)](https://github.com/xlabs-club/xlabs-club.github.io/actions)
[![GitHub Repo stars](https://img.shields.io/github/stars/xlabs-club/xlabs-club.github.io)](https://github.com/xlabs-club/xlabs-club.github.io/stargazers)
[![GitHub contributors](https://img.shields.io/github/contributors/xlabs-club/xlabs-club.github.io)](https://github.com/xlabs-club/xlabs-club.github.io/graphs/contributors)
[![Commit Activity](https://img.shields.io/github/commit-activity/m/xlabs-club/xlabs-club.github.io)](https://github.com/xlabs-club/xlabs-club.github.io)

English | [中文](README.md)

**xlabs.club** — Exploring the edge with open source, delivering value through sharing.

This is the source of the [xlabs.club][] site. It collects our field notes on platform engineering and cloud-native work from the trenches: DevOps, DataOps, FinOps, and AIOps — the real pitfalls and lessons from driving long-term business growth with technology.

PRs are welcome.

_If these notes help your work, a ⭐ on this repo tells us to keep writing._

## What's on the site

- **Platform engineering** — our journey building a platform org around DevOps, DataOps, FinOps, and AIOps.
- **Cloud-native** — using cloud-native tech to support constantly shifting, complex business.
- **Blog** — engineering war stories; dig in and you'll find surprises.
- **awesome-x-ops** — a curated list of software, blogs, and tools for AIOps, DataOps, DevOps, GitOps, and FinOps.
- **xlabs-ops** — IaC ops scripts and reusable templates (e.g. Argo Workflows template repo) that compose and extend the official examples.

## Featured reading

- [MCP Streamable HTTP in practice: missing one Accept entry = 406, second initialize kills the server](https://www.xlabs.club/blog/mcp-streamable-http-sdk-behavior/) — wire-level captures of SDK 1.30.0: hard Accept check, one-transport-per-session requirement, GET/DELETE return raw 500 in stateless mode.
- [LLM observability in practice: how far can you trust the usage from an OpenAI-compatible gateway](https://www.xlabs.club/blog/llm-observability-usage-fields/) — 5 models measured: `include_usage` is a no-op, MiniMax returns zero-filled usage, aborted streams lose tokens, prompt_tokens differs 6.8×.
- [Prompt regression testing in practice: the same prompt fails differently on two models](https://www.xlabs.club/blog/prompt-regression-testing/) — 198 calls, 11 cases: JSON-valid but contract-compliant 0/33, verdicts still flip at temperature=0.
- [MCP 2026-07-28: no more initialize handshake](https://www.xlabs.club/blog/mcp-2026-07-28-version-negotiation/) — wire-level capture of v1/v2 client negotiation, dual-era server implementation, cache-field pitfalls.
- [AI-generated E2E tests: 5 models × 41 cases against 8 injected defects](https://www.xlabs.club/blog/ai-generated-e2e-tests-mutation-testing/) — 12% of cases never failed on any defect; case-insensitive search slipped past 4 of 5 models.

## Contributing

This site is built with [Hugo][] using the [Doks][] theme. Content is plain Markdown — just write.

Install Node.js and Hugo first, then:

```bash
# install npm deps (this pulls Hugo from GitHub)
npm install
# start the dev server, then open http://localhost:1313/
npm run dev
# create a new page
npm run create docs/platform/backstage.md
npm run create blog/k8s.md
# build
npm run build
```

Content layout:

```
content/
├── blog/      # engineering notes, war stories
└── docs/
    ├── cloud/     # cloud-native
    ├── platform/  # platform engineering
    ├── guides/    # how-tos
    └── tldr/      # quick reference
```

Minimal front matter for a new post:

```markdown
---
title: "Your Title"
description: "One-line summary"
date: 2024-03-31T21:29:52+08:00
draft: false
tags: [k8s]
---
```

Create the file, preview with `npm run dev`, then open a PR.

## License

Content is licensed under [CC BY-NC 4.0][].

[xlabs.club]: https://www.xlabs.club
[Hugo]: https://gohugo.io/
[Doks]: https://github.com/thuliteio/doks
[CC BY-NC 4.0]: https://creativecommons.org/licenses/by-nc/4.0/
