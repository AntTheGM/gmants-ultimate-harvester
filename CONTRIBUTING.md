# Contributing

Thanks for your interest in contributing! Here's how to get started.

## Reporting Bugs

Use the [Bug Report](../../issues/new?template=bug-report.yml) template. Include your Foundry version, system version, and steps to reproduce.

## Suggesting Features

Use the [Feature Request](../../issues/new?template=feature-request.yml) template. Describe the use case — knowing *why* helps prioritize.

## Pull Requests

1. **Fork** the repo and create a branch from `main`
2. **Make your changes** — this is a vanilla ES module project with no build step
3. **Test locally** by copying the module folder to your Foundry `Data/modules/` directory and reloading
4. **Open a PR** using the provided template

### Code Style

- Vanilla JavaScript ES modules (no TypeScript, no bundler)
- `const` over `let`, never `var`
- Strict equality (`===`)
- Curly braces on all control flow
- CSS classes prefixed with `ultimate-harvester-`

### What We're Looking For

- **Bug fixes**: always welcome
- **New features**: please open an issue first to discuss
- **New harvest tables**: creature-specific tables for monsters we haven't covered yet

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
