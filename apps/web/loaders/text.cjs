/* global module */
// A webpack-style loader that hands a file over as its text: `import doc from "./doc.md"` is the file's contents.
// Turbopack runs it for every `*.md` (`turbopack.rules` in next.config.ts); its own `raw` module type exports nothing
// an ES import can see (Next 16.3).
module.exports = function text(source) {
  return `export default ${JSON.stringify(source)};`;
};
