import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('svelte/compiler').CompileOptions} */
const compilerOptions = {
  runes: true,
};

export default {
  preprocess: vitePreprocess(),
  compilerOptions,
};
