import path from "node:path";
import type { PreprocessorGroup } from "svelte/compiler";

type Matcher = RegExp | string;

export interface FigmaCidDescriptor {
  filename: string;
  relativePath: string;
  line: number;
}

export interface FigmaCidPreprocessorOptions {
  enabled?: boolean;
  sourceRoot?: string;
  include?: Matcher[] | ((filename: string) => boolean);
  exclude?: Matcher[] | ((filename: string) => boolean);
  formatCid?: (descriptor: FigmaCidDescriptor) => string;
  skipFileMarker?: string;
}

const NATIVE_TAGS = new Set([
  "a",
  "abbr",
  "address",
  "article",
  "aside",
  "audio",
  "b",
  "blockquote",
  "body",
  "br",
  "button",
  "canvas",
  "caption",
  "code",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "em",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "i",
  "iframe",
  "img",
  "input",
  "label",
  "legend",
  "li",
  "main",
  "nav",
  "ol",
  "option",
  "p",
  "picture",
  "pre",
  "section",
  "select",
  "small",
  "source",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "svg",
  "table",
  "tbody",
  "td",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "ul",
  "video",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polygon",
  "polyline",
  "text",
  "tspan",
  "foreignobject",
]);

type ParsedTag = {
  start: number;
  end: number;
  tagName: string;
  isClosing: boolean;
  isSelfClosing: boolean;
  raw: string;
};

function normalizePath(fileName: string): string {
  return fileName.replace(/\\/g, "/");
}

function matchAgainst(filename: string, pattern: Matcher): boolean {
  return typeof pattern === "string"
    ? normalizePath(filename).includes(normalizePath(pattern))
    : pattern.test(filename);
}

function shouldProcessFile(
  filename: string,
  options: FigmaCidPreprocessorOptions,
): boolean {
  const { include, exclude } = options;

  if (typeof exclude === "function" && exclude(filename)) {
    return false;
  }

  if (
    Array.isArray(exclude) &&
    exclude.some((pattern) => matchAgainst(filename, pattern))
  ) {
    return false;
  }

  if (typeof include === "function") {
    return include(filename);
  }

  if (Array.isArray(include) && include.length > 0) {
    return include.some((pattern) => matchAgainst(filename, pattern));
  }

  return true;
}

function resolveRelativePath(filename: string, sourceRoot?: string): string {
  const normalized = normalizePath(filename);
  if (sourceRoot) {
    const relative = normalizePath(path.relative(sourceRoot, filename));
    if (!relative.startsWith("..")) {
      return relative;
    }
  }

  const srcIndex = normalized.lastIndexOf("/src/");
  if (srcIndex >= 0) {
    return normalized.slice(srcIndex + 5);
  }

  return normalized.split("/").slice(-2).join("/");
}

function isLowerAlpha(char: string): boolean {
  return char >= "a" && char <= "z";
}

function parseTagAt(source: string, start: number): ParsedTag | null {
  if (source[start] !== "<" || source.startsWith("<!--", start)) {
    return null;
  }

  let position = start + 1;
  let isClosing = false;
  if (source[position] === "/") {
    isClosing = true;
    position += 1;
  }

  if (!isLowerAlpha(source[position] ?? "")) {
    return null;
  }

  const nameStart = position;
  while (/[a-z0-9-]/.test(source[position] ?? "")) {
    position += 1;
  }

  const tagName = source.slice(nameStart, position);
  let inQuote: '"' | "'" | null = null;
  let braceDepth = 0;

  for (; position < source.length; position += 1) {
    const char = source[position];

    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inQuote = char;
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
      continue;
    }

    if (char === "}" && braceDepth > 0) {
      braceDepth -= 1;
      continue;
    }

    if (char === ">" && braceDepth === 0) {
      const raw = source.slice(start, position + 1);
      return {
        start,
        end: position + 1,
        tagName,
        isClosing,
        isSelfClosing: /\/\s*>$/.test(raw),
        raw,
      };
    }
  }

  return null;
}

function lineNumberAt(source: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source[cursor] === "\n") {
      line += 1;
    }
  }
  return line;
}

function injectCid(
  content: string,
  filename: string,
  options: FigmaCidPreprocessorOptions,
): string {
  if (options.skipFileMarker && content.includes(options.skipFileMarker)) {
    return content;
  }

  const relativePath = resolveRelativePath(filename, options.sourceRoot);
  const parts: string[] = [];
  let cursor = 0;
  let index = 0;
  let ignoredTag: "script" | "style" | null = null;

  while (index < content.length) {
    if (content[index] !== "<") {
      index += 1;
      continue;
    }

    const parsed = parseTagAt(content, index);
    if (!parsed) {
      index += 1;
      continue;
    }

    if (ignoredTag) {
      if (parsed.isClosing && parsed.tagName === ignoredTag) {
        ignoredTag = null;
      }
      index = parsed.end;
      continue;
    }

    if (
      !parsed.isClosing &&
      (parsed.tagName === "script" || parsed.tagName === "style")
    ) {
      if (!parsed.isSelfClosing) {
        ignoredTag = parsed.tagName;
      }
      index = parsed.end;
      continue;
    }

    if (
      !parsed.isClosing &&
      NATIVE_TAGS.has(parsed.tagName) &&
      !/\sdata-cid\s*=/.test(parsed.raw)
    ) {
      const line = lineNumberAt(content, parsed.start);
      const cid = options.formatCid
        ? options.formatCid({ filename, relativePath, line })
        : `${relativePath}:${line}`;
      const attribute = ` data-cid="${cid}"`;

      let insertAt = parsed.end - 1;
      let rewind = insertAt - 1;
      while (rewind >= parsed.start && /\s/.test(content[rewind])) {
        rewind -= 1;
      }
      if (content[rewind] === "/") {
        insertAt = rewind;
      }

      parts.push(content.slice(cursor, insertAt));
      parts.push(attribute);
      cursor = insertAt;
    }

    index = parsed.end;
  }

  if (cursor === 0) {
    return content;
  }

  parts.push(content.slice(cursor));
  return parts.join("");
}

export function cidPreprocessor(
  options: FigmaCidPreprocessorOptions = {},
): PreprocessorGroup {
  const enabled = options.enabled ?? process.env.NODE_ENV !== "production";

  if (!enabled) {
    return { name: "figma-code-link-cid-preprocessor" };
  }

  return {
    name: "figma-code-link-cid-preprocessor",
    markup({ content, filename }) {
      if (!filename || filename.includes("node_modules")) {
        return { code: content };
      }

      if (!shouldProcessFile(filename, options)) {
        return { code: content };
      }

      return {
        code: injectCid(content, filename, options),
      };
    },
  };
}

export default cidPreprocessor;
