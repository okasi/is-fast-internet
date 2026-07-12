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
  // Keep require("is-fast-internet") callable for backwards compatibility,
  // while copying named exports such as checkInternet onto that function.
  footer({ format }) {
    if (format === "cjs") {
      return {
        js: [
          "const callableExport = module.exports.default;",
          "Object.assign(callableExport, module.exports);",
          "module.exports = callableExport;",
          "module.exports.default = callableExport;"
        ].join("\n")
      };
    }
    return {};
  }
});
