interface SourceLocation {
  start?: {
    line?: number;
  };
}

interface BabelNodePath {
  node: {
    loc?: SourceLocation;
    name: unknown;
    attributes: unknown[];
  };
}

interface BabelPluginState {
  filename?: string;
}

interface BabelTypesLike {
  isJSXAttribute: (value: unknown) => boolean;
  isJSXIdentifier: (value: unknown) => boolean;
  jsxAttribute: (name: unknown, value: unknown) => unknown;
  jsxIdentifier: (name: string) => unknown;
  stringLiteral: (value: string) => unknown;
}

interface BabelPluginApi {
  types: BabelTypesLike;
}

interface BabelPluginObject {
  name: string;
  visitor: {
    JSXOpeningElement: (path: BabelNodePath, state: BabelPluginState) => void;
  };
}

function toRelativeFromSrc(fileName: string): string {
  const normalized = fileName.replace(/\\/g, "/");
  const srcIndex = normalized.lastIndexOf("/src/");
  if (srcIndex >= 0) {
    return normalized.slice(srcIndex + 5);
  }
  return normalized.split("/").slice(-2).join("/");
}

function hasDataCidAttribute(
  t: BabelTypesLike,
  attributes: unknown[],
): boolean {
  return attributes.some((attribute) => {
    if (!t.isJSXAttribute(attribute)) {
      return false;
    }

    const jsxAttribute = attribute as { name?: unknown };

    if (!t.isJSXIdentifier(jsxAttribute.name)) {
      return false;
    }

    return (jsxAttribute.name as { name?: unknown }).name === "data-cid";
  });
}

function getLineNumber(path: BabelNodePath): number {
  return path.node.loc?.start?.line ?? 1;
}

export default function cidPreprocessor(
  api: BabelPluginApi,
): BabelPluginObject {
  const t = api.types;

  return {
    name: "cid-preprocessor",
    visitor: {
      JSXOpeningElement(path, state): void {
        if (process.env.NODE_ENV !== "development") {
          return;
        }

        const fileName = state.filename ?? "";
        if (!fileName || fileName.includes("node_modules")) {
          return;
        }

        if (!t.isJSXIdentifier(path.node.name)) {
          return;
        }

        if (hasDataCidAttribute(t, path.node.attributes)) {
          return;
        }

        const relativePath = toRelativeFromSrc(fileName);
        const line = getLineNumber(path);
        path.node.attributes.push(
          t.jsxAttribute(
            t.jsxIdentifier("data-cid"),
            t.stringLiteral(`${relativePath}:${line}`),
          ),
        );
      },
    },
  };
}
