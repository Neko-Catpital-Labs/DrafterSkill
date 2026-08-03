import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
  // Unlike Invoker's internal (unpublished) workspace packages, drafter-core
  // is published standalone — it resolves as a normal npm dependency at
  // install time, so it (and its own mermaid/jsdom deps) should NOT be
  // inlined here; bundling it dragged mermaid+jsdom into a 9.6MB single file.
  external: ['@neko-catpital-labs/drafter-core'],
});
