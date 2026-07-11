import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: false,
  minify: false,
  cjsInterop: true,
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
  // esbuild/tsup emit `exports.default = fn` for a TS `export default`,
  // so plain `require("is-fast-internet")` would return { default: fn }
  // instead of fn itself. Rewrite module.exports to the function directly
  // (keeping .default too, for interop with transpiled `import x from`).
  footer({ format }) {
    if (format === "cjs") {
      return { js: "module.exports = module.exports.default;\nmodule.exports.default = module.exports;" };
    }
    return {};
  }
});
