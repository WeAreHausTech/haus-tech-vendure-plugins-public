# Haus Tech Vendure Plugins Monorepo

This repository is an [Nx](https://nx.dev/) monorepo that contains multiple custom plugins for [Vendure](https://www.vendure.io/). Each plugin lives in the `packages/` directory and is developed, built, tested, and versioned independently.

## NOTE! Package versioning

The version numbers of the plugins in this repo follow the version of the current Vendure packages. This is to make versioning both simple and clearly indicate which Vendure version they depend on (and support).

We only take major and minor version into account. For example, if Vendure v2.2.4 is used, a plugin in this repo will have version 2.2.x, where x is just a build number.

---

## 🛠️ Monorepo Structure

This monorepo is structured using Nx, which allows for efficient management of multiple plugins. The main directories are:

```text
.
├── packages/              # Plugin packages
├── scripts/               # Utility scripts
├── .yarnrc.yml            # Yarn configuration file
├── .npmrc                 # NPM configuration
├── .eslintrc.json         # ESLint configuration
├── .prettierrc            # Prettier configuration
├── .gitignore             # Git ignore file
├── nx.json                # Nx configuration
├── package.json           # Root package.json
├── README.md              # This README file
├── tsconfig.base.json     # Base TypeScript configuration
├── tsconfig.e2e.json      # E2E test TypeScript configuration
├── vitest.config.ts       # Vitest test configuration
```

---

## Plugin Structure:

Each plugin in this monorepo follows a standard structure:

```text
packages/
├── plugin-name/
│   ├── src/                  # Source code for the plugin
│   ├── package.json          # Plugin metadata and dependencies
│   ├── project.json          # Nx project configuration
│   ├── README.md             # Plugin documentation
│   ├── CHANGELOG.md          # Plugin changelog
│   ├── tsconfig.json         # TypeScript configuration
│   ├── tsconfig.spec.json    # TypeScript configuration for compiling and running test files
│   ├── .eslintrc.json        # ESLint configuration
│   └── ...                   # Other configuration files
```

---

## Running Scripts with Yarn

You can run any of the scripts defined in the root `package.json` using `yarn <script>`.  
For example, to build all plugins:

```bash
yarn build
```

Here are all available scripts:

| Script                     | Description                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `yarn build`               | Build all plugins (except `example-plugin`)                                            |
| `yarn build:affected`      | Build only affected plugins (except `example-plugin`)                                  |
| `yarn test`                | Run tests for all plugins (except `example-plugin` and the monorepo package itself)    |
| `yarn test:affected`       | Run tests only for affected plugins (except `example-plugin` and the monorepo package) |
| `yarn lint`                | Lint all plugins (except `example-plugin`)                                             |
| `yarn lint:affected`       | Lint only affected plugins (except `example-plugin`)                                   |
| `yarn upgrade:vendure`     | Run the Vendure upgrade target for all plugins                                         |
| `yarn upgrade:vendure:all` | Update all Vendure dependencies in the root package                                    |
| `yarn remove-node-modules` | Remove all `node_modules` folders recursively                                          |
| `yarn bump-all-versions`   | Bump all plugin versions to match the current Vendure version (major.minor.x)          |
| `yarn update-readmes`      | Update all plugin READMEs to match their current version in their package.json         |

You can see and modify these scripts in the root `package.json`.

---

## Useful `npx nx` Commands

Below is a list of useful `npx nx` commands tailored for this monorepo setup:

### 🔨 Build & Lint

```bash
# Build all plugins
npx nx run-many --target=build --all

# Build one plugin
npx nx build plugin-name

# Lint all plugins
npx nx run-many --target=lint --all

# Lint one plugin
npx nx lint plugin-name
```

### Upgrade Vendure

```bash
# Upgrade Vendure for all plugins
npx nx run-many --target=upgrade:vendure --all

# Upgrade Vendure for one plugin
npx nx run plugin-name:upgrade:vendure
```

### Affected (CI / partial rebuilds)

These commands require Nx to detect changes against a base branch like main.

```bash
# Build only affected plugins
npx nx affected --target=build

# Test only affected plugins
npx nx affected --target=test

# Lint only affected plugins
npx nx affected --target=lint
```

### 🔎 Misc

```bash
# List all projects
npx nx show projects

# Visual dependency graph
npx nx graph
```

---

## Testing

Each plugin uses [Vitest](https://vitest.dev/) for unit testing.  
Ensure that each plugin’s `project.json` includes a `test` target with an executor like `@nx/vite:test`.

### Test Commands

```bash
# Test all plugins
npx nx run-many --target=test --all

# Test only affected plugins
npx nx affected --target=test

# Test one plugin
npx nx test plugin-name
```

---

## Releasing a Plugin with Nx Release

This repository uses the Nx Release workflow to automate plugin releases, changelog updates, and version tagging. All plugins follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) standard for commit messages, which helps in generating changelogs and determining version bumps.

### How to Release a Plugin

1. **Commit your changes**  
   Make sure your commits follow the Conventional Commits format (`feat:`, `fix:`, `perf:`, etc.).

2. **Run a dry run (recommended)**  
   Before actually releasing, you can preview what will happen:

   ```bash
   npx nx release --dry-run
   # or for a specific plugin
   npx nx release --projects=name-plugin --dry-run
   ```

   or

   ```bash
   yarn nx release --dry-run
   # or for a specific plugin
   yarn nx release --projects=name-plugin --dry-run
   ```

   This will show you which plugins will be released, the proposed changelog, and version changes, but will not commit, tag, or push anything.

3. **Run the release command**  
   From the root of the repo, run:

   ```bash
   npx nx release
   # or for a specific plugin
   npx nx release --projects=name-plugin
   ```

   or

   ```bash
   yarn nx release
   # or for a specific plugin
   yarn nx release --projects=name-plugin
   ```

   You will be prompted to select the type of version bump (major, minor, patch, custom) for each plugin that has changes.

4. **What happens when you run `nx release`:**
   - Nx analyzes the commit history for each plugin since the last release.
   - You select the next version for each plugin based on the changes.
   - The plugin’s `CHANGELOG.md` is automatically updated with new entries for all relevant commits.
   - The plugin’s `package.json` version is bumped.
   - A new Git tag is created for the released version of the plugin.
   - All changes are committed and pushed automatically to the remote repository.
   - Optionally, a GitHub/GitLab release is created, including the changelog for that version.

### Notes

- Each plugin maintains its own changelog and version tag.
- Only `feat`, `fix`, and `perf` commit types are included in the changelog.
- The process is mostly automated, but you control the version bump for each release.
- Always use `--dry-run` first to preview changes before releasing!

---

## Vendure Versions Branches

### Version 2.1

[vendure-v2.1](https://github.com/WeAreHausTech/haus-tech-vendure-plugins/tree/vendure-v2.1)

### Version 2.2

[feat/update-vendure-2.2](https://github.com/WeAreHausTech/haus-tech-vendure-plugins/tree/feat/update-vendure-2.2)
