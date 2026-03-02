/**
 * layer-tree.ts
 *
 * Generates a compact, token-dense representation of a Figma node tree.
 * Runs in the plugin sandbox (has access to the `figma` global).
 *
 * Output format:
 *   Frame("Card") v hug gap=8 pad=16 align=start cross=center
 *     Text("Title") heading-sm "Title"
 *     Frame("icon/arrow-right") h fixed 16x16
 *
 * Design goals:
 * - Token-dense: no redundant punctuation, human-readable
 * - Bounded: hard depth cap + child collapse marker
 * - Resilient: every variable/style lookup has a raw-value fallback
 *
 * Full schema reference: docs/layer-tree-schema-reference.md
 */

declare const figma: any;

const MAX_DEPTH = 4;
const CHILD_COLLAPSE_AT = 4;

export interface LayerTreeSnapshot {
  tree: string;
  componentsUsed: string[];
}

// ---------------------------------------------------------------------------
// Variable / style resolution
// ---------------------------------------------------------------------------

function resolveVariable(node: any, fieldName: string): string | null {
  try {
    const bound = node.boundVariables?.[fieldName];
    if (!bound) return null;
    const id: string | undefined = Array.isArray(bound)
      ? bound[0]?.id
      : bound?.id;
    if (!id) return null;
    const variable = figma.variables?.getVariableById(id);
    return variable?.name ?? null;
  } catch {
    return null;
  }
}

function resolveTextStyle(node: any): string {
  if (node.textStyleId && typeof node.textStyleId === "string") {
    try {
      const style = figma.getStyleById(node.textStyleId);
      if (style?.name) {
        // Convert "Heading / Small" → "heading-small"
        return style.name
          .toLowerCase()
          .replace(/\s*\/\s*/g, "-")
          .replace(/\s+/g, "-");
      }
    } catch {
      // ignore
    }
  }
  return "";
}

