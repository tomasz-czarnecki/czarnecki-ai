# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This is the **Tomasz Czarnecki portfolio site** (czarnecki.ai), currently a placeholder. The entire codebase is two files:

- `README.md` — one-line project description.
- `index.html` — an "Under Construction" placeholder. Note: it is currently plain text, **not** a valid HTML document (no `<!DOCTYPE>`, `<html>`, `<head>`, or `<body>`). Wrap it in proper HTML structure when building out the real page.

There is no build system, package manager, test suite, framework, or dependencies yet. To preview, open `index.html` in a browser (or serve the directory, e.g. `python3 -m http.server`).

## When adding real architecture

Once a stack is chosen (framework, bundler, package manager, etc.), update this file with the build/lint/test commands and a description of how the pieces fit together — the placeholder notes above can be removed at that point.
