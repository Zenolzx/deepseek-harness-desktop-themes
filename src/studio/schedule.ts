import type { DesktopThemesConfig } from '../config/types.ts';

/** No location lookup; predictable wall-clock schedule in the device timezone. */
export function scheduledTheme(config: DesktopThemesConfig, hour: number): string | undefined {
  if (!config.themeSchedule.enabled || !config.themeSchedule.family) return undefined;
  const variant = hour >= 7 && hour < 19 ? 'light' : 'dark';
  const target = config.customThemes.find(theme => theme.variantOf === config.themeSchedule.family && theme.variant === variant);
  return target?.id;
}
