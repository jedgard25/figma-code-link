# Layer Tree Schema Reference

The layer tree is a compact, plaintext representation of a Figma node's layout structure. It is generated at queue-time by the plugin sandbox and stored as `layerTree` on a `TaskEntry`. Its purpose is to give Copilot the nesting structure, flex layout, and design token context of a component without requiring a live Figma MCP call.

## Enabling

Toggle **Settings → Dev Features → Generate Layer Tree** in the plugin. The setting is persisted in `localStorage` and defaults to off. When enabled, the tree is captured silently when you click **Continue** in the add-to-queue modal and is written to `figma-tasks.json` alongside the other entry fields.

---

## Format overview

Each node is one line. Children are indented with two spaces per level. Node type comes first, followed by space-separated attributes. Only attributes with non-default / non-zero values are emitted.

Generic auto-generated Figma names (e.g. `Frame 2019`, `Text 44`) are omitted to reduce token count.

```
Frame("Card / Default") v hug gap=16 pad=16 bg=surface-raised radius=8
  Frame("Header") h fill align=between cross=center
    Text("Title") heading-sm "Card Title"
    Frame("icon/more-horizontal") h fixed 16x16
```

---

## Node types

### `Frame("name") h` / `Frame("name") v`

A Figma auto-layout frame, component root, or component set.

```
Frame("<layer-name>") h|v  <sizing>  [gap=N]  [pad=…]  [align=…]  [cross=…]  [wrap]  [bg=…]  [radius=N]
```

`h` = `layoutMode: HORIZONTAL`, `v` = `layoutMode: VERTICAL`.

### `Box("name")`

A frame with **no auto-layout** (absolute-positioned children). Attributes are limited to sizing, padding, background, and corner radius — alignment and gap are not emitted.

```
Box("<layer-name>")  <sizing>  [pad=…]  [bg=…]  [radius=N]
```

### `Text`

A text layer.

```
Text("<layer-name>")  [<style-token>]  [color=<token>]  "<content-preview>"
```

`<content-preview>` is the first 40 characters of the text content. Double quotes inside the preview are replaced with single quotes.

### `Instance handling`

`INSTANCE` nodes are serialized exactly like containers (`Frame("name") h|v ...` or `Box("name") ...`) and children are recursed just like any other node. This keeps build-mode trees structural even when selected UI is composed from variants.

Component dependencies are collected separately in the entry's `componentsUsed` array.

### `Group("name")`

A Figma group layer. Children are recursed normally up to the depth cap.

```
Group("<layer-name>")
  <children…>
```

### `Shape`

Any vector-type leaf node: `VECTOR`, `BOOLEAN_OPERATION`, `STAR`, `POLYGON`, `ELLIPSE`, `LINE`, `RECTANGLE`. Only size is emitted.

```
Shape("<layer-name>") <WxH>
```

---

## Attribute reference

### Sizing

Encodes the Figma sizing mode of the node relative to its parent.

| Token        | Figma equivalent                        | Details                                  |
| ------------ | --------------------------------------- | ---------------------------------------- |
| `hug`        | Both axes `AUTO`                        | Hugs content on both axes                |
| `fill`       | `layoutGrow: 1`                         | Fills the main axis of the parent        |
| `fill,hug`   | `layoutGrow: 1` + cross axis `AUTO`     | Fill main, hug cross                     |
| `hug,fill`   | Horizontal hug + vertical fill          | Mixed axis sizing                        |
| `hug,fixed`  | Primary axis `AUTO`, cross axis `FIXED` | Hug main, fixed cross                    |
| `fixed,hug`  | Horizontal fixed + vertical hug         | Mixed axis sizing                        |
| `fill,fixed` | Horizontal fill + vertical fixed        | Mixed axis sizing                        |
| `fixed,fill` | Horizontal fixed + vertical fill        | Mixed axis sizing                        |
| `fixed WxH`  | Both axes `FIXED`                       | Explicit pixel size, e.g. `fixed 320x48` |

> **Resolution order:** serializer prefers modern `layoutSizingHorizontal` / `layoutSizingVertical`, then falls back to legacy `layoutGrow` + `primaryAxisSizingMode`/`counterAxisSizingMode` when needed.

> **Note:** `fill` is only meaningful when the node is inside an auto-layout parent. Inside a `Box` it can still appear and should be treated as informational.

