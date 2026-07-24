import { createContext } from 'svelte';
import type { UiRuntime } from './types.js';

// A typed Svelte context prevents UI state from leaking across SSR requests or mount trees.
export const [getUiRuntime, setUiRuntime] = createContext<UiRuntime>();
