# Customer customisations

This folder belongs to **your installation**. Core updates never change it, so updating the platform stays conflict-free.

- `custom/extensions/<name>/index.ts`: your extensions are discovered and loaded automatically (default export: `defineExtension({...})`). See [docs/EXTENDING.md](../docs/EXTENDING.md).

Everything else (brand, wording, modules, prices, payments) is configured in the admin, not in code.
