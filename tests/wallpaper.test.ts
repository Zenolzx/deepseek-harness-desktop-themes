import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWallpaperCss, escapeCssUrl, extensionOf, validateWallpaperFile } from '../src/appearance/wallpaper.ts';
import { DEFAULT_WALLPAPER } from '../src/config/defaults.ts';

test('accepts png/jpg/jpeg/webp within size limit', () => {
  for (const name of ['a.png', 'b.jpg', 'c.jpeg', 'd.webp', 'E.PNG']) {
    const result = validateWallpaperFile({ name, size: 1024, type: 'image/png' });
    assert.equal(result.ok, true, name);
  }
});

test('rejects unsupported types and non-image files', () => {
  const result = validateWallpaperFile({ name: 'evil.exe', size: 10, type: 'application/x-msdownload' });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'unsupported-type');
});

test('rejects empty and oversized files', () => {
  assert.equal(validateWallpaperFile({ name: 'a.png', size: 0, type: 'image/png' }).ok, false);
  const big = validateWallpaperFile({ name: 'a.png', size: 26 * 1024 * 1024, type: 'image/png' });
  assert.equal(big.ok, false);
  if (!big.ok) assert.equal(big.reason, 'too-large');
});

test('extensionOf lowercases and handles missing extensions', () => {
  assert.equal(extensionOf('photo.JPG'), 'jpg');
  assert.equal(extensionOf('noext'), '');
});

test('escapeCssUrl neutralizes control chars, backslashes, and quotes', () => {
  const escaped = escapeCssUrl('C:\\Users\\me\na("b).png');
  assert.ok(!escaped.includes('\n'));
  assert.ok(!escaped.includes('\r'));
  assert.ok(escaped.includes('C:/Users/me')); // backslash → slash
  assert.ok(escaped.includes('a(\\"b)')); // quote escaped
});

test('wallpaper CSS is empty when disabled or without a path', () => {
  assert.equal(buildWallpaperCss({ ...DEFAULT_WALLPAPER, enabled: false, path: 'blob:x' }), '');
  assert.equal(buildWallpaperCss({ ...DEFAULT_WALLPAPER, enabled: true, path: '' }), '');
});

test('wallpaper CSS never executes the image — only background-image', () => {
  const css = buildWallpaperCss({ ...DEFAULT_WALLPAPER, enabled: true, path: 'blob:abc' });
  assert.ok(css.includes('background-image: url("blob:abc")'));
  assert.ok(!css.includes('<img'));
  assert.ok(!css.includes('javascript:'));
});

test('each fit mode produces a distinct background-size/repeat', () => {
  const cover = buildWallpaperCss({ ...DEFAULT_WALLPAPER, enabled: true, path: 'x', fit: 'cover' });
  const tile = buildWallpaperCss({ ...DEFAULT_WALLPAPER, enabled: true, path: 'x', fit: 'tile' });
  assert.ok(cover.includes('background-size: cover'));
  assert.ok(tile.includes('background-repeat: repeat'));
});

test('safe area paints a theme-coloured bottom scrim and centred vignette', () => {
  const css = buildWallpaperCss(
    { ...DEFAULT_WALLPAPER, enabled: true, path: 'x', safeArea: 'strong', focusX: 30, focusY: 70 },
    '#3366ff',
    '#101820',
  );
  assert.ok(css.includes('linear-gradient(to top'));
  assert.ok(css.includes('linear-gradient(to right'));
  assert.ok(css.includes('radial-gradient(circle at 30% 70%'));
  assert.ok(css.includes('rgba(16, 24, 32'));
});

test('safe area off keeps the wallpaper free of scrim layers', () => {
  const css = buildWallpaperCss({ ...DEFAULT_WALLPAPER, enabled: true, path: 'x', safeArea: 'off' }, '#3366ff', '#101820');
  assert.ok(!css.includes('linear-gradient(to top'));
  assert.ok(!css.includes('radial-gradient(circle at'));
  assert.ok(css.includes('background-image: url("x")'));
});
