---
name: dashboard-locale-plugin
title: Dashboard Locale
description: Vendure plugin that gives every administrator a configured default display language, region and content language in the React Dashboard.
version: 3.6.0
tags:
  - vendure
  - plugin
  - dashboard
  - locale
  - i18n
---

# Dashboard Locale Plugin

The Vendure React Dashboard always opens in English with English date, number and price formatting, and content (products, collections, ...) is shown and edited in English until each administrator changes it in the language dialog. The `i18n` options of `vendureDashboardPlugin` only control which languages the dialog offers, not what a user starts with.

This plugin sets a configured display language, region and content language for every administrator, once per administrator.

## Features

- **Configured in code** – the defaults are plugin options; there is no settings UI
- **Applied once per administrator** – a per-user marker in the settings store records that the defaults were applied, so a later choice made in the language dialog stands in every browser
- **Existing users included** – administrators who already used the Dashboard get the defaults the next time they open it
- **Re-applied on change** – changing the configured defaults applies the new values once more to everyone

## Compatibility

- Vendure **^3.6.0**
- Requires the `DashboardPlugin` from `@vendure/dashboard/plugin` (the user settings are stored through its settings store fields)

## Getting started

```bash
npm install @haus-tech/dashboard-locale-plugin
```

## Configuration

```typescript
import { LanguageCode } from '@vendure/core'
import { DashboardPlugin } from '@vendure/dashboard/plugin'
import { DashboardLocalePlugin } from '@haus-tech/dashboard-locale-plugin'

export const config = {
  plugins: [
    DashboardPlugin.init({ route: 'dashboard', appDir: './dist/dashboard' }),
    DashboardLocalePlugin.init({
      displayLanguage: LanguageCode.sv,
      displayLocale: 'SE',
      contentLanguage: LanguageCode.sv,
    }),
  ],
}
```

Rebuild the Dashboard after adding the plugin, since it ships a Dashboard extension.

## Configuration options

| Option            | Type           | Required | Description                                                                                                                   |
| ----------------- | -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `displayLanguage` | `LanguageCode` | Yes      | The Dashboard UI language.                                                                                                    |
| `displayLocale`   | `string`       | No       | The region used to format dates, numbers and prices, e.g. `'SE'`. Left untouched when not set.                                |
| `contentLanguage` | `LanguageCode` | No       | The language translatable content is shown and edited in. Must be available in the active channel. Left untouched when not set. |

## How it works

- The plugin adds a `dashboardLocaleDefaults` query to the Admin API (any authenticated administrator) returning the configured values.
- It registers a user-scoped settings store field, `haus.dashboardLocale.appliedDefaults`, holding a fingerprint of the defaults last applied to that user.
- A Dashboard extension (an invisible toolbar item) waits until the user's settings have loaded from the server. If the stored fingerprint does not match the configured defaults, it sets the values, waits until the Dashboard has saved them on the server, and only then stores the fingerprint. If that save fails, no fingerprint is stored and the next load tries again.

## Known limitations

- The Dashboard activates English before the user settings have loaded, so English can show for a moment on the first load after the defaults change.
- A Dashboard tab that is already open switches on its next reload.
- If `contentLanguage` is not one of the active channel's available languages, it is skipped and the other values are still applied. Adding the language to the channel later does not apply it; change the configured defaults to apply them once more.
- Texts of your own Dashboard extensions only follow the display language if they are translated with Lingui.
