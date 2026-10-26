/**
 * Small, keyboard-accessible form primitives for the settings UI. Every
 * control pairs a visible label with its input (`htmlFor`/`id`), shows a
 * focus outline, and never encodes state with color alone.
 */

import { createContext, useContext, useState, type ReactNode } from 'react';
import { quoteFont } from '../fonts/presets.ts';

/** Localized common labels, provided by the panel/pet roots. */
export interface UiText {
  on: string;
  off: string;
  reset: string;
}

export const UiTextContext = createContext<UiText>({ on: 'On', off: 'Off', reset: 'Restore default' });

/**
 * Per-control reset handlers keyed by control id. Keeping this in context means
 * every Field gets a reset affordance without threading a callback through
 * every call site: the panel owns the config and registers one handler per id.
 */
export const SettingsResetContext = createContext<Record<string, () => void>>({});

export interface ThemeCardModel {
  id: string;
  name: string;
  description: string;
  tag: string;
  wallpaper?: string;
  readability?: 'AAA' | 'AA' | 'fail';
  colors: {
    bg: string;
    panel: string;
    text: string;
    accent: string;
    particles: string[];
  };
}

export function Section(props: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="dth-section" aria-labelledby={`dth-sec-${props.title}`}>
      <header className="dth-section-head">
        <h3 className="dth-section-title" id={`dth-sec-${props.title}`}>
          {props.title}
        </h3>
        {props.actions !== undefined ? <div className="dth-section-actions">{props.actions}</div> : null}
      </header>
      <div className="dth-section-body">{props.children}</div>
    </section>
  );
}

export function Field(props: { label: string; hint?: string; children: ReactNode; id: string }) {
  const text = useContext(UiTextContext);
  const resets = useContext(SettingsResetContext);
  const reset = resets[props.id];
  return (
    <div className="dth-field" data-dth-setting={props.id}>
      <div className="dth-field-label">
        <label htmlFor={props.id}>{props.label}</label>
        <span className="dth-field-label-row">
          {props.hint !== undefined ? <span className="dth-field-hint">{props.hint}</span> : null}
          {reset !== undefined ? (
            <button type="button" className="dth-reset" title={text.reset} aria-label={`${text.reset}: ${props.label}`} onClick={reset}>
              ↺
            </button>
          ) : null}
        </span>
      </div>
      {props.children}
    </div>
  );
}

export function Toggle(props: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const text = useContext(UiTextContext);
  return (
    <Field id={props.id} label={props.label}>
      <button
        id={props.id}
        type="button"
        role="switch"
        aria-checked={props.checked}
        className={`dth-toggle${props.checked ? ' is-on' : ''}`}
        onClick={() => props.onChange(!props.checked)}
        disabled={props.disabled}
      >
        <span className="dth-toggle-knob" />
        <span className="dth-toggle-text">{props.checked ? text.on : text.off}</span>
      </button>
    </Field>
  );
}

export function Slider(props: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  const format = props.format ?? ((v: number) => String(v));
  return (
    <Field id={props.id} label={props.label}>
      <div className="dth-slider">
        <input
          id={props.id}
          type="range"
          min={props.min}
          max={props.max}
          step={props.step}
          value={props.value}
          disabled={props.disabled}
          onChange={(event) => props.onChange(Number(event.currentTarget.value))}
        />
        <output className="dth-slider-value" htmlFor={props.id}>
          {format(props.value)}
        </output>
      </div>
    </Field>
  );
}

