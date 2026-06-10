# Workflow

## Implementation steps

1. Check existing type: find where the interface/type is defined and all its consumers (`grep -r "TypeName"`)
2. For type changes: update definition first, then fix all downstream compile errors
3. Never silence errors with `any` or `@ts-ignore` — use proper narrowing or overloads
4. For new generic: constrain with `extends` — prefer `T extends object` over unconstrained `T`
5. For utility types: prefer composing built-ins (`Pick`, `Omit`, `Partial`) over manual re-declaration
6. For strict mode enablement: fix `noImplicitAny` first, then `strictNullChecks`, then others incrementally
7. For path alias changes in `tsconfig.base.json`: update corresponding Vite/Jest `moduleNameMapper` config
8. Run type check clean before finalizing — zero errors is the bar

## Commands

```bash
yarn tsc --noEmit                         # type check without building
yarn tsc --noEmit --watch                 # watch mode type check
yarn tsc --noEmit --listFiles             # see which files are included
yarn tsc --noEmit --traceResolution       # debug module resolution issues
yarn tsc --noEmit --diagnostics           # show compiler performance diagnostics

# Find all uses of a type before changing
grep -r "InterfaceName" src/ --include="*.ts" --include="*.tsx" -l

# Check strict options enabled
yarn tsc --showConfig | grep strict
```

## Validation checklist

- [ ] `tsc --noEmit` exits with zero errors
- [ ] No `any`, `@ts-ignore`, or `as unknown as X` introduced — use proper type narrowing
- [ ] Exported types: all downstream consumers updated when signature changes
- [ ] Generic constraints use `extends` — not unconstrained `T`
- [ ] `tsconfig.base.json` path alias matches actual file system path
- [ ] Vite/Jest `moduleNameMapper` / `resolve.alias` updated to match `tsconfig` alias changes
- [ ] `noUncheckedIndexedAccess` considered for array/record access — add bounds check if enabled
