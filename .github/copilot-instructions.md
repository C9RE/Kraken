# GitHub Copilot Instructions

## Language and communication
- Write code, variable names, commit messages, and comments in English.
- Keep responses short, concrete, and action-oriented.
- State assumptions clearly when something is uncertain.
- Do not invent missing project rules. If a rule is unclear, prefer the current repository style.

## Project context
- This repository is used to run a Windrose dedicated server in Docker on Linux through Wine.
- The main priorities are reliable startup, persistent save data, simple configuration, and easy troubleshooting.
- Treat this repository as an operational project, not as a playground for broad refactors.
- Prefer safe, incremental improvements over architectural rewrites.

## Change scope
- Do not rewrite working startup logic unless explicitly requested.
- Do not change default ports, network behavior, volume mappings, or save paths unless explicitly requested.
- Do not replace simple Bash or Docker Compose logic with more complex tooling without a strong reason.
- Do not edit repository files using ad-hoc scripts or bulk find-replace automation; make file changes manually and explicitly unless the user explicitly asks for scripted edits.
- Prefer small, isolated changes over sweeping cleanup.
- Reuse the current repository structure unless there is a clear operational benefit to changing it.

## Configuration rules
- Prefer configuration through environment variables and documented `.env` values.
- Do not add hidden defaults or undocumented fallback behavior.
- Any new environment variable, mount, port, or startup flag must be documented in the README.
- Keep configuration explicit, discoverable, and easy to override.
- Prefer predictable behavior over clever automation.

## Data safety
- Preserve compatibility with existing persistent volumes and saved data.
- Treat save data and mounted directories as critical.
- Avoid changes that may silently reset, overwrite, relocate, or invalidate persistent data.
- When changing startup or update behavior, consider rollback safety first.
- If a change increases operational risk, call it out explicitly.

## Docker and scripts
- Keep Dockerfile, Compose files, and entrypoint scripts simple and transparent.
- Favor readability and deterministic behavior over compact or clever scripting.
- Avoid unnecessary background processes, fragile timing hacks, or implicit side effects.
- When practical, startup logic should log the effective configuration, save path, and update status.
- Do not add logic that is difficult to debug from container logs.

## Documentation
- Keep documentation practical and operator-focused.
- Prefer a clear structure: quick start, configuration, persistence, updates, troubleshooting.
- When changing behavior, update documentation in the same change.
- Document operational assumptions instead of leaving them implicit.
- Use concise wording and avoid marketing-style language.

## Decision rules
- Prefer the simplest solution that preserves current behavior.
- Prefer backward-compatible changes over breaking improvements.
- Prefer explicit errors over silent failure.
- Prefer repository conventions over personal preference.
- If a requested change conflicts with stability or persistence, explain the tradeoff briefly before implementing it.

## Pre-push validation
- Before every `git push`, run the same relevant checks as CI workflow for the files changed in the branch.
- For shell changes, this must include at minimum syntax validation (`bash -n`) and static lint checks (`shellcheck`) so syntax or SC errors do not reach CI.
- Do not push if required local checks fail; fix the issue first, then rerun checks.