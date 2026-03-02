# Bundler Setup — Review

## Does this plan fit the bigger goal?

Yes. It directly addresses the two priorities:

- break up the monolithic plugin UI into maintainable modules
- provide a single command that outputs a deliverable plugin package

## Why this is clean

- Keeps current plugin behavior intact while improving structure first.
- Uses lightweight tooling (esbuild + scripts) instead of introducing framework overhead.
- Produces deterministic outputs that match Figma manifest expectations.

## Simplicity checks

- No UX redesign is introduced in this migration.
- No adapter/server API changes are required.
- No new runtime dependencies are needed inside the plugin iframe.

## Open decisions (if needed before implementation)

- Keep legacy root files temporarily during migration, or remove immediately after parity checks.
- Include source maps in dist for debugging, or keep dist minimal for package output.
