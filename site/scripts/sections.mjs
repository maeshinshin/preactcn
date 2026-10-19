// Splits an upstream example file into its sections with the TypeScript parser (no text matching on JSX).
// A section is a module-level function that the default export renders as a direct child of <ExampleWrapper />
// and whose returned JSX root is <Example title="...">. Anything else returns { reason } and the caller shows the whole file.
// Never throws on a shape it does not know: a new upstream release must not break the site.
import ts from "typescript";

const unwrap = (node) => {
  while (node && ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
};
const isJsx = (node) => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node);
const tagOf = (node) => (ts.isJsxElement(node) ? node.openingElement : node).tagName.getText();
const attrsOf = (node) => (ts.isJsxElement(node) ? node.openingElement : node).attributes.properties;

// the JSX a function returns: its last top-level `return`, or the body of an expression-bodied arrow
const returned = (fn) => {
  const body = fn.body;
  if (!body) return undefined;
  if (!ts.isBlock(body)) return unwrap(body);
  const last = body.statements.findLast(ts.isReturnStatement);
  return unwrap(last?.expression);
};

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";

export function analyze(source) {
  const sf = ts.createSourceFile("example.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fns = new Map(); // module-level functions by name
  let main;
  for (const s of sf.statements) {
    if (!ts.isFunctionDeclaration(s) || !s.name) {
      if (ts.isExportAssignment(s)) main = s.expression;
      continue;
    }
    fns.set(s.name.text, s);
    if (s.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) main = s;
  }
  if (main && ts.isIdentifier(main)) main = fns.get(main.text);
  if (!main || !ts.isFunctionDeclaration(main)) return { reason: "no default-exported function" };

  const root = returned(main);
  if (!root || !isJsx(root) || tagOf(root) !== "ExampleWrapper") return { reason: "default export does not return <ExampleWrapper>" };
  const children = ts.isJsxElement(root) ? root.children : [];
  const sections = [];
  for (const child of children) {
    if (ts.isJsxText(child) && !child.text.trim()) continue;
    if (!ts.isJsxSelfClosingElement(child) || child.attributes.properties.length) return { reason: `child of <ExampleWrapper> is not a bare <Section />: ${child.getText().slice(0, 40)}` };
    const fn = fns.get(child.tagName.getText());
    if (!fn || fn.parameters.length) return { reason: `${child.tagName.getText()} is not a module-level function without parameters` };
    const top = returned(fn);
    if (!top || !isJsx(top) || tagOf(top) !== "Example") return { reason: `${fn.name.text} does not return <Example>` };
    const title = attrsOf(top).find((a) => ts.isJsxAttribute(a) && a.name.getText() === "title")?.initializer;
    const text = title && ts.isStringLiteral(title) ? title.text : title && ts.isJsxExpression(title) && title.expression && ts.isStringLiteralLike(title.expression) ? title.expression.text : undefined;
    if (!text) return { reason: `${fn.name.text} has no literal title` };
    const exported = fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    sections.push({ fn: fn.name.text, title: text, code: fn.getText(sf), exported });
  }
  if (!sections.length) return { reason: "no sections" };

  const seen = new Map();
  for (const s of sections) {
    const base = slug(s.title);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    s.id = n ? `${base}-${n + 1}` : base;
  }
  return { sections };
}