export function Segmented<T extends string>(props: {
  id: string;
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <Field id={props.id} label={props.label}>
      <div className="dth-segmented" role="radiogroup" aria-label={props.label}>
        {props.options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={props.value === option.value}
            className={`dth-seg${props.value === option.value ? ' is-active' : ''}`}
            onClick={() => props.onChange(option.value)}
            disabled={props.disabled}
          >
            {option.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

export function Select<T extends string>(props: {
  id: string;
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <Field id={props.id} label={props.label}>
      <select
        id={props.id}
        className="dth-select"
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.currentTarget.value as T)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function TextInput(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Field id={props.id} label={props.label}>
      <input
        id={props.id}
        type="text"
        className="dth-input"
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </Field>
  );
}

export function SpeechLinesEditor(props: {
  id: string;
  label: string;
  hint?: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  // Keep a local draft while typing; the parsed, trimmed array is committed on
  // blur so intermediate keystrokes never reorder or drop half-typed lines.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? props.value.join('\n');
  const commit = () => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    setDraft(null);
    props.onChange(lines);
  };
  return (
    <Field id={props.id} label={props.label} hint={props.hint}>
      <textarea
        id={props.id}
        className="dth-input dth-textarea"
        value={text}
        placeholder={props.placeholder}
        disabled={props.disabled}
        rows={4}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
      />
    </Field>
  );
}

function normalizeHex(value: string): string {
  const trimmed = value.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed}`;
  return '#000000';
}

export function ColorPicker(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const safe = normalizeHex(props.value);
  return (
    <Field id={props.id} label={props.label}>
      <div className="dth-color">
        <input
          id={props.id}
          type="color"
          className="dth-color-swatch"
          value={safe}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
        <input
          type="text"
          className="dth-input dth-color-text"
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
      </div>
    </Field>
  );
}

export function ColorSwatches(props: { colors: string[]; onPick: (v: string) => void }) {
  return (
    <div className="dth-swatches" aria-hidden="true">
      {props.colors.map((color) => (
        <button key={color} type="button" className="dth-swatches-chip" style={{ background: color }} onClick={() => props.onPick(color)} />
      ))}
    </div>
  );
}

export function Button(props: { onClick: () => void; children: ReactNode; variant?: 'primary' | 'ghost' | 'danger'; title?: string; disabled?: boolean }) {
  const variant = props.variant ?? 'ghost';
  return (
    <button type="button" className={`dth-btn dth-btn-${variant}`} onClick={props.onClick} title={props.title} disabled={props.disabled}>
      {props.children}
    </button>
  );
}

export function ThemeCard(props: {
  theme: ThemeCardModel;
  selected: boolean;
  previewing?: boolean;
  onSelect: () => void;
  /** Hold-to-preview: called on Space keydown. */
  onPreviewStart?: () => void;
  /** Release/Esc/blur cancels the preview without committing. */
  onPreviewEnd?: () => void;
}) {
  const c = props.theme.colors;
  const grade = props.theme.readability;
  return (
    <button
      type="button"
      className={`dth-theme-card${props.selected ? ' is-selected' : ''}${props.previewing === true ? ' is-previewing' : ''}`}
      aria-pressed={props.selected}
      onClick={props.onSelect}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault();
          if (!event.repeat) props.onPreviewStart?.();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          props.onSelect();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault();
          props.onPreviewEnd?.();
        }
      }}
      onBlur={() => props.onPreviewEnd?.()}
    >
      <span
        className="dth-theme-card-preview"
        style={{ backgroundColor: c.bg, backgroundImage: props.theme.wallpaper === undefined ? undefined : `linear-gradient(rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.18)), url(${props.theme.wallpaper})` }}
        aria-hidden="true"
      >
        <span className="dth-theme-card-panel" style={{ background: c.panel, color: c.text }}>
          <span className="dth-theme-card-text" style={{ background: c.text }} />
          <span className="dth-theme-card-accent" style={{ background: c.accent }} />
        </span>
        <span className="dth-theme-card-particles">
          {c.particles.slice(0, 4).map((color, i) => (
            <i key={i} style={{ background: color }} />
          ))}
        </span>
      </span>
      <span className="dth-theme-card-meta">
        <span className="dth-theme-card-name">{props.theme.name}</span>
        <span className={`dth-theme-card-badge is-${grade ?? 'AA'}`} title={grade === undefined ? undefined : `WCAG ${grade}`}>
          {grade ?? 'AA'}
        </span>
        <span className="dth-theme-card-tag">{props.theme.tag}</span>
      </span>
      <span className="dth-theme-card-desc">{props.theme.description}</span>
    </button>
  );
}

export function FontCard(props: {
  label: string;
  family: string;
  installed: boolean;
  selected: boolean;
  onSelect: () => void;
  installedText: string;
  fallbackText: string;
  preview: string;
  codePreview: string;
  /** Raw family stack for previews that must not inherit the panel font. */
  previewFamily?: string;
  /** Optional status/action row rendered under the preview. */
  statusText?: string;
  statusTone?: 'ok' | 'warn' | 'muted';
  action?: ReactNode;
}) {
  const previewFamily = props.previewFamily ?? (props.family.length > 0 ? quoteFont(props.family) : undefined);
  return (
    <div className={`dth-font-card${props.selected ? ' is-selected' : ''}${props.installed ? '' : ' is-unavailable'}`}>
      <button
        type="button"
        className="dth-font-card-select"
        aria-pressed={props.selected}
        onClick={props.onSelect}
      >
        <span className="dth-font-card-head">
          <span className="dth-font-card-name">{props.label}</span>
          <span className={`dth-font-badge${props.installed ? ' is-installed' : ''}${props.statusTone === 'muted' ? ' is-muted' : ''}`}>
            {props.statusText ?? (props.installed ? props.installedText : props.fallbackText)}
          </span>
        </span>
        <span
          className="dth-font-card-preview"
          style={{ fontFamily: previewFamily }}
        >
          <span className="dth-font-card-line">{props.preview}</span>
          <code className="dth-font-card-code" style={{ fontFamily: 'inherit' }}>{props.codePreview}</code>
        </span>
      </button>
      {props.action !== undefined ? <div className="dth-font-card-action">{props.action}</div> : null}
    </div>
  );
}

export function Swatch(props: { color: string; label: string }) {
  return (
    <span className="dth-swatch" title={`${props.label} · ${props.color}`}>
      <span className="dth-swatch-chip" style={{ background: props.color }} aria-hidden="true" />
      <span className="dth-swatch-label">{props.label}</span>
    </span>
  );
}

export function Notice(props: { tone: 'info' | 'warn' | 'error'; children: ReactNode }) {
  return (
    <p className={`dth-notice dth-notice-${props.tone}`} role={props.tone === 'error' ? 'alert' : 'status'}>
      {props.children}
    </p>
  );
}