### `gap=N`

`itemSpacing` in pixels (auto-layout frames only). Omitted when `0`.

### `pad=N` / `pad=T,R,B,L`

Padding in pixels.

- Uniform: `pad=16` (all four sides equal)
- Asymmetric: `pad=24,16,24,16` (top, right, bottom, left)

Omitted entirely when all sides are `0`.

### `align=<value>`

Main-axis alignment (`primaryAxisAlignItems`). Auto-layout frames only.

| Token     | Figma value     |
| --------- | --------------- |
| `start`   | `MIN`           |
| `center`  | `CENTER`        |
| `end`     | `MAX`           |
| `between` | `SPACE_BETWEEN` |

### `cross=<value>`

Cross-axis alignment (`counterAxisAlignItems`). Auto-layout frames only. Same token set as `align`.

### `wrap`

Emitted when `layoutWrap === "WRAP"`. Auto-layout frames only.

### `bg=<token>`

Fill color token. Resolution priority:

1. Bound variable name (last path segment, e.g. `surface-raised` from `Colors/Surface/surface-raised`)
2. Fill style name (last path segment)
3. Omitted if neither is available — raw hex is not emitted

### `radius=N`

`cornerRadius` in pixels. Omitted when `0` or when the property is not uniform (mixed corner radii are not serialized).

### `color=<token>` (Text only)

Text fill color token, resolved the same way as `bg`. Omitted when no variable or style is bound.

---

## Depth and collapse behaviour

| Constant            | Default | Description                                     |
| ------------------- | ------- | ----------------------------------------------- |
| `MAX_DEPTH`         | `4`     | Maximum recursion depth from the root node      |
| `CHILD_COLLAPSE_AT` | `4`     | Maximum children shown before a collapse marker |

When a frame has more than 4 children, the first 4 are shown and the rest are replaced with:

```
  ... 3 more children
```

When `MAX_DEPTH` is reached and a container still has children:

```
  ... 6 children
```

---

## Style / variable resolution

The serializer resolves design token names from two sources in priority order:

1. **Bound variables** (`node.boundVariables`) — calls `figma.variables.getVariableById(id)` and uses the variable's `.name`. If the name contains path separators (`/`), only the last segment is used (e.g. `Colors/Text/text-secondary` → `text-secondary`).
2. **Applied styles** (`node.textStyleId`, `node.fillStyleId`) — calls `figma.getStyleById(id)` and normalises the style name. Text styles are also kebab-cased and slash-separated (e.g. `Heading / Small` → `heading-small`).
3. **Raw fallback** — for fills and backgrounds, if neither resolves, the attribute is silently omitted rather than emitting a raw hex value. For text styles, the `Text` line is still emitted without a style token.

---

## Output location in `figma-tasks.json`

```jsonc
{
  "version": 1,
  "entries": [
    {
      "figmaNodeId": "14:203",
      "figmaNodeName": "Card / Default",
      "status": "to-build",
      "comment": "Build the card component",
      "componentsUsed": ["label", "button.icon.ghost"],
      "layerTree": "Frame(\"Card / Default\") v hug gap=16 pad=16 bg=surface-raised radius=8\n  Frame(\"label\") h fixed 54x18 gap=10 pad=0,4,0,4 align=center cross=center radius=4\n    Text(\"Label\") body-xs-medium \"Label\"\n  Frame(\"button.icon.ghost\") h fixed 22x22 gap=10 align=center cross=center radius=4",
    },
  ],
}
```

`layerTree` is `undefined` / absent when the setting is off or when the serializer returned an empty string.
`componentsUsed` is optional per entry.

---

## Known limitations

- **Icon detection** — there is no first-class `ICON` node type in the Figma API. Icons are serialized as generic frame/box/shape/text lines based on their actual Figma node type.
- **Mixed corner radii** — only uniform `cornerRadius` is serialized. `topLeftRadius` etc. are ignored.
- **Absolute children of `Box`** — children are listed but have no positional information (x/y coordinates are not emitted).
- **Variable resolution latency** — `figma.variables.getVariableById` is synchronous in the plugin sandbox but can be slow on files with large variable collections. If it throws, the attribute is silently omitted.
- **`fill` inside `Box`** — `layoutGrow: 1` is serialized as `fill` even inside frames without auto-layout. Consumers should treat `fill` on direct children of `Box` nodes as informational only.
