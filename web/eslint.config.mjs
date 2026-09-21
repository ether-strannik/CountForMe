// Lint config for the page. Everything here runs in the browser as ES
// modules; there is no server side and nothing is compiled.

// The layering, as a gate rather than a habit: app.js composes the
// screens and nothing imports it, and one screen never imports another.
// Anything two screens both need moves down into a module they can each
// import. A new screen in src/ is added to FEATURES.
const FEATURES = ['timers', 'intervals', 'intervals2'];
const nobody = (names, message) => ({
  patterns: names.map((n) => ({ group: [`./${n}.js`, `**/${n}.js`], message })),
});

export default [
  {
    files: ['src/**/*.js', 'shared/*.js'],
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
        Element: 'readonly',
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
      // A parameter that hides a module-level name reads as that name
      // and is not it. One of these cost an evening: a Set called
      // `open` was shadowed by a callback parameter called `open`, and
      // every category row threw on null.
      'no-shadow': 'error',
      'no-restricted-imports': ['error', nobody(['app'], 'app.js composes the screens; nothing imports it')],
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
              nobody(['app', ...FEATURES], 'a screen never imports a screen; move the shared thing down'),
            ],
          },
        },
      ]
    : []),
];
