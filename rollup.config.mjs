import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";

export default {
	input: "src/plugin.ts",
	output: {
		file: "com.io.paraita.centreon.alerts.sdPlugin/bin/plugin.js",
		format: "esm",
		sourcemap: true,
		inlineDynamicImports: true
	},
	plugins: [
		typescript(),
		resolve({
			browser: false,
			preferBuiltins: true,
			exportConditions: ["node"]
		}),
		commonjs()
	]
};