function resolveFill(node: any): string | null {
  // 1. Bound variable (most specific)
  const varName = resolveVariable(node, "fills");
  if (varName) return varName.split("/").pop() ?? varName;

  // 2. Fill style
  if (node.fillStyleId && typeof node.fillStyleId === "string") {
    try {
      const style = figma.getStyleById(node.fillStyleId);
      if (style?.name) return style.name.split("/").pop() ?? style.name;
    } catch {
      // ignore
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Sizing
// ---------------------------------------------------------------------------

type AxisSizing = "fill" | "hug" | "fixed";

function normalizeAxisSizing(value: unknown): AxisSizing | null {
  if (typeof value !== "string") {
    return null;
  }

  const upper = value.toUpperCase();
  if (upper === "FILL" || upper === "FILL_CONTAINER") {
    return "fill";
  }

  if (upper === "HUG" || upper === "HUG_CONTENT") {
    return "hug";
  }

  if (upper === "FIXED") {
    return "fixed";
  }

  return null;
}

function resolveSizing(node: any): string {
  const horizontal: AxisSizing =
    normalizeAxisSizing(node.layoutSizingHorizontal) ??
    (node.layoutGrow === 1
      ? "fill"
      : node.primaryAxisSizingMode === "AUTO"
        ? "hug"
        : "fixed");

  const vertical: AxisSizing =
    normalizeAxisSizing(node.layoutSizingVertical) ??
    (node.counterAxisSizingMode === "AUTO" ? "hug" : "fixed");

  if (horizontal === "fill" && vertical === "fill") return "fill";
  if (horizontal === "hug" && vertical === "hug") return "hug";

  const w = Math.round(node.width ?? 0);
  const h = Math.round(node.height ?? 0);

  if (horizontal === "fixed" && vertical === "fixed") {
    return `fixed ${w}x${h}`;
  }

  if (horizontal === "fixed" && vertical === "hug") return "fixed,hug";
  if (horizontal === "hug" && vertical === "fixed") return "hug,fixed";
  if (horizontal === "fill" && vertical === "hug") return "fill,hug";
  if (horizontal === "hug" && vertical === "fill") return "hug,fill";
  if (horizontal === "fill" && vertical === "fixed") return "fill,fixed";
  if (horizontal === "fixed" && vertical === "fill") return "fixed,fill";

  return `fixed ${w}x${h}`;
}

// ---------------------------------------------------------------------------
// Padding
// ---------------------------------------------------------------------------

function resolvePadding(node: any): string | null {
  const t = Math.round(node.paddingTop ?? 0);
  const r = Math.round(node.paddingRight ?? 0);
  const b = Math.round(node.paddingBottom ?? 0);
  const l = Math.round(node.paddingLeft ?? 0);

  if (t === 0 && r === 0 && b === 0 && l === 0) return null;
  if (t === r && r === b && b === l) return String(t);
  return `${t},${r},${b},${l}`;
}

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

function resolveAlign(value: string): string {
  if (value === "MIN") return "start";
  if (value === "CENTER") return "center";
  if (value === "MAX") return "end";
  if (value === "SPACE_BETWEEN") return "between";
  return "";
}

// ---------------------------------------------------------------------------
// Frame / Box attribute string
// ---------------------------------------------------------------------------

function buildFrameAttrs(node: any): string {
  const parts: string[] = [];

  const sizing = resolveSizing(node);
  if (sizing) parts.push(sizing);

  const hasAutoLayout =
    node.layoutMode === "HORIZONTAL" || node.layoutMode === "VERTICAL";

  if (
    hasAutoLayout &&
    typeof node.itemSpacing === "number" &&
    node.itemSpacing > 0
  ) {
    parts.push(`gap=${Math.round(node.itemSpacing)}`);
  }

  const pad = resolvePadding(node);
  if (pad) parts.push(`pad=${pad}`);

  if (hasAutoLayout) {
    const align = resolveAlign(node.primaryAxisAlignItems ?? "");
    if (align) parts.push(`align=${align}`);

    const cross = resolveAlign(node.counterAxisAlignItems ?? "");
    if (cross) parts.push(`cross=${cross}`);

    if (node.layoutWrap === "WRAP") parts.push("wrap");
  }

  const bg = resolveFill(node);
  if (bg) parts.push(`bg=${bg}`);

  if (typeof node.cornerRadius === "number" && node.cornerRadius > 0) {
    parts.push(`radius=${Math.round(node.cornerRadius)}`);
  }

  return parts.join(" ");
}

function escapeQuoted(value: string): string {
  return value.replace(/"/g, "'");
}

function isGenericLayerName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;

  return /^(Frame|Group|Rectangle|Ellipse|Polygon|Star|Line|Vector|Text|Shape|Component|Instance|Boolean operation)\s+\d+$/i.test(
    trimmed,
  );
}

function resolveDisplayName(node: any): string {
  const raw = String(node.name ?? "").trim();
  if (!raw || isGenericLayerName(raw)) {
    return "";
  }
  return raw;
}

function resolveComponentDependencyName(node: any): string {
  const layerName = String(node.name ?? "").trim();
  const sourceName = String(node.mainComponent?.name ?? "").trim();

  if (layerName && !isGenericLayerName(layerName)) {
    return layerName;
  }

  if (sourceName && !isGenericLayerName(sourceName)) {
    return sourceName;
  }

  return sourceName || layerName;
}

function buildContainerLine(
  node: any,
  indent: string,
  nodeType: string,
  dir: "h" | "v" | null,
  attrs: string,
): string {
  const name = resolveDisplayName(node);
  const label = name ? `${nodeType}("${escapeQuoted(name)}")` : nodeType;

  const parts: string[] = [label];
  if (dir) parts.push(dir);
  if (attrs) parts.push(attrs);

  return `${indent}${parts.join(" ")}`;
}

function appendChildren(
  lines: string[],
  node: any,
  depth: number,
  indent: string,
  componentDeps: Set<string>,
): void {
  if (!Array.isArray(node.children)) {
    return;
  }

  if (depth < MAX_DEPTH) {
    const childLines = node.children
      .map((child: any) =>
        serializeNode(child, depth + 1, `${indent}  `, componentDeps),
      )
      .filter(Boolean);

    if (childLines.length > CHILD_COLLAPSE_AT) {
      lines.push(...childLines.slice(0, CHILD_COLLAPSE_AT));
      lines.push(
        `${indent}  ... ${childLines.length - CHILD_COLLAPSE_AT} more children`,
      );
    } else {
      lines.push(...childLines);
    }
    return;
  }

  if (node.children.length > 0) {
    lines.push(`${indent}  ... ${node.children.length} children`);
  }
}

// ---------------------------------------------------------------------------
// Node serializer (recursive)
// ---------------------------------------------------------------------------

function serializeNode(
  node: any,
  depth: number,
  indent: string,
  componentDeps: Set<string>,
): string {
  const lines: string[] = [];
  const type: string = node.type ?? "";

  // --- Frame-like containers ---
  if (
    type === "FRAME" ||
    type === "COMPONENT" ||
    type === "COMPONENT_SET" ||
    type === "INSTANCE"
  ) {
    const dir =
      node.layoutMode === "HORIZONTAL"
        ? "h"
        : node.layoutMode === "VERTICAL"
          ? "v"
          : null;
    const nodeType = dir ? "Frame" : "Box";
    const attrs = buildFrameAttrs(node);

    if (type === "INSTANCE") {
      const dependencyName = resolveComponentDependencyName(node);
      if (dependencyName) {
        componentDeps.add(dependencyName);
      }
    }

    lines.push(buildContainerLine(node, indent, nodeType, dir, attrs));
    appendChildren(lines, node, depth, indent, componentDeps);
  }

  // --- Text ---
  else if (type === "TEXT") {
    const styleToken = resolveTextStyle(node);
    const colorVar = resolveVariable(node, "fills");
    const colorStr = colorVar
      ? ` color=${colorVar.split("/").pop() ?? colorVar}`
      : "";
    const preview = String(node.characters ?? "").slice(0, 40);
    const escaped = escapeQuoted(preview);
    const layerName = resolveDisplayName(node);
    const textLabel = layerName ? `Text("${escapeQuoted(layerName)}")` : "Text";
    lines.push(
      `${indent}${textLabel}${styleToken ? ` ${styleToken}` : ""}${colorStr} "${escaped}"`,
    );
  }

  // --- Groups ---
  else if (type === "GROUP") {
    const name = resolveDisplayName(node);
    const groupLabel = name ? `Group("${escapeQuoted(name)}")` : "Group";
    lines.push(`${indent}${groupLabel}`);
    if (Array.isArray(node.children) && depth < MAX_DEPTH) {
      node.children.forEach((child: any) => {
        const childLine = serializeNode(
          child,
          depth + 1,
          `${indent}  `,
          componentDeps,
        );
        if (childLine) lines.push(childLine);
      });
    }
  }

  // --- Shapes / vectors (leaf — size only) ---
  else if (
    [
      "VECTOR",
      "BOOLEAN_OPERATION",
      "STAR",
      "POLYGON",
      "ELLIPSE",
      "LINE",
      "RECTANGLE",
    ].includes(type)
  ) {
    const w = Math.round(node.width ?? 0);
    const h = Math.round(node.height ?? 0);
    const name = resolveDisplayName(node);
    const shapeLabel = name ? `Shape("${escapeQuoted(name)}")` : "Shape";
    lines.push(`${indent}${shapeLabel} ${w}x${h}`);
  }

  // Unknown node types are silently skipped.
  return lines.filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function generateLayerTree(nodeId: string): string {
  return generateLayerTreeSnapshot(nodeId).tree;
}

export function generateLayerTreeSnapshot(nodeId: string): LayerTreeSnapshot {
  const node = figma.getNodeById(nodeId);
  if (!node) {
    return {
      tree: "",
      componentsUsed: [],
    };
  }

  const componentDeps = new Set<string>();
  const tree = serializeNode(node, 0, "", componentDeps);

  return {
    tree,
    componentsUsed: Array.from(componentDeps),
  };
}
