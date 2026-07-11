# xlabs-club.github.io

[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/xlabs-club/xlabs-club.github.io/.github%2Fworkflows%2Fgh-pages.yml)](https://github.com/xlabs-club/xlabs-club.github.io/actions)
[![GitHub Repo stars](https://img.shields.io/github/stars/xlabs-club/xlabs-club.github.io)](https://github.com/xlabs-club/xlabs-club.github.io/stargazers)
[![GitHub contributors](https://img.shields.io/github/contributors/xlabs-club/xlabs-club.github.io)](https://github.com/xlabs-club/xlabs-club.github.io/graphs/contributors)
[![Commit Activity](https://img.shields.io/github/commit-activity/m/xlabs-club/xlabs-club.github.io)](https://github.com/xlabs-club/xlabs-club.github.io)

English | [中文](README.zh-CN.md)

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

- [Spring Boot 3 → 4 migration: the complete guide](https://www.xlabs.club/blog/migration-spring-boot-3-to-4/) — new features, deprecations, and real-world pitfalls.
- [GitOps Kubernetes Secret management](https://www.xlabs.club/blog/gitops-secrets-in-k8s/) — scheme comparison and best practices.
- [Resizing StatefulSet PV/PVC without downtime](https://www.xlabs.club/blog/statefulset-resize-pvc/) — smooth expansion, Helm included.
- [Backstage + oauth2-proxy + Keycloak](https://www.xlabs.club/blog/backstage-keycloak-oauth2-proxy/) — user management, auth, and RBAC/ABAC.
- [Container image best practices](https://www.xlabs.club/blog/docker-best-practices/) — multi-arch builds, Dockerfile tips, and ORAS/skopeo.

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
