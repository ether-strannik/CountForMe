// Lint config for the timer board. api.js and the modules beside it are
// server-side (node globals); src/ is the page's own code, loaded as ES
// modules in the browser.

// The layering (development/building/03-architecture.md §1) as a gate:
// nothing imports app.js, and a feature never imports a feature. A new
// screen in src/ is added to FEATURES.
const FEATURES = ['timers', 'intervals', 'intervals2'];
const nobody = (names, message) => ({
  patterns: names.map((n) => ({ group: [`./${n}.js`, `**/${n}.js`], message })),
});

export default [
  {
    files: ['api.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { globalThis: 'readonly', process: 'readonly' },
    },
    rules: { 'no-unused-vars': 'error' },
  },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        Option: 'readonly',
        AudioContext: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        Event: 'readonly',
        history: 'readonly',
        getComputedStyle: 'readonly',
        WeakMap: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'error',
      'no-undef': 'error',
      'no-restricted-imports': ['error', nobody(['app'], 'app.js composes; nothing imports it (03 §1)')],
    },
  },
  // eslint rejects an empty `files`, so the block exists only once there is a feature to name.
  ...(FEATURES.length
    ? [
        {
          files: FEATURES.map((f) => `src/${f}.js`),
          rules: {
            'no-restricted-imports': [
              'error',
              nobody(['app', ...FEATURES], 'a feature never imports a feature; move the shared thing down (03 §1)'),
            ],
          },
        },
      ]
    : []),
];
