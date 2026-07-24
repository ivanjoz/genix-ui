/// <reference types="vite/client" />

declare module '*.svg?raw' {
  const svgSource: string;
  export default svgSource;
}

declare module '*.module.css' {
  const classNames: Record<string, string>;
  export default classNames;
}
