/** A Markdown file imports as its text (`turbopack.rules` in `next.config.ts`); the `Markdown` component renders it. */
declare module "*.md" {
  const text: string;
  export default text;
}
