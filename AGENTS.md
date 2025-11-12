# Repository Guidelines

## Project Structure & Module Organization
The workspace centers on `short-video-maker/`, a TypeScript/Remotion service for generating vertical videos. Core runtime code lives under `short-video-maker/src/`, with `short-creator/` handling media pipelines, `server/` exposing the HTTP layer, and `ui/` bundling the optional control panel. Use `static/` for bundled assets (fonts, audio beds) and `__mocks__/` for Vitest doubles. Top-level `docs/` captures workflow playbooks and integration notes, while `RAW/short-video-maker/` holds the upstream template for diffing changes. JSON recipes (e.g. `N8N_*`) document automation flows that feed the service.

## Build, Test, and Development Commands
Run `npm install` inside `short-video-maker/` to sync dependencies. Use `npm run dev` for watch-mode builds plus the API shim, and `npm run ui:dev` when iterating on the Remotion dashboard. Ship builds with `npm run build`; the output lands in `dist/` for `npm start` or Docker images. Execute `npm test` to run the Vitest suite locally; add `--runInBand` on CI-limited runners. Docker variants (`npm run publish:docker:*`) target CUDA, tiny, and default runtimes—mirror those tags in release notes.

## Coding Style & Naming Conventions
Keep TypeScript modules at 2-space indentation and favor named exports. Follow existing PascalCase for classes (`ShortCreator`), camelCase for functions, and kebab-case for config files. ESLint (`eslint.config.mjs`) and Prettier enforce formatting—run `npx eslint .` and `npx prettier --check .` before opening a pull request. Tailwind utility classes belong in JSX, while shared design tokens stay in `tailwind.config.js`.

## Testing Guidelines
Tests live next to source as `*.test.ts`, executed with Vitest and the project’s mocks. Cover new orchestration logic with integration-style tests in `short-creator/`, and isolate API adapters with mocked providers. Aim to preserve or improve coverage on media pipeline modules; flag gaps in the PR if external APIs block deterministic testing.

## Commit & Pull Request Guidelines
Recent history favors concise, lower-case summaries (e.g. `nano`, `eleven`). Keep commits small, imperative, and scoped to one concern; describe cross-cutting work in body text. Pull requests should link the originating brief or issue, note any media assets required, and include before/after thumbnails or logs when video output changes. Highlight new env vars and configuration files so deployment automation can be updated promptly.
