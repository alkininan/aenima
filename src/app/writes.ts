import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import ts from "typescript";

/**
 * design-spec §17 C-25's grep half (T0.48): "Every call into a mutation hook is reached only
 * from an element carrying `data-writes`". Read over the syntax trees rather than the text:
 * a server action's call site is an identifier imported from a `"use server"` module and
 * used as a form's `action`, a button's `formAction`, or called — and it has to sit inside a
 * `WriteGate`, or an element that carries `data-writes` itself. The auth flow is exempt
 * (§4: "except the auth flow"), so `src/app/sign-in/` is not read.
 *
 * Pure over a `read` and a file list, so the test can run it over the repository and over a
 * planted source with one call site outside a gate.
 */

export type WriteUse = {
  path: string;
  line: number;
  /** The imported action's local name. */
  name: string;
};

const SCRIPT = /\.(ts|tsx)$/;

/** Every `.tsx` under `dir`, as paths relative to `root` with `/` separators. */
function tsxFiles(root: string, dir: string): string[] {
  const found: string[] = [];
  const walk = (relative: string) => {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".tsx")) found.push(path);
    }
  };
  walk(dir);
  return found;
}

/** The component modules C-25 reads: everything under src/app but the tests and the auth path. */
export function componentFiles(root: string): string[] {
  return tsxFiles(root, "src/app")
    .filter((path) => !/\.(test|spec)\.tsx$/.test(path))
    .filter((path) => !path.startsWith("src/app/sign-in/"))
    .sort();
}

/** Whether a module opens with the `"use server"` directive. */
export function isServerActionModule(text: string, path = "module.ts"): boolean {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const first = source.statements[0];
  return (
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use server"
  );
}

/**
 * The file an import specifier names, relative to the repository root, or null for a
 * package. `@/` is the tsconfig alias for `src/`; a relative path is resolved from the
 * importing file; either may omit its extension.
 */
export function resolveImport(from: string, specifier: string, exists: (path: string) => boolean) {
  let base: string;
  if (specifier.startsWith("@/")) base = join("src", specifier.slice(2));
  else if (specifier.startsWith(".")) base = join(dirname(from), specifier);
  else return null;
  base = base.replace(/\\/g, "/");
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (SCRIPT.test(candidate) && exists(candidate)) return candidate;
  }
  return null;
}

/** Whether a JSX element is a gate: `<WriteGate>`, or any element carrying `data-writes`. */
function isGate(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  if (opening.tagName.getText() === "WriteGate") return true;
  return opening.attributes.properties.some(
    (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText() === "data-writes",
  );
}

/** Whether `node` has a gate among its JSX ancestors. */
function gated(node: ts.Node): boolean {
  for (let at: ts.Node | undefined = node.parent; at; at = at.parent) {
    if ((ts.isJsxElement(at) || ts.isJsxSelfClosingElement(at)) && isGate(at)) return true;
  }
  return false;
}

/**
 * Every use of a server action in `files` that no gate encloses.
 *
 * A use is the identifier itself, wherever it stands after its import — an attribute value,
 * a call, a reference handed on — so a call site that reaches the action indirectly is
 * still read as one. What excuses it is only a `WriteGate` or a `data-writes` carrier above
 * it in the same tree.
 */
export function ungatedWrites({
  files,
  read,
  exists,
}: {
  files: readonly string[];
  read: (path: string) => string;
  exists: (path: string) => boolean;
}): WriteUse[] {
  const offenders: WriteUse[] = [];
  const actionModules = new Map<string, boolean>();
  const isActions = (path: string) => {
    if (!actionModules.has(path)) actionModules.set(path, isServerActionModule(read(path), path));
    return actionModules.get(path) === true;
  };

  for (const path of files) {
    const source = ts.createSourceFile(
      path,
      read(path),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    const actions = new Set<string>();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
        continue;
      const target = resolveImport(path, statement.moduleSpecifier.text, exists);
      if (target === null || !isActions(target)) continue;
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) actions.add(element.name.text);
      }
      if (statement.importClause?.name) actions.add(statement.importClause.name.text);
    }
    if (actions.size === 0) continue;

    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) return;
      if (ts.isIdentifier(node) && actions.has(node.text) && !gated(node)) {
        offenders.push({
          path,
          line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          name: node.text,
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return offenders;
}

/** The repository's own reader and existence check, rooted at `root`. */
export function repository(root: string) {
  return {
    files: componentFiles(root),
    read: (path: string) => readFileSync(resolve(root, path), "utf8"),
    exists: (path: string) => existsSync(resolve(root, path)),
  };
}
