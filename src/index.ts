/**
 * Host entry for `dsh-desktop-themes`.
 *
 * The durable half of the plugin's configuration. Two DSH generations are
 * supported from one build:
 *
 *  - DSH 0.2.x serves settings per profile entry id and derives the form from
 *    the plugin's exported `Config` schema (only `.volatile()` fields are
 *    served). This plugin ships its own page, so it opts out of the generated
 *    form with `settings.configure({ auto: false }, ctx.fiber)`.
 *  - DSH 0.1.x has no entry-scoped Config settings; the plugin registers its
 *    own `ui-desktop-themes` namespace through `settings.register()`.
 *
 * Both are optional injections, so a composition without a settings provider
 * still loads the plugin — it just runs with in-memory defaults.
 */

import { DesktopThemesSchema } from './config/schema.ts';
import { SETTINGS_NAMESPACE } from './config/types.ts';

/**
 * The entry-scoped configuration schema. DSH 0.2.x reads this export, serves
 * its volatile fields as the `desktop-themes` settings entry, and validates
 * every write against it.
 */
export const Config = DesktopThemesSchema;

interface SettingsService {
  /** DSH 0.1.x: register a plugin-owned settings namespace. */
  register?(namespace: string, schema: unknown): unknown;
  /** DSH 0.2.x: declare that this plugin renders its own settings page. */
  configure?(policy: { auto: boolean }, fiber: unknown): unknown;
}

interface SettingsContext {
  settings: SettingsService;
  effect(callback: () => unknown, label?: string): void;
}

interface HostContext {
  inject(services: string[], callback: (ctx: SettingsContext) => void): void;
  fiber?: unknown;
}

export function apply(ctx: HostContext): void {
  ctx.inject(['settings'], (settingsCtx) => {
    const settings = settingsCtx.settings;
    if (typeof settings.configure === 'function') {
      // DSH 0.2.x: the browser page owns editing; suppress the generated form.
      settingsCtx.effect(
        () => settings.configure?.({ auto: false }, ctx.fiber),
        'desktop-themes: own settings page',
      );
      return;
    }
    if (typeof settings.register === 'function') {
      // DSH 0.1.x: keep the legacy plugin-owned namespace.
      settings.register(SETTINGS_NAMESPACE, DesktopThemesSchema);
    }
  });
}
