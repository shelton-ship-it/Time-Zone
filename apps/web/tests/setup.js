import '@testing-library/jest-dom/vitest';
// deterministic user timezone for jsdom tests
Object.defineProperty(Intl, 'DateTimeFormat', {
  value: new Proxy(Intl.DateTimeFormat, {
    construct(target, args) {
      const opts = args[1] || {};
      return new target(args[0], { ...opts, timeZone: opts.timeZone ?? 'Europe/London' });
    },
  }),
});
window.matchMedia = window.matchMedia || (q => ({ matches: false, media: q, addEventListener(){}, removeEventListener(){} }));
