<template>
  <router-view />
</template>

<style>
/* ─── Global Reset ─── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --q1-hue: 4;
  --q2-hue: 138;
  --q3-hue: 205;
  --q4-hue: 0;

  --q1-bg: oklch(97% 0.018 var(--q1-hue));
  --q1-header: oklch(62% 0.14 var(--q1-hue));
  --q1-border: oklch(89% 0.03 var(--q1-hue));
  --q1-tag: oklch(62% 0.14 var(--q1-hue));
  --q1-item-hover: oklch(94% 0.03 var(--q1-hue));

  --q2-bg: oklch(97% 0.016 var(--q2-hue));
  --q2-header: oklch(54% 0.13 var(--q2-hue));
  --q2-border: oklch(89% 0.03 var(--q2-hue));
  --q2-tag: oklch(54% 0.13 var(--q2-hue));
  --q2-item-hover: oklch(94% 0.03 var(--q2-hue));

  --q3-bg: oklch(97% 0.016 var(--q3-hue));
  --q3-header: oklch(56% 0.12 var(--q3-hue));
  --q3-border: oklch(89% 0.03 var(--q3-hue));
  --q3-tag: oklch(56% 0.12 var(--q3-hue));
  --q3-item-hover: oklch(94% 0.025 var(--q3-hue));

  --q4-bg: oklch(97% 0.003 240);
  --q4-header: oklch(50% 0.01 240);
  --q4-border: oklch(88% 0.005 240);
  --q4-tag: oklch(54% 0.01 var(--q4-hue));
  --q4-item-hover: oklch(93% 0.005 240);

  --q1-count-bg: oklch(92% 0.04 var(--q1-hue));
  --q2-count-bg: oklch(92% 0.04 var(--q2-hue));
  --q3-count-bg: oklch(92% 0.04 var(--q3-hue));
  --q4-count-bg: oklch(93% 0.005 var(--q4-hue));

  --q1-tag-bg: oklch(92% 0.05 var(--q1-hue));
  --q2-tag-bg: oklch(92% 0.05 var(--q2-hue));
  --q3-tag-bg: oklch(92% 0.05 var(--q3-hue));
  --q4-tag-bg: oklch(93% 0.005 var(--q4-hue));

  --surface: oklch(99% 0 0);
  --surface-mid: oklch(96.5% 0.003 240);
  --text-primary: oklch(18% 0.01 240);
  --text-secondary: oklch(46% 0.015 240);
  --text-muted: oklch(64% 0.01 240);
  --border-subtle: oklch(90% 0.006 240);
  --sidebar-width: 220px;
  --header-height: 46px;
  --radius-lg: 14px;
  --radius-md: 10px;
  --radius-sm: 6px;
  --shadow-card: 0 1px 3px oklch(0% 0 0 / 0.06), 0 4px 12px oklch(0% 0 0 / 0.04);
  --shadow-panel: 0 2px 8px oklch(0% 0 0 / 0.08), 0 12px 32px oklch(0% 0 0 / 0.06);
  --transition: 160ms cubic-bezier(0.2, 0, 0, 1);
}

/* ─── Dark Mode ─── */
@media (prefers-color-scheme: dark) {
  :root {
    --q1-bg: oklch(22% 0.02 var(--q1-hue));
    --q1-header: oklch(72% 0.14 var(--q1-hue));
    --q1-border: oklch(30% 0.04 var(--q1-hue));
    --q1-tag: oklch(72% 0.14 var(--q1-hue));
    --q1-item-hover: oklch(26% 0.03 var(--q1-hue));

    --q2-bg: oklch(22% 0.02 var(--q2-hue));
    --q2-header: oklch(68% 0.13 var(--q2-hue));
    --q2-border: oklch(28% 0.04 var(--q2-hue));
    --q2-tag: oklch(68% 0.13 var(--q2-hue));
    --q2-item-hover: oklch(26% 0.03 var(--q2-hue));

    --q3-bg: oklch(22% 0.02 var(--q3-hue));
    --q3-header: oklch(70% 0.12 var(--q3-hue));
    --q3-border: oklch(28% 0.04 var(--q3-hue));
    --q3-tag: oklch(70% 0.12 var(--q3-hue));
    --q3-item-hover: oklch(26% 0.03 var(--q3-hue));

    --q4-bg: oklch(20% 0.003 240);
    --q4-header: oklch(65% 0.01 240);
    --q4-border: oklch(28% 0.01 240);
    --q4-tag: oklch(65% 0.01 var(--q4-hue));
    --q4-item-hover: oklch(24% 0.005 240);

    --q1-count-bg: oklch(30% 0.05 var(--q1-hue));
    --q2-count-bg: oklch(28% 0.05 var(--q2-hue));
    --q3-count-bg: oklch(28% 0.05 var(--q3-hue));
    --q4-count-bg: oklch(28% 0.005 var(--q4-hue));

    --q1-tag-bg: oklch(30% 0.06 var(--q1-hue));
    --q2-tag-bg: oklch(28% 0.06 var(--q2-hue));
    --q3-tag-bg: oklch(28% 0.06 var(--q3-hue));
    --q4-tag-bg: oklch(28% 0.005 var(--q4-hue));

    --surface: oklch(18% 0.005 240);
    --surface-mid: oklch(22% 0.005 240);
    --text-primary: oklch(93% 0.005 240);
    --text-secondary: oklch(73% 0.01 240);
    --text-muted: oklch(58% 0.01 240);
    --border-subtle: oklch(32% 0.01 240);

    --shadow-card: 0 1px 3px oklch(0% 0 0 / 0.4);
    --shadow-panel: 0 2px 8px oklch(0% 0 0 / 0.4), 0 12px 32px oklch(0% 0 0 / 0.3);
  }

  html, body {
    color-scheme: dark;
  }

  ::-webkit-scrollbar-thumb:hover { background: oklch(45% 0.01 240); }
}

html, body {
  height: 100%;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--surface-mid);
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: oklch(80% 0.01 240); }
</style>
