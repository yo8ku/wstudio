"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => FakeCanvasHostPlugin
});
module.exports = __toCommonJS(main_exports);
var import_plugin = require("@note-studio/plugin");
var DEMO_VIEW_TYPE = "wstudio-demo-canvas-host-view";
var DEMO_TITLE = "\u5047\u767D\u677F\u6700\u5C0F\u6F14\u793A";
var SCENE_FOLDER_PATH = "plugin-api-demo/canvas-host";
var SCENE_FILE_PATH = `${SCENE_FOLDER_PATH}/fake-whiteboard.canvas`;
var CANVAS_FILE_EXTENSIONS = ["canvas", "canvs"];
var OPEN_DEMO_COMMAND_ID = "open-fake-canvas-demo";
var CREATE_NEW_SCENE_FILE_COMMAND_ID = "create-fake-canvas-scene-file";
var RESET_SCENE_COMMAND_ID = "reset-fake-canvas-demo";
var ADD_NODE_COMMAND_ID = "add-fake-canvas-node";
var ADD_CONNECTED_NODE_COMMAND_ID = "add-linked-fake-canvas-node";
var ADD_NOTE_NODE_COMMAND_ID = "add-fake-canvas-note-node";
var ADD_FILE_NODE_COMMAND_ID = "add-fake-canvas-file-node";
var ADD_URL_NODE_COMMAND_ID = "add-fake-canvas-url-node";
var ADD_GROUP_NODE_COMMAND_ID = "add-fake-canvas-group-node";
var REMOVE_SELECTED_NODE_COMMAND_ID = "remove-selected-fake-canvas-node";
var REMOVE_SELECTED_LINES_COMMAND_ID = "remove-selected-fake-canvas-lines";
var SAVE_SCENE_COMMAND_ID = "save-fake-canvas-scene";
var LOAD_SCENE_COMMAND_ID = "load-fake-canvas-scene";
var OPEN_SCENE_FILE_COMMAND_ID = "open-fake-canvas-scene-file";
var WORKSPACE_FILE_DRAG_MIME_TYPE = "application/x-note-studio-file-path";
var CANVAS_COMMAND_CATEGORY = "\u767D\u677F";
var TEXT_NODE_WIDTH = 220;
var TEXT_NODE_HEIGHT = 44;
var TEXT_NODE_MULTI_LINE_HEIGHT = 72;
var TEXT_NODE_LINE_HEIGHT = 28;
var CARD_WIDTH = 248;
var CARD_HEIGHT = 148;
var GROUP_NODE_WIDTH = 420;
var GROUP_NODE_HEIGHT = 280;
var FLOATING_PANEL_WIDTH = 220;
var FLOATING_PANEL_INSET = 16;
var GROUP_NODE_PADDING = 36;
var PERSISTENT_SELECTION_BOX_PADDING = 10;
var MIN_NODE_WIDTH = 180;
var MIN_NODE_HEIGHT = 96;
var NODE_RESIZE_FRAME_OUTSET = 8;
var NODE_RESIZE_EDGE_HIT_SIZE = 2;
var NODE_RESIZE_CORNER_HIT_SIZE = 6;
var COMPACT_TEXT_NODE_RESIZE_FRAME_OUTSET = 4;
var COMPACT_TEXT_NODE_RESIZE_EDGE_HIT_SIZE = 1;
var COMPACT_TEXT_NODE_RESIZE_CORNER_HIT_SIZE = 4;
var NODE_BORDER_WIDTH = "2px";
var SELECTED_NODE_OUTLINE_WIDTH = "2px";
var SELECTED_NODE_BORDER_COLOR = "var(--ws-focus-border, var(--focus-border, #007acc))";
var GROUP_NODE_Z_INDEX = "0";
var NODE_BASE_Z_INDEX = "1";
var NODE_SELECTED_Z_INDEX = "2";
var NODE_ACTIVE_Z_INDEX = "3";
var AUTO_SAVE_DELAY_MS = 420;
var MIN_SCALE = 0.5;
var MAX_SCALE = 2;
var HOST_MOUSE_POINTER_ID = 1;
var NODE_DOUBLE_CLICK_THRESHOLD_MS = 360;
var NODE_DOUBLE_CLICK_DISTANCE_THRESHOLD = 8;
var NODE_ACTIVATION_DEBOUNCE_MS = 320;
var CANVAS_SCHEMA_KIND = "wstudio.canvas";
var CANVAS_SCHEMA_VERSION = 2;
var LEGACY_CANVAS_SCHEMA_VERSION = 1;
var CANVAS_SCHEMA_GENERATOR = "wstudio-plugin-demo-canvas-host";
var RESIZE_DIRECTIONS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
function clamp(value, min, max) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}
function isJsonObjectValue(value) {
  return value !== null && value !== void 0 && typeof value === "object" && !Array.isArray(value);
}
function readJsonObjectValue(state, key) {
  const value = state[key];
  return isJsonObjectValue(value) ? value : null;
}
function readStringValue(state, key, fallback) {
  const value = state[key];
  return typeof value === "string" ? value : fallback;
}
function readNumberValue(state, key, fallback) {
  const value = state[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function readBooleanValue(state, key, fallback) {
  const value = state[key];
  return typeof value === "boolean" ? value : fallback;
}
function readNullableStringValue(state, key, fallback) {
  const value = state[key];
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return fallback;
}
function resolveWorkspaceLeaf(args) {
  const leaf = args[0] ?? null;
  if (typeof leaf !== "object" || leaf === null) {
    throw new Error("FakeCanvasView requires a workspace leaf.");
  }
  return leaf;
}
function formatTimestamp(date) {
  return date.toLocaleString("zh-CN", { hour12: false });
}
function padDatePart(value) {
  return value.toString().padStart(2, "0");
}
function extractCanvasFileName(filePath) {
  const fileName = filePath.split("/").map((segment) => segment.trim()).filter((segment) => segment.length > 0).at(-1);
  return fileName ?? "untitled.canvas";
}
function extractCanvasTitle(filePath) {
  const fileName = extractCanvasFileName(filePath);
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}
function isCanvasFileExtension(extension) {
  return CANVAS_FILE_EXTENSIONS.includes(extension.toLowerCase());
}
function extractPathFileName(filePath) {
  return filePath.split("/").map((segment) => segment.trim()).filter((segment) => segment.length > 0).at(-1) ?? filePath;
}
function extractPathBasename(filePath) {
  const fileName = extractPathFileName(filePath);
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}
function createCanvasMetadata(filePath, source, createdAt, updatedAt, migratedFromVersion) {
  return {
    title: extractCanvasTitle(filePath),
    createdAt,
    updatedAt,
    source,
    generator: CANVAS_SCHEMA_GENERATOR,
    migratedFromVersion
  };
}
function readCanvasNodeTypeValue(state, key, fallback) {
  const value = state[key];
  switch (value) {
    case "note":
    case "file":
    case "url":
    case "group":
    case "text":
      return value;
    default:
      return fallback;
  }
}
function getNodeTypeLabel(type) {
  switch (type) {
    case "note":
      return "\u7B14\u8BB0";
    case "file":
      return "\u6587\u4EF6";
    case "url":
      return "URL";
    case "group":
      return "\u5206\u7EC4";
    default:
      return "\u6587\u672C";
  }
}
function getNodeReferenceText(node) {
  switch (node.type) {
    case "note":
      return `\u76EE\u6807\u7B14\u8BB0\uFF1A${node.targetPath ?? "\u672A\u8BBE\u7F6E"}`;
    case "file":
      return `\u76EE\u6807\u6587\u4EF6\uFF1A${node.targetPath ?? "\u672A\u8BBE\u7F6E"}`;
    case "url":
      return `\u76EE\u6807\u94FE\u63A5\uFF1A${node.url ?? "\u672A\u8BBE\u7F6E"}`;
    case "group":
      return "\u5206\u7EC4\u8282\u70B9\uFF1A\u7528\u4E8E\u627F\u8F7D\u4E00\u7EC4\u767D\u677F\u5361\u7247";
    default:
      return null;
  }
}
function isWorkspaceFileNode(node) {
  return node.type === "note" || node.type === "file";
}
function isSupportedExternalUrl(value) {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}
function normalizeExternalUrlInput(value) {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return null;
  }
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmedValue) ? trimmedValue : `https://${trimmedValue}`;
  try {
    const parsedUrl = new URL(candidate);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:" || parsedUrl.hostname.trim().length === 0) {
      return null;
    }
    return parsedUrl.toString();
  } catch {
    return null;
  }
}
function formatExternalUrlHost(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}
function normalizeDroppedWorkspacePath(value) {
  const candidate = value.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0 && !line.startsWith("#"));
  if (candidate === void 0) {
    return null;
  }
  return candidate.replace(/\\/g, "/").replace(/^\/+/, "");
}
function readDroppedWorkspacePath(dataTransfer) {
  const dragPayloadTypes = [
    WORKSPACE_FILE_DRAG_MIME_TYPE,
    "text/plain",
    "text/uri-list"
  ];
  for (const payloadType of dragPayloadTypes) {
    if (!Array.from(dataTransfer.types).includes(payloadType)) {
      continue;
    }
    const droppedPath = normalizeDroppedWorkspacePath(dataTransfer.getData(payloadType));
    if (droppedPath !== null) {
      return droppedPath;
    }
  }
  return null;
}
function createDefaultNodes() {
  return [
    {
      id: "start",
      type: "text",
      title: "\u6B22\u8FCE",
      body: "\u4F5C\u4E3A\u5165\u53E3\u8282\u70B9\uFF0C\u8868\u793A\u5F53\u524D\u767D\u677F\u89C6\u56FE\u5DF2\u7ECF\u5177\u5907\u6700\u5C0F\u4EA4\u4E92\u627F\u8F7D\u80FD\u529B\u3002",
      accent: "linear-gradient(135deg, rgba(14,165,233,0.24), rgba(59,130,246,0.12))",
      shadow: "rgba(2, 132, 199, 0.18)",
      x: 140,
      y: 120
    },
    {
      id: "idea",
      type: "note",
      title: "\u601D\u8DEF\u5361\u7247",
      body: "\u8FD9\u662F\u4E00\u4E2A\u7B14\u8BB0\u8282\u70B9\uFF0C\u7528\u4E8E\u9A8C\u8BC1\u767D\u677F\u53EF\u4EE5\u627F\u8F7D\u7B14\u8BB0\u5F15\u7528\u7C7B\u5361\u7247\u3002",
      accent: "linear-gradient(135deg, rgba(45,212,191,0.24), rgba(16,185,129,0.12))",
      shadow: "rgba(13, 148, 136, 0.16)",
      x: 520,
      y: 200,
      targetPath: "notes/canvas-idea.md"
    },
    {
      id: "task",
      type: "file",
      title: "\u4E0B\u4E00\u6B65",
      body: "\u8FD9\u662F\u4E00\u4E2A\u6587\u4EF6\u8282\u70B9\uFF0C\u7528\u4E8E\u9A8C\u8BC1\u767D\u677F\u53EF\u4EE5\u4FDD\u5B58\u548C\u6062\u590D\u6587\u4EF6\u5F15\u7528\u5361\u7247\u3002",
      accent: "linear-gradient(135deg, rgba(250,204,21,0.24), rgba(249,115,22,0.12))",
      shadow: "rgba(234, 88, 12, 0.15)",
      x: 900,
      y: 340,
      targetPath: "attachments/canvas-host-roadmap.pdf"
    },
    {
      id: "reference-url",
      type: "url",
      title: "\u53C2\u8003\u94FE\u63A5",
      body: "",
      accent: "linear-gradient(135deg, rgba(168,85,247,0.24), rgba(59,130,246,0.12))",
      shadow: "rgba(109, 40, 217, 0.18)",
      x: 560,
      y: 480,
      groupId: "group-demo"
    },
    {
      id: "group-demo",
      type: "group",
      title: "\u6269\u5C55\u5206\u7EC4",
      body: "\u8FD9\u662F\u4E00\u4E2A\u5206\u7EC4\u8282\u70B9\uFF0C\u7528\u4E8E\u9A8C\u8BC1 Canvas \u98CE\u683C\u7684\u5BB9\u5668\u7C7B\u5361\u7247\u3002",
      accent: "linear-gradient(135deg, rgba(148,163,184,0.18), rgba(51,65,85,0.16))",
      shadow: "rgba(15, 23, 42, 0.18)",
      x: 500,
      y: 430,
      width: 560,
      height: 280
    }
  ];
}
function createDefaultLines() {
  return [
    {
      id: "line-start-idea",
      from: "start",
      to: "idea",
      label: "\u627F\u8F7D\u94FE\u8DEF"
    },
    {
      id: "line-idea-task",
      from: "idea",
      to: "task",
      label: "\u7EE7\u7EED\u63A8\u8FDB"
    },
    {
      id: "line-task-url",
      from: "task",
      to: "reference-url",
      label: "\u53C2\u8003\u8D44\u6599"
    },
    {
      id: "line-url-group",
      from: "reference-url",
      to: "group-demo",
      label: "\u5F52\u5165\u5206\u7EC4"
    }
  ];
}
function createInitialViewState(source) {
  return {
    source,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    selectedNodeId: "start",
    nextNodeSerial: 1,
    nodes: createDefaultNodes(),
    lines: createDefaultLines()
  };
}
function updateNodePosition(nodes, targetId, x, y) {
  return nodes.map((node) => {
    if (node.id !== targetId) {
      return node;
    }
    return {
      ...node,
      x,
      y
    };
  });
}
function updateNodeContent(nodes, targetId, patch) {
  return nodes.map((node) => {
    if (node.id !== targetId) {
      return node;
    }
    return {
      ...node,
      title: patch.title,
      body: patch.body
    };
  });
}
function findNode(nodes, targetId) {
  const node = nodes.find((item) => item.id === targetId);
  if (node === void 0) {
    throw new Error(`Missing canvas node: ${targetId}`);
  }
  return node;
}
function defaultNodeWidthForType(type) {
  switch (type) {
    case "text":
      return TEXT_NODE_WIDTH;
    case "group":
      return GROUP_NODE_WIDTH;
    default:
      return CARD_WIDTH;
  }
}
function defaultNodeHeightForType(type) {
  switch (type) {
    case "text":
      return TEXT_NODE_HEIGHT;
    case "group":
      return GROUP_NODE_HEIGHT;
    default:
      return CARD_HEIGHT;
  }
}
function minNodeWidthForType(type) {
  switch (type) {
    case "text":
      return 120;
    case "group":
      return 240;
    default:
      return MIN_NODE_WIDTH;
  }
}
function minNodeHeightForType(type) {
  switch (type) {
    case "text":
      return TEXT_NODE_HEIGHT;
    case "group":
      return 180;
    default:
      return MIN_NODE_HEIGHT;
  }
}
function resolveTextNodeTitleInputMetrics(isExpandedTextNode) {
  if (isExpandedTextNode) {
    return {
      minHeight: `${TEXT_NODE_HEIGHT}px`,
      height: "100%",
      padding: "8px 10px"
    };
  }
  return {
    minHeight: `${TEXT_NODE_LINE_HEIGHT}px`,
    height: `${TEXT_NODE_LINE_HEIGHT}px`,
    padding: "0 10px"
  };
}
function resolveResizeHitAreaMetrics(node) {
  if (node.type === "text" && nodeHeight(node) <= TEXT_NODE_HEIGHT) {
    return {
      frameOutset: COMPACT_TEXT_NODE_RESIZE_FRAME_OUTSET,
      edgeHitSize: COMPACT_TEXT_NODE_RESIZE_EDGE_HIT_SIZE,
      cornerHitSize: COMPACT_TEXT_NODE_RESIZE_CORNER_HIT_SIZE
    };
  }
  return {
    frameOutset: NODE_RESIZE_FRAME_OUTSET,
    edgeHitSize: NODE_RESIZE_EDGE_HIT_SIZE,
    cornerHitSize: NODE_RESIZE_CORNER_HIT_SIZE
  };
}
function resolveResizeDirectionFromLocalPoint(localX, localY, width, height, metrics) {
  const nearLeft = localX <= metrics.edgeHitSize;
  const nearRight = localX >= width - metrics.edgeHitSize;
  const nearTop = localY <= metrics.edgeHitSize;
  const nearBottom = localY >= height - metrics.edgeHitSize;
  const nearCornerLeft = localX <= metrics.cornerHitSize;
  const nearCornerRight = localX >= width - metrics.cornerHitSize;
  const nearCornerTop = localY <= metrics.cornerHitSize;
  const nearCornerBottom = localY >= height - metrics.cornerHitSize;
  if (nearCornerTop && nearCornerLeft) {
    return "nw";
  }
  if (nearCornerTop && nearCornerRight) {
    return "ne";
  }
  if (nearCornerBottom && nearCornerLeft) {
    return "sw";
  }
  if (nearCornerBottom && nearCornerRight) {
    return "se";
  }
  if (nearTop) {
    return "n";
  }
  if (nearBottom) {
    return "s";
  }
  if (nearLeft) {
    return "w";
  }
  if (nearRight) {
    return "e";
  }
  return null;
}
function resolveResizeCursor(direction) {
  switch (direction) {
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "nw":
    case "se":
      return "nwse-resize";
  }
}
function resolveNodeZIndex(node, isSelected, isActive) {
  if (isActive) {
    return NODE_ACTIVE_Z_INDEX;
  }
  if (node.type === "group") {
    return GROUP_NODE_Z_INDEX;
  }
  return isSelected ? NODE_SELECTED_Z_INDEX : NODE_BASE_Z_INDEX;
}
function nodeWidth(node) {
  return node.width ?? defaultNodeWidthForType(node.type);
}
function nodeHeight(node) {
  return node.height ?? defaultNodeHeightForType(node.type);
}
function nodeCenterX(node) {
  return node.x + nodeWidth(node) / 2;
}
function nodeCenterY(node) {
  return node.y + nodeHeight(node) / 2;
}
function isPointInsideNode(point, node) {
  return point.x >= node.x && point.x <= node.x + nodeWidth(node) && point.y >= node.y && point.y <= node.y + nodeHeight(node);
}
function readAugmentedEventNumber(event, key) {
  const value = event[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function readEventClientCoordinate(event, key) {
  const value = event[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function createNodeAccent(serial) {
  const presets = [
    {
      accent: "linear-gradient(135deg, rgba(168,85,247,0.24), rgba(59,130,246,0.12))",
      shadow: "rgba(109, 40, 217, 0.18)"
    },
    {
      accent: "linear-gradient(135deg, rgba(251,191,36,0.24), rgba(244,114,182,0.12))",
      shadow: "rgba(234, 88, 12, 0.16)"
    },
    {
      accent: "linear-gradient(135deg, rgba(34,197,94,0.24), rgba(59,130,246,0.12))",
      shadow: "rgba(22, 163, 74, 0.16)"
    }
  ];
  return presets[(serial - 1) % presets.length] ?? presets[0];
}
function createNodeContent(type, serial, anchorTitle) {
  const anchorSuffix = anchorTitle === void 0 ? "" : `\uFF0C\u4ECE\u201C${anchorTitle}\u201D\u5EF6\u4F38`;
  switch (type) {
    case "note":
      return {
        title: `\u7B14\u8BB0\u8282\u70B9 ${serial}`,
        body: `\u8FD9\u662F\u65B0\u589E\u7684\u7B14\u8BB0\u8282\u70B9${anchorSuffix}\uFF0C\u540E\u7EED\u53EF\u5728 P1-02 \u63A5\u5165\u53CC\u5411\u8DF3\u8F6C\u3002`,
        targetPath: `notes/canvas-note-${serial}.md`
      };
    case "file":
      return {
        title: `\u6587\u4EF6\u8282\u70B9 ${serial}`,
        body: `\u8FD9\u662F\u65B0\u589E\u7684\u6587\u4EF6\u8282\u70B9${anchorSuffix}\uFF0C\u7528\u4E8E\u9A8C\u8BC1\u6587\u4EF6\u5F15\u7528\u7C7B\u5361\u7247\u7684\u4FDD\u5B58\u4E0E\u6062\u590D\u3002`,
        targetPath: `attachments/canvas-file-${serial}.pdf`
      };
    case "url":
      return {
        title: `URL \u8282\u70B9 ${serial}`,
        body: ""
      };
    case "group":
      return {
        title: `\u5206\u7EC4\u8282\u70B9 ${serial}`,
        body: `\u8FD9\u662F\u65B0\u589E\u7684\u5206\u7EC4\u8282\u70B9${anchorSuffix}\uFF0C\u7528\u4E8E\u9A8C\u8BC1\u5BB9\u5668\u7C7B\u5361\u7247\u7684\u57FA\u7840\u627F\u8F7D\u3002`
      };
    default:
      return {
        title: "",
        body: ""
      };
  }
}
function readNodeArrayValue(state, key) {
  const value = state[key];
  if (!Array.isArray(value)) {
    return null;
  }
  const parsedNodes = [];
  for (const item of value) {
    if (!isJsonObjectValue(item)) {
      continue;
    }
    const id = typeof item.id === "string" ? item.id : "";
    const type = readCanvasNodeTypeValue(item, "type", "text");
    const title = typeof item.title === "string" ? item.title : "";
    const body = typeof item.body === "string" ? item.body : "";
    const accent = typeof item.accent === "string" ? item.accent : "";
    const shadow = typeof item.shadow === "string" ? item.shadow : "";
    const x = typeof item.x === "number" && Number.isFinite(item.x) ? item.x : Number.NaN;
    const y = typeof item.y === "number" && Number.isFinite(item.y) ? item.y : Number.NaN;
    const targetPath = typeof item.targetPath === "string" && item.targetPath.trim().length > 0 ? item.targetPath : void 0;
    const url = typeof item.url === "string" && item.url.trim().length > 0 ? item.url : void 0;
    const width = typeof item.width === "number" && Number.isFinite(item.width) && item.width > 0 ? item.width : void 0;
    const height = typeof item.height === "number" && Number.isFinite(item.height) && item.height > 0 ? item.height : void 0;
    const groupId = typeof item.groupId === "string" && item.groupId.trim().length > 0 ? item.groupId : void 0;
    if (id.length === 0 || accent.length === 0 || shadow.length === 0 || Number.isNaN(x) || Number.isNaN(y)) {
      continue;
    }
    parsedNodes.push({
      id,
      type,
      title,
      body,
      accent,
      shadow,
      x,
      y,
      ...targetPath === void 0 ? {} : { targetPath },
      ...url === void 0 ? {} : { url },
      ...width === void 0 ? {} : { width },
      ...height === void 0 ? {} : { height },
      ...groupId === void 0 ? {} : { groupId }
    });
  }
  return parsedNodes.length > 0 ? parsedNodes : null;
}
function readLineArrayValue(state, key) {
  const value = state[key];
  if (!Array.isArray(value)) {
    return null;
  }
  const parsedLines = [];
  for (const item of value) {
    if (!isJsonObjectValue(item)) {
      continue;
    }
    const id = typeof item.id === "string" ? item.id : "";
    const from = typeof item.from === "string" ? item.from : "";
    const to = typeof item.to === "string" ? item.to : "";
    const label = typeof item.label === "string" ? item.label : "";
    if (id.length === 0 || from.length === 0 || to.length === 0 || label.length === 0) {
      continue;
    }
    parsedLines.push({
      id,
      from,
      to,
      label
    });
  }
  return parsedLines.length > 0 ? parsedLines : null;
}
function createLegacyNodeState(state) {
  const defaultNodes = createDefaultNodes();
  const startNode = findNode(defaultNodes, "start");
  const ideaNode = findNode(defaultNodes, "idea");
  const taskNode = findNode(defaultNodes, "task");
  return [
    {
      ...startNode,
      x: readNumberValue(state, "startX", startNode.x),
      y: readNumberValue(state, "startY", startNode.y)
    },
    {
      ...ideaNode,
      x: readNumberValue(state, "ideaX", ideaNode.x),
      y: readNumberValue(state, "ideaY", ideaNode.y)
    },
    {
      ...taskNode,
      x: readNumberValue(state, "taskX", taskNode.x),
      y: readNumberValue(state, "taskY", taskNode.y)
    }
  ];
}
function createSceneSnapshotFromState(state, fallbackSource) {
  return {
    source: readStringValue(state, "source", fallbackSource),
    scale: clamp(readNumberValue(state, "scale", 1), MIN_SCALE, MAX_SCALE),
    offsetX: readNumberValue(state, "offsetX", 0),
    offsetY: readNumberValue(state, "offsetY", 0),
    selectedNodeId: readNullableStringValue(state, "selectedNodeId", "start"),
    nextNodeSerial: Math.max(1, Math.round(readNumberValue(state, "nextNodeSerial", 1))),
    nodes: readNodeArrayValue(state, "nodes") ?? createLegacyNodeState(state),
    lines: readLineArrayValue(state, "lines") ?? createDefaultLines()
  };
}
function createLoadedCanvasDocumentFromLegacyState(state, filePath, fallbackSource) {
  const sceneState = readJsonObjectValue(state, "scene");
  if (sceneState === null) {
    throw new Error("\u767D\u677F\u6587\u4EF6\u7F3A\u5C11 scene \u5B57\u6BB5\u3002");
  }
  const savedAtValue = readStringValue(state, "savedAt", (/* @__PURE__ */ new Date()).toISOString());
  const snapshot = createSceneSnapshotFromState(sceneState, fallbackSource);
  return {
    snapshot,
    metadata: createCanvasMetadata(
      filePath,
      snapshot.source,
      savedAtValue,
      savedAtValue,
      LEGACY_CANVAS_SCHEMA_VERSION
    )
  };
}
function createLoadedCanvasDocumentFromCurrentState(state, filePath, fallbackSource) {
  const metadataState = readJsonObjectValue(state, "metadata");
  const viewportState = readJsonObjectValue(state, "viewport");
  const selectionState = readJsonObjectValue(state, "selection");
  const sceneState = readJsonObjectValue(state, "scene");
  if (metadataState === null || viewportState === null || selectionState === null || sceneState === null) {
    throw new Error("\u767D\u677F\u6587\u4EF6\u7F3A\u5C11 metadata / viewport / selection / scene \u5B57\u6BB5\u3002");
  }
  const createdAtValue = readStringValue(metadataState, "createdAt", (/* @__PURE__ */ new Date()).toISOString());
  const updatedAtValue = readStringValue(metadataState, "updatedAt", createdAtValue);
  const sourceValue = readStringValue(metadataState, "source", fallbackSource);
  const migratedFromVersionValue = readNumberValue(metadataState, "migratedFromVersion", -1);
  const snapshot = {
    source: sourceValue,
    scale: clamp(readNumberValue(viewportState, "scale", 1), MIN_SCALE, MAX_SCALE),
    offsetX: readNumberValue(viewportState, "offsetX", 0),
    offsetY: readNumberValue(viewportState, "offsetY", 0),
    selectedNodeId: readNullableStringValue(selectionState, "selectedNodeId", "start"),
    nextNodeSerial: Math.max(1, Math.round(readNumberValue(sceneState, "nextNodeSerial", 1))),
    nodes: readNodeArrayValue(sceneState, "nodes") ?? createDefaultNodes(),
    lines: readLineArrayValue(sceneState, "edges") ?? createDefaultLines()
  };
  return {
    snapshot,
    metadata: createCanvasMetadata(
      filePath,
      sourceValue,
      createdAtValue,
      updatedAtValue,
      migratedFromVersionValue >= 0 ? migratedFromVersionValue : null
    )
  };
}
function parseCanvasDocument(raw, filePath, fallbackSource) {
  const parsed = JSON.parse(raw);
  if (!isJsonObjectValue(parsed)) {
    throw new Error("\u767D\u677F\u6587\u4EF6\u4E0D\u662F\u6709\u6548\u7684\u5BF9\u8C61\u7ED3\u6784\u3002");
  }
  const versionValue = readNumberValue(parsed, "version", 0);
  if (versionValue === CANVAS_SCHEMA_VERSION && readStringValue(parsed, "kind", "") === CANVAS_SCHEMA_KIND) {
    return createLoadedCanvasDocumentFromCurrentState(parsed, filePath, fallbackSource);
  }
  if (versionValue === LEGACY_CANVAS_SCHEMA_VERSION) {
    return createLoadedCanvasDocumentFromLegacyState(parsed, filePath, fallbackSource);
  }
  throw new Error(`\u4E0D\u652F\u6301\u7684\u767D\u677F\u6587\u4EF6\u7248\u672C\uFF1A${versionValue}`);
}
function serializeSceneForFile(scene, filePath = SCENE_FILE_PATH, metadata = null) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const payload = {
    kind: CANVAS_SCHEMA_KIND,
    version: CANVAS_SCHEMA_VERSION,
    metadata: createCanvasMetadata(
      filePath,
      scene.source,
      metadata?.createdAt ?? timestamp,
      timestamp,
      metadata?.migratedFromVersion ?? null
    ),
    viewport: {
      scale: scene.scale,
      offsetX: scene.offsetX,
      offsetY: scene.offsetY
    },
    selection: {
      selectedNodeId: scene.selectedNodeId
    },
    scene: {
      nextNodeSerial: scene.nextNodeSerial,
      nodes: scene.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        title: node.title,
        body: node.body,
        accent: node.accent,
        shadow: node.shadow,
        x: node.x,
        y: node.y,
        ...node.targetPath === void 0 ? {} : { targetPath: node.targetPath },
        ...node.url === void 0 ? {} : { url: node.url },
        ...node.width === void 0 ? {} : { width: node.width },
        ...node.height === void 0 ? {} : { height: node.height },
        ...node.groupId === void 0 ? {} : { groupId: node.groupId }
      })),
      edges: scene.lines.map((line) => ({
        id: line.id,
        from: line.from,
        to: line.to,
        label: line.label
      }))
    }
  };
  return `${JSON.stringify(payload, null, 2)}
`;
}
async function ensureFolderPath(view, targetPath) {
  const segments = targetPath.split("/").map((segment) => segment.trim()).filter((segment) => segment.length > 0);
  let current = "";
  for (const segment of segments) {
    current = current.length === 0 ? segment : `${current}/${segment}`;
    if (view.app.vault.getFolderByPath(current) !== null) {
      continue;
    }
    await view.app.vault.createFolder(current);
  }
}
function createPlainTextPreview(raw, limit = 360) {
  const withoutFrontmatter = raw.replace(/^---[\s\S]*?---\s*/, "");
  const plainText = withoutFrontmatter.replace(/```[\s\S]*?```/g, " ").replace(/`([^`]+)`/g, "$1").replace(/!\[[^\]]*]\([^)]*\)/g, " ").replace(/\[([^\]]+)]\([^)]*\)/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/^>\s?/gm, "").replace(/[*_~>#-]+/g, " ").replace(/\s+/g, " ").trim();
  if (plainText.length <= limit) {
    return plainText.length === 0 ? "\u8BE5\u7B14\u8BB0\u6682\u65E0\u53EF\u9884\u89C8\u6587\u672C\u3002" : plainText;
  }
  return `${plainText.slice(0, limit).trim()}...`;
}
var WorkspaceFileNodeSuggestModal = class extends import_plugin.SuggestModal {
  constructor(app, nodeType, files, chooseFile) {
    super(app);
    this.nodeType = nodeType;
    this.files = files;
    this.chooseFile = chooseFile;
    this.limit = 80;
    this.emptyStateText = nodeType === "note" ? "\u5F53\u524D\u5DE5\u4F5C\u533A\u6CA1\u6709\u53EF\u9009\u62E9\u7684 Markdown \u7B14\u8BB0\u3002" : "\u5F53\u524D\u5DE5\u4F5C\u533A\u6CA1\u6709\u53EF\u9009\u62E9\u7684\u6587\u4EF6\u3002";
    this.setTitle(nodeType === "note" ? "\u9009\u62E9\u5DE5\u4F5C\u533A\u7B14\u8BB0\u6587\u4EF6" : "\u9009\u62E9\u5DE5\u4F5C\u533A\u6587\u4EF6");
    this.setPlaceholder(nodeType === "note" ? "\u641C\u7D22\u7B14\u8BB0\u540D\u6216\u8DEF\u5F84" : "\u641C\u7D22\u6587\u4EF6\u540D\u6216\u8DEF\u5F84");
    this.setInstructions([
      { command: "Enter", purpose: "\u521B\u5EFA\u6307\u5411\u5F53\u524D\u9AD8\u4EAE\u6587\u4EF6\u7684\u767D\u677F\u8282\u70B9" },
      { command: "Click", purpose: "\u521B\u5EFA\u6307\u5411\u6240\u9009\u6587\u4EF6\u7684\u767D\u677F\u8282\u70B9" }
    ]);
  }
  getSuggestions(query) {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
      return this.files;
    }
    return this.files.filter((file) => {
      return `${file.basename} ${file.name} ${file.path}`.toLowerCase().includes(normalizedQuery);
    });
  }
  renderSuggestion(file, el) {
    const titleEl = document.createElement("strong");
    titleEl.textContent = file.basename.length > 0 ? file.basename : file.name;
    const pathEl = document.createElement("div");
    pathEl.textContent = file.path;
    const metaEl = document.createElement("small");
    metaEl.textContent = this.nodeType === "note" ? "Markdown \u7B14\u8BB0" : `.${file.extension || "file"} \u6587\u4EF6`;
    el.append(titleEl, pathEl, metaEl);
  }
  onChooseSuggestion(file) {
    this.chooseFile(file);
  }
};
var UrlNodeAddressSuggestModal = class extends import_plugin.SuggestModal {
  constructor(app, title, actionLabel, initialUrl, chooseUrl) {
    super(app);
    this.actionLabel = actionLabel;
    this.chooseUrl = chooseUrl;
    this.limit = 1;
    this.emptyStateText = "\u8F93\u5165\u6709\u6548\u7684 http \u6216 https \u94FE\u63A5\u540E\u6309 Enter \u786E\u8BA4\u3002";
    this.inputEl.value = initialUrl ?? "";
    this.setTitle(title);
    this.setPlaceholder("\u8F93\u5165 URL \u5730\u5740");
    this.setInstructions([
      { command: "Enter", purpose: actionLabel },
      { command: "Esc", purpose: "\u53D6\u6D88" }
    ]);
  }
  getSuggestions(query) {
    const normalizedUrl = normalizeExternalUrlInput(query);
    return normalizedUrl === null ? [] : [normalizedUrl];
  }
  renderSuggestion(url, el) {
    const titleEl = document.createElement("strong");
    titleEl.textContent = this.actionLabel;
    const urlEl = document.createElement("div");
    urlEl.textContent = url;
    const metaEl = document.createElement("small");
    metaEl.textContent = `\u5185\u5D4C\u7F51\u9875\uFF1A${formatExternalUrlHost(url)}`;
    el.append(titleEl, urlEl, metaEl);
  }
  onChooseSuggestion(url) {
    this.chooseUrl(url);
  }
};
var FakeCanvasView = class extends import_plugin.ItemView {
  constructor(...args) {
    super(resolveWorkspaceLeaf(args));
    this.source = "\u672A\u8BBE\u7F6E";
    this.canvasFilePath = SCENE_FILE_PATH;
    this.canvasFile = null;
    this.canvasMetadata = null;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.nodes = createDefaultNodes();
    this.lines = createDefaultLines();
    this.selectedNodeId = "start";
    this.selectedNodeIds = ["start"];
    this.inlineEditingNodeId = null;
    this.nextNodeSerial = 1;
    this.dragMode = "none";
    this.activeNodeId = null;
    this.lastNodePointerDownId = null;
    this.lastNodePointerDownAt = 0;
    this.lastNodePointerDownX = 0;
    this.lastNodePointerDownY = 0;
    this.lastNodeActivationId = null;
    this.lastNodeActivationAt = 0;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragOriginNodeX = 0;
    this.dragOriginNodeY = 0;
    this.dragOriginNodePositions = /* @__PURE__ */ new Map();
    this.resizeDirection = null;
    this.resizeOriginNodeX = 0;
    this.resizeOriginNodeY = 0;
    this.resizeOriginWidth = CARD_WIDTH;
    this.resizeOriginHeight = CARD_HEIGHT;
    this.dragOriginOffsetX = 0;
    this.dragOriginOffsetY = 0;
    this.dropTargetGroupId = null;
    this.interactionOriginClientX = 0;
    this.interactionOriginClientY = 0;
    this.lastViewportWidth = 0;
    this.lastViewportHeight = 0;
    this.selectionStartSceneX = 0;
    this.selectionStartSceneY = 0;
    this.selectionCurrentSceneX = 0;
    this.selectionCurrentSceneY = 0;
    this.pointerCaptureOwnerEl = null;
    this.spacePanPressed = false;
    this.boxSelectionEnabled = true;
    this.persistentSelectionBoxActive = false;
    this.sceneFileExists = false;
    this.lastSavedAt = null;
    this.lastLoadedAt = null;
    this.sceneFileMessage = "\u72EC\u7ACB\u573A\u666F\u6587\u4EF6\u5C1A\u672A\u521B\u5EFA\u3002";
    this.autoSaveState = "idle";
    this.autoSaveErrorMessage = null;
    this.autoSaveHandle = null;
    this.recoveryMode = "normal";
    this.recoveryErrorMessage = null;
    this.recoveryRawContent = null;
    this.recoveryTextVisible = false;
    this.rootEl = null;
    this.viewportEl = null;
    this.sceneEl = null;
    this.selectionBoxEl = null;
    this.summaryEl = null;
    this.scaleEl = null;
    this.sourceEl = null;
    this.recoveryPanelEl = null;
    this.recoveryTitleEl = null;
    this.recoveryMessageEl = null;
    this.recoveryToggleRawEl = null;
    this.recoveryRawTextEl = null;
    this.boxSelectionChipEl = null;
    this.selectedMetaEl = null;
    this.titleInputEl = null;
    this.urlLabelEl = null;
    this.urlInputEl = null;
    this.bodyLabelEl = null;
    this.bodyInputEl = null;
    this.fileMetaEl = null;
    this.recentFilesEl = null;
    this.allFilesEl = null;
    this.nodeRuntimes = /* @__PURE__ */ new Map();
    this.lineRuntimes = /* @__PURE__ */ new Map();
    this.urlPreviewStates = /* @__PURE__ */ new Map();
    this.icon = "layout-dashboard";
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      this.handleVaultRename(file, oldPath);
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      this.syncFileReferenceStatusForPath(file.path);
    }));
    this.registerEvent(this.app.vault.on("create", (file) => {
      this.syncFileReferenceStatusForPath(file.path);
    }));
  }
  getViewType() {
    return DEMO_VIEW_TYPE;
  }
  getDisplayText() {
    const fileName = this.canvasFilePath.split("/").filter((segment) => segment.length > 0).at(-1) ?? "";
    return fileName.length > 0 ? fileName : DEMO_TITLE;
  }
  getState() {
    return {
      file: this.canvasFilePath,
      source: this.source,
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      selectedNodeId: this.selectedNodeId,
      nextNodeSerial: this.nextNodeSerial,
      nodes: this.nodes.map((node) => ({
        id: node.id,
        title: node.title,
        body: node.body,
        accent: node.accent,
        shadow: node.shadow,
        x: node.x,
        y: node.y,
        type: node.type,
        ...node.targetPath === void 0 ? {} : { targetPath: node.targetPath },
        ...node.url === void 0 ? {} : { url: node.url },
        ...node.width === void 0 ? {} : { width: node.width },
        ...node.height === void 0 ? {} : { height: node.height },
        ...node.groupId === void 0 ? {} : { groupId: node.groupId }
      })),
      lines: this.lines.map((line) => ({
        id: line.id,
        from: line.from,
        to: line.to,
        label: line.label
      })),
      sceneFileExists: this.sceneFileExists,
      lastSavedAt: this.lastSavedAt,
      lastLoadedAt: this.lastLoadedAt,
      sceneFileMessage: this.sceneFileMessage,
      recoveryMode: this.recoveryMode,
      recoveryErrorMessage: this.recoveryErrorMessage
    };
  }
  async setState(state, _result) {
    const nextSource = readStringValue(state, "source", this.source);
    const nextFilePath = readStringValue(state, "file", this.canvasFilePath);
    const hasExplicitScene = Array.isArray(state.nodes) && Array.isArray(state.lines);
    let snapshot = createSceneSnapshotFromState(state, nextSource);
    let sceneFileExists = readBooleanValue(state, "sceneFileExists", this.sceneFileExists);
    let lastSavedAt = readNullableStringValue(state, "lastSavedAt", this.lastSavedAt);
    let lastLoadedAt = readNullableStringValue(state, "lastLoadedAt", this.lastLoadedAt);
    let sceneFileMessage = readStringValue(state, "sceneFileMessage", this.sceneFileMessage);
    let canvasMetadata = this.canvasMetadata;
    let recoveryMode = "normal";
    let recoveryErrorMessage = null;
    let recoveryRawContent = null;
    this.source = nextSource;
    this.canvasFilePath = nextFilePath;
    this.canvasFile = this.app.vault.getFileByPath(nextFilePath);
    if (!hasExplicitScene) {
      try {
        const fileSnapshot = await this.readSnapshotFromCanvasFile(nextFilePath, nextSource);
        if (fileSnapshot !== null) {
          snapshot = fileSnapshot.snapshot;
          canvasMetadata = fileSnapshot.metadata;
          sceneFileExists = true;
          lastLoadedAt = formatTimestamp(/* @__PURE__ */ new Date());
          sceneFileMessage = `\u5DF2\u4ECE ${nextFilePath} \u52A0\u8F7D\u767D\u677F\u6587\u4EF6\u3002`;
        } else {
          snapshot = createInitialViewState(nextSource);
          canvasMetadata = null;
          sceneFileExists = false;
          sceneFileMessage = "\u5F53\u524D\u767D\u677F\u6587\u4EF6\u5C1A\u672A\u521B\u5EFA\uFF0C\u5DF2\u56DE\u9000\u5230\u9ED8\u8BA4\u753B\u5E03\u3002";
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "\u672A\u77E5\u9519\u8BEF";
        snapshot = createInitialViewState(`\u6062\u590D\u5931\u8D25\uFF1A${nextSource}`);
        canvasMetadata = null;
        sceneFileExists = this.app.vault.getFileByPath(nextFilePath) !== null;
        lastLoadedAt = null;
        sceneFileMessage = `\u767D\u677F\u6587\u4EF6\u6062\u590D\u5931\u8D25\uFF0C\u5DF2\u8FDB\u5165\u53EA\u8BFB\u6062\u590D\u6A21\u5F0F\uFF1A${errorMessage}`;
        recoveryMode = "invalid";
        recoveryErrorMessage = errorMessage;
        recoveryRawContent = await this.readCanvasRawContent(nextFilePath);
      }
    }
    this.applySnapshot(snapshot);
    this.canvasMetadata = canvasMetadata;
    this.sceneFileExists = sceneFileExists;
    this.lastSavedAt = lastSavedAt;
    this.lastLoadedAt = lastLoadedAt;
    this.sceneFileMessage = sceneFileMessage;
    this.recoveryMode = recoveryMode;
    this.recoveryErrorMessage = recoveryErrorMessage;
    this.recoveryRawContent = recoveryRawContent;
    this.recoveryTextVisible = false;
    this.autoSaveState = recoveryMode === "normal" ? sceneFileExists ? "saved" : "idle" : "error";
    this.autoSaveErrorMessage = recoveryMode === "normal" ? null : recoveryErrorMessage;
    this.cancelAutoSaveHandle();
    this.ensureViewDom();
    this.syncScene();
  }
  onOpen() {
    this.ensureViewDom();
    this.syncScene();
    void this.refreshSceneFileStatus();
  }
  onClose() {
    if (this.autoSaveHandle !== null) {
      void this.flushAutoSave("\u5173\u95ED\u89C6\u56FE\u524D\u81EA\u52A8\u4FDD\u5B58", "\u5173\u95ED\u89C6\u56FE\u524D\u5DF2\u81EA\u52A8\u4FDD\u5B58\u5230");
    }
    this.finishPointerInteraction();
    this.contentEl.replaceChildren();
  }
  applySnapshot(snapshot) {
    this.source = snapshot.source;
    this.scale = snapshot.scale;
    this.offsetX = snapshot.offsetX;
    this.offsetY = snapshot.offsetY;
    this.nodes = snapshot.nodes;
    this.lines = snapshot.lines;
    this.selectedNodeId = snapshot.selectedNodeId;
    this.selectedNodeIds = snapshot.selectedNodeId === null ? [] : [snapshot.selectedNodeId];
    this.persistentSelectionBoxActive = false;
    this.nextNodeSerial = snapshot.nextNodeSerial;
    this.expandGroupsToFitMembers(this.nodes.filter((node) => node.type === "group").map((node) => node.id));
    if (this.selectedNodeId !== null && this.nodes.every((node) => node.id !== this.selectedNodeId)) {
      this.selectedNodeId = this.nodes[0]?.id ?? null;
      this.selectedNodeIds = this.selectedNodeId === null ? [] : [this.selectedNodeId];
    }
    if (this.inlineEditingNodeId !== null && this.nodes.every((node) => node.id !== this.inlineEditingNodeId)) {
      this.inlineEditingNodeId = null;
    }
  }
  async readSnapshotFromCanvasFile(filePath, fallbackSource) {
    const file = this.app.vault.getFileByPath(filePath);
    if (file === null) {
      this.canvasMetadata = null;
      this.canvasFile = null;
      return null;
    }
    this.canvasFile = file;
    const raw = await this.app.vault.read(file);
    return parseCanvasDocument(raw, filePath, fallbackSource);
  }
  async readCanvasRawContent(filePath) {
    const file = this.app.vault.getFileByPath(filePath);
    if (file === null) {
      return null;
    }
    try {
      return await this.app.vault.read(file);
    } catch {
      return null;
    }
  }
  isCanvasReadOnly() {
    return this.recoveryMode !== "normal";
  }
  clearCanvasRecoveryState() {
    this.recoveryMode = "normal";
    this.recoveryErrorMessage = null;
    this.recoveryRawContent = null;
    this.recoveryTextVisible = false;
  }
  enterInvalidCanvasRecovery(errorMessage, rawContent) {
    this.recoveryMode = "invalid";
    this.recoveryErrorMessage = errorMessage;
    this.recoveryRawContent = rawContent;
    this.recoveryTextVisible = false;
    this.autoSaveState = "error";
    this.autoSaveErrorMessage = errorMessage;
    this.sceneFileMessage = `\u767D\u677F\u6587\u4EF6\u6062\u590D\u5931\u8D25\uFF0C\u5DF2\u8FDB\u5165\u53EA\u8BFB\u6062\u590D\u6A21\u5F0F\uFF1A${errorMessage}`;
  }
  enterReadOnlyCanvasRecovery(errorMessage) {
    this.recoveryMode = "readonly";
    this.recoveryErrorMessage = errorMessage;
    this.recoveryRawContent = null;
    this.recoveryTextVisible = false;
    this.autoSaveState = "error";
    this.autoSaveErrorMessage = errorMessage;
    this.sceneFileMessage = `\u767D\u677F\u5DF2\u8FDB\u5165\u53EA\u8BFB\u4FDD\u62A4\uFF1A${errorMessage}`;
  }
  guardWritableCanvas(actionLabel) {
    if (!this.isCanvasReadOnly()) {
      return true;
    }
    new import_plugin.Notice(`${DEMO_TITLE}\uFF1A\u5F53\u524D\u767D\u677F\u5904\u4E8E\u53EA\u8BFB\u6062\u590D\u6A21\u5F0F\uFF0C\u4E0D\u80FD${actionLabel}\u3002\u8BF7\u5148\u4FEE\u590D\u6587\u4EF6\u540E\u91CD\u65B0\u52A0\u8F7D\uFF0C\u6216\u65B0\u5EFA\u767D\u677F\u6587\u4EF6\u3002`, 2800);
    this.syncScene({
      recovery: true,
      file: true,
      summary: true,
      inspector: true
    });
    return false;
  }
  resetScene() {
    if (!this.guardWritableCanvas("\u91CD\u7F6E\u753B\u5E03")) {
      return;
    }
    const nextState = createInitialViewState(this.source);
    this.applySnapshot(nextState);
    this.finishPointerInteraction();
    this.markSceneChanged({
      syncStructure: true,
      viewport: true,
      selectionBox: true,
      scale: true,
      source: true,
      summary: true,
      inspector: true,
      file: true
    });
  }
  listWorkspaceFilesForNodeType(nodeType) {
    const files = nodeType === "note" ? this.app.vault.getMarkdownFiles() : this.app.vault.getFiles();
    return [...files].sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
  }
  openWorkspaceFileNodePicker(nodeType, scenePosition, anchorNode) {
    const files = this.listWorkspaceFilesForNodeType(nodeType);
    if (files.length === 0) {
      new import_plugin.Notice(
        nodeType === "note" ? `${DEMO_TITLE}: \u5F53\u524D\u5DE5\u4F5C\u533A\u6CA1\u6709\u53EF\u9009\u62E9\u7684 Markdown \u7B14\u8BB0\u3002` : `${DEMO_TITLE}: \u5F53\u524D\u5DE5\u4F5C\u533A\u6CA1\u6709\u53EF\u9009\u62E9\u7684\u6587\u4EF6\u3002`,
        2400
      );
      return;
    }
    const modal = new WorkspaceFileNodeSuggestModal(
      this.app,
      nodeType,
      files,
      (file) => {
        void this.addWorkspaceFileNode(file, nodeType, scenePosition, anchorNode);
      }
    );
    modal.open();
  }
  openUrlNodeAddressPicker(scenePosition, anchorNode) {
    const modal = new UrlNodeAddressSuggestModal(
      this.app,
      "\u65B0\u589E URL \u8282\u70B9",
      "\u521B\u5EFA URL \u8282\u70B9",
      void 0,
      (url) => {
        this.addUrlNode(url, scenePosition, anchorNode);
      }
    );
    modal.open();
  }
  openUrlNodeAddressEditor(node) {
    if (node.type !== "url") {
      return;
    }
    if (!this.guardWritableCanvas("\u7F16\u8F91 URL \u5730\u5740")) {
      return;
    }
    const modal = new UrlNodeAddressSuggestModal(
      this.app,
      "\u4FEE\u6539 URL \u5730\u5740",
      "\u66F4\u65B0 URL \u5730\u5740",
      node.url,
      (url) => {
        this.updateUrlNodeAddress(node.id, url);
      }
    );
    modal.open();
  }
  updateUrlNodeAddress(nodeId, url) {
    if (!this.guardWritableCanvas("\u7F16\u8F91 URL \u5730\u5740")) {
      return;
    }
    const nextUrl = normalizeExternalUrlInput(url);
    if (nextUrl === null) {
      new import_plugin.Notice(`${DEMO_TITLE}: URL \u8282\u70B9\u94FE\u63A5\u65E0\u6548\u3002`, 2200);
      return;
    }
    const targetNode = this.nodes.find((node) => node.id === nodeId) ?? null;
    if (targetNode === null || targetNode.type !== "url" || targetNode.url === nextUrl) {
      return;
    }
    this.urlPreviewStates.delete(nodeId);
    this.nodes = this.nodes.map((node) => {
      if (node.id !== nodeId || node.type !== "url") {
        return node;
      }
      return {
        ...node,
        body: "",
        url: nextUrl
      };
    });
    this.setSelectedNodes([nodeId], nodeId);
    this.inlineEditingNodeId = null;
    this.markSceneChanged({
      nodeIds: [nodeId],
      summary: true,
      inspector: true
    });
  }
  addUrlNode(url, scenePosition, anchorNode) {
    if (!this.guardWritableCanvas("\u65B0\u589E URL \u8282\u70B9")) {
      return;
    }
    const accent = createNodeAccent(this.nextNodeSerial);
    const nextNodeId = `node-${this.nextNodeSerial}`;
    const nodeContent = createNodeContent("url", this.nextNodeSerial, anchorNode?.title);
    const shouldCenterViewport = scenePosition === void 0 && anchorNode === null;
    const nextPosition = scenePosition ?? (anchorNode === null ? this.resolveCenteredScenePosition("url") : { x: anchorNode.x + 320, y: anchorNode.y + 140 });
    const nextNode = {
      id: nextNodeId,
      type: "url",
      title: nodeContent.title,
      body: "",
      accent: accent.accent,
      shadow: accent.shadow,
      x: nextPosition.x,
      y: nextPosition.y,
      url
    };
    const nextLine = anchorNode === null ? null : {
      id: `line-${anchorNode.id}-${nextNodeId}`,
      from: anchorNode.id,
      to: nextNodeId,
      label: "\u65B0\u5EFA\u8FDE\u7EBF"
    };
    this.nextNodeSerial += 1;
    this.nodes = [...this.nodes, nextNode];
    this.lines = nextLine === null ? this.lines : [...this.lines, nextLine];
    this.setSelectedNodes([nextNodeId], nextNodeId);
    if (shouldCenterViewport) {
      this.centerViewportOnNode(nextNode);
    }
    this.markSceneChanged({
      syncStructure: true,
      viewport: shouldCenterViewport,
      summary: true,
      inspector: true
    });
  }
  async createWorkspaceFileNodeBody(file, nodeType, anchorNode) {
    const anchorSuffix = anchorNode === null ? "" : `\uFF0C\u4ECE\u201C${anchorNode.title}\u201D\u8FDE\u63A5`;
    if (nodeType === "file") {
      return `\u5DF2\u94FE\u63A5\u5F53\u524D\u5DE5\u4F5C\u533A\u6587\u4EF6\uFF1A${file.path}${anchorSuffix}`;
    }
    try {
      const raw = await this.app.vault.cachedRead(file);
      return createPlainTextPreview(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : "\u672A\u77E5\u9519\u8BEF";
      new import_plugin.Notice(`${DEMO_TITLE}: \u8BFB\u53D6\u7B14\u8BB0\u9884\u89C8\u5931\u8D25\uFF1A${message}`, 2400);
      return `\u5DF2\u94FE\u63A5\u5F53\u524D\u5DE5\u4F5C\u533A\u7B14\u8BB0\uFF1A${file.path}${anchorSuffix}`;
    }
  }
  async addWorkspaceFileNode(file, nodeType, scenePosition, anchorNode) {
    if (!this.guardWritableCanvas("\u65B0\u589E\u6587\u4EF6\u8282\u70B9")) {
      return;
    }
    const serial = this.nextNodeSerial;
    const accent = createNodeAccent(serial);
    const nextNodeId = `node-${serial}`;
    const nextBody = await this.createWorkspaceFileNodeBody(file, nodeType, anchorNode);
    const shouldCenterViewport = scenePosition === void 0 && anchorNode === null;
    const nextPosition = scenePosition ?? (anchorNode === null ? this.resolveCenteredScenePosition(nodeType) : { x: anchorNode.x + 320, y: anchorNode.y + 140 });
    const nextNode = {
      id: nextNodeId,
      type: nodeType,
      title: file.basename.length > 0 ? file.basename : file.name,
      body: nextBody,
      accent: accent.accent,
      shadow: accent.shadow,
      x: nextPosition.x,
      y: nextPosition.y,
      targetPath: file.path
    };
    this.nextNodeSerial += 1;
    this.nodes = [...this.nodes, nextNode];
    if (shouldCenterViewport) {
      this.centerViewportOnNode(nextNode);
    }
    if (anchorNode !== null) {
      this.lines = [
        ...this.lines,
        {
          id: `line-${anchorNode.id}-${nextNodeId}`,
          from: anchorNode.id,
          to: nextNodeId,
          label: "\u65B0\u5EFA\u8FDE\u7EBF"
        }
      ];
    }
    this.setSelectedNodes([nextNodeId], nextNodeId);
    this.markSceneChanged({
      syncStructure: true,
      viewport: shouldCenterViewport,
      summary: true,
      inspector: true
    });
  }
  resolveWorkspaceFileNodeType(file) {
    return file.extension.toLowerCase() === "md" ? "note" : "file";
  }
  resolveTargetPathAfterVaultRename(targetPath, oldPath, newPath) {
    if (targetPath === oldPath) {
      return newPath;
    }
    const oldPathPrefix = `${oldPath}/`;
    if (!targetPath.startsWith(oldPathPrefix)) {
      return null;
    }
    return `${newPath}/${targetPath.slice(oldPathPrefix.length)}`;
  }
  resolveNodeTitleAfterVaultRename(node, oldPath, nextFile) {
    if (nextFile === null) {
      return node.title;
    }
    const oldFileName = extractPathFileName(oldPath);
    const oldBasename = extractPathBasename(oldPath);
    if (node.title !== oldFileName && node.title !== oldBasename && node.title.trim().length > 0) {
      return node.title;
    }
    return nextFile.basename.length > 0 ? nextFile.basename : nextFile.name;
  }
  handleVaultRename(file, oldPath) {
    const changedNodeIds = [];
    this.nodes = this.nodes.map((node) => {
      if (!isWorkspaceFileNode(node) || node.targetPath === void 0) {
        return node;
      }
      const nextTargetPath = this.resolveTargetPathAfterVaultRename(node.targetPath, oldPath, file.path);
      if (nextTargetPath === null) {
        return node;
      }
      const nextFile = this.app.vault.getFileByPath(nextTargetPath);
      changedNodeIds.push(node.id);
      return {
        ...node,
        title: this.resolveNodeTitleAfterVaultRename(node, oldPath, nextFile),
        targetPath: nextTargetPath
      };
    });
    if (changedNodeIds.length === 0) {
      return;
    }
    this.markSceneChanged({
      nodeIds: changedNodeIds,
      summary: true,
      inspector: true
    });
  }
  syncFileReferenceStatusForPath(path) {
    const affectedNodeIds = this.nodes.filter((node) => isWorkspaceFileNode(node) && node.targetPath !== void 0 && (node.targetPath === path || node.targetPath.startsWith(`${path}/`))).map((node) => node.id);
    if (affectedNodeIds.length === 0) {
      return;
    }
    this.syncScene({
      nodeIds: affectedNodeIds,
      inspector: true,
      summary: true
    });
  }
  canAcceptWorkspaceFileDrop(dataTransfer) {
    if (dataTransfer === null) {
      return false;
    }
    const dragPayloadTypes = Array.from(dataTransfer.types);
    return dragPayloadTypes.includes(WORKSPACE_FILE_DRAG_MIME_TYPE) || dragPayloadTypes.includes("text/plain") || dragPayloadTypes.includes("text/uri-list");
  }
  resolveWorkspaceFileFromDrop(dataTransfer) {
    if (dataTransfer === null) {
      return null;
    }
    const droppedPath = readDroppedWorkspacePath(dataTransfer);
    if (droppedPath === null) {
      return null;
    }
    return this.app.vault.getFileByPath(droppedPath);
  }
  resolveScenePointFromMouseEvent(event) {
    const viewportLocal = this.resolveViewportLocalPoint(event, false);
    if (viewportLocal === null) {
      return null;
    }
    return this.resolveScenePointFromViewportLocal(viewportLocal);
  }
  captureViewportMetricsFromEvent(event) {
    const surfaceWidth = readAugmentedEventNumber(event, "surfaceWidth");
    const surfaceHeight = readAugmentedEventNumber(event, "surfaceHeight");
    if (surfaceWidth !== null && surfaceWidth > 0) {
      this.lastViewportWidth = surfaceWidth;
    }
    if (surfaceHeight !== null && surfaceHeight > 0) {
      this.lastViewportHeight = surfaceHeight;
    }
  }
  resolvePreferredViewportCenterLocalPoint() {
    const viewportWidth = Math.max(
      this.lastViewportWidth,
      this.viewportEl?.clientWidth ?? 0,
      CARD_WIDTH
    );
    const viewportHeight = Math.max(
      this.lastViewportHeight,
      this.viewportEl?.clientHeight ?? 0,
      CARD_HEIGHT
    );
    const reservedRightWidth = Math.min(
      viewportWidth / 3,
      FLOATING_PANEL_WIDTH + FLOATING_PANEL_INSET * 2
    );
    const usableWidth = Math.max(viewportWidth - reservedRightWidth, CARD_WIDTH);
    return {
      x: usableWidth / 2,
      y: viewportHeight / 2
    };
  }
  resolveCenteredScenePosition(nodeType) {
    const viewportCenter = this.resolvePreferredViewportCenterLocalPoint();
    const sceneCenter = this.resolveScenePointFromViewportLocal(viewportCenter);
    const nodeWidthValue = defaultNodeWidthForType(nodeType);
    const nodeHeightValue = defaultNodeHeightForType(nodeType);
    return {
      x: sceneCenter.x - nodeWidthValue / 2,
      y: sceneCenter.y - nodeHeightValue / 2
    };
  }
  centerViewportOnNode(node) {
    const viewportCenter = this.resolvePreferredViewportCenterLocalPoint();
    this.offsetX = viewportCenter.x - nodeCenterX(node) * this.scale;
    this.offsetY = viewportCenter.y - nodeCenterY(node) * this.scale;
  }
  focusInlineTitleInput(inputEl) {
    const compatibleInput = inputEl;
    if (typeof compatibleInput.focus === "function") {
      try {
        compatibleInput.focus({ preventScroll: true });
      } catch {
        compatibleInput.focus();
      }
    }
    if (typeof compatibleInput.setSelectionRange === "function") {
      const cursorOffset = compatibleInput.value.length;
      compatibleInput.setSelectionRange(cursorOffset, cursorOffset);
      return;
    }
    compatibleInput.select?.();
  }
  focusInlineEditorForNode(nodeId) {
    setTimeout(() => {
      const nodeRuntime = this.nodeRuntimes.get(nodeId) ?? null;
      if (nodeRuntime === null) {
        return;
      }
      this.focusInlineTitleInput(nodeRuntime.inlineTitleInputEl);
    }, 0);
  }
  focusElementWithoutScroll(target) {
    if (target === null) {
      return;
    }
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
  }
  bringNodeIdsToFront(nodeIds) {
    if (nodeIds.length === 0) {
      return false;
    }
    const targetNodeIds = new Set(nodeIds);
    const nextNodes = [
      ...this.nodes.filter((node) => !targetNodeIds.has(node.id)),
      ...this.nodes.filter((node) => targetNodeIds.has(node.id))
    ];
    if (nextNodes.length === this.nodes.length && nextNodes.every((node, index) => node.id === this.nodes[index]?.id)) {
      return false;
    }
    this.nodes = nextNodes;
    return true;
  }
  resolveTextNodeRequiredHeight(nodeId) {
    const runtime = this.nodeRuntimes.get(nodeId) ?? null;
    if (runtime === null || !(runtime.inlineTitleInputEl instanceof HTMLTextAreaElement)) {
      return null;
    }
    return Math.ceil(runtime.inlineTitleInputEl.scrollHeight) > TEXT_NODE_LINE_HEIGHT ? TEXT_NODE_MULTI_LINE_HEIGHT : TEXT_NODE_HEIGHT;
  }
  resolveMinimumNodeHeight(node) {
    if (node.type !== "text") {
      return minNodeHeightForType(node.type);
    }
    return this.resolveTextNodeRequiredHeight(node.id) ?? TEXT_NODE_HEIGHT;
  }
  syncTextNodeDisplayViewport(node, runtime, isInlineEditing) {
    if (node.type !== "text" || !(runtime.inlineTitleInputEl instanceof HTMLTextAreaElement)) {
      return;
    }
    runtime.inlineTitleInputEl.style.overflowY = isInlineEditing && nodeHeight(node) > TEXT_NODE_HEIGHT ? "auto" : "hidden";
    if (isInlineEditing) {
      return;
    }
    runtime.inlineTitleInputEl.scrollTop = runtime.inlineTitleInputEl.scrollHeight;
  }
  expandTextNodeToFitContent(nodeId) {
    const node = this.nodes.find((item) => item.id === nodeId) ?? null;
    if (node === null || node.type !== "text") {
      return [];
    }
    const requiredHeight = this.resolveTextNodeRequiredHeight(nodeId);
    if (requiredHeight === null || nodeHeight(node) >= requiredHeight) {
      return [];
    }
    this.nodes = this.nodes.map((item) => {
      if (item.id !== nodeId) {
        return item;
      }
      return {
        ...item,
        height: requiredHeight
      };
    });
    const expandedGroupIds = this.expandGroupsToFitMembers(this.collectParentGroupIdsForNodes([nodeId]));
    return [nodeId, ...expandedGroupIds];
  }
  syncViewportCursor() {
    if (this.viewportEl === null) {
      return;
    }
    if (this.dragMode === "pan" || this.dragMode === "selection-box") {
      this.viewportEl.style.cursor = "grabbing";
      return;
    }
    if (this.dragMode === "select") {
      this.viewportEl.style.cursor = "crosshair";
      return;
    }
    if (this.spacePanPressed) {
      this.viewportEl.style.cursor = "grab";
      return;
    }
    this.viewportEl.style.cursor = "default";
  }
  canDragPersistentSelectionBox() {
    return this.persistentSelectionBoxActive && this.selectedNodeIds.length > 1 && !this.isCanvasReadOnly() && this.inlineEditingNodeId === null;
  }
  resolveResizeDirectionForNodeEvent(event, node, isInlineEditing, isReadOnly) {
    if (isInlineEditing || isReadOnly) {
      return null;
    }
    const elementX = readAugmentedEventNumber(event, "elementX");
    const elementY = readAugmentedEventNumber(event, "elementY");
    if (elementX === null || elementY === null) {
      return null;
    }
    return resolveResizeDirectionFromLocalPoint(
      elementX,
      elementY,
      nodeWidth(node),
      nodeHeight(node),
      resolveResizeHitAreaMetrics(node)
    );
  }
  startNodeResizeInteraction(event, nodeId, currentNode, direction, pointerOwnerEl) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.guardWritableCanvas("\u8C03\u6574\u8282\u70B9\u5927\u5C0F")) {
      return;
    }
    const previousSelection = this.captureSelectionSnapshot();
    const zOrderChanged = this.bringNodeIdsToFront([nodeId]);
    this.setSelectedNodes([nodeId], nodeId);
    this.inlineEditingNodeId = null;
    this.activeNodeId = nodeId;
    this.dragMode = "resize";
    this.resizeDirection = direction;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.resizeOriginNodeX = currentNode.x;
    this.resizeOriginNodeY = currentNode.y;
    this.resizeOriginWidth = nodeWidth(currentNode);
    this.resizeOriginHeight = nodeHeight(currentNode);
    this.pointerCaptureOwnerEl = pointerOwnerEl;
    pointerOwnerEl.setPointerCapture(HOST_MOUSE_POINTER_ID);
    pointerOwnerEl.style.cursor = resolveResizeCursor(direction);
    this.syncScene({
      syncStructure: zOrderChanged,
      nodeIds: this.collectSelectionAffectedNodeIds(previousSelection),
      inspector: true,
      summary: true
    });
  }
  applyResizeHitAreaLayout(targetEl, direction, metrics) {
    const frameOutset = metrics.frameOutset;
    const edgeSize = metrics.edgeHitSize * 2;
    const edgeSpan = edgeSize + frameOutset;
    const cornerSpan = metrics.cornerHitSize + frameOutset;
    const edgeInset = cornerSpan;
    targetEl.style.position = "absolute";
    targetEl.style.background = "transparent";
    targetEl.style.zIndex = "6";
    targetEl.style.cursor = resolveResizeCursor(direction);
    targetEl.style.pointerEvents = "auto";
    switch (direction) {
      case "n":
        targetEl.style.left = `${edgeInset}px`;
        targetEl.style.right = `${edgeInset}px`;
        targetEl.style.top = "0";
        targetEl.style.height = `${edgeSpan}px`;
        return;
      case "s":
        targetEl.style.left = `${edgeInset}px`;
        targetEl.style.right = `${edgeInset}px`;
        targetEl.style.bottom = "0";
        targetEl.style.height = `${edgeSpan}px`;
        return;
      case "e":
        targetEl.style.top = `${edgeInset}px`;
        targetEl.style.bottom = `${edgeInset}px`;
        targetEl.style.right = "0";
        targetEl.style.width = `${edgeSpan}px`;
        return;
      case "w":
        targetEl.style.top = `${edgeInset}px`;
        targetEl.style.bottom = `${edgeInset}px`;
        targetEl.style.left = "0";
        targetEl.style.width = `${edgeSpan}px`;
        return;
      case "ne":
        targetEl.style.top = "0";
        targetEl.style.right = "0";
        targetEl.style.width = `${cornerSpan}px`;
        targetEl.style.height = `${cornerSpan}px`;
        return;
      case "nw":
        targetEl.style.top = "0";
        targetEl.style.left = "0";
        targetEl.style.width = `${cornerSpan}px`;
        targetEl.style.height = `${cornerSpan}px`;
        return;
      case "se":
        targetEl.style.right = "0";
        targetEl.style.bottom = "0";
        targetEl.style.width = `${cornerSpan}px`;
        targetEl.style.height = `${cornerSpan}px`;
        return;
      case "sw":
        targetEl.style.left = "0";
        targetEl.style.bottom = "0";
        targetEl.style.width = `${cornerSpan}px`;
        targetEl.style.height = `${cornerSpan}px`;
        return;
    }
  }
  resolveNodeCursor(_isSelected, isInlineEditing, isReadOnly) {
    if (isReadOnly) {
      return "not-allowed";
    }
    if (!isInlineEditing) {
      return "default";
    }
    return "default";
  }
  releaseSpacePanPress() {
    if (!this.spacePanPressed) {
      return;
    }
    this.spacePanPressed = false;
    if (this.dragMode === "pan") {
      this.finishPointerInteraction();
      return;
    }
    this.syncViewportCursor();
  }
  handleWorkspaceFileDragOver(event) {
    if (!this.canAcceptWorkspaceFileDrop(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer !== null) {
      event.dataTransfer.dropEffect = event.dataTransfer.effectAllowed === "move" ? "move" : "copy";
    }
  }
  handleWorkspaceFileDrop(event) {
    if (!this.canAcceptWorkspaceFileDrop(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const file = this.resolveWorkspaceFileFromDrop(event.dataTransfer);
    if (file === null) {
      new import_plugin.Notice(`${DEMO_TITLE}: \u62D6\u5165\u9879\u4E0D\u662F\u5F53\u524D\u5DE5\u4F5C\u533A\u6587\u4EF6\uFF0C\u65E0\u6CD5\u521B\u5EFA\u767D\u677F\u8282\u70B9\u3002`, 2400);
      return;
    }
    const scenePoint = this.resolveScenePointFromMouseEvent(event);
    void this.addWorkspaceFileNode(
      file,
      this.resolveWorkspaceFileNodeType(file),
      scenePoint ?? void 0,
      null
    );
  }
  addStandaloneNode(scenePosition, nodeType = "text") {
    if (!this.guardWritableCanvas("\u65B0\u589E\u8282\u70B9")) {
      return;
    }
    if (nodeType === "note" || nodeType === "file") {
      this.openWorkspaceFileNodePicker(nodeType, scenePosition, null);
      return;
    }
    if (nodeType === "url") {
      this.openUrlNodeAddressPicker(scenePosition, null);
      return;
    }
    const accent = createNodeAccent(this.nextNodeSerial);
    const nodeContent = createNodeContent(nodeType, this.nextNodeSerial);
    const nextPosition = scenePosition ?? this.resolveCenteredScenePosition(nodeType);
    const shouldCenterViewport = scenePosition === void 0;
    const nextNode = {
      id: `node-${this.nextNodeSerial}`,
      type: nodeType,
      title: nodeContent.title,
      body: nodeType === "group" ? "" : nodeContent.body,
      accent: accent.accent,
      shadow: accent.shadow,
      x: nextPosition.x,
      y: nextPosition.y,
      ...nodeContent.targetPath === void 0 ? {} : { targetPath: nodeContent.targetPath },
      ...nodeContent.url === void 0 ? {} : { url: nodeContent.url },
      ...nodeType === "group" ? { width: GROUP_NODE_WIDTH, height: GROUP_NODE_HEIGHT } : {}
    };
    this.nextNodeSerial += 1;
    this.nodes = [...this.nodes, nextNode];
    this.setSelectedNodes([nextNode.id], nextNode.id);
    if (shouldCenterViewport) {
      this.centerViewportOnNode(nextNode);
    }
    if (nodeType === "text") {
      this.inlineEditingNodeId = nextNode.id;
    }
    this.markSceneChanged({
      syncStructure: true,
      viewport: shouldCenterViewport,
      summary: true,
      inspector: true
    });
    if (nodeType === "text") {
      this.focusInlineEditorForNode(nextNode.id);
    }
  }
  addConnectedNode(scenePosition, nodeType = "text") {
    if (!this.guardWritableCanvas("\u65B0\u589E\u8FDE\u63A5\u8282\u70B9")) {
      return;
    }
    const anchorNode = this.resolveSelectedNode() ?? this.nodes[this.nodes.length - 1] ?? null;
    if (nodeType === "note" || nodeType === "file") {
      this.openWorkspaceFileNodePicker(nodeType, scenePosition, anchorNode);
      return;
    }
    if (nodeType === "url") {
      if (anchorNode === null) {
        this.openUrlNodeAddressPicker(scenePosition, null);
        return;
      }
      this.openUrlNodeAddressPicker(scenePosition, anchorNode);
      return;
    }
    if (anchorNode === null) {
      this.addStandaloneNode(scenePosition, nodeType);
      return;
    }
    const accent = createNodeAccent(this.nextNodeSerial);
    const nextNodeId = `node-${this.nextNodeSerial}`;
    const nodeContent = createNodeContent(nodeType, this.nextNodeSerial, anchorNode.title);
    const nextPosition = scenePosition ?? {
      x: anchorNode.x + 320,
      y: anchorNode.y + 140
    };
    const nextNode = {
      id: nextNodeId,
      type: nodeType,
      title: nodeContent.title,
      body: nodeType === "group" ? "" : nodeContent.body,
      accent: accent.accent,
      shadow: accent.shadow,
      x: nextPosition.x,
      y: nextPosition.y,
      ...nodeContent.targetPath === void 0 ? {} : { targetPath: nodeContent.targetPath },
      ...nodeContent.url === void 0 ? {} : { url: nodeContent.url },
      ...nodeType === "group" ? { width: GROUP_NODE_WIDTH, height: GROUP_NODE_HEIGHT } : {}
    };
    const nextLine = {
      id: `line-${anchorNode.id}-${nextNodeId}`,
      from: anchorNode.id,
      to: nextNodeId,
      label: "\u65B0\u5EFA\u8FDE\u7EBF"
    };
    this.nextNodeSerial += 1;
    this.nodes = [...this.nodes, nextNode];
    this.lines = [...this.lines, nextLine];
    this.setSelectedNodes([nextNodeId], nextNodeId);
    if (nodeType === "text") {
      this.inlineEditingNodeId = nextNodeId;
    }
    this.markSceneChanged({
      syncStructure: true,
      summary: true,
      inspector: true
    });
    if (nodeType === "text") {
      this.focusInlineEditorForNode(nextNodeId);
    }
  }
  removeSelectedNode() {
    if (!this.guardWritableCanvas("\u5220\u9664\u8282\u70B9")) {
      return;
    }
    const selectedNode = this.resolveSelectedNode();
    if (selectedNode === null) {
      new import_plugin.Notice(`${DEMO_TITLE}\uFF1A\u8BF7\u5148\u9009\u4E2D\u4E00\u4E2A\u8282\u70B9\u3002`, 1800);
      return;
    }
    const selectedIdSet = new Set(this.selectedNodeIds.length > 0 ? this.selectedNodeIds : [selectedNode.id]);
    const removedGroupIds = new Set(
      this.nodes.filter((node) => selectedIdSet.has(node.id) && node.type === "group").map((node) => node.id)
    );
    this.nodes = this.nodes.filter((node) => !selectedIdSet.has(node.id)).map((node) => node.groupId !== void 0 && removedGroupIds.has(node.groupId) ? this.createNodeWithoutGroupId(node) : node);
    this.lines = this.lines.filter((line) => !selectedIdSet.has(line.from) && !selectedIdSet.has(line.to));
    this.setSelectedNodes(this.nodes[0] === void 0 ? [] : [this.nodes[0].id], this.nodes[0]?.id ?? null);
    this.finishPointerInteraction();
    this.markSceneChanged({
      syncStructure: true,
      summary: true,
      inspector: true
    });
  }
  removeSelectedNodeLines() {
    if (!this.guardWritableCanvas("\u5220\u9664\u8FDE\u7EBF")) {
      return;
    }
    const selectedNode = this.resolveSelectedNode();
    if (selectedNode === null) {
      new import_plugin.Notice(`${DEMO_TITLE}\uFF1A\u8BF7\u5148\u9009\u4E2D\u4E00\u4E2A\u8282\u70B9\u3002`, 1800);
      return;
    }
    const selectedIdSet = new Set(this.selectedNodeIds.length > 0 ? this.selectedNodeIds : [selectedNode.id]);
    this.lines = this.lines.filter((line) => !selectedIdSet.has(line.from) && !selectedIdSet.has(line.to));
    this.markSceneChanged({
      syncStructure: true,
      summary: true,
      inspector: true
    });
  }
  updateSelectedNodeTitle(value) {
    if (!this.guardWritableCanvas("\u7F16\u8F91\u8282\u70B9\u6807\u9898")) {
      return;
    }
    if (this.selectedNodeIds.length !== 1) {
      return;
    }
    const selectedNode = this.resolveSelectedNode();
    if (selectedNode === null) {
      return;
    }
    const nextTitle = value.trim().length > 0 ? value : "";
    if (selectedNode.title === nextTitle) {
      return;
    }
    this.nodes = updateNodeContent(this.nodes, selectedNode.id, {
      title: nextTitle,
      body: selectedNode.body
    });
    const autoExpandedNodeIds = this.expandTextNodeToFitContent(selectedNode.id);
    const changedNodeIds = [.../* @__PURE__ */ new Set([selectedNode.id, ...autoExpandedNodeIds])];
    this.markSceneChanged({
      nodeIds: changedNodeIds,
      lineIds: this.collectLineIdsForNodeIds(changedNodeIds),
      summary: true,
      inspector: true
    });
  }
  updateSelectedNodeBody(value) {
    if (!this.guardWritableCanvas("\u7F16\u8F91\u8282\u70B9\u6B63\u6587")) {
      return;
    }
    if (this.selectedNodeIds.length !== 1) {
      return;
    }
    const selectedNode = this.resolveSelectedNode();
    if (selectedNode === null) {
      return;
    }
    if (selectedNode.type === "group") {
      return;
    }
    if (selectedNode.type === "url") {
      return;
    }
    if (selectedNode.body === value) {
      return;
    }
    this.nodes = updateNodeContent(this.nodes, selectedNode.id, {
      title: selectedNode.title,
      body: value
    });
    this.markSceneChanged({
      nodeIds: [selectedNode.id],
      inspector: true
    });
  }
  updateSelectedNodeUrl(value) {
    if (this.selectedNodeIds.length !== 1) {
      return;
    }
    const selectedNode = this.resolveSelectedNode();
    if (selectedNode === null || selectedNode.type !== "url") {
      return;
    }
    this.updateUrlNodeAddress(selectedNode.id, value);
  }
  async saveSceneFile() {
    if (!this.guardWritableCanvas("\u4FDD\u5B58\u767D\u677F\u6587\u4EF6")) {
      return;
    }
    await this.flushAutoSave("\u624B\u52A8\u4FDD\u5B58", "\u5DF2\u624B\u52A8\u4FDD\u5B58\u5230");
    this.syncScene({
      file: true,
      refreshFileLists: true
    });
  }
  async loadSceneFile() {
    let snapshot = null;
    try {
      snapshot = await this.readSnapshotFromCanvasFile(this.canvasFilePath, "\u4ECE\u767D\u677F\u6587\u4EF6\u52A0\u8F7D");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "\u672A\u77E5\u9519\u8BEF";
      const rawContent = await this.readCanvasRawContent(this.canvasFilePath);
      this.enterInvalidCanvasRecovery(errorMessage, rawContent);
      this.sceneFileExists = this.app.vault.getFileByPath(this.canvasFilePath) !== null;
      this.canvasMetadata = null;
      this.finishPointerInteraction();
      new import_plugin.Notice(`${DEMO_TITLE}\uFF1A\u767D\u677F\u6587\u4EF6\u6062\u590D\u5931\u8D25\uFF0C\u5DF2\u8FDB\u5165\u53EA\u8BFB\u6062\u590D\u6A21\u5F0F\u3002`, 2800);
      this.syncScene();
      return;
    }
    if (snapshot === null) {
      new import_plugin.Notice(`${DEMO_TITLE}\uFF1A\u5F53\u524D\u8FD8\u6CA1\u6709\u767D\u677F\u6587\u4EF6\uFF0C\u8BF7\u5148\u70B9\u51FB\u201C\u4FDD\u5B58\u5230\u6587\u4EF6\u201D\u3002`, 2200);
      this.sceneFileExists = false;
      this.canvasMetadata = null;
      this.sceneFileMessage = "\u5F53\u524D\u767D\u677F\u6587\u4EF6\u5C1A\u672A\u521B\u5EFA\u3002";
      this.clearCanvasRecoveryState();
      this.syncScene({
        file: true,
        refreshFileLists: true,
        recovery: true
      });
      return;
    }
    this.applySnapshot(snapshot.snapshot);
    this.canvasMetadata = snapshot.metadata;
    this.source = "\u4ECE\u767D\u677F\u6587\u4EF6\u52A0\u8F7D";
    this.sceneFileExists = true;
    this.lastLoadedAt = formatTimestamp(/* @__PURE__ */ new Date());
    this.sceneFileMessage = `\u5DF2\u4ECE ${this.canvasFilePath} \u91CD\u65B0\u52A0\u8F7D\u767D\u677F\u6587\u4EF6\u3002`;
    this.clearCanvasRecoveryState();
    this.autoSaveState = "saved";
    this.autoSaveErrorMessage = null;
    this.cancelAutoSaveHandle();
    this.finishPointerInteraction();
    this.syncScene();
  }
  async openSceneFile() {
    if (this.autoSaveState === "pending") {
      await this.flushAutoSave("\u6253\u5F00\u767D\u677F\u6587\u4EF6\u524D\u81EA\u52A8\u4FDD\u5B58", "\u6253\u5F00\u767D\u677F\u6587\u4EF6\u524D\u5DF2\u81EA\u52A8\u4FDD\u5B58\u5230");
    }
    const file = await this.ensureSceneFileExists();
    await this.openCanvasFile(file, "\u6253\u5F00\u767D\u677F\u6587\u4EF6");
  }
  async openSpecificSceneFile(file, source) {
    if (this.autoSaveState === "pending") {
      await this.flushAutoSave("\u5207\u6362\u767D\u677F\u6587\u4EF6\u524D\u81EA\u52A8\u4FDD\u5B58", "\u5207\u6362\u767D\u677F\u6587\u4EF6\u524D\u5DF2\u81EA\u52A8\u4FDD\u5B58\u5230");
    }
    await this.openCanvasFile(file, source);
  }
  resetViewport() {
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.markSceneChanged({
      viewport: true,
      selectionBox: true,
      scale: true,
      summary: true
    });
  }
  moveSelectedNodesBy(deltaX, deltaY) {
    if (this.selectedNodeIds.length === 0) {
      return;
    }
    const movedNodeIds = this.collectGroupAwareMoveNodeIds(this.selectedNodeIds);
    const selectedIds = new Set(movedNodeIds);
    this.nodes = this.nodes.map((node) => {
      if (!selectedIds.has(node.id)) {
        return node;
      }
      return {
        ...node,
        x: node.x + deltaX,
        y: node.y + deltaY
      };
    });
    this.markSceneChanged({
      nodeIds: movedNodeIds,
      lineIds: this.collectLineIdsForNodeIds(movedNodeIds),
      summary: true,
      inspector: true
    });
  }
  isInlineEditorEventTarget(target) {
    return target instanceof HTMLElement && target.dataset.inlineEditorInteractive === "true";
  }
  handleCanvasKeydown(event) {
    this.captureViewportMetricsFromEvent(event);
    if (this.isInlineEditorEventTarget(event.target)) {
      const inlineEditorTarget = event.target;
      const isInlineTitleEditorTarget = inlineEditorTarget instanceof HTMLElement && inlineEditorTarget.dataset.role === "inline-title-input";
      const shouldExitInlineEditing = event.key === "Escape" || event.key === "Enter" && !event.isComposing && (inlineEditorTarget instanceof HTMLInputElement || inlineEditorTarget instanceof HTMLTextAreaElement && isInlineTitleEditorTarget);
      if (shouldExitInlineEditing) {
        event.preventDefault();
        const previousSelection = this.captureSelectionSnapshot();
        this.inlineEditingNodeId = null;
        this.syncScene({
          nodeIds: this.collectSelectionAffectedNodeIds(previousSelection),
          inspector: true,
          summary: true
        });
      }
      return;
    }
    if (event.code === "Space" || event.key === " ") {
      event.preventDefault();
      if (!this.spacePanPressed) {
        this.spacePanPressed = true;
        this.syncViewportCursor();
      }
      return;
    }
    switch (event.key) {
      case "Delete":
      case "Backspace":
        event.preventDefault();
        this.removeSelectedNode();
        return;
      case "Escape":
        event.preventDefault();
        {
          const previousSelection = this.captureSelectionSnapshot();
          this.inlineEditingNodeId = null;
          this.setSelectedNodes([], null);
          this.syncScene({
            nodeIds: this.collectSelectionAffectedNodeIds(previousSelection),
            inspector: true,
            summary: true
          });
        }
        return;
      case "Enter":
        if (this.selectedNodeIds.length === 1 && this.selectedNodeId !== null) {
          event.preventDefault();
          this.enterInlineEdit(this.selectedNodeId);
        }
        return;
      case "ArrowLeft":
        event.preventDefault();
        this.moveSelectedNodesBy(-16, 0);
        return;
      case "ArrowRight":
        event.preventDefault();
        this.moveSelectedNodesBy(16, 0);
        return;
      case "ArrowUp":
        event.preventDefault();
        this.moveSelectedNodesBy(0, -16);
        return;
      case "ArrowDown":
        event.preventDefault();
        this.moveSelectedNodesBy(0, 16);
        return;
      case "+":
      case "=":
        event.preventDefault();
        this.scale = clamp(Number((this.scale + 0.08).toFixed(2)), MIN_SCALE, MAX_SCALE);
        this.markSceneChanged({
          viewport: true,
          selectionBox: true,
          scale: true,
          summary: true
        });
        return;
      case "-":
      case "_":
        event.preventDefault();
        this.scale = clamp(Number((this.scale - 0.08).toFixed(2)), MIN_SCALE, MAX_SCALE);
        this.markSceneChanged({
          viewport: true,
          selectionBox: true,
          scale: true,
          summary: true
        });
        return;
      case "0":
        event.preventDefault();
        this.resetViewport();
        return;
      default:
        return;
    }
  }
  handleCanvasKeyup(event) {
    this.captureViewportMetricsFromEvent(event);
    if (this.isInlineEditorEventTarget(event.target)) {
      return;
    }
    if (event.code === "Space" || event.key === " ") {
      event.preventDefault();
      this.releaseSpacePanPress();
    }
  }
  bindCanvasKeyboardTarget(targetEl) {
    this.registerDomEvent(targetEl, "keydown", (event) => {
      this.handleCanvasKeydown(event);
    });
    this.registerDomEvent(targetEl, "keyup", (event) => {
      this.handleCanvasKeyup(event);
    });
  }
  openViewportContextMenu(event) {
    event.preventDefault();
    const viewportLocal = this.resolveViewportLocalPoint(event, false);
    const scenePoint = viewportLocal === null ? null : this.resolveScenePointFromViewportLocal(viewportLocal);
    const menu = new import_plugin.Menu();
    menu.addItem((item) => {
      item.setTitle("\u65B0\u589E\u5361\u7247");
      item.onClick(() => {
        this.addStandaloneNode(scenePoint ?? void 0);
      });
    });
    menu.addItem((item) => {
      item.setTitle("\u65B0\u589E\u8FDE\u63A5\u5361\u7247");
      item.setDisabled(this.resolveSelectedNode() === null);
      item.onClick(() => {
        this.addConnectedNode(scenePoint ?? void 0);
      });
    });
    menu.addItem((item) => {
      item.setTitle("\u65B0\u589E\u7B14\u8BB0\u8282\u70B9");
      item.onClick(() => {
        this.addStandaloneNode(scenePoint ?? void 0, "note");
      });
    });
    menu.addItem((item) => {
      item.setTitle("\u65B0\u589E\u6587\u4EF6\u8282\u70B9");
      item.onClick(() => {
        this.addStandaloneNode(scenePoint ?? void 0, "file");
      });
    });
    menu.addItem((item) => {
      item.setTitle("\u65B0\u589E URL \u8282\u70B9");
      item.onClick(() => {
        this.addStandaloneNode(scenePoint ?? void 0, "url");
      });
    });
    menu.addItem((item) => {
      item.setTitle("\u65B0\u589E\u5206\u7EC4\u8282\u70B9");
      item.onClick(() => {
        this.addStandaloneNode(scenePoint ?? void 0, "group");
      });
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle(this.boxSelectionEnabled ? "\u5173\u95ED\u6846\u9009" : "\u5F00\u542F\u6846\u9009");
      item.setChecked(this.boxSelectionEnabled);
      item.onClick(() => {
        this.boxSelectionEnabled = !this.boxSelectionEnabled;
        if (!this.boxSelectionEnabled && this.dragMode === "select") {
          this.finishPointerInteraction();
          this.syncScene({
            boxSelectionChip: true,
            selectionBox: true
          });
          return;
        }
        this.syncViewportCursor();
        this.syncScene({
          boxSelectionChip: true,
          selectionBox: true
        });
      });
    });
    menu.addItem((item) => {
      item.setTitle("\u91CD\u7F6E\u89C6\u53E3");
      item.onClick(() => {
        this.resetViewport();
      });
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle("\u4FDD\u5B58\u5230\u6587\u4EF6");
      item.onClick(() => {
        void this.saveSceneFile();
      });
    });
    menu.addItem((item) => {
      item.setTitle("\u4ECE\u6587\u4EF6\u52A0\u8F7D");
      item.onClick(() => {
        void this.loadSceneFile();
      });
    });
    menu.addItem((item) => {
      item.setTitle("\u6253\u5F00\u573A\u666F\u6587\u4EF6");
      item.onClick(() => {
        void this.openSceneFile();
      });
    });
    menu.showAtMouseEvent(event);
  }
  openNodeContextMenu(nodeId, event) {
    event.preventDefault();
    const previousSelection = this.captureSelectionSnapshot();
    this.setSelectedNodes([nodeId], nodeId);
    const selectionChanged = this.hasSelectionStateChanged(previousSelection);
    const selectionNodeIds = this.collectSelectionAffectedNodeIds(previousSelection);
    if (selectionChanged) {
      this.markSceneChanged({
        nodeIds: selectionNodeIds,
        inspector: true,
        summary: true
      });
    } else {
      this.syncScene({
        nodeIds: selectionNodeIds
      });
    }
    const selectedNode = this.resolveSelectedNode();
    const scenePoint = selectedNode === null ? void 0 : { x: selectedNode.x + 320, y: selectedNode.y + 140 };
    const menu = new import_plugin.Menu();
    menu.addItem((item) => {
      item.setTitle(selectedNode?.type === "url" ? "\u7F16\u8F91 URL \u5730\u5740" : "\u5361\u7247\u5185\u7F16\u8F91");
      item.onClick(() => {
        if (selectedNode?.type === "url") {
          this.openUrlNodeAddressEditor(selectedNode);
          return;
        }
        this.enterInlineEdit(nodeId);
      });
    });
    if (selectedNode?.type === "url") {
      menu.addItem((item) => {
        item.setTitle("\u6253\u5F00 URL \u94FE\u63A5");
        item.setDisabled(selectedNode.url === void 0 || !isSupportedExternalUrl(selectedNode.url));
        item.onClick(() => {
          void this.openNodeUrlTarget(selectedNode);
        });
      });
    }
    menu.addItem((item) => {
      item.setTitle("\u65B0\u589E\u8FDE\u63A5\u5361\u7247");
      item.onClick(() => {
        this.addConnectedNode(scenePoint);
      });
    });
    menu.addItem((item) => {
      item.setTitle("\u65B0\u589E\u8FDE\u63A5\u7B14\u8BB0");
      item.onClick(() => {
        this.addConnectedNode(scenePoint, "note");
      });
    });
    menu.addItem((item) => {
      item.setTitle("\u65B0\u589E\u8FDE\u63A5\u6587\u4EF6");
      item.onClick(() => {
        this.addConnectedNode(scenePoint, "file");
      });
    });
    menu.addItem((item) => {
      item.setTitle("\u65B0\u589E\u8FDE\u63A5 URL");
      item.onClick(() => {
        this.addConnectedNode(scenePoint, "url");
      });
    });
    menu.addItem((item) => {
      item.setTitle("\u65B0\u589E\u8FDE\u63A5\u5206\u7EC4");
      item.onClick(() => {
        this.addConnectedNode(scenePoint, "group");
      });
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle("\u5220\u9664\u9009\u4E2D\u5361\u7247");
      item.onClick(() => {
        this.removeSelectedNode();
      });
    });
    menu.addItem((item) => {
      item.setTitle("\u5220\u9664\u5173\u8054\u8FDE\u7EBF");
      item.onClick(() => {
        this.removeSelectedNodeLines();
      });
    });
    menu.showAtMouseEvent(event);
  }
  async openCanvasFile(file, source) {
    await this.openCanvasFileInLeaf(this.leaf, file, source);
  }
  async openCanvasFileInLeaf(leaf, file, source) {
    await leaf.setViewState({
      type: DEMO_VIEW_TYPE,
      active: true,
      state: {
        file: file.path,
        source
      }
    });
    await this.app.workspace.revealLeaf(leaf);
  }
  hasBrokenNodeReference(node) {
    if (isWorkspaceFileNode(node)) {
      return node.targetPath === void 0 || this.app.vault.getFileByPath(node.targetPath) === null;
    }
    if (node.type === "url") {
      return node.url === void 0 || !isSupportedExternalUrl(node.url);
    }
    return false;
  }
  resolveNodeReferenceText(node) {
    const referenceText = getNodeReferenceText(node);
    if (!this.hasBrokenNodeReference(node)) {
      return referenceText;
    }
    return `${referenceText ?? "\u8282\u70B9\u5F15\u7528"}\uFF08\u76EE\u6807\u4E0D\u5B58\u5728\u6216\u65E0\u6548\uFF09`;
  }
  queueUrlPreview(node) {
    if (node.type !== "url" || node.url === void 0 || !isSupportedExternalUrl(node.url)) {
      return;
    }
    const currentState = this.urlPreviewStates.get(node.id) ?? null;
    if (currentState !== null && currentState.url === node.url) {
      return;
    }
    const previewUrl = node.url;
    this.urlPreviewStates.set(node.id, {
      url: previewUrl,
      status: "loading",
      metadata: null,
      errorMessage: null
    });
    void this.loadUrlPreview(node.id, previewUrl).catch((error) => {
      const errorMessage = error instanceof Error ? error.message : "\u672A\u77E5\u9519\u8BEF";
      this.urlPreviewStates.set(node.id, {
        url: previewUrl,
        status: "error",
        metadata: null,
        errorMessage
      });
      this.syncScene({
        nodeIds: [node.id]
      });
    });
  }
  async loadUrlPreview(nodeId, url) {
    try {
      const metadata = await this.app.urlMetadata.fetch(url);
      const currentNode = this.nodes.find((node) => node.id === nodeId) ?? null;
      if (currentNode === null || currentNode.type !== "url" || currentNode.url !== url) {
        return;
      }
      this.urlPreviewStates.set(nodeId, {
        url,
        status: metadata.status === "ok" ? "ready" : "error",
        metadata,
        errorMessage: metadata.errorMessage
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "\u672A\u77E5\u9519\u8BEF";
      const currentNode = this.nodes.find((node) => node.id === nodeId) ?? null;
      if (currentNode === null || currentNode.type !== "url" || currentNode.url !== url) {
        return;
      }
      this.urlPreviewStates.set(nodeId, {
        url,
        status: "error",
        metadata: null,
        errorMessage
      });
    }
    this.syncScene({
      nodeIds: [nodeId]
    });
  }
  createUrlPreviewText(text, opacity = "0.78", fontWeight = "400") {
    const textEl = document.createElement("div");
    textEl.textContent = text;
    textEl.style.opacity = opacity;
    textEl.style.fontWeight = fontWeight;
    textEl.style.lineHeight = "1.5";
    textEl.style.fontSize = "12px";
    textEl.style.whiteSpace = "pre-wrap";
    textEl.style.overflow = "hidden";
    textEl.style.overflowWrap = "anywhere";
    return textEl;
  }
  createUrlPreviewFrame(url, title) {
    const iframeEl = document.createElement("iframe");
    iframeEl.setAttribute("src", url);
    iframeEl.setAttribute("sandbox", "allow-scripts");
    iframeEl.setAttribute("credentialless", "");
    iframeEl.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    iframeEl.setAttribute("loading", "lazy");
    iframeEl.setAttribute("title", title);
    iframeEl.setAttribute("autocomplete", "off");
    iframeEl.style.display = "block";
    iframeEl.style.width = "100%";
    iframeEl.style.height = "100%";
    iframeEl.style.minHeight = "0";
    iframeEl.style.border = "0";
    iframeEl.style.borderRadius = "10px";
    iframeEl.style.background = "#fff";
    iframeEl.style.pointerEvents = "none";
    return iframeEl;
  }
  syncUrlPreviewRuntime(node, runtime) {
    if (node.type !== "url") {
      runtime.urlPreviewEl.style.display = "none";
      runtime.urlPreviewEl.replaceChildren();
      runtime.urlPreviewEl.dataset.previewSignature = "";
      return;
    }
    runtime.urlPreviewEl.style.display = "flex";
    if (node.url === void 0 || !isSupportedExternalUrl(node.url)) {
      const signature = `invalid:${node.url ?? ""}`;
      if (runtime.urlPreviewEl.dataset.previewSignature !== signature) {
        runtime.urlPreviewEl.dataset.previewSignature = signature;
        runtime.urlPreviewEl.replaceChildren(
          this.createUrlPreviewText("URL \u9884\u89C8\u4E0D\u53EF\u7528\uFF1A\u94FE\u63A5\u683C\u5F0F\u65E0\u6548\u3002", "0.9", "700")
        );
      }
      return;
    }
    const directFrameSignature = `direct-frame:${node.url}`;
    if (runtime.urlPreviewEl.dataset.previewSignature !== directFrameSignature) {
      runtime.urlPreviewEl.dataset.previewSignature = directFrameSignature;
      runtime.urlPreviewEl.replaceChildren(this.createUrlPreviewFrame(node.url, node.title));
    }
  }
  async openNodeFileTarget(node) {
    if (node.targetPath === void 0) {
      new import_plugin.Notice(`${DEMO_TITLE}: \u5F53\u524D\u8282\u70B9\u6CA1\u6709\u76EE\u6807\u6587\u4EF6\u3002`, 2200);
      return;
    }
    const file = this.app.vault.getFileByPath(node.targetPath);
    if (file === null) {
      new import_plugin.Notice(`${DEMO_TITLE}: \u76EE\u6807\u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A${node.targetPath}`, 2600);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    if (isCanvasFileExtension(file.extension)) {
      await this.openCanvasFileInLeaf(leaf, file, `\u767D\u677F\u8282\u70B9\uFF1A${node.title}`);
      return;
    }
    await leaf.openFile(file, {
      active: true,
      state: {
        source: `\u767D\u677F\u8282\u70B9\uFF1A${node.title}`
      }
    });
    await this.app.workspace.revealLeaf(leaf);
  }
  async openNodeUrlTarget(node) {
    if (node.url === void 0) {
      new import_plugin.Notice(`${DEMO_TITLE}: \u5F53\u524D URL \u8282\u70B9\u6CA1\u6709\u76EE\u6807\u94FE\u63A5\u3002`, 2200);
      return;
    }
    if (!isSupportedExternalUrl(node.url)) {
      new import_plugin.Notice(`${DEMO_TITLE}: URL \u8282\u70B9\u94FE\u63A5\u65E0\u6548\uFF1A${node.url}`, 2600);
      return;
    }
    try {
      await this.app.shell.openExternal(node.url);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "\u672A\u77E5\u9519\u8BEF";
      new import_plugin.Notice(`${DEMO_TITLE}: \u6253\u5F00 URL \u5931\u8D25\uFF1A${errorMessage}`, 2600);
    }
  }
  async activateNode(nodeId) {
    const now = Date.now();
    if (this.lastNodeActivationId === nodeId && now - this.lastNodeActivationAt <= NODE_ACTIVATION_DEBOUNCE_MS) {
      return;
    }
    this.lastNodeActivationId = nodeId;
    this.lastNodeActivationAt = now;
    const node = this.nodes.find((item) => item.id === nodeId) ?? null;
    if (node === null) {
      return;
    }
    if (node.type === "note" || node.type === "file") {
      await this.openNodeFileTarget(node);
      return;
    }
    if (node.type === "url") {
      this.openUrlNodeAddressEditor(node);
      return;
    }
    if (node.type === "group") {
      const memberIds = this.nodes.filter((item) => item.groupId === node.id).map((item) => item.id);
      this.setSelectedNodes([node.id, ...memberIds], node.id);
      this.syncScene({
        nodeIds: [node.id, ...memberIds],
        inspector: true,
        summary: true
      });
      return;
    }
    this.enterInlineEdit(node.id);
  }
  async createAndOpenNewSceneFile() {
    if (this.autoSaveState === "pending") {
      await this.flushAutoSave("\u65B0\u5EFA\u767D\u677F\u6587\u4EF6\u524D\u81EA\u52A8\u4FDD\u5B58", "\u65B0\u5EFA\u767D\u677F\u6587\u4EF6\u524D\u5DF2\u81EA\u52A8\u4FDD\u5B58\u5230");
    }
    const nextFilePath = await this.createUniqueSceneFilePath();
    const nextSnapshot = createInitialViewState("\u65B0\u5EFA\u767D\u677F\u6587\u4EF6");
    const payload = serializeSceneForFile(nextSnapshot, nextFilePath, null);
    const file = await this.app.vault.create(nextFilePath, payload);
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file, {
      active: true,
      state: {
        source: "\u65B0\u5EFA\u767D\u677F\u6587\u4EF6"
      }
    });
    await this.app.workspace.revealLeaf(leaf);
  }
  createCurrentSnapshot(source) {
    return {
      source,
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      selectedNodeId: this.selectedNodeId,
      nextNodeSerial: this.nextNodeSerial,
      nodes: this.nodes,
      lines: this.lines
    };
  }
  async refreshSceneFileStatus() {
    const file = this.app.vault.getFileByPath(this.canvasFilePath);
    this.canvasFile = file;
    this.sceneFileExists = file !== null;
    if (file === null) {
      this.canvasMetadata = null;
      this.clearCanvasRecoveryState();
      this.sceneFileMessage = "\u72EC\u7ACB\u573A\u666F\u6587\u4EF6\u5C1A\u672A\u521B\u5EFA\u3002";
      this.autoSaveState = "idle";
      this.autoSaveErrorMessage = null;
      this.syncScene({
        file: true,
        refreshFileLists: true,
        recovery: true
      });
      return;
    }
    try {
      const raw = await this.app.vault.read(file);
      const parsed = parseCanvasDocument(raw, file.path, this.source);
      this.canvasMetadata = parsed.metadata;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "\u672A\u77E5\u9519\u8BEF";
      const rawContent = await this.readCanvasRawContent(file.path);
      this.canvasMetadata = null;
      this.enterInvalidCanvasRecovery(errorMessage, rawContent);
      this.syncScene({
        file: true,
        refreshFileLists: true,
        recovery: true
      });
      return;
    }
    this.sceneFileMessage = `\u72EC\u7ACB\u6587\u4EF6\u5DF2\u5B58\u5728\uFF1A${file.path}`;
    this.clearCanvasRecoveryState();
    this.autoSaveState = "saved";
    this.autoSaveErrorMessage = null;
    this.syncScene({
      file: true,
      refreshFileLists: true,
      recovery: true
    });
  }
  async ensureSceneFolder() {
    await ensureFolderPath(this, SCENE_FOLDER_PATH);
  }
  async createUniqueSceneFilePath() {
    await this.ensureSceneFolder();
    const now = /* @__PURE__ */ new Date();
    const stamp = `${now.getFullYear()}${padDatePart(now.getMonth() + 1)}${padDatePart(now.getDate())}-${padDatePart(now.getHours())}${padDatePart(now.getMinutes())}${padDatePart(now.getSeconds())}`;
    let suffixIndex = 0;
    while (true) {
      const suffix = suffixIndex === 0 ? "" : `-${suffixIndex + 1}`;
      const nextPath = `${SCENE_FOLDER_PATH}/whiteboard-${stamp}${suffix}.canvas`;
      if (this.app.vault.getFileByPath(nextPath) === null) {
        return nextPath;
      }
      suffixIndex += 1;
    }
  }
  listCanvasFiles() {
    const sceneFolder = this.app.vault.getFolderByPath(SCENE_FOLDER_PATH);
    const collectedFiles = [];
    const visitFolder = (folder) => {
      for (const child of folder.children) {
        if (child instanceof import_plugin.TFile) {
          if (isCanvasFileExtension(child.extension)) {
            collectedFiles.push(child);
          }
          continue;
        }
        visitFolder(child);
      }
    };
    if (sceneFolder !== null) {
      visitFolder(sceneFolder);
      return collectedFiles.sort((left, right) => right.stat.mtime - left.stat.mtime);
    }
    const normalizedSceneFolderMarker = `/${SCENE_FOLDER_PATH}/`;
    return this.app.vault.getFiles().filter((file) => {
      if (!isCanvasFileExtension(file.extension)) {
        return false;
      }
      const normalizedPath = file.path.replace(/\\/g, "/");
      return normalizedPath.startsWith(`${SCENE_FOLDER_PATH}/`) || normalizedPath.includes(normalizedSceneFolderMarker);
    }).sort((left, right) => right.stat.mtime - left.stat.mtime);
  }
  listRecentCanvasFiles() {
    const recentPaths = [
      this.canvasFilePath,
      ...this.app.workspace.getLastOpenFiles()
    ];
    const filesByPath = new Map(this.listCanvasFiles().map((file) => [file.path, file]));
    const recentFiles = [];
    const seen = /* @__PURE__ */ new Set();
    for (const pathValue of recentPaths) {
      if (seen.has(pathValue)) {
        continue;
      }
      seen.add(pathValue);
      const file = filesByPath.get(pathValue) ?? null;
      if (file === null) {
        continue;
      }
      recentFiles.push(file);
    }
    return recentFiles.slice(0, 6);
  }
  async ensureSceneFileExists() {
    const existingFile = this.app.vault.getFileByPath(this.canvasFilePath);
    if (existingFile !== null) {
      this.canvasFile = existingFile;
      return existingFile;
    }
    return this.writeSceneFile("\u9996\u6B21\u521B\u5EFA\u72EC\u7ACB\u6587\u4EF6");
  }
  async writeSceneFile(source) {
    if (this.isCanvasReadOnly()) {
      throw new Error("\u5F53\u524D\u767D\u677F\u5904\u4E8E\u53EA\u8BFB\u6062\u590D\u6A21\u5F0F\uFF0C\u5DF2\u963B\u6B62\u8986\u76D6\u539F\u59CB\u6587\u4EF6\u3002");
    }
    await this.ensureSceneFolder();
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const nextMetadata = createCanvasMetadata(
      this.canvasFilePath,
      source,
      this.canvasMetadata?.createdAt ?? timestamp,
      timestamp,
      this.canvasMetadata?.migratedFromVersion ?? null
    );
    const payload = serializeSceneForFile(this.createCurrentSnapshot(source), this.canvasFilePath, nextMetadata);
    const existingFile = this.app.vault.getFileByPath(this.canvasFilePath);
    if (existingFile !== null) {
      await this.app.vault.modify(existingFile, payload);
      this.canvasFile = existingFile;
      this.canvasMetadata = nextMetadata;
      return existingFile;
    }
    const createdFile = await this.app.vault.create(this.canvasFilePath, payload);
    this.canvasFile = createdFile;
    this.canvasMetadata = nextMetadata;
    return createdFile;
  }
  cancelAutoSaveHandle() {
    if (this.autoSaveHandle === null) {
      return;
    }
    clearTimeout(this.autoSaveHandle);
    this.autoSaveHandle = null;
  }
  scheduleAutoSave() {
    if (this.isCanvasReadOnly()) {
      this.cancelAutoSaveHandle();
      this.autoSaveState = "error";
      this.autoSaveErrorMessage = this.recoveryErrorMessage ?? "\u5F53\u524D\u767D\u677F\u5904\u4E8E\u53EA\u8BFB\u6062\u590D\u6A21\u5F0F\u3002";
      this.syncFilePanel();
      this.syncRecoveryPanel();
      return;
    }
    if (this.canvasFilePath.trim().length === 0) {
      return;
    }
    this.cancelAutoSaveHandle();
    this.autoSaveState = "pending";
    this.autoSaveErrorMessage = null;
    this.autoSaveHandle = setTimeout(() => {
      void this.flushAutoSave("\u81EA\u52A8\u4FDD\u5B58", "\u5DF2\u81EA\u52A8\u4FDD\u5B58\u5230");
    }, AUTO_SAVE_DELAY_MS);
    this.syncFilePanel();
  }
  async flushAutoSave(source, successPrefix) {
    this.cancelAutoSaveHandle();
    if (this.isCanvasReadOnly()) {
      this.autoSaveState = "error";
      this.autoSaveErrorMessage = this.recoveryErrorMessage ?? "\u5F53\u524D\u767D\u677F\u5904\u4E8E\u53EA\u8BFB\u6062\u590D\u6A21\u5F0F\u3002";
      this.syncScene({
        file: true,
        recovery: true
      });
      return;
    }
    if (this.autoSaveState === "saving") {
      return;
    }
    this.autoSaveState = "saving";
    this.autoSaveErrorMessage = null;
    this.syncFilePanel();
    try {
      const file = await this.writeSceneFile(source);
      this.sceneFileExists = true;
      this.lastSavedAt = formatTimestamp(/* @__PURE__ */ new Date());
      this.sceneFileMessage = `${successPrefix} ${file.path}`;
      this.clearCanvasRecoveryState();
      this.autoSaveState = "saved";
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "\u672A\u77E5\u9519\u8BEF";
      this.enterReadOnlyCanvasRecovery(errorMessage);
      new import_plugin.Notice(`${DEMO_TITLE}\uFF1A\u81EA\u52A8\u4FDD\u5B58\u5931\u8D25\uFF0C\u5DF2\u5207\u6362\u4E3A\u53EA\u8BFB\u4FDD\u62A4\u3002`, 3200);
    }
    this.syncScene({
      file: true,
      refreshFileLists: true,
      recovery: true
    });
  }
  markSceneChanged(options) {
    this.syncScene(options);
    this.scheduleAutoSave();
  }
  ensureViewDom() {
    if (this.rootEl !== null) {
      if (this.contentEl.firstChild !== this.rootEl || this.contentEl.childNodes.length !== 1) {
        this.contentEl.replaceChildren(this.rootEl);
      }
      return;
    }
    this.rootEl = document.createElement("div");
    this.rootEl.style.position = "relative";
    this.rootEl.style.display = "flex";
    this.rootEl.style.width = "100%";
    this.rootEl.style.height = "100%";
    this.rootEl.style.minWidth = "0";
    this.rootEl.style.minHeight = "0";
    this.rootEl.style.overflow = "hidden";
    const floatingPanelEl = document.createElement("div");
    floatingPanelEl.style.position = "absolute";
    floatingPanelEl.style.top = `${FLOATING_PANEL_INSET}px`;
    floatingPanelEl.style.right = `${FLOATING_PANEL_INSET}px`;
    floatingPanelEl.style.bottom = `${FLOATING_PANEL_INSET}px`;
    floatingPanelEl.style.width = `${FLOATING_PANEL_WIDTH}px`;
    floatingPanelEl.style.maxWidth = `calc(100% - ${FLOATING_PANEL_INSET * 2}px)`;
    floatingPanelEl.style.display = "flex";
    floatingPanelEl.style.flexDirection = "column";
    floatingPanelEl.style.gap = "12px";
    floatingPanelEl.style.pointerEvents = "none";
    floatingPanelEl.style.zIndex = "12";
    const statusPanelEl = document.createElement("div");
    statusPanelEl.style.display = "flex";
    statusPanelEl.style.flexDirection = "column";
    statusPanelEl.style.gap = "6px";
    statusPanelEl.style.padding = "12px 14px";
    statusPanelEl.style.borderRadius = "16px";
    statusPanelEl.style.border = "1px solid rgba(255,255,255,0.12)";
    statusPanelEl.style.background = "rgba(15,23,42,0.78)";
    statusPanelEl.style.backdropFilter = "blur(14px)";
    statusPanelEl.style.webkitBackdropFilter = "blur(14px)";
    statusPanelEl.style.pointerEvents = "auto";
    this.sourceEl = document.createElement("div");
    this.sourceEl.style.fontSize = "12px";
    this.sourceEl.style.lineHeight = "1.5";
    this.sourceEl.style.opacity = "0.72";
    this.recoveryPanelEl = document.createElement("div");
    this.recoveryPanelEl.style.display = "none";
    this.recoveryPanelEl.style.flexDirection = "column";
    this.recoveryPanelEl.style.gap = "10px";
    this.recoveryPanelEl.style.padding = "14px";
    this.recoveryPanelEl.style.borderRadius = "14px";
    this.recoveryPanelEl.style.border = "1px solid var(--ws-inputValidation-errorBorder, rgba(248,113,113,0.72))";
    this.recoveryPanelEl.style.background = "var(--ws-inputValidation-errorBackground, rgba(127,29,29,0.22))";
    this.recoveryPanelEl.style.pointerEvents = "auto";
    this.recoveryTitleEl = document.createElement("div");
    this.recoveryTitleEl.style.fontWeight = "700";
    this.recoveryPanelEl.append(this.recoveryTitleEl);
    this.recoveryMessageEl = document.createElement("div");
    this.recoveryMessageEl.style.lineHeight = "1.6";
    this.recoveryMessageEl.style.opacity = "0.86";
    this.recoveryPanelEl.append(this.recoveryMessageEl);
    const recoveryActionEl = document.createElement("div");
    recoveryActionEl.style.display = "flex";
    recoveryActionEl.style.flexWrap = "wrap";
    recoveryActionEl.style.gap = "8px";
    recoveryActionEl.append(
      this.createToolChip("\u91CD\u65B0\u52A0\u8F7D\u767D\u677F\u6587\u4EF6", () => {
        void this.loadSceneFile();
      })
    );
    this.recoveryToggleRawEl = this.createToolChip("\u67E5\u770B\u539F\u59CB\u6587\u672C", () => {
      this.recoveryTextVisible = !this.recoveryTextVisible;
      this.syncRecoveryPanel();
    });
    recoveryActionEl.append(this.recoveryToggleRawEl);
    this.recoveryPanelEl.append(recoveryActionEl);
    this.recoveryRawTextEl = document.createElement("pre");
    this.recoveryRawTextEl.style.display = "none";
    this.recoveryRawTextEl.style.maxHeight = "220px";
    this.recoveryRawTextEl.style.overflow = "auto";
    this.recoveryRawTextEl.style.margin = "0";
    this.recoveryRawTextEl.style.padding = "12px";
    this.recoveryRawTextEl.style.borderRadius = "10px";
    this.recoveryRawTextEl.style.border = "1px solid var(--ws-panel-border, rgba(255,255,255,0.12))";
    this.recoveryRawTextEl.style.background = "var(--ws-editor-background, rgba(15,23,42,0.64))";
    this.recoveryRawTextEl.style.whiteSpace = "pre-wrap";
    this.recoveryRawTextEl.style.userSelect = "text";
    this.recoveryPanelEl.append(this.recoveryRawTextEl);
    const toolbarEl = document.createElement("div");
    toolbarEl.style.display = "flex";
    toolbarEl.style.flex = "1";
    toolbarEl.style.flexDirection = "column";
    toolbarEl.style.alignItems = "stretch";
    toolbarEl.style.gap = "8px";
    toolbarEl.style.minHeight = "0";
    toolbarEl.style.padding = "12px";
    toolbarEl.style.overflow = "auto";
    toolbarEl.style.borderRadius = "16px";
    toolbarEl.style.border = "1px solid rgba(255,255,255,0.12)";
    toolbarEl.style.background = "rgba(15,23,42,0.78)";
    toolbarEl.style.backdropFilter = "blur(14px)";
    toolbarEl.style.webkitBackdropFilter = "blur(14px)";
    toolbarEl.style.pointerEvents = "auto";
    toolbarEl.append(
      this.createToolChip("\u65B0\u5EFA\u767D\u677F\u6587\u4EF6", () => {
        void this.createAndOpenNewSceneFile();
      }),
      this.createToolChip("\u65B0\u589E\u5361\u7247", () => {
        this.addStandaloneNode();
      }),
      this.createToolChip("\u65B0\u589E\u8FDE\u63A5\u5361\u7247", () => {
        this.addConnectedNode();
      }),
      this.createToolChip("\u65B0\u589E\u7B14\u8BB0\u8282\u70B9", () => {
        this.addStandaloneNode(void 0, "note");
      }),
      this.createToolChip("\u65B0\u589E\u6587\u4EF6\u8282\u70B9", () => {
        this.addStandaloneNode(void 0, "file");
      }),
      this.createToolChip("\u65B0\u589E URL \u8282\u70B9", () => {
        this.addStandaloneNode(void 0, "url");
      }),
      this.createToolChip("\u65B0\u589E\u5206\u7EC4\u8282\u70B9", () => {
        this.addStandaloneNode(void 0, "group");
      }),
      this.createToolChip("\u5220\u9664\u9009\u4E2D\u5361\u7247", () => {
        this.removeSelectedNode();
      }),
      this.createToolChip("\u5220\u9664\u9009\u4E2D\u8FDE\u7EBF", () => {
        this.removeSelectedNodeLines();
      }),
      this.createToolChip("\u4FDD\u5B58\u5230\u6587\u4EF6", () => {
        void this.saveSceneFile();
      }),
      this.createToolChip("\u4ECE\u6587\u4EF6\u52A0\u8F7D", () => {
        void this.loadSceneFile();
      }),
      this.createToolChip("\u6253\u5F00\u767D\u677F\u6587\u4EF6", () => {
        void this.openSceneFile();
      }),
      this.createToolChip("\u653E\u5927", () => {
        this.scale = clamp(Number((this.scale + 0.1).toFixed(2)), MIN_SCALE, MAX_SCALE);
        this.markSceneChanged({
          viewport: true,
          selectionBox: true,
          scale: true,
          summary: true
        });
      }),
      this.createToolChip("\u7F29\u5C0F", () => {
        this.scale = clamp(Number((this.scale - 0.1).toFixed(2)), MIN_SCALE, MAX_SCALE);
        this.markSceneChanged({
          viewport: true,
          selectionBox: true,
          scale: true,
          summary: true
        });
      }),
      this.createToolChip("\u5DE6\u79FB", () => {
        this.offsetX -= 40;
        this.markSceneChanged({
          viewport: true,
          selectionBox: true,
          summary: true
        });
      }),
      this.createToolChip("\u53F3\u79FB", () => {
        this.offsetX += 40;
        this.markSceneChanged({
          viewport: true,
          selectionBox: true,
          summary: true
        });
      }),
      this.createToolChip("\u4E0A\u79FB", () => {
        this.offsetY -= 40;
        this.markSceneChanged({
          viewport: true,
          selectionBox: true,
          summary: true
        });
      }),
      this.createToolChip("\u4E0B\u79FB", () => {
        this.offsetY += 40;
        this.markSceneChanged({
          viewport: true,
          selectionBox: true,
          summary: true
        });
      }),
      this.createToolChip("\u91CD\u7F6E", () => {
        this.resetScene();
      })
    );
    this.boxSelectionChipEl = this.createToolChip("\u6846\u9009\uFF1A\u5F00", () => {
      this.boxSelectionEnabled = !this.boxSelectionEnabled;
      if (!this.boxSelectionEnabled && this.dragMode === "select") {
        this.finishPointerInteraction();
      } else {
        this.syncViewportCursor();
      }
      this.syncScene({
        boxSelectionChip: true,
        selectionBox: true
      });
    });
    toolbarEl.append(this.boxSelectionChipEl);
    this.scaleEl = document.createElement("div");
    this.scaleEl.style.fontSize = "12px";
    this.scaleEl.style.lineHeight = "1.5";
    this.scaleEl.style.opacity = "0.78";
    statusPanelEl.append(this.sourceEl, this.scaleEl);
    this.viewportEl = document.createElement("div");
    this.viewportEl.style.position = "relative";
    this.viewportEl.style.flex = "1";
    this.viewportEl.style.minHeight = "0";
    this.viewportEl.style.overflow = "hidden";
    this.viewportEl.style.border = "none";
    this.viewportEl.style.borderRadius = "0";
    this.viewportEl.style.backgroundColor = "rgba(15,23,42,0.82)";
    this.viewportEl.style.backgroundImage = [
      "linear-gradient(rgba(148,163,184,0.1) 1px, transparent 1px)",
      "linear-gradient(90deg, rgba(148,163,184,0.1) 1px, transparent 1px)",
      "linear-gradient(rgba(148,163,184,0.04) 1px, transparent 1px)",
      "linear-gradient(90deg, rgba(148,163,184,0.04) 1px, transparent 1px)"
    ].join(", ");
    this.viewportEl.style.backgroundSize = "120px 120px, 120px 120px, 24px 24px, 24px 24px";
    this.viewportEl.style.backgroundPosition = "-1px -1px, -1px -1px, -1px -1px, -1px -1px";
    this.viewportEl.style.userSelect = "none";
    this.viewportEl.setAttribute("tabindex", "0");
    this.syncViewportCursor();
    this.registerDomEvent(this.viewportEl, "mousedown", (event) => {
      if (event.button !== 0) {
        return;
      }
      if (event.target !== this.viewportEl && event.target !== this.sceneEl) {
        return;
      }
      event.preventDefault();
      this.focusElementWithoutScroll(this.viewportEl);
      const viewportLocal = this.resolveViewportLocalPoint(event, false);
      if (viewportLocal === null) {
        return;
      }
      const shouldStartPan = this.spacePanPressed;
      const shouldStartSelection = !shouldStartPan && this.boxSelectionEnabled;
      if (!shouldStartPan && !shouldStartSelection) {
        return;
      }
      this.interactionOriginClientX = event.clientX - viewportLocal.x;
      this.interactionOriginClientY = event.clientY - viewportLocal.y;
      this.activeNodeId = null;
      const previousSelection = this.captureSelectionSnapshot();
      if (shouldStartSelection) {
        const scenePoint = this.resolveScenePointFromViewportLocal(viewportLocal);
        this.dragMode = "select";
        this.selectionStartSceneX = scenePoint.x;
        this.selectionStartSceneY = scenePoint.y;
        this.selectionCurrentSceneX = scenePoint.x;
        this.selectionCurrentSceneY = scenePoint.y;
        this.setSelectedNodes([], null);
      } else {
        this.dragMode = "pan";
        this.dragStartX = event.clientX;
        this.dragStartY = event.clientY;
        this.dragOriginOffsetX = this.offsetX;
        this.dragOriginOffsetY = this.offsetY;
      }
      this.pointerCaptureOwnerEl = this.viewportEl;
      this.viewportEl?.setPointerCapture(HOST_MOUSE_POINTER_ID);
      this.syncViewportCursor();
      const selectionChanged = shouldStartSelection && this.hasSelectionStateChanged(previousSelection);
      const selectionNodeIds = shouldStartSelection ? this.collectSelectionAffectedNodeIds(previousSelection) : [];
      if (selectionChanged) {
        this.markSceneChanged({
          nodeIds: selectionNodeIds,
          selectionBox: true,
          summary: true,
          inspector: true
        });
        return;
      }
      this.syncScene({
        nodeIds: selectionNodeIds,
        selectionBox: true
      });
    });
    this.registerDomEvent(this.viewportEl, "mousemove", (event) => {
      if (this.dragMode !== "pan") {
        return;
      }
      this.handlePointerMove(event);
    });
    this.registerDomEvent(this.viewportEl, "mouseup", () => {
      if (this.dragMode !== "pan" && this.dragMode !== "select") {
        return;
      }
      this.finishPointerInteraction();
    });
    this.registerDomEvent(this.viewportEl, "wheel", (event) => {
      event.preventDefault();
      const viewportLocal = this.resolveViewportLocalPoint(event, false);
      if (viewportLocal === null) {
        return;
      }
      const scenePoint = this.resolveScenePointFromViewportLocal(viewportLocal);
      const deltaY = readAugmentedEventNumber(event, "deltaY") ?? 0;
      const nextScale = clamp(
        Number((this.scale + (deltaY < 0 ? 0.08 : -0.08)).toFixed(2)),
        MIN_SCALE,
        MAX_SCALE
      );
      if (nextScale === this.scale) {
        return;
      }
      this.scale = nextScale;
      this.offsetX = viewportLocal.x - scenePoint.x * this.scale;
      this.offsetY = viewportLocal.y - scenePoint.y * this.scale;
      this.markSceneChanged({
        viewport: true,
        selectionBox: true,
        scale: true,
        summary: true
      });
    });
    this.registerDomEvent(this.viewportEl, "contextmenu", (event) => {
      if (event.target !== this.viewportEl && event.target !== this.sceneEl) {
        return;
      }
      this.openViewportContextMenu(event);
    });
    this.bindCanvasKeyboardTarget(this.viewportEl);
    this.registerDomEvent(this.viewportEl, "dragover", (event) => {
      this.handleWorkspaceFileDragOver(event);
    });
    this.registerDomEvent(this.viewportEl, "drop", (event) => {
      this.handleWorkspaceFileDrop(event);
    });
    this.sceneEl = document.createElement("div");
    this.sceneEl.style.position = "absolute";
    this.sceneEl.style.left = "0";
    this.sceneEl.style.top = "0";
    this.sceneEl.style.width = "1800px";
    this.sceneEl.style.height = "1100px";
    this.sceneEl.style.transformOrigin = "top left";
    this.selectionBoxEl = document.createElement("div");
    this.selectionBoxEl.style.position = "absolute";
    this.selectionBoxEl.style.display = "none";
    this.selectionBoxEl.style.left = "0";
    this.selectionBoxEl.style.top = "0";
    this.selectionBoxEl.style.width = "0";
    this.selectionBoxEl.style.height = "0";
    this.selectionBoxEl.style.border = "1px dashed rgba(125, 211, 252, 0.92)";
    this.selectionBoxEl.style.background = "rgba(14, 165, 233, 0.12)";
    this.selectionBoxEl.style.pointerEvents = "none";
    this.selectionBoxEl.style.zIndex = "4";
    this.registerDomEvent(this.selectionBoxEl, "mousedown", (event) => {
      if (event.button !== 0 || !this.canDragPersistentSelectionBox()) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const selectionBoxEl = this.selectionBoxEl;
      if (selectionBoxEl === null) {
        return;
      }
      this.focusElementWithoutScroll(this.viewportEl);
      const zOrderChanged = this.bringNodeIdsToFront(this.selectedNodeIds);
      this.dragMode = "selection-box";
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
      this.dragOriginNodePositions = this.captureDragOriginPositionsForNodeIds(this.selectedNodeIds);
      this.pointerCaptureOwnerEl = selectionBoxEl;
      selectionBoxEl.setPointerCapture(HOST_MOUSE_POINTER_ID);
      this.syncViewportCursor();
      this.syncScene({
        syncStructure: zOrderChanged,
        nodeIds: [...this.dragOriginNodePositions.keys()],
        selectionBox: true
      });
    });
    const helperCardEl = document.createElement("div");
    helperCardEl.textContent = "\u6309\u4F4F\u7A7A\u683C\u5E76\u62D6\u52A8\u753B\u5E03\u7A7A\u767D\u533A\u57DF\u53EF\u4EE5\u5E73\u79FB\uFF1B\u5355\u51FB\u8282\u70B9\u4F1A\u9009\u4E2D\u5361\u7247\uFF0C\u53CC\u51FB\u666E\u901A\u8282\u70B9\u8FDB\u5165\u7F16\u8F91\uFF0C\u53CC\u51FB URL \u8282\u70B9\u4F1A\u5F39\u7A97\u4FEE\u6539\u5730\u5740\uFF1B\u70B9\u51FB\u7A7A\u767D\u5904\u4F1A\u9000\u51FA\u7F16\u8F91\u72B6\u6001\u3002";
    helperCardEl.style.position = "absolute";
    helperCardEl.style.left = "48px";
    helperCardEl.style.top = "40px";
    helperCardEl.style.padding = "12px 14px";
    helperCardEl.style.borderRadius = "12px";
    helperCardEl.style.background = "rgba(15, 23, 42, 0.72)";
    helperCardEl.style.border = "1px solid rgba(255,255,255,0.1)";
    helperCardEl.style.maxWidth = "420px";
    helperCardEl.style.lineHeight = "1.6";
    this.sceneEl.append(helperCardEl);
    this.viewportEl.append(this.sceneEl, this.selectionBoxEl);
    const controlPanelEl = document.createElement("div");
    controlPanelEl.style.display = "grid";
    controlPanelEl.style.gridTemplateColumns = "minmax(280px, 420px) minmax(260px, 1fr)";
    controlPanelEl.style.gap = "16px";
    const editorPanelEl = document.createElement("div");
    editorPanelEl.style.display = "flex";
    editorPanelEl.style.flexDirection = "column";
    editorPanelEl.style.gap = "12px";
    editorPanelEl.style.padding = "14px";
    editorPanelEl.style.borderRadius = "14px";
    editorPanelEl.style.background = "rgba(255,255,255,0.04)";
    editorPanelEl.style.border = "1px solid rgba(255,255,255,0.08)";
    this.selectedMetaEl = document.createElement("div");
    this.selectedMetaEl.style.opacity = "0.78";
    this.selectedMetaEl.style.lineHeight = "1.6";
    editorPanelEl.append(this.selectedMetaEl);
    const titleLabelEl = document.createElement("label");
    titleLabelEl.textContent = "\u8282\u70B9\u6807\u9898";
    titleLabelEl.style.display = "flex";
    titleLabelEl.style.flexDirection = "column";
    titleLabelEl.style.gap = "6px";
    titleLabelEl.style.fontSize = "13px";
    titleLabelEl.style.opacity = "0.86";
    this.titleInputEl = document.createElement("input");
    this.titleInputEl.type = "text";
    this.titleInputEl.setAttribute("spellcheck", "false");
    this.titleInputEl.setAttribute("autocorrect", "off");
    this.titleInputEl.setAttribute("autocapitalize", "off");
    this.titleInputEl.placeholder = "\u8BF7\u5148\u9009\u4E2D\u4E00\u4E2A\u8282\u70B9";
    this.titleInputEl.style.minHeight = "36px";
    this.titleInputEl.style.padding = "0 12px";
    this.titleInputEl.style.borderRadius = "10px";
    this.titleInputEl.style.border = "1px solid rgba(255,255,255,0.12)";
    this.titleInputEl.style.background = "rgba(255,255,255,0.04)";
    this.titleInputEl.style.color = "inherit";
    this.registerDomEvent(this.titleInputEl, "input", () => {
      this.updateSelectedNodeTitle(this.titleInputEl?.value ?? "");
    });
    titleLabelEl.append(this.titleInputEl);
    editorPanelEl.append(titleLabelEl);
    const urlLabelEl = document.createElement("label");
    urlLabelEl.textContent = "URL \u94FE\u63A5\u5730\u5740";
    urlLabelEl.style.display = "none";
    urlLabelEl.style.flexDirection = "column";
    urlLabelEl.style.gap = "6px";
    urlLabelEl.style.fontSize = "13px";
    urlLabelEl.style.opacity = "0.86";
    this.urlInputEl = document.createElement("input");
    this.urlInputEl.type = "url";
    this.urlInputEl.placeholder = "\u8F93\u5165 URL \u5730\u5740";
    this.urlInputEl.style.minHeight = "36px";
    this.urlInputEl.style.padding = "0 12px";
    this.urlInputEl.style.borderRadius = "10px";
    this.urlInputEl.style.border = "1px solid rgba(255,255,255,0.12)";
    this.urlInputEl.style.background = "rgba(255,255,255,0.04)";
    this.urlInputEl.style.color = "inherit";
    this.registerDomEvent(this.urlInputEl, "input", () => {
      this.updateSelectedNodeUrl(this.urlInputEl?.value ?? "");
    });
    urlLabelEl.append(this.urlInputEl);
    this.urlLabelEl = urlLabelEl;
    editorPanelEl.append(urlLabelEl);
    const bodyLabelEl = document.createElement("label");
    bodyLabelEl.textContent = "\u8282\u70B9\u6B63\u6587";
    bodyLabelEl.style.display = "flex";
    bodyLabelEl.style.flexDirection = "column";
    bodyLabelEl.style.gap = "6px";
    bodyLabelEl.style.fontSize = "13px";
    bodyLabelEl.style.opacity = "0.86";
    this.bodyInputEl = document.createElement("textarea");
    this.bodyInputEl.placeholder = "\u8BF7\u5148\u9009\u4E2D\u4E00\u4E2A\u8282\u70B9";
    this.bodyInputEl.style.minHeight = "120px";
    this.bodyInputEl.style.padding = "12px";
    this.bodyInputEl.style.borderRadius = "10px";
    this.bodyInputEl.style.border = "1px solid rgba(255,255,255,0.12)";
    this.bodyInputEl.style.background = "rgba(255,255,255,0.04)";
    this.bodyInputEl.style.color = "inherit";
    this.bodyInputEl.style.resize = "vertical";
    this.registerDomEvent(this.bodyInputEl, "input", () => {
      this.updateSelectedNodeBody(this.bodyInputEl?.value ?? "");
    });
    bodyLabelEl.append(this.bodyInputEl);
    this.bodyLabelEl = bodyLabelEl;
    editorPanelEl.append(bodyLabelEl);
    const filePanelEl = document.createElement("div");
    filePanelEl.style.display = "flex";
    filePanelEl.style.flexDirection = "column";
    filePanelEl.style.gap = "12px";
    filePanelEl.style.padding = "14px";
    filePanelEl.style.borderRadius = "14px";
    filePanelEl.style.background = "rgba(255,255,255,0.04)";
    filePanelEl.style.border = "1px solid rgba(255,255,255,0.08)";
    this.fileMetaEl = document.createElement("div");
    this.fileMetaEl.style.opacity = "0.8";
    this.fileMetaEl.style.lineHeight = "1.7";
    filePanelEl.append(this.fileMetaEl);
    const recentFilesTitleEl = document.createElement("div");
    recentFilesTitleEl.textContent = "\u6700\u8FD1\u6253\u5F00\u767D\u677F";
    recentFilesTitleEl.style.fontWeight = "600";
    recentFilesTitleEl.style.marginTop = "12px";
    filePanelEl.append(recentFilesTitleEl);
    this.recentFilesEl = document.createElement("div");
    this.recentFilesEl.style.display = "flex";
    this.recentFilesEl.style.flexDirection = "column";
    this.recentFilesEl.style.gap = "8px";
    filePanelEl.append(this.recentFilesEl);
    const allFilesTitleEl = document.createElement("div");
    allFilesTitleEl.textContent = "\u767D\u677F\u6587\u4EF6\u5217\u8868";
    allFilesTitleEl.style.fontWeight = "600";
    allFilesTitleEl.style.marginTop = "12px";
    filePanelEl.append(allFilesTitleEl);
    this.allFilesEl = document.createElement("div");
    this.allFilesEl.style.display = "flex";
    this.allFilesEl.style.flexDirection = "column";
    this.allFilesEl.style.gap = "8px";
    filePanelEl.append(this.allFilesEl);
    const fileActionHintEl = document.createElement("div");
    fileActionHintEl.textContent = "\u5EFA\u8BAE\u6D41\u7A0B\uFF1A\u5148\u70B9\u201C\u65B0\u5EFA\u767D\u677F\u6587\u4EF6\u201D\u5EFA\u7ACB\u4E3B\u6587\u4EF6\uFF1B\u4E4B\u540E\u5BF9\u767D\u677F\u7684\u62D6\u62FD\u3001\u7F29\u653E\u3001\u9009\u4E2D\u4E0E\u5185\u5BB9\u7F16\u8F91\u90FD\u4F1A\u81EA\u52A8\u4FDD\u5B58\u3002\u4E5F\u53EF\u4EE5\u968F\u65F6\u70B9\u201C\u4FDD\u5B58\u5230\u6587\u4EF6 / \u4ECE\u6587\u4EF6\u52A0\u8F7D / \u6253\u5F00\u767D\u677F\u6587\u4EF6\u201D\u505A\u624B\u52A8\u9A8C\u8BC1\u3002";
    fileActionHintEl.style.opacity = "0.72";
    fileActionHintEl.style.lineHeight = "1.6";
    fileActionHintEl.style.marginTop = "12px";
    filePanelEl.append(fileActionHintEl);
    controlPanelEl.append(editorPanelEl, filePanelEl);
    this.summaryEl = document.createElement("div");
    this.summaryEl.style.opacity = "0.8";
    this.summaryEl.style.lineHeight = "1.7";
    statusPanelEl.append(this.summaryEl);
    this.registerDomEvent(document, "mousemove", (event) => {
      this.handlePointerMove(event);
    });
    this.registerDomEvent(document, "mouseup", () => {
      this.finishPointerInteraction();
    });
    this.registerDomEvent(document, "keyup", (event) => {
      this.handleCanvasKeyup(event);
    });
    floatingPanelEl.append(this.recoveryPanelEl, statusPanelEl, toolbarEl);
    this.rootEl.append(this.viewportEl, floatingPanelEl);
    this.contentEl.replaceChildren(this.rootEl);
  }
  createNodeCard(node) {
    const isTextNode = node.type === "text";
    const isExpandedTextNode = isTextNode && nodeHeight(node) > TEXT_NODE_HEIGHT;
    const shouldCenterCompactTextNode = isTextNode && !isExpandedTextNode;
    const resizeHitAreaMetrics = resolveResizeHitAreaMetrics(node);
    const isSelected = this.selectedNodeIds.includes(node.id);
    const isInlineEditing = this.inlineEditingNodeId === node.id;
    const isReadOnly = this.isCanvasReadOnly();
    const initialResizeCursor = this.dragMode === "resize" && this.activeNodeId === node.id && this.resizeDirection !== null ? resolveResizeCursor(this.resizeDirection) : null;
    const nodeEl = document.createElement("div");
    nodeEl.style.position = "absolute";
    nodeEl.style.left = `${node.x}px`;
    nodeEl.style.top = `${node.y}px`;
    nodeEl.style.width = `${nodeWidth(node)}px`;
    nodeEl.style.minHeight = `${nodeHeight(node)}px`;
    nodeEl.style.height = !isTextNode || isExpandedTextNode ? `${nodeHeight(node)}px` : "";
    nodeEl.style.padding = "0";
    nodeEl.style.borderRadius = isTextNode ? "10px" : "12px";
    nodeEl.style.background = isTextNode ? "var(--ws-input-background, rgba(15,23,42,0.52))" : node.accent;
    nodeEl.style.border = `${NODE_BORDER_WIDTH} solid ${isSelected ? "transparent" : isTextNode ? "var(--ws-input-border, rgba(255,255,255,0.16))" : "rgba(255,255,255,0.16)"}`;
    nodeEl.style.outline = isSelected ? `${SELECTED_NODE_OUTLINE_WIDTH} solid ${SELECTED_NODE_BORDER_COLOR}` : "none";
    nodeEl.style.outlineOffset = isSelected ? "0" : "0";
    nodeEl.style.boxShadow = isTextNode ? "none" : `0 20px 40px ${node.shadow}`;
    nodeEl.style.cursor = initialResizeCursor ?? this.resolveNodeCursor(isSelected, isInlineEditing, isReadOnly);
    nodeEl.style.userSelect = "none";
    nodeEl.style.boxSizing = "border-box";
    nodeEl.style.overflow = "visible";
    nodeEl.style.display = shouldCenterCompactTextNode ? "flex" : "block";
    nodeEl.style.flexDirection = shouldCenterCompactTextNode ? "column" : "";
    nodeEl.style.justifyContent = shouldCenterCompactTextNode ? "center" : "";
    nodeEl.style.zIndex = resolveNodeZIndex(node, isSelected, false);
    nodeEl.setAttribute("tabindex", "0");
    nodeEl.dataset.pluginCanvasNodeRoot = "true";
    const resizeFrameEl = document.createElement("div");
    resizeFrameEl.dataset.role = "resize-frame";
    resizeFrameEl.dataset.inlineEditorInteractive = "true";
    resizeFrameEl.style.position = "absolute";
    resizeFrameEl.style.left = `-${resizeHitAreaMetrics.frameOutset}px`;
    resizeFrameEl.style.top = `-${resizeHitAreaMetrics.frameOutset}px`;
    resizeFrameEl.style.right = `-${resizeHitAreaMetrics.frameOutset}px`;
    resizeFrameEl.style.bottom = `-${resizeHitAreaMetrics.frameOutset}px`;
    resizeFrameEl.style.background = "transparent";
    resizeFrameEl.style.pointerEvents = "none";
    resizeFrameEl.style.zIndex = "6";
    const contentShellEl = document.createElement("div");
    contentShellEl.dataset.role = "content-shell";
    contentShellEl.style.width = "100%";
    contentShellEl.style.height = !isTextNode || isExpandedTextNode ? "100%" : "auto";
    contentShellEl.style.padding = isTextNode ? "0" : "18px";
    contentShellEl.style.boxSizing = "border-box";
    contentShellEl.style.display = "flex";
    contentShellEl.style.flexDirection = "column";
    contentShellEl.style.justifyContent = "flex-start";
    contentShellEl.style.overflow = "hidden";
    contentShellEl.style.borderRadius = "inherit";
    const nodeTypeEl = document.createElement("div");
    nodeTypeEl.dataset.role = "type-display";
    nodeTypeEl.textContent = getNodeTypeLabel(node.type);
    nodeTypeEl.style.display = "inline-flex";
    nodeTypeEl.style.width = "fit-content";
    nodeTypeEl.style.minHeight = "24px";
    nodeTypeEl.style.alignItems = "center";
    nodeTypeEl.style.marginBottom = "10px";
    nodeTypeEl.style.padding = "0 8px";
    nodeTypeEl.style.borderRadius = "999px";
    nodeTypeEl.style.border = "1px solid rgba(255,255,255,0.18)";
    nodeTypeEl.style.background = "rgba(15,23,42,0.26)";
    nodeTypeEl.style.fontSize = "12px";
    nodeTypeEl.style.fontWeight = "700";
    nodeTypeEl.style.pointerEvents = "none";
    const nodeTitleEl = document.createElement("div");
    nodeTitleEl.dataset.role = "title-display";
    nodeTitleEl.textContent = node.title;
    nodeTitleEl.style.display = isTextNode ? "none" : "block";
    nodeTitleEl.style.fontSize = "20px";
    nodeTitleEl.style.fontWeight = "700";
    nodeTitleEl.style.marginBottom = "8px";
    nodeTitleEl.style.pointerEvents = "none";
    const nodeMetaEl = document.createElement("div");
    nodeMetaEl.dataset.role = "meta-display";
    nodeMetaEl.textContent = this.resolveNodeReferenceText(node) ?? "";
    nodeMetaEl.style.display = nodeMetaEl.textContent.length > 0 ? "block" : "none";
    nodeMetaEl.style.marginBottom = "8px";
    nodeMetaEl.style.fontSize = "12px";
    nodeMetaEl.style.lineHeight = "1.5";
    nodeMetaEl.style.opacity = "0.72";
    nodeMetaEl.style.whiteSpace = "pre-wrap";
    nodeMetaEl.style.pointerEvents = "none";
    const nodeBodyEl = document.createElement("div");
    nodeBodyEl.dataset.role = "body-display";
    nodeBodyEl.textContent = node.body;
    nodeBodyEl.style.lineHeight = "1.6";
    nodeBodyEl.style.opacity = "0.84";
    nodeBodyEl.style.whiteSpace = "pre-wrap";
    nodeBodyEl.style.pointerEvents = "none";
    const urlPreviewEl = document.createElement("div");
    urlPreviewEl.dataset.role = "url-preview";
    urlPreviewEl.style.display = "none";
    urlPreviewEl.style.flexDirection = "column";
    urlPreviewEl.style.gap = "8px";
    urlPreviewEl.style.marginTop = "12px";
    urlPreviewEl.style.padding = "10px";
    urlPreviewEl.style.borderRadius = "12px";
    urlPreviewEl.style.border = "1px solid var(--ws-panel-border, rgba(255,255,255,0.14))";
    urlPreviewEl.style.background = "var(--ws-editorWidget-background, rgba(15,23,42,0.32))";
    urlPreviewEl.style.flex = "1 1 auto";
    urlPreviewEl.style.minHeight = "0";
    urlPreviewEl.style.overflow = "hidden";
    urlPreviewEl.style.boxSizing = "border-box";
    const inlineEditTriggerEl = document.createElement("div");
    inlineEditTriggerEl.dataset.role = "inline-edit-trigger";
    inlineEditTriggerEl.textContent = "\u5361\u7247\u5185\u7F16\u8F91";
    inlineEditTriggerEl.setAttribute("role", "button");
    inlineEditTriggerEl.tabIndex = 0;
    inlineEditTriggerEl.dataset.inlineEditorInteractive = "true";
    inlineEditTriggerEl.style.display = "none";
    inlineEditTriggerEl.style.alignItems = "center";
    inlineEditTriggerEl.style.justifyContent = "center";
    inlineEditTriggerEl.style.width = "fit-content";
    inlineEditTriggerEl.style.minHeight = "28px";
    inlineEditTriggerEl.style.marginTop = "12px";
    inlineEditTriggerEl.style.padding = "0 10px";
    inlineEditTriggerEl.style.borderRadius = "999px";
    inlineEditTriggerEl.style.border = "1px solid rgba(255,255,255,0.18)";
    inlineEditTriggerEl.style.background = "rgba(15,23,42,0.36)";
    inlineEditTriggerEl.style.cursor = "pointer";
    inlineEditTriggerEl.style.fontSize = "12px";
    inlineEditTriggerEl.style.opacity = "0.9";
    this.registerDomEvent(inlineEditTriggerEl, "click", () => {
      this.enterInlineEdit(node.id);
    });
    this.registerDomEvent(inlineEditTriggerEl, "keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      this.enterInlineEdit(node.id);
    });
    const inlineEditorEl = isTextNode ? null : document.createElement("div");
    if (inlineEditorEl !== null) {
      inlineEditorEl.dataset.role = "inline-editor";
      inlineEditorEl.style.display = isInlineEditing ? "flex" : "none";
      inlineEditorEl.style.flexDirection = "column";
      inlineEditorEl.style.flex = "1 1 auto";
      inlineEditorEl.style.gap = "8px";
      inlineEditorEl.style.marginTop = "4px";
      inlineEditorEl.style.justifyContent = "flex-start";
    }
    const inlineTitleInputEl = isTextNode ? document.createElement("textarea") : document.createElement("input");
    const textNodeTitleInputMetrics = resolveTextNodeTitleInputMetrics(isExpandedTextNode);
    inlineTitleInputEl.dataset.role = "inline-title-input";
    inlineTitleInputEl.dataset.inlineEditorInteractive = "true";
    if (inlineTitleInputEl instanceof HTMLInputElement) {
      inlineTitleInputEl.type = "text";
    } else {
      inlineTitleInputEl.dataset.customScrollbar = isExpandedTextNode ? "true" : "false";
      inlineTitleInputEl.rows = 1;
      inlineTitleInputEl.wrap = "soft";
      inlineTitleInputEl.style.resize = "none";
      inlineTitleInputEl.style.overflowY = isExpandedTextNode ? "auto" : "hidden";
      inlineTitleInputEl.style.overflowX = "hidden";
      inlineTitleInputEl.style.whiteSpace = "pre-wrap";
      inlineTitleInputEl.style.overflowWrap = "anywhere";
      inlineTitleInputEl.style.wordBreak = "break-word";
    }
    inlineTitleInputEl.setAttribute("spellcheck", "false");
    inlineTitleInputEl.setAttribute("autocorrect", "off");
    inlineTitleInputEl.setAttribute("autocapitalize", "off");
    inlineTitleInputEl.style.minHeight = isTextNode ? textNodeTitleInputMetrics.minHeight : "32px";
    inlineTitleInputEl.style.minWidth = isTextNode ? "0" : "";
    inlineTitleInputEl.style.height = isTextNode ? textNodeTitleInputMetrics.height : "32px";
    inlineTitleInputEl.style.width = isTextNode ? "" : "100%";
    inlineTitleInputEl.style.boxSizing = "border-box";
    inlineTitleInputEl.style.margin = "0";
    inlineTitleInputEl.style.padding = isTextNode ? textNodeTitleInputMetrics.padding : "0 10px";
    inlineTitleInputEl.style.borderRadius = isTextNode ? "0" : "10px";
    inlineTitleInputEl.style.border = isTextNode ? "none" : "1px solid rgba(255,255,255,0.16)";
    inlineTitleInputEl.style.background = isTextNode ? "transparent" : "rgba(15,23,42,0.36)";
    inlineTitleInputEl.style.color = "inherit";
    inlineTitleInputEl.style.fontSize = isTextNode ? "15px" : "14px";
    inlineTitleInputEl.style.fontWeight = isTextNode ? "500" : "400";
    inlineTitleInputEl.style.lineHeight = isTextNode ? `${TEXT_NODE_LINE_HEIGHT}px` : "normal";
    inlineTitleInputEl.style.caretColor = isTextNode ? isInlineEditing ? "var(--ws-input-foreground, inherit)" : "transparent" : "currentColor";
    inlineTitleInputEl.readOnly = isTextNode ? !isInlineEditing : false;
    inlineTitleInputEl.style.pointerEvents = isTextNode && !isInlineEditing ? "none" : "auto";
    inlineTitleInputEl.style.cursor = isTextNode && !isInlineEditing ? "inherit" : "text";
    inlineTitleInputEl.style.outline = "none";
    inlineTitleInputEl.tabIndex = isTextNode && !isInlineEditing ? -1 : 0;
    if (isTextNode && !isInlineEditing) {
      inlineTitleInputEl.dataset.pluginRuntimeStickBottom = "true";
    }
    if (isInlineEditing) {
      inlineTitleInputEl.dataset.pluginRuntimeAutofocus = "true";
      inlineTitleInputEl.dataset.pluginRuntimeEditing = "true";
    }
    this.registerDomEvent(inlineTitleInputEl, "focus", () => {
      const previousSelection = this.captureSelectionSnapshot();
      const nextInlineEditingNodeId = node.type === "text" ? node.id : this.inlineEditingNodeId;
      const shouldSyncSelection = previousSelection.selectedNodeId !== node.id || previousSelection.selectedNodeIds.length !== 1 || previousSelection.selectedNodeIds[0] !== node.id || previousSelection.inlineEditingNodeId !== nextInlineEditingNodeId;
      if (!shouldSyncSelection) {
        return;
      }
      this.setSelectedNodes([node.id], node.id);
      this.inlineEditingNodeId = nextInlineEditingNodeId;
      this.syncScene({
        nodeIds: this.collectSelectionAffectedNodeIds(previousSelection),
        inspector: true,
        summary: true
      });
    });
    this.registerDomEvent(inlineTitleInputEl, "input", () => {
      this.selectedNodeId = node.id;
      this.inlineEditingNodeId = node.id;
      this.updateSelectedNodeTitle(inlineTitleInputEl.value);
    });
    const inlineUrlInputEl = document.createElement("input");
    inlineUrlInputEl.dataset.role = "inline-url-input";
    inlineUrlInputEl.dataset.inlineEditorInteractive = "true";
    inlineUrlInputEl.type = "url";
    inlineUrlInputEl.setAttribute("spellcheck", "false");
    inlineUrlInputEl.setAttribute("autocorrect", "off");
    inlineUrlInputEl.setAttribute("autocapitalize", "off");
    inlineUrlInputEl.placeholder = "\u8F93\u5165 URL \u5730\u5740";
    inlineUrlInputEl.style.display = "none";
    inlineUrlInputEl.style.minHeight = "32px";
    inlineUrlInputEl.style.padding = "0 10px";
    inlineUrlInputEl.style.borderRadius = "10px";
    inlineUrlInputEl.style.border = "1px solid rgba(255,255,255,0.16)";
    inlineUrlInputEl.style.background = "rgba(15,23,42,0.36)";
    inlineUrlInputEl.style.color = "inherit";
    this.registerDomEvent(inlineUrlInputEl, "input", () => {
      this.selectedNodeId = node.id;
      this.inlineEditingNodeId = node.id;
      this.updateSelectedNodeUrl(inlineUrlInputEl.value);
    });
    const inlineBodyInputEl = document.createElement("textarea");
    inlineBodyInputEl.dataset.role = "inline-body-input";
    inlineBodyInputEl.dataset.inlineEditorInteractive = "true";
    inlineBodyInputEl.setAttribute("spellcheck", "false");
    inlineBodyInputEl.setAttribute("autocorrect", "off");
    inlineBodyInputEl.setAttribute("autocapitalize", "off");
    inlineBodyInputEl.style.minHeight = "78px";
    inlineBodyInputEl.style.padding = "10px";
    inlineBodyInputEl.style.borderRadius = "10px";
    inlineBodyInputEl.style.border = "1px solid rgba(255,255,255,0.16)";
    inlineBodyInputEl.style.background = "rgba(15,23,42,0.36)";
    inlineBodyInputEl.style.color = "inherit";
    inlineBodyInputEl.style.resize = "vertical";
    this.registerDomEvent(inlineBodyInputEl, "input", () => {
      this.selectedNodeId = node.id;
      this.inlineEditingNodeId = node.id;
      this.updateSelectedNodeBody(inlineBodyInputEl.value);
    });
    const inlineHintEl = document.createElement("div");
    inlineHintEl.dataset.role = "inline-edit-hint";
    inlineHintEl.textContent = "\u5F53\u524D\u5361\u7247\u6B63\u5728\u5C31\u5730\u7F16\u8F91";
    inlineHintEl.style.fontSize = "12px";
    inlineHintEl.style.opacity = "0.72";
    inlineHintEl.style.display = isTextNode ? "none" : "block";
    inlineHintEl.style.pointerEvents = "none";
    if (isTextNode) {
      contentShellEl.append(inlineTitleInputEl);
    } else if (inlineEditorEl !== null) {
      inlineEditorEl.append(inlineTitleInputEl, inlineUrlInputEl, inlineBodyInputEl, inlineHintEl);
    }
    const resizeHandleEl = document.createElement("div");
    resizeHandleEl.dataset.role = "resize-handle";
    resizeHandleEl.dataset.inlineEditorInteractive = "true";
    resizeHandleEl.style.position = "absolute";
    resizeHandleEl.style.right = "8px";
    resizeHandleEl.style.bottom = "8px";
    resizeHandleEl.style.width = "14px";
    resizeHandleEl.style.height = "14px";
    resizeHandleEl.style.borderRight = "2px solid rgba(255,255,255,0.72)";
    resizeHandleEl.style.borderBottom = "2px solid rgba(255,255,255,0.72)";
    resizeHandleEl.style.cursor = "nwse-resize";
    resizeHandleEl.style.opacity = "0.86";
    resizeHandleEl.style.display = "none";
    this.registerDomEvent(resizeHandleEl, "mousedown", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (!this.guardWritableCanvas("\u8C03\u6574\u8282\u70B9\u5927\u5C0F")) {
        return;
      }
      const currentNode = findNode(this.nodes, node.id);
      this.startNodeResizeInteraction(event, node.id, currentNode, "se", resizeHandleEl);
    });
    const resizeHitAreaEls = RESIZE_DIRECTIONS.reduce((result, direction) => {
      const handleEl = document.createElement("div");
      handleEl.dataset.role = `resize-hit-${direction}`;
      handleEl.dataset.inlineEditorInteractive = "true";
      this.applyResizeHitAreaLayout(handleEl, direction, resizeHitAreaMetrics);
      handleEl.style.display = isInlineEditing || isReadOnly ? "none" : "block";
      this.registerDomEvent(handleEl, "mousedown", (event) => {
        if (event.button !== 0) {
          return;
        }
        const currentNode = findNode(this.nodes, node.id);
        this.startNodeResizeInteraction(event, node.id, currentNode, direction, handleEl);
      });
      result[direction] = handleEl;
      return result;
    }, {
      n: document.createElement("div"),
      s: document.createElement("div"),
      e: document.createElement("div"),
      w: document.createElement("div"),
      ne: document.createElement("div"),
      nw: document.createElement("div"),
      se: document.createElement("div"),
      sw: document.createElement("div")
    });
    resizeFrameEl.append(...RESIZE_DIRECTIONS.map((direction) => resizeHitAreaEls[direction]));
    if (isTextNode) {
      nodeEl.append(contentShellEl, resizeFrameEl);
    } else {
      if (inlineEditorEl === null) {
        throw new Error("Block node inline editor is required.");
      }
      contentShellEl.append(
        nodeTypeEl,
        nodeTitleEl,
        nodeMetaEl,
        nodeBodyEl,
        urlPreviewEl,
        inlineEditTriggerEl,
        inlineEditorEl
      );
      nodeEl.append(contentShellEl, resizeHandleEl, resizeFrameEl);
    }
    this.registerDomEvent(nodeEl, "mousedown", (event) => {
      if (event.button !== 0) {
        return;
      }
      const eventTarget = event.target;
      if (eventTarget instanceof HTMLElement && eventTarget.dataset.inlineEditorInteractive === "true") {
        return;
      }
      const now = Date.now();
      const repeatedPrimaryDown = this.lastNodePointerDownId === node.id && now - this.lastNodePointerDownAt <= NODE_DOUBLE_CLICK_THRESHOLD_MS && Math.abs(event.clientX - this.lastNodePointerDownX) <= NODE_DOUBLE_CLICK_DISTANCE_THRESHOLD && Math.abs(event.clientY - this.lastNodePointerDownY) <= NODE_DOUBLE_CLICK_DISTANCE_THRESHOLD;
      this.lastNodePointerDownId = node.id;
      this.lastNodePointerDownAt = now;
      this.lastNodePointerDownX = event.clientX;
      this.lastNodePointerDownY = event.clientY;
      if (repeatedPrimaryDown) {
        event.preventDefault();
        const previousSelection2 = this.captureSelectionSnapshot();
        const zOrderChanged2 = this.bringNodeIdsToFront([node.id]);
        this.setSelectedNodes([node.id], node.id);
        this.inlineEditingNodeId = null;
        this.activeNodeId = null;
        this.dragMode = "none";
        const selectionChanged2 = this.hasSelectionStateChanged(previousSelection2);
        if (selectionChanged2) {
          this.syncScene({
            syncStructure: zOrderChanged2,
            nodeIds: this.collectSelectionAffectedNodeIds(previousSelection2),
            inspector: true,
            summary: true
          });
        }
        void this.activateNode(node.id);
        return;
      }
      const currentNode = findNode(this.nodes, node.id);
      const currentIsReadOnly = this.isCanvasReadOnly();
      const currentIsInlineEditing = this.inlineEditingNodeId === node.id && this.selectedNodeId === node.id && this.selectedNodeIds.length === 1 && !currentIsReadOnly;
      const resizeDirection = this.resolveResizeDirectionForNodeEvent(
        event,
        currentNode,
        currentIsInlineEditing,
        currentIsReadOnly
      );
      if (resizeDirection !== null) {
        event.preventDefault();
        const previousSelection2 = this.captureSelectionSnapshot();
        const zOrderChanged2 = this.bringNodeIdsToFront([node.id]);
        this.setSelectedNodes([node.id], node.id);
        this.inlineEditingNodeId = null;
        this.activeNodeId = node.id;
        this.dragMode = "resize";
        this.resizeDirection = resizeDirection;
        this.dragStartX = event.clientX;
        this.dragStartY = event.clientY;
        this.resizeOriginNodeX = currentNode.x;
        this.resizeOriginNodeY = currentNode.y;
        this.resizeOriginWidth = nodeWidth(currentNode);
        this.resizeOriginHeight = nodeHeight(currentNode);
        this.pointerCaptureOwnerEl = nodeEl;
        nodeEl.setPointerCapture(HOST_MOUSE_POINTER_ID);
        nodeEl.style.cursor = resolveResizeCursor(resizeDirection);
        this.syncScene({
          syncStructure: zOrderChanged2,
          nodeIds: this.collectSelectionAffectedNodeIds(previousSelection2),
          inspector: true,
          summary: true
        });
        return;
      }
      event.preventDefault();
      const previousSelection = this.captureSelectionSnapshot();
      const zOrderChanged = this.bringNodeIdsToFront([node.id]);
      this.setSelectedNodes([node.id], node.id);
      this.inlineEditingNodeId = null;
      this.activeNodeId = node.id;
      this.dragMode = "node";
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
      this.dragOriginNodeX = currentNode.x;
      this.dragOriginNodeY = currentNode.y;
      this.dragOriginNodePositions = this.captureDragOriginPositions(node.id);
      this.interactionOriginClientX = event.clientX;
      this.interactionOriginClientY = event.clientY;
      this.pointerCaptureOwnerEl = nodeEl;
      nodeEl.setPointerCapture(HOST_MOUSE_POINTER_ID);
      nodeEl.style.cursor = "grabbing";
      nodeEl.style.zIndex = NODE_ACTIVE_Z_INDEX;
      const selectionChanged = this.hasSelectionStateChanged(previousSelection);
      const selectionNodeIds = this.collectSelectionAffectedNodeIds(previousSelection);
      if (selectionChanged) {
        this.markSceneChanged({
          syncStructure: zOrderChanged,
          nodeIds: selectionNodeIds,
          inspector: true,
          summary: true
        });
        return;
      }
      this.syncScene({
        syncStructure: zOrderChanged,
        nodeIds: [node.id]
      });
    });
    this.registerDomEvent(nodeEl, "mousemove", (event) => {
      if (this.dragMode === "none") {
        const currentNode = this.nodes.find((item) => item.id === node.id) ?? null;
        if (currentNode !== null) {
          const resizeDirection = this.resolveResizeDirectionForNodeEvent(
            event,
            currentNode,
            this.inlineEditingNodeId === node.id,
            this.isCanvasReadOnly()
          );
          nodeEl.style.cursor = resizeDirection === null ? this.resolveNodeCursor(
            this.selectedNodeIds.includes(node.id),
            this.inlineEditingNodeId === node.id,
            this.isCanvasReadOnly()
          ) : resolveResizeCursor(resizeDirection);
        }
        return;
      }
      if (this.dragMode === "resize" && this.activeNodeId === node.id && this.resizeDirection !== null) {
        nodeEl.style.cursor = resolveResizeCursor(this.resizeDirection);
      }
      if (this.dragMode !== "node" || this.activeNodeId !== node.id) {
        if (this.dragMode === "resize" && this.activeNodeId === node.id) {
          this.handlePointerMove(event);
        }
        return;
      }
      this.handlePointerMove(event);
    });
    this.registerDomEvent(nodeEl, "mouseup", () => {
      if (this.dragMode !== "node" || this.activeNodeId !== node.id) {
        return;
      }
      this.finishPointerInteraction();
    });
    this.registerDomEvent(nodeEl, "dblclick", (event) => {
      event.preventDefault();
      void this.activateNode(node.id);
    });
    this.registerDomEvent(nodeEl, "contextmenu", (event) => {
      this.openNodeContextMenu(node.id, event);
    });
    this.bindCanvasKeyboardTarget(nodeEl);
    return {
      nodeEl,
      resizeFrameEl,
      contentShellEl,
      typeEl: nodeTypeEl,
      titleEl: nodeTitleEl,
      metaEl: nodeMetaEl,
      bodyEl: nodeBodyEl,
      urlPreviewEl,
      inlineEditTriggerEl,
      inlineEditorEl,
      inlineTitleInputEl,
      inlineUrlInputEl,
      inlineBodyInputEl,
      inlineHintEl,
      resizeHandleEl,
      resizeHitAreaEls
    };
  }
  createLineRuntime(line) {
    const holderEl = document.createElement("div");
    holderEl.style.position = "absolute";
    holderEl.style.left = "0";
    holderEl.style.top = "0";
    holderEl.style.pointerEvents = "none";
    const lineEl = document.createElement("div");
    lineEl.style.position = "absolute";
    lineEl.style.height = "4px";
    lineEl.style.borderRadius = "999px";
    lineEl.style.background = "linear-gradient(90deg, rgba(148,163,184,0.85), rgba(226,232,240,0.95))";
    lineEl.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.08)";
    lineEl.style.transformOrigin = "0 50%";
    const labelEl = document.createElement("div");
    labelEl.textContent = line.label;
    labelEl.style.position = "absolute";
    labelEl.style.padding = "4px 8px";
    labelEl.style.borderRadius = "999px";
    labelEl.style.background = "rgba(15, 23, 42, 0.86)";
    labelEl.style.border = "1px solid rgba(255,255,255,0.08)";
    labelEl.style.fontSize = "12px";
    labelEl.style.whiteSpace = "nowrap";
    holderEl.append(lineEl, labelEl);
    this.sceneEl?.append(holderEl);
    return {
      holderEl,
      lineEl,
      labelEl
    };
  }
  createToolChip(label, onClick) {
    const chipEl = document.createElement("div");
    chipEl.textContent = label;
    chipEl.setAttribute("role", "button");
    chipEl.tabIndex = 0;
    chipEl.style.display = "inline-flex";
    chipEl.style.alignItems = "center";
    chipEl.style.justifyContent = "flex-start";
    chipEl.style.width = "100%";
    chipEl.style.minHeight = "32px";
    chipEl.style.padding = "0 12px";
    chipEl.style.boxSizing = "border-box";
    chipEl.style.border = "1px solid rgba(255,255,255,0.12)";
    chipEl.style.borderRadius = "999px";
    chipEl.style.cursor = "pointer";
    chipEl.style.userSelect = "none";
    chipEl.style.background = "rgba(255,255,255,0.04)";
    this.registerDomEvent(chipEl, "click", (event) => {
      this.captureViewportMetricsFromEvent(event);
      onClick();
    });
    this.registerDomEvent(chipEl, "keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      this.captureViewportMetricsFromEvent(event);
      onClick();
    });
    return chipEl;
  }
  resolveSelectedNode() {
    if (this.selectedNodeId === null) {
      return null;
    }
    return this.nodes.find((node) => node.id === this.selectedNodeId) ?? null;
  }
  resolveSelectedNodes() {
    if (this.selectedNodeIds.length === 0) {
      return [];
    }
    const selectedIdSet = new Set(this.selectedNodeIds);
    return this.nodes.filter((node) => selectedIdSet.has(node.id));
  }
  captureSelectionSnapshot() {
    return {
      selectedNodeId: this.selectedNodeId,
      selectedNodeIds: [...this.selectedNodeIds],
      inlineEditingNodeId: this.inlineEditingNodeId,
      persistentSelectionBoxActive: this.persistentSelectionBoxActive
    };
  }
  hasSelectionStateChanged(previousSelection) {
    if (previousSelection.selectedNodeId !== this.selectedNodeId) {
      return true;
    }
    if (previousSelection.inlineEditingNodeId !== this.inlineEditingNodeId) {
      return true;
    }
    if (previousSelection.persistentSelectionBoxActive !== this.persistentSelectionBoxActive) {
      return true;
    }
    if (previousSelection.selectedNodeIds.length !== this.selectedNodeIds.length) {
      return true;
    }
    return previousSelection.selectedNodeIds.some((nodeId, index) => this.selectedNodeIds[index] !== nodeId);
  }
  collectSelectionAffectedNodeIds(previousSelection) {
    return [
      .../* @__PURE__ */ new Set([
        ...previousSelection.selectedNodeIds,
        ...this.selectedNodeIds,
        ...previousSelection.selectedNodeId === null ? [] : [previousSelection.selectedNodeId],
        ...this.selectedNodeId === null ? [] : [this.selectedNodeId],
        ...previousSelection.inlineEditingNodeId === null ? [] : [previousSelection.inlineEditingNodeId],
        ...this.inlineEditingNodeId === null ? [] : [this.inlineEditingNodeId]
      ])
    ];
  }
  collectLineIdsForNodeIds(nodeIds) {
    if (nodeIds.length === 0) {
      return [];
    }
    const nodeIdSet = new Set(nodeIds);
    return this.lines.filter((line) => nodeIdSet.has(line.from) || nodeIdSet.has(line.to)).map((line) => line.id);
  }
  collectGroupMemberIds(groupId) {
    return this.nodes.filter((node) => node.groupId === groupId).map((node) => node.id);
  }
  collectParentGroupIdsForNodes(nodeIds) {
    const nodeIdSet = new Set(nodeIds);
    const groupIds = [];
    for (const node of this.nodes) {
      if (node.groupId !== void 0 && nodeIdSet.has(node.id)) {
        groupIds.push(node.groupId);
      }
    }
    return [...new Set(groupIds)];
  }
  resolveGroupMemberBounds(groupId) {
    const members = this.nodes.filter((node) => node.groupId === groupId && node.id !== groupId);
    if (members.length === 0) {
      return null;
    }
    const minX = Math.min(...members.map((node) => node.x));
    const minY = Math.min(...members.map((node) => node.y));
    const maxX = Math.max(...members.map((node) => node.x + nodeWidth(node)));
    const maxY = Math.max(...members.map((node) => node.y + nodeHeight(node)));
    return {
      x: minX - GROUP_NODE_PADDING,
      y: minY - GROUP_NODE_PADDING,
      width: Math.max(GROUP_NODE_WIDTH, maxX - minX + GROUP_NODE_PADDING * 2),
      height: Math.max(GROUP_NODE_HEIGHT, maxY - minY + GROUP_NODE_PADDING * 2)
    };
  }
  expandGroupsToFitMembers(groupIds) {
    const targetGroupIds = [...new Set(groupIds)];
    if (targetGroupIds.length === 0) {
      return [];
    }
    const changedGroupIds = [];
    this.nodes = this.nodes.map((node) => {
      if (node.type !== "group" || !targetGroupIds.includes(node.id)) {
        return node;
      }
      const memberBounds = this.resolveGroupMemberBounds(node.id);
      if (memberBounds === null) {
        return node;
      }
      const currentRight = node.x + nodeWidth(node);
      const currentBottom = node.y + nodeHeight(node);
      const boundsRight = memberBounds.x + memberBounds.width;
      const boundsBottom = memberBounds.y + memberBounds.height;
      const nextX = Math.min(node.x, memberBounds.x);
      const nextY = Math.min(node.y, memberBounds.y);
      const nextWidth = Math.max(currentRight, boundsRight) - nextX;
      const nextHeight = Math.max(currentBottom, boundsBottom) - nextY;
      if (nextX === node.x && nextY === node.y && nextWidth === nodeWidth(node) && nextHeight === nodeHeight(node)) {
        return node;
      }
      changedGroupIds.push(node.id);
      return {
        ...node,
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight
      };
    });
    return changedGroupIds;
  }
  collectGroupAwareMoveNodeIds(nodeIds) {
    const moveNodeIds = new Set(nodeIds);
    for (const node of this.nodes) {
      if (node.type !== "group" || !moveNodeIds.has(node.id)) {
        continue;
      }
      for (const memberId of this.collectGroupMemberIds(node.id)) {
        moveNodeIds.add(memberId);
      }
    }
    return [...moveNodeIds];
  }
  captureDragOriginPositions(activeNodeId) {
    return this.captureDragOriginPositionsForNodeIds([activeNodeId]);
  }
  captureDragOriginPositionsForNodeIds(activeNodeIds) {
    const moveNodeIds = this.collectGroupAwareMoveNodeIds(activeNodeIds);
    const entries = [];
    for (const node of this.nodes) {
      if (!moveNodeIds.includes(node.id)) {
        continue;
      }
      entries.push([node.id, { x: node.x, y: node.y }]);
    }
    return new Map(entries);
  }
  resolveDropTargetGroupId(activeNode) {
    if (activeNode.type === "group") {
      return null;
    }
    const centerPoint = {
      x: nodeCenterX(activeNode),
      y: nodeCenterY(activeNode)
    };
    return this.nodes.find((node) => node.type === "group" && node.id !== activeNode.id && isPointInsideNode(centerPoint, node))?.id ?? null;
  }
  createNodeWithoutGroupId(node) {
    return {
      id: node.id,
      type: node.type,
      title: node.title,
      body: node.body,
      accent: node.accent,
      shadow: node.shadow,
      x: node.x,
      y: node.y,
      ...node.targetPath === void 0 ? {} : { targetPath: node.targetPath },
      ...node.url === void 0 ? {} : { url: node.url },
      ...node.width === void 0 ? {} : { width: node.width },
      ...node.height === void 0 ? {} : { height: node.height }
    };
  }
  setSelectedNodes(nodeIds, preferredNodeId = null) {
    const existingNodeIds = new Set(this.nodes.map((node) => node.id));
    const normalizedIds = [...new Set(nodeIds)].filter((nodeId) => existingNodeIds.has(nodeId));
    this.selectedNodeIds = normalizedIds;
    if (this.dragMode !== "select") {
      this.persistentSelectionBoxActive = false;
    }
    if (normalizedIds.length === 0) {
      this.selectedNodeId = null;
      this.inlineEditingNodeId = null;
      this.persistentSelectionBoxActive = false;
      return;
    }
    if (preferredNodeId !== null && normalizedIds.includes(preferredNodeId)) {
      this.selectedNodeId = preferredNodeId;
    } else if (this.selectedNodeId !== null && normalizedIds.includes(this.selectedNodeId)) {
      this.selectedNodeId = this.selectedNodeId;
    } else {
      this.selectedNodeId = normalizedIds[0] ?? null;
    }
    if (this.inlineEditingNodeId !== null && !normalizedIds.includes(this.inlineEditingNodeId)) {
      this.inlineEditingNodeId = null;
    }
  }
  resolveViewportLocalPoint(event, fallbackToStoredOrigin) {
    this.captureViewportMetricsFromEvent(event);
    const clientX = readEventClientCoordinate(event, "clientX");
    const clientY = readEventClientCoordinate(event, "clientY");
    const elementX = readAugmentedEventNumber(event, "elementX");
    const elementY = readAugmentedEventNumber(event, "elementY");
    if (elementX !== null && elementY !== null) {
      if (event.target === this.viewportEl) {
        return {
          x: elementX,
          y: elementY
        };
      }
      if (event.target === this.sceneEl) {
        return {
          x: this.offsetX + elementX,
          y: this.offsetY + elementY
        };
      }
      if (!fallbackToStoredOrigin) {
        return null;
      }
    }
    if (!fallbackToStoredOrigin) {
      return null;
    }
    return {
      x: clientX - this.interactionOriginClientX,
      y: clientY - this.interactionOriginClientY
    };
  }
  resolveScenePointFromViewportLocal(viewportLocal) {
    return {
      x: (viewportLocal.x - this.offsetX) / this.scale,
      y: (viewportLocal.y - this.offsetY) / this.scale
    };
  }
  updateSelectionBoxFromSceneBounds() {
    if (this.selectionBoxEl === null) {
      return;
    }
    const canDragPersistentSelection = this.canDragPersistentSelectionBox();
    this.selectionBoxEl.style.pointerEvents = this.dragMode === "selection-box" || canDragPersistentSelection ? "auto" : "none";
    this.selectionBoxEl.style.cursor = this.dragMode === "selection-box" ? "grabbing" : canDragPersistentSelection ? "pointer" : "default";
    if (this.dragMode !== "select" && !this.persistentSelectionBoxActive) {
      this.selectionBoxEl.style.display = "none";
      return;
    }
    let left = 0;
    let top = 0;
    let width = 0;
    let height = 0;
    if (this.dragMode === "select") {
      const startViewportX = this.offsetX + this.selectionStartSceneX * this.scale;
      const startViewportY = this.offsetY + this.selectionStartSceneY * this.scale;
      const currentViewportX = this.offsetX + this.selectionCurrentSceneX * this.scale;
      const currentViewportY = this.offsetY + this.selectionCurrentSceneY * this.scale;
      left = Math.min(startViewportX, currentViewportX);
      top = Math.min(startViewportY, currentViewportY);
      width = Math.abs(currentViewportX - startViewportX);
      height = Math.abs(currentViewportY - startViewportY);
    } else {
      const selectedNodes = this.resolveSelectedNodes();
      if (selectedNodes.length === 0) {
        this.selectionBoxEl.style.display = "none";
        return;
      }
      const minX = Math.min(...selectedNodes.map((node) => node.x));
      const minY = Math.min(...selectedNodes.map((node) => node.y));
      const maxX = Math.max(...selectedNodes.map((node) => node.x + nodeWidth(node)));
      const maxY = Math.max(...selectedNodes.map((node) => node.y + nodeHeight(node)));
      left = this.offsetX + minX * this.scale - PERSISTENT_SELECTION_BOX_PADDING;
      top = this.offsetY + minY * this.scale - PERSISTENT_SELECTION_BOX_PADDING;
      width = (maxX - minX) * this.scale + PERSISTENT_SELECTION_BOX_PADDING * 2;
      height = (maxY - minY) * this.scale + PERSISTENT_SELECTION_BOX_PADDING * 2;
    }
    this.selectionBoxEl.style.display = "block";
    this.selectionBoxEl.style.left = `${left}px`;
    this.selectionBoxEl.style.top = `${top}px`;
    this.selectionBoxEl.style.width = `${width}px`;
    this.selectionBoxEl.style.height = `${height}px`;
  }
  updateBoxSelectionCandidates(previousSelection) {
    const minX = Math.min(this.selectionStartSceneX, this.selectionCurrentSceneX);
    const maxX = Math.max(this.selectionStartSceneX, this.selectionCurrentSceneX);
    const minY = Math.min(this.selectionStartSceneY, this.selectionCurrentSceneY);
    const maxY = Math.max(this.selectionStartSceneY, this.selectionCurrentSceneY);
    const selectedIds = this.nodes.filter((node) => {
      const nodeRight = node.x + nodeWidth(node);
      const nodeBottom = node.y + nodeHeight(node);
      return !(nodeRight < minX || node.x > maxX || nodeBottom < minY || node.y > maxY);
    }).map((node) => node.id);
    this.setSelectedNodes(selectedIds, selectedIds[0] ?? null);
    return this.collectSelectionAffectedNodeIds(previousSelection);
  }
  enterInlineEdit(nodeId) {
    if (!this.guardWritableCanvas("\u7F16\u8F91\u8282\u70B9")) {
      return;
    }
    const activeNode = this.nodes.find((node) => node.id === nodeId) ?? null;
    const previousSelection = this.captureSelectionSnapshot();
    const zOrderChanged = this.bringNodeIdsToFront([nodeId]);
    this.setSelectedNodes([nodeId], nodeId);
    if (activeNode?.type === "url") {
      this.inlineEditingNodeId = null;
      this.syncScene({
        syncStructure: zOrderChanged,
        nodeIds: this.collectSelectionAffectedNodeIds(previousSelection),
        inspector: true,
        summary: true
      });
      this.openUrlNodeAddressEditor(activeNode);
      return;
    }
    this.inlineEditingNodeId = nodeId;
    this.syncScene({
      syncStructure: zOrderChanged,
      nodeIds: this.collectSelectionAffectedNodeIds(previousSelection),
      inspector: true,
      summary: true
    });
    const activeNodeRuntime = this.nodeRuntimes.get(nodeId) ?? null;
    if (activeNodeRuntime !== null) {
      this.focusInlineTitleInput(activeNodeRuntime.inlineTitleInputEl);
    }
  }
  syncNodeDom() {
    const activeNodeIds = new Set(this.nodes.map((node) => node.id));
    for (const [nodeId, runtime] of [...this.nodeRuntimes.entries()]) {
      if (activeNodeIds.has(nodeId)) {
        continue;
      }
      runtime.nodeEl.remove();
      this.nodeRuntimes.delete(nodeId);
      this.urlPreviewStates.delete(nodeId);
    }
    for (const node of this.nodes) {
      let runtime = this.nodeRuntimes.get(node.id) ?? null;
      if (runtime === null) {
        runtime = this.createNodeCard(node);
        this.nodeRuntimes.set(node.id, runtime);
      }
      this.sceneEl?.append(runtime.nodeEl);
    }
  }
  syncLineDom() {
    const activeLineIds = new Set(this.lines.map((line) => line.id));
    for (const [lineId, lineRuntime] of [...this.lineRuntimes.entries()]) {
      if (activeLineIds.has(lineId)) {
        continue;
      }
      lineRuntime.holderEl.remove();
      this.lineRuntimes.delete(lineId);
    }
    for (const line of this.lines) {
      const existingRuntime = this.lineRuntimes.get(line.id) ?? null;
      if (existingRuntime !== null) {
        existingRuntime.labelEl.textContent = line.label;
        continue;
      }
      this.lineRuntimes.set(line.id, this.createLineRuntime(line));
    }
  }
  syncNodeRuntime(nodeId) {
    const runtime = this.nodeRuntimes.get(nodeId) ?? null;
    if (runtime === null) {
      return;
    }
    const node = this.nodes.find((item) => item.id === nodeId) ?? null;
    if (node === null) {
      return;
    }
    const typeLabel = getNodeTypeLabel(node.type);
    const referenceText = this.resolveNodeReferenceText(node);
    const hasBrokenReference = this.hasBrokenNodeReference(node);
    const isTextNode = node.type === "text";
    const isUrlNode = node.type === "url";
    const shouldDeferUrlPreviewSync = isUrlNode && (this.dragMode === "node" && (this.dragOriginNodePositions.has(node.id) || this.activeNodeId === node.id) || this.dragMode === "selection-box" && this.dragOriginNodePositions.has(node.id) || this.dragMode === "resize" && this.activeNodeId === node.id);
    if (runtime.typeEl.textContent !== typeLabel) {
      runtime.typeEl.textContent = typeLabel;
    }
    if (runtime.titleEl.textContent !== node.title) {
      runtime.titleEl.textContent = node.title;
    }
    if (runtime.metaEl.textContent !== (referenceText ?? "")) {
      runtime.metaEl.textContent = referenceText ?? "";
    }
    runtime.metaEl.style.display = referenceText === null || isUrlNode ? "none" : "block";
    runtime.metaEl.style.color = hasBrokenReference ? "rgba(254,202,202,0.96)" : "inherit";
    if (runtime.bodyEl.textContent !== node.body) {
      runtime.bodyEl.textContent = node.body;
    }
    if (!shouldDeferUrlPreviewSync) {
      this.syncUrlPreviewRuntime(node, runtime);
    }
    const isSelected = this.selectedNodeIds.includes(node.id);
    const isGroupNode = node.type === "group";
    const isGroupDropTarget = this.dropTargetGroupId === node.id;
    const isReadOnly = this.isCanvasReadOnly();
    const isActiveResizeNode = this.dragMode === "resize" && this.activeNodeId === node.id;
    const isExpandedTextNode = isTextNode && nodeHeight(node) > TEXT_NODE_HEIGHT;
    const shouldCenterCompactTextNode = isTextNode && !isExpandedTextNode;
    const resizeHitAreaMetrics = resolveResizeHitAreaMetrics(node);
    const hasVisibleTitle = node.title.trim().length > 0;
    const hasVisibleBody = node.body.trim().length > 0;
    const isInlineEditing = this.selectedNodeIds.length === 1 && this.inlineEditingNodeId === node.id && this.selectedNodeId === node.id && !isReadOnly;
    if (runtime.inlineEditorEl !== null) {
      runtime.inlineEditorEl.style.display = isInlineEditing ? "flex" : "none";
      runtime.inlineEditorEl.style.flex = "1 1 auto";
      runtime.inlineEditorEl.style.gap = "8px";
      runtime.inlineEditorEl.style.marginTop = "4px";
      runtime.inlineEditorEl.style.justifyContent = "flex-start";
    }
    if (isInlineEditing) {
      runtime.inlineTitleInputEl.dataset.pluginRuntimeAutofocus = "true";
      runtime.inlineTitleInputEl.dataset.pluginRuntimeEditing = "true";
    } else {
      delete runtime.inlineTitleInputEl.dataset.pluginRuntimeAutofocus;
      delete runtime.inlineTitleInputEl.dataset.pluginRuntimeEditing;
    }
    runtime.inlineEditTriggerEl.style.display = isTextNode ? "none" : isSelected && !isInlineEditing && !isReadOnly && !isUrlNode ? "inline-flex" : "none";
    runtime.typeEl.style.display = isTextNode ? "none" : "inline-flex";
    runtime.titleEl.style.display = isTextNode ? "none" : isInlineEditing || isUrlNode || !hasVisibleTitle ? "none" : "block";
    runtime.bodyEl.style.display = isTextNode || isInlineEditing || isGroupNode || isUrlNode || !hasVisibleBody ? "none" : "block";
    runtime.inlineBodyInputEl.style.display = isTextNode || isGroupNode || isUrlNode ? "none" : "block";
    runtime.resizeHandleEl.style.display = "none";
    for (const direction of RESIZE_DIRECTIONS) {
      this.applyResizeHitAreaLayout(runtime.resizeHitAreaEls[direction], direction, resizeHitAreaMetrics);
      runtime.resizeHitAreaEls[direction].style.display = isInlineEditing || isReadOnly ? "none" : "block";
    }
    runtime.inlineTitleInputEl.style.display = isUrlNode ? "none" : "block";
    runtime.inlineUrlInputEl.style.display = "none";
    runtime.inlineHintEl.style.display = isTextNode ? "none" : isInlineEditing ? "block" : "none";
    runtime.inlineTitleInputEl.readOnly = isTextNode ? !isInlineEditing : false;
    runtime.inlineTitleInputEl.disabled = isReadOnly || isUrlNode;
    runtime.inlineUrlInputEl.disabled = true;
    runtime.inlineBodyInputEl.disabled = isReadOnly || isTextNode || isGroupNode || isUrlNode;
    if (runtime.inlineTitleInputEl.value !== node.title) {
      runtime.inlineTitleInputEl.value = node.title;
    }
    if (runtime.inlineUrlInputEl.value !== (node.url ?? "")) {
      runtime.inlineUrlInputEl.value = node.url ?? "";
    }
    if (runtime.inlineBodyInputEl.value !== node.body) {
      runtime.inlineBodyInputEl.value = node.body;
    }
    runtime.nodeEl.style.transform = "";
    runtime.nodeEl.style.left = `${node.x}px`;
    runtime.nodeEl.style.top = `${node.y}px`;
    runtime.nodeEl.style.width = `${nodeWidth(node)}px`;
    runtime.nodeEl.style.minHeight = `${nodeHeight(node)}px`;
    runtime.nodeEl.style.height = !isTextNode || isExpandedTextNode ? `${nodeHeight(node)}px` : "";
    runtime.nodeEl.style.padding = "0";
    runtime.nodeEl.style.display = shouldCenterCompactTextNode ? "flex" : "block";
    runtime.nodeEl.style.flexDirection = shouldCenterCompactTextNode ? "column" : "";
    runtime.nodeEl.style.justifyContent = shouldCenterCompactTextNode ? "center" : "";
    runtime.nodeEl.style.borderRadius = isTextNode ? "10px" : "12px";
    runtime.nodeEl.style.background = isTextNode ? "var(--ws-input-background, rgba(15,23,42,0.52))" : node.accent;
    runtime.nodeEl.style.boxShadow = isTextNode ? "none" : `0 20px 40px ${node.shadow}`;
    runtime.nodeEl.style.borderWidth = NODE_BORDER_WIDTH;
    runtime.nodeEl.style.borderStyle = isGroupNode ? "dashed" : "solid";
    runtime.nodeEl.style.borderColor = isSelected ? "transparent" : isTextNode ? "var(--ws-input-border, rgba(255,255,255,0.16))" : hasBrokenReference ? "rgba(248,113,113,0.92)" : "rgba(255,255,255,0.16)";
    runtime.nodeEl.style.cursor = this.dragMode === "resize" && this.activeNodeId === node.id && this.resizeDirection !== null ? resolveResizeCursor(this.resizeDirection) : this.resolveNodeCursor(isSelected, isInlineEditing, isReadOnly);
    runtime.nodeEl.style.zIndex = resolveNodeZIndex(
      node,
      isSelected,
      this.dragMode !== "none" && this.activeNodeId === node.id || this.dragMode === "selection-box" && this.dragOriginNodePositions.has(node.id)
    );
    runtime.nodeEl.style.outline = isGroupDropTarget ? "2px solid rgba(34,197,94,0.92)" : isSelected ? `${SELECTED_NODE_OUTLINE_WIDTH} solid ${SELECTED_NODE_BORDER_COLOR}` : "none";
    runtime.nodeEl.style.outlineOffset = isGroupDropTarget || isSelected ? "0" : "0";
    runtime.resizeFrameEl.style.left = `-${resizeHitAreaMetrics.frameOutset}px`;
    runtime.resizeFrameEl.style.top = `-${resizeHitAreaMetrics.frameOutset}px`;
    runtime.resizeFrameEl.style.right = `-${resizeHitAreaMetrics.frameOutset}px`;
    runtime.resizeFrameEl.style.bottom = `-${resizeHitAreaMetrics.frameOutset}px`;
    runtime.contentShellEl.style.height = !isTextNode || isExpandedTextNode ? "100%" : "auto";
    runtime.contentShellEl.style.padding = isTextNode ? "0" : "18px";
    runtime.contentShellEl.style.borderRadius = "inherit";
    runtime.contentShellEl.style.justifyContent = "flex-start";
    runtime.titleEl.style.minHeight = "";
    runtime.titleEl.style.height = "";
    runtime.titleEl.style.marginBottom = isTextNode ? "0" : "8px";
    runtime.titleEl.style.padding = "0";
    runtime.titleEl.style.alignItems = "";
    runtime.titleEl.style.whiteSpace = !isTextNode && isActiveResizeNode ? "nowrap" : "normal";
    runtime.titleEl.style.overflow = !isTextNode && isActiveResizeNode ? "hidden" : "visible";
    runtime.titleEl.style.textOverflow = !isTextNode && isActiveResizeNode ? "ellipsis" : "clip";
    runtime.titleEl.style.fontSize = isTextNode ? "18px" : "20px";
    runtime.titleEl.style.fontWeight = isTextNode ? "500" : "700";
    runtime.titleEl.style.opacity = isTextNode ? "0.96" : "1";
    runtime.metaEl.style.whiteSpace = !isTextNode && isActiveResizeNode ? "nowrap" : "pre-wrap";
    runtime.metaEl.style.overflow = !isTextNode && isActiveResizeNode ? "hidden" : "visible";
    runtime.metaEl.style.textOverflow = !isTextNode && isActiveResizeNode ? "ellipsis" : "clip";
    runtime.bodyEl.style.whiteSpace = !isTextNode && isActiveResizeNode ? "nowrap" : "pre-wrap";
    runtime.bodyEl.style.overflow = !isTextNode && isActiveResizeNode ? "hidden" : "visible";
    runtime.bodyEl.style.textOverflow = !isTextNode && isActiveResizeNode ? "ellipsis" : "clip";
    const textNodeTitleInputMetrics = resolveTextNodeTitleInputMetrics(isExpandedTextNode);
    runtime.inlineTitleInputEl.style.minHeight = isTextNode ? textNodeTitleInputMetrics.minHeight : "32px";
    runtime.inlineTitleInputEl.style.minWidth = isTextNode ? "0" : "";
    runtime.inlineTitleInputEl.style.height = isTextNode ? textNodeTitleInputMetrics.height : "32px";
    runtime.inlineTitleInputEl.style.width = isTextNode ? "" : "100%";
    runtime.inlineTitleInputEl.style.boxSizing = "border-box";
    runtime.inlineTitleInputEl.style.margin = "0";
    runtime.inlineTitleInputEl.style.padding = isTextNode ? textNodeTitleInputMetrics.padding : "0 10px";
    runtime.inlineTitleInputEl.style.borderRadius = isTextNode ? "0" : "10px";
    runtime.inlineTitleInputEl.style.border = isTextNode ? "none" : "1px solid rgba(255,255,255,0.16)";
    runtime.inlineTitleInputEl.style.background = isTextNode ? "transparent" : "rgba(15,23,42,0.36)";
    runtime.inlineTitleInputEl.style.color = isTextNode ? "var(--ws-input-foreground, inherit)" : "inherit";
    runtime.inlineTitleInputEl.style.fontSize = isTextNode ? "15px" : "14px";
    runtime.inlineTitleInputEl.style.fontWeight = isTextNode ? "500" : "400";
    runtime.inlineTitleInputEl.style.lineHeight = isTextNode ? `${TEXT_NODE_LINE_HEIGHT}px` : "normal";
    runtime.inlineTitleInputEl.style.caretColor = isTextNode ? isInlineEditing ? "var(--ws-input-foreground, inherit)" : "transparent" : "currentColor";
    runtime.inlineTitleInputEl.style.pointerEvents = isTextNode && !isInlineEditing ? "none" : "auto";
    runtime.inlineTitleInputEl.style.cursor = isTextNode && !isInlineEditing ? "inherit" : "text";
    runtime.inlineTitleInputEl.style.outline = "none";
    runtime.inlineTitleInputEl.tabIndex = isTextNode && !isInlineEditing ? -1 : 0;
    if (isTextNode && !isInlineEditing) {
      runtime.inlineTitleInputEl.dataset.pluginRuntimeStickBottom = "true";
    } else {
      delete runtime.inlineTitleInputEl.dataset.pluginRuntimeStickBottom;
    }
    if (runtime.inlineTitleInputEl instanceof HTMLTextAreaElement) {
      runtime.inlineTitleInputEl.dataset.customScrollbar = isExpandedTextNode ? "true" : "false";
      runtime.inlineTitleInputEl.rows = 1;
      runtime.inlineTitleInputEl.wrap = "soft";
      runtime.inlineTitleInputEl.style.resize = "none";
      runtime.inlineTitleInputEl.style.overflowY = isExpandedTextNode && isInlineEditing ? "auto" : "hidden";
      runtime.inlineTitleInputEl.style.overflowX = "hidden";
      runtime.inlineTitleInputEl.style.whiteSpace = isTextNode ? "pre-wrap" : "normal";
      runtime.inlineTitleInputEl.style.overflowWrap = isTextNode ? "anywhere" : "normal";
      runtime.inlineTitleInputEl.style.wordBreak = isTextNode ? "break-word" : "normal";
    }
    this.syncTextNodeDisplayViewport(node, runtime, isInlineEditing);
  }
  syncLineRuntime(lineId) {
    const runtime = this.lineRuntimes.get(lineId) ?? null;
    if (runtime === null) {
      return;
    }
    const line = this.lines.find((item) => item.id === lineId) ?? null;
    if (line === null) {
      return;
    }
    const fromNode = this.nodes.find((node) => node.id === line.from) ?? null;
    const toNode = this.nodes.find((node) => node.id === line.to) ?? null;
    if (fromNode === null || toNode === null) {
      runtime.holderEl.style.display = "none";
      return;
    }
    runtime.holderEl.style.display = "";
    const startX = nodeCenterX(fromNode);
    const startY = nodeCenterY(fromNode);
    const endX = nodeCenterX(toNode);
    const endY = nodeCenterY(toNode);
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    const midX = startX + deltaX / 2;
    const midY = startY + deltaY / 2;
    runtime.lineEl.style.width = `${length}px`;
    runtime.lineEl.style.transform = `translate(${startX}px, ${startY}px) rotate(${angle}deg)`;
    runtime.labelEl.style.transform = `translate(${midX - 28}px, ${midY - 18}px)`;
    runtime.labelEl.textContent = line.label;
  }
  handlePointerMove(event) {
    if (this.dragMode === "none") {
      return;
    }
    if (this.isCanvasReadOnly() && (this.dragMode === "node" || this.dragMode === "selection-box" || this.dragMode === "resize")) {
      this.finishPointerInteraction();
      return;
    }
    if (this.dragMode === "select") {
      const viewportLocal = this.resolveViewportLocalPoint(event, true);
      if (viewportLocal === null) {
        return;
      }
      const scenePoint = this.resolveScenePointFromViewportLocal(viewportLocal);
      this.selectionCurrentSceneX = scenePoint.x;
      this.selectionCurrentSceneY = scenePoint.y;
      const previousSelection = this.captureSelectionSnapshot();
      const selectionNodeIds = this.updateBoxSelectionCandidates(previousSelection);
      const selectionChanged = this.hasSelectionStateChanged(previousSelection);
      if (selectionChanged) {
        this.markSceneChanged({
          nodeIds: selectionNodeIds,
          selectionBox: true,
          summary: true,
          inspector: true
        });
        return;
      }
      this.syncScene({
        nodeIds: selectionNodeIds,
        selectionBox: true
      });
      return;
    }
    const deltaX = event.clientX - this.dragStartX;
    const deltaY = event.clientY - this.dragStartY;
    if (this.dragMode === "resize" && this.activeNodeId !== null) {
      const activeResizeNodeBeforeUpdate = this.nodes.find((node) => node.id === this.activeNodeId) ?? null;
      if (activeResizeNodeBeforeUpdate === null || this.resizeDirection === null) {
        return;
      }
      const minWidth = minNodeWidthForType(activeResizeNodeBeforeUpdate.type);
      const minHeight = this.resolveMinimumNodeHeight(activeResizeNodeBeforeUpdate);
      const deltaSceneX = deltaX / this.scale;
      const deltaSceneY = deltaY / this.scale;
      let nextX = this.resizeOriginNodeX;
      let nextY = this.resizeOriginNodeY;
      let nextWidth = this.resizeOriginWidth;
      let nextHeight = this.resizeOriginHeight;
      if (this.resizeDirection.includes("e")) {
        nextWidth = Math.max(minWidth, this.resizeOriginWidth + deltaSceneX);
      }
      if (this.resizeDirection.includes("s")) {
        nextHeight = Math.max(minHeight, this.resizeOriginHeight + deltaSceneY);
      }
      if (this.resizeDirection.includes("w")) {
        const proposedWidth = this.resizeOriginWidth - deltaSceneX;
        nextWidth = Math.max(minWidth, proposedWidth);
        nextX = this.resizeOriginNodeX + (this.resizeOriginWidth - nextWidth);
      }
      if (this.resizeDirection.includes("n")) {
        const proposedHeight = this.resizeOriginHeight - deltaSceneY;
        nextHeight = Math.max(minHeight, proposedHeight);
        nextY = this.resizeOriginNodeY + (this.resizeOriginHeight - nextHeight);
      }
      this.nodes = this.nodes.map((node) => {
        if (node.id !== this.activeNodeId) {
          return node;
        }
        return {
          ...node,
          x: nextX,
          y: nextY,
          width: nextWidth,
          height: nextHeight
        };
      });
      const activeResizeNode = this.nodes.find((node) => node.id === this.activeNodeId) ?? null;
      const groupIdsToExpand = [
        ...activeResizeNode?.type === "group" ? [this.activeNodeId] : [],
        ...this.collectParentGroupIdsForNodes([this.activeNodeId])
      ];
      const expandedGroupIds = this.expandGroupsToFitMembers(groupIdsToExpand);
      const resizedNodeIds = [.../* @__PURE__ */ new Set([this.activeNodeId, ...expandedGroupIds])];
      this.markSceneChanged({
        nodeIds: resizedNodeIds,
        lineIds: this.collectLineIdsForNodeIds(resizedNodeIds),
        summary: true,
        inspector: true
      });
      return;
    }
    if (this.dragMode === "selection-box") {
      const deltaSceneX = deltaX / this.scale;
      const deltaSceneY = deltaY / this.scale;
      const movedNodeIds = [...this.dragOriginNodePositions.keys()];
      this.nodes = this.nodes.map((node) => {
        const origin = this.dragOriginNodePositions.get(node.id) ?? null;
        if (origin === null) {
          return node;
        }
        return {
          ...node,
          x: origin.x + deltaSceneX,
          y: origin.y + deltaSceneY
        };
      });
      const expandedGroupIds = this.expandGroupsToFitMembers(this.collectParentGroupIdsForNodes(movedNodeIds));
      const changedNodeIds = [.../* @__PURE__ */ new Set([...movedNodeIds, ...expandedGroupIds])];
      this.markSceneChanged({
        nodeIds: changedNodeIds,
        lineIds: this.collectLineIdsForNodeIds(changedNodeIds),
        selectionBox: true,
        summary: true,
        inspector: true
      });
      return;
    }
    if (this.dragMode === "node" && this.activeNodeId !== null) {
      const deltaSceneX = deltaX / this.scale;
      const deltaSceneY = deltaY / this.scale;
      const movedNodeIds = this.dragOriginNodePositions.size === 0 ? [this.activeNodeId] : [...this.dragOriginNodePositions.keys()];
      this.nodes = this.dragOriginNodePositions.size === 0 ? updateNodePosition(
        this.nodes,
        this.activeNodeId,
        this.dragOriginNodeX + deltaSceneX,
        this.dragOriginNodeY + deltaSceneY
      ) : this.nodes.map((node) => {
        const origin = this.dragOriginNodePositions.get(node.id) ?? null;
        if (origin === null) {
          return node;
        }
        return {
          ...node,
          x: origin.x + deltaSceneX,
          y: origin.y + deltaSceneY
        };
      });
      const expandedGroupIds = this.expandGroupsToFitMembers(this.collectParentGroupIdsForNodes(movedNodeIds));
      const activeNode = this.nodes.find((node) => node.id === this.activeNodeId) ?? null;
      const previousDropTargetGroupId = this.dropTargetGroupId;
      this.dropTargetGroupId = activeNode === null ? null : this.resolveDropTargetGroupId(activeNode);
      const dropTargetNodeIds = [
        ...previousDropTargetGroupId === null ? [] : [previousDropTargetGroupId],
        ...this.dropTargetGroupId === null ? [] : [this.dropTargetGroupId]
      ];
      const changedNodeIds = [.../* @__PURE__ */ new Set([...movedNodeIds, ...expandedGroupIds, ...dropTargetNodeIds])];
      this.markSceneChanged({
        nodeIds: changedNodeIds,
        lineIds: this.collectLineIdsForNodeIds(changedNodeIds),
        summary: true,
        inspector: true
      });
      return;
    }
    this.offsetX = this.dragOriginOffsetX + deltaX;
    this.offsetY = this.dragOriginOffsetY + deltaY;
    this.markSceneChanged({
      viewport: true,
      selectionBox: true,
      summary: true
    });
  }
  finishPointerInteraction() {
    const hasActiveInteraction = this.dragMode !== "none" || this.pointerCaptureOwnerEl !== null || this.activeNodeId !== null || this.dropTargetGroupId !== null;
    if (!hasActiveInteraction) {
      return;
    }
    if (this.pointerCaptureOwnerEl !== null && this.pointerCaptureOwnerEl.hasPointerCapture(HOST_MOUSE_POINTER_ID)) {
      this.pointerCaptureOwnerEl.releasePointerCapture(HOST_MOUSE_POINTER_ID);
    }
    const finishingActiveNodeId = this.activeNodeId;
    const finishingDropTargetGroupId = this.dropTargetGroupId;
    const wasSelecting = this.dragMode === "select";
    if (finishingActiveNodeId !== null && this.dragMode === "node") {
      const activeNode = this.nodes.find((node) => node.id === finishingActiveNodeId) ?? null;
      if (activeNode !== null && activeNode.type !== "group") {
        this.nodes = this.nodes.map((node) => {
          if (node.id !== finishingActiveNodeId) {
            return node;
          }
          if (finishingDropTargetGroupId === null) {
            return this.createNodeWithoutGroupId(node);
          }
          return {
            ...node,
            groupId: finishingDropTargetGroupId
          };
        });
      }
    }
    if (finishingActiveNodeId !== null) {
      this.expandGroupsToFitMembers([
        ...finishingDropTargetGroupId === null ? [] : [finishingDropTargetGroupId],
        ...this.collectParentGroupIdsForNodes([finishingActiveNodeId])
      ]);
    }
    if (finishingActiveNodeId !== null) {
      const activeNodeEl = this.nodeRuntimes.get(finishingActiveNodeId)?.nodeEl ?? null;
      const activeNode = this.nodes.find((node) => node.id === finishingActiveNodeId) ?? null;
      if (activeNodeEl !== null) {
        activeNodeEl.style.cursor = this.resolveNodeCursor(
          this.selectedNodeIds.includes(finishingActiveNodeId),
          this.inlineEditingNodeId === finishingActiveNodeId,
          this.isCanvasReadOnly()
        );
        if (activeNode !== null) {
          activeNodeEl.style.zIndex = resolveNodeZIndex(
            activeNode,
            this.selectedNodeIds.includes(finishingActiveNodeId),
            false
          );
        }
      }
    }
    this.dragMode = "none";
    this.activeNodeId = null;
    this.dragOriginNodePositions = /* @__PURE__ */ new Map();
    this.resizeDirection = null;
    this.pointerCaptureOwnerEl = null;
    this.dropTargetGroupId = null;
    if (wasSelecting) {
      this.persistentSelectionBoxActive = this.selectedNodeIds.length > 0;
    }
    this.syncViewportCursor();
    this.syncScene({
      syncStructure: true,
      selectionBox: true
    });
  }
  syncInspectorPanel() {
    const selectedNode = this.resolveSelectedNode();
    const selectedNodes = this.resolveSelectedNodes();
    const isSingleSelection = selectedNodes.length === 1 && selectedNode !== null;
    const isGroupSelection = isSingleSelection && selectedNode.type === "group";
    const isUrlSelection = isSingleSelection && selectedNode.type === "url";
    const isReadOnly = this.isCanvasReadOnly();
    if (this.selectedMetaEl !== null) {
      if (isReadOnly) {
        this.selectedMetaEl.textContent = `\u5F53\u524D\u767D\u677F\u5904\u4E8E\u53EA\u8BFB\u6062\u590D\u6A21\u5F0F\uFF1A${this.recoveryErrorMessage ?? "\u8BF7\u5148\u4FEE\u590D\u6587\u4EF6\u540E\u91CD\u65B0\u52A0\u8F7D\u3002"}`;
      } else if (selectedNodes.length === 0) {
        this.selectedMetaEl.textContent = "\u5F53\u524D\u6CA1\u6709\u9009\u4E2D\u8282\u70B9\u3002\u8BF7\u5148\u70B9\u51FB\u767D\u677F\u91CC\u7684\u4EFB\u610F\u8282\u70B9\u3002";
      } else if (!isSingleSelection) {
        this.selectedMetaEl.textContent = `???????????? ${selectedNodes.length} ???????????????????????????????????`;
      } else {
        const relatedLines = this.lines.filter((line) => line.from === selectedNode.id || line.to === selectedNode.id).length;
        const referenceText = this.resolveNodeReferenceText(selectedNode);
        this.selectedMetaEl.textContent = `\u7C7B\u578B\uFF1A${getNodeTypeLabel(selectedNode.type)} | \u8282\u70B9\uFF1A${selectedNode.title} | \u5750\u6807\uFF1A(${Math.round(selectedNode.x)}, ${Math.round(selectedNode.y)}) | \u5173\u8054\u8FDE\u7EBF\uFF1A${relatedLines}${referenceText === null ? "" : ` | ${referenceText}`}`;
      }
    }
    if (this.titleInputEl !== null) {
      this.titleInputEl.disabled = isReadOnly || !isSingleSelection;
      const nextValue = isSingleSelection ? selectedNode.title : "";
      if (this.titleInputEl.value !== nextValue) {
        this.titleInputEl.value = nextValue;
      }
    }
    if (this.urlLabelEl !== null) {
      this.urlLabelEl.style.display = isUrlSelection ? "flex" : "none";
    }
    if (this.urlInputEl !== null) {
      this.urlInputEl.disabled = isReadOnly || !isUrlSelection;
      const nextValue = isUrlSelection ? selectedNode.url ?? "" : "";
      if (this.urlInputEl.value !== nextValue) {
        this.urlInputEl.value = nextValue;
      }
    }
    if (this.bodyLabelEl !== null) {
      this.bodyLabelEl.style.display = isGroupSelection || isUrlSelection ? "none" : "flex";
    }
    if (this.bodyInputEl !== null) {
      this.bodyInputEl.disabled = isReadOnly || !isSingleSelection || isGroupSelection || isUrlSelection;
      const nextValue = isSingleSelection && !isGroupSelection && !isUrlSelection ? selectedNode.body : "";
      if (this.bodyInputEl.value !== nextValue) {
        this.bodyInputEl.value = nextValue;
      }
    }
  }
  syncFilePanel(refreshLists = false) {
    if (this.fileMetaEl === null) {
      return;
    }
    const lines = [
      `\u767D\u677F\u6587\u4EF6\uFF1A${this.canvasFilePath}`,
      `\u6587\u4EF6\u72B6\u6001\uFF1A${this.sceneFileExists ? "\u5DF2\u5B58\u5728" : "\u672A\u521B\u5EFA"}`,
      `\u81EA\u52A8\u4FDD\u5B58\uFF1A${this.describeAutoSaveState()}`,
      `\u4FDD\u62A4\u72B6\u6001\uFF1A${this.isCanvasReadOnly() ? "\u53EA\u8BFB\u6062\u590D" : "\u53EF\u7F16\u8F91"}`,
      `\u6700\u8FD1\u4FDD\u5B58\uFF1A${this.lastSavedAt ?? "\u65E0"}`,
      `\u6700\u8FD1\u52A0\u8F7D\uFF1A${this.lastLoadedAt ?? "\u65E0"}`,
      `\u6062\u590D\u9519\u8BEF\uFF1A${this.recoveryErrorMessage ?? "\u65E0"}`,
      `\u81EA\u52A8\u4FDD\u5B58\u9519\u8BEF\uFF1A${this.autoSaveErrorMessage ?? "\u65E0"}`,
      `\u5F53\u524D\u8BF4\u660E\uFF1A${this.sceneFileMessage}`
    ];
    this.fileMetaEl.textContent = lines.join("\n");
    this.fileMetaEl.style.whiteSpace = "pre-wrap";
    if (!refreshLists) {
      return;
    }
    this.syncRecentFilesPanel();
    this.syncAllFilesPanel();
  }
  syncRecoveryPanel() {
    if (this.recoveryPanelEl === null || this.recoveryTitleEl === null || this.recoveryMessageEl === null || this.recoveryToggleRawEl === null || this.recoveryRawTextEl === null) {
      return;
    }
    if (this.recoveryMode === "normal") {
      this.recoveryPanelEl.style.display = "none";
      this.recoveryRawTextEl.style.display = "none";
      return;
    }
    const hasRawContent = this.recoveryRawContent !== null && this.recoveryRawContent.length > 0;
    this.recoveryPanelEl.style.display = "flex";
    this.recoveryTitleEl.textContent = this.recoveryMode === "invalid" ? "\u767D\u677F\u6587\u4EF6\u6062\u590D\u5931\u8D25\uFF0C\u5DF2\u8FDB\u5165\u53EA\u8BFB\u6062\u590D\u6A21\u5F0F" : "\u767D\u677F\u5DF2\u8FDB\u5165\u53EA\u8BFB\u4FDD\u62A4\u6A21\u5F0F";
    this.recoveryMessageEl.textContent = [
      this.recoveryErrorMessage ?? "\u672A\u63D0\u4F9B\u5177\u4F53\u9519\u8BEF\u3002",
      "\u5F53\u524D\u89C6\u56FE\u4E0D\u4F1A\u8986\u76D6\u539F\u59CB .canvas \u6587\u4EF6\u3002\u4F60\u53EF\u4EE5\u5148\u4FEE\u590D\u6587\u4EF6\u540E\u70B9\u51FB\u201C\u91CD\u65B0\u52A0\u8F7D\u767D\u677F\u6587\u4EF6\u201D\uFF0C\u4E5F\u53EF\u4EE5\u67E5\u770B\u539F\u59CB\u6587\u672C\u505A\u4EBA\u5DE5\u6062\u590D\u3002"
    ].join("\n");
    this.recoveryMessageEl.style.whiteSpace = "pre-wrap";
    this.recoveryToggleRawEl.style.display = hasRawContent ? "inline-flex" : "none";
    this.recoveryToggleRawEl.textContent = this.recoveryTextVisible ? "\u9690\u85CF\u539F\u59CB\u6587\u672C" : "\u67E5\u770B\u539F\u59CB\u6587\u672C";
    this.recoveryRawTextEl.textContent = hasRawContent ? this.recoveryRawContent : "";
    this.recoveryRawTextEl.style.display = hasRawContent && this.recoveryTextVisible ? "block" : "none";
  }
  describeAutoSaveState() {
    if (this.isCanvasReadOnly()) {
      return "\u53EA\u8BFB\u4FDD\u62A4\u4E2D";
    }
    switch (this.autoSaveState) {
      case "pending":
        return "\u5F85\u81EA\u52A8\u4FDD\u5B58";
      case "saving":
        return "\u6B63\u5728\u4FDD\u5B58";
      case "saved":
        return "\u5DF2\u4FDD\u5B58";
      case "error":
        return "\u4FDD\u5B58\u5931\u8D25";
      default:
        return "\u5C31\u7EEA";
    }
  }
  syncRecentFilesPanel() {
    if (this.recentFilesEl === null) {
      return;
    }
    this.recentFilesEl.replaceChildren();
    const recentFiles = this.listRecentCanvasFiles();
    if (recentFiles.length === 0) {
      const emptyEl = document.createElement("div");
      emptyEl.textContent = "\u6682\u65E0\u6700\u8FD1\u6253\u5F00\u767D\u677F\u3002";
      emptyEl.style.opacity = "0.68";
      this.recentFilesEl.append(emptyEl);
      return;
    }
    for (const file of recentFiles) {
      this.recentFilesEl.append(this.createSceneFileEntry(file, "\u6253\u5F00\u6700\u8FD1\u767D\u677F"));
    }
  }
  syncAllFilesPanel() {
    if (this.allFilesEl === null) {
      return;
    }
    this.allFilesEl.replaceChildren();
    const sceneFiles = this.listCanvasFiles();
    if (sceneFiles.length === 0) {
      const emptyEl = document.createElement("div");
      emptyEl.textContent = "\u5F53\u524D\u76EE\u5F55\u8FD8\u6CA1\u6709\u767D\u677F\u6587\u4EF6\u3002";
      emptyEl.style.opacity = "0.68";
      this.allFilesEl.append(emptyEl);
      return;
    }
    for (const file of sceneFiles) {
      this.allFilesEl.append(this.createSceneFileEntry(file, "\u4ECE\u6587\u4EF6\u5217\u8868\u6253\u5F00"));
    }
  }
  createSceneFileEntry(file, source) {
    const entryEl = document.createElement("div");
    entryEl.setAttribute("role", "button");
    entryEl.tabIndex = 0;
    entryEl.style.display = "flex";
    entryEl.style.flexDirection = "column";
    entryEl.style.gap = "2px";
    entryEl.style.padding = "8px 10px";
    entryEl.style.borderRadius = "10px";
    entryEl.style.border = "1px solid rgba(255,255,255,0.1)";
    entryEl.style.background = file.path === this.canvasFilePath ? "rgba(14,165,233,0.12)" : "rgba(255,255,255,0.04)";
    entryEl.style.cursor = "pointer";
    const nameEl = document.createElement("div");
    nameEl.textContent = file.basename;
    nameEl.style.fontWeight = "600";
    entryEl.append(nameEl);
    const metaEl = document.createElement("div");
    metaEl.textContent = `${file.path} | \u66F4\u65B0\u4E8E ${formatTimestamp(new Date(file.stat.mtime))}`;
    metaEl.style.opacity = "0.72";
    metaEl.style.fontSize = "12px";
    metaEl.style.lineHeight = "1.5";
    metaEl.style.whiteSpace = "pre-wrap";
    entryEl.append(metaEl);
    this.registerDomEvent(entryEl, "click", () => {
      void this.openSpecificSceneFile(file, source);
    });
    this.registerDomEvent(entryEl, "keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      void this.openSpecificSceneFile(file, source);
    });
    return entryEl;
  }
  syncScene(options) {
    if (this.sceneEl === null || this.summaryEl === null || this.scaleEl === null || this.sourceEl === null) {
      return;
    }
    const syncAll = options === void 0;
    const shouldSyncStructure = syncAll || options?.syncStructure === true;
    if (shouldSyncStructure) {
      this.syncNodeDom();
      this.syncLineDom();
    }
    if (syncAll || options?.viewport === true) {
      this.sceneEl.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
    }
    this.updateSelectionBoxFromSceneBounds();
    if (syncAll || options?.boxSelectionChip === true) {
      if (this.boxSelectionChipEl !== null) {
        this.boxSelectionChipEl.textContent = this.boxSelectionEnabled ? "\u6846\u9009\uFF1A\u5F00" : "\u6846\u9009\uFF1A\u5173";
      }
    }
    const nodeIdsToSync = shouldSyncStructure ? this.nodes.map((node) => node.id) : [...new Set(options?.nodeIds ?? [])];
    for (const nodeId of nodeIdsToSync) {
      this.syncNodeRuntime(nodeId);
    }
    const lineIdsToSync = shouldSyncStructure ? this.lines.map((line) => line.id) : [...new Set(options?.lineIds ?? [])];
    for (const lineId of lineIdsToSync) {
      this.syncLineRuntime(lineId);
    }
    if (syncAll || options?.scale === true) {
      this.scaleEl.textContent = `\u7F29\u653E\uFF1A${Math.round(this.scale * 100)}%`;
    }
    if (syncAll || options?.source === true) {
      this.sourceEl.textContent = `\u6765\u6E90\uFF1A${this.source}`;
    }
    if (syncAll || options?.recovery === true) {
      this.syncRecoveryPanel();
    }
    if (syncAll || options?.summary === true) {
      const recoveryText = this.isCanvasReadOnly() ? " | \u53EA\u8BFB\u6062\u590D" : "";
      this.summaryEl.textContent = `\u8282\u70B9 ${this.nodes.length} | \u8FDE\u7EBF ${this.lines.length} | \u5F53\u524D\u9009\u4E2D ${this.resolveSelectedNode()?.title ?? "\u65E0"}${recoveryText}`;
    }
    if (syncAll || options?.inspector === true) {
      this.syncInspectorPanel();
    }
    if (syncAll || options?.file === true) {
      this.syncFilePanel(syncAll || options?.refreshFileLists === true);
    }
  }
};
var FakeCanvasHostPlugin = class extends import_plugin.Plugin {
  resolveActiveCanvasView() {
    const activeView = this.app.workspace.getActiveViewOfType(FakeCanvasView);
    if (activeView instanceof FakeCanvasView) {
      return activeView;
    }
    const fallbackView = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;
    return fallbackView instanceof FakeCanvasView ? fallbackView : null;
  }
  runActiveCanvasAction(action) {
    const view = this.resolveActiveCanvasView();
    if (view === null) {
      new import_plugin.Notice("\u5047\u767D\u677F\u6F14\u793A\uFF1A\u5F53\u524D\u8FD8\u6CA1\u6709\u6253\u5F00\u767D\u677F\u89C6\u56FE\u3002");
      return;
    }
    action(view);
  }
  onload() {
    this.registerView(DEMO_VIEW_TYPE, (leaf) => new FakeCanvasView(leaf));
    this.registerExtensions([...CANVAS_FILE_EXTENSIONS], DEMO_VIEW_TYPE);
    this.addRibbonIcon("layout-dashboard", DEMO_TITLE, () => {
      void this.openDemoView("\u6D3B\u52A8\u680F\u5165\u53E3");
    }, { location: "activityBar" });
    const canvasUiScope = {
      viewType: DEMO_VIEW_TYPE,
      fileExtensions: [...CANVAS_FILE_EXTENSIONS]
    };
    this.addRibbonIcon("plus", "\u767D\u677F\u5DE5\u5177\u680F\uFF1A\u65B0\u589E\u5361\u7247", () => {
      this.runActiveCanvasAction((view) => view.addStandaloneNode());
    }, { location: "canvasToolbar", scope: canvasUiScope });
    this.addRibbonIcon("link-2", "\u767D\u677F\u5DE5\u5177\u680F\uFF1A\u65B0\u589E\u8FDE\u63A5\u5361\u7247", () => {
      this.runActiveCanvasAction((view) => view.addConnectedNode());
    }, { location: "canvasToolbar", scope: canvasUiScope });
    this.addRibbonIcon("file-text", "\u767D\u677F\u5DE5\u5177\u680F\uFF1A\u65B0\u589E\u7B14\u8BB0\u8282\u70B9", () => {
      this.runActiveCanvasAction((view) => view.addStandaloneNode(void 0, "note"));
    }, { location: "canvasToolbar", scope: canvasUiScope });
    this.addRibbonIcon("file", "\u767D\u677F\u5DE5\u5177\u680F\uFF1A\u65B0\u589E\u6587\u4EF6\u8282\u70B9", () => {
      this.runActiveCanvasAction((view) => view.addStandaloneNode(void 0, "file"));
    }, { location: "canvasToolbar", scope: canvasUiScope });
    this.addRibbonIcon("network", "\u767D\u677F\u5DE5\u5177\u680F\uFF1A\u65B0\u589E URL \u8282\u70B9", () => {
      this.runActiveCanvasAction((view) => view.addStandaloneNode(void 0, "url"));
    }, { location: "canvasToolbar", scope: canvasUiScope });
    this.addRibbonIcon("delete", "\u767D\u677F\u5DE5\u5177\u680F\uFF1A\u5220\u9664\u9009\u4E2D\u5361\u7247", () => {
      this.runActiveCanvasAction((view) => view.removeSelectedNode());
    }, { location: "canvasToolbar", scope: canvasUiScope });
    this.addRibbonIcon("save-all", "\u767D\u677F\u6807\u9898\u680F\uFF1A\u4FDD\u5B58\u767D\u677F\u6587\u4EF6", () => {
      this.runActiveCanvasAction((view) => {
        void view.saveSceneFile();
      });
    }, { location: "canvasTitleBar", scope: canvasUiScope });
    this.addRibbonIcon("import", "\u767D\u677F\u6807\u9898\u680F\uFF1A\u6253\u5F00\u767D\u677F\u6587\u4EF6", () => {
      this.runActiveCanvasAction((view) => {
        void view.openSceneFile();
      });
    }, { location: "canvasTitleBar", scope: canvasUiScope });
    this.addRibbonIcon("plus", "\u767D\u677F\u53F3\u952E\u83DC\u5355\uFF1A\u65B0\u589E\u5361\u7247", () => {
      this.runActiveCanvasAction((view) => view.addStandaloneNode());
    }, { location: "canvasContextMenu", scope: canvasUiScope });
    this.addRibbonIcon("link-2", "\u767D\u677F\u53F3\u952E\u83DC\u5355\uFF1A\u65B0\u589E\u8FDE\u63A5\u5361\u7247", () => {
      this.runActiveCanvasAction((view) => view.addConnectedNode());
    }, { location: "canvasContextMenu", scope: canvasUiScope });
    this.addRibbonIcon("file-text", "\u767D\u677F\u53F3\u952E\u83DC\u5355\uFF1A\u65B0\u589E\u7B14\u8BB0\u8282\u70B9", () => {
      this.runActiveCanvasAction((view) => view.addStandaloneNode(void 0, "note"));
    }, { location: "canvasContextMenu", scope: canvasUiScope });
    this.addRibbonIcon("delete", "\u767D\u677F\u53F3\u952E\u83DC\u5355\uFF1A\u5220\u9664\u9009\u4E2D\u5361\u7247", () => {
      this.runActiveCanvasAction((view) => view.removeSelectedNode());
    }, { location: "canvasContextMenu", scope: canvasUiScope });
    this.addRibbonIcon("save-all", "\u767D\u677F\u53F3\u952E\u83DC\u5355\uFF1A\u4FDD\u5B58\u767D\u677F\u6587\u4EF6", () => {
      this.runActiveCanvasAction((view) => {
        void view.saveSceneFile();
      });
    }, { location: "canvasContextMenu", scope: canvasUiScope });
    this.addRibbonIcon("layout-dashboard", "\u767D\u677F\u72B6\u6001\u680F\u5165\u53E3\uFF1A\u6253\u5F00 demo \u767D\u677F", () => {
      void this.openDemoView("\u72B6\u6001\u680F\u767D\u677F\u5165\u53E3");
    }, { location: "statusBar" });
    this.addCommand({
      id: OPEN_DEMO_COMMAND_ID,
      name: "\u5047\u767D\u677F\u6F14\u793A\uFF1A\u6253\u5F00\u6700\u5C0F\u753B\u5E03",
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        void this.openDemoView("\u547D\u4EE4\u4E2D\u5FC3");
      }
    });
    this.addCommand({
      id: CREATE_NEW_SCENE_FILE_COMMAND_ID,
      name: "\u5047\u767D\u677F\u6F14\u793A\uFF1A\u65B0\u5EFA\u767D\u677F\u6587\u4EF6",
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        void this.createAndOpenNewCanvasFile("\u547D\u4EE4\u4E2D\u5FC3\u65B0\u5EFA\u767D\u677F\u6587\u4EF6");
      }
    });
    this.addCommand({
      id: RESET_SCENE_COMMAND_ID,
      name: "\u5047\u767D\u677F\u6F14\u793A\uFF1A\u91CD\u7F6E\u5F53\u524D\u753B\u5E03",
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;
        if (!(view instanceof FakeCanvasView)) {
          new import_plugin.Notice("\u5047\u767D\u677F\u6F14\u793A\uFF1A\u5F53\u524D\u8FD8\u6CA1\u6709\u6253\u5F00\u767D\u677F\u89C6\u56FE\u3002");
          return;
        }
        view.resetScene();
      }
    });
    this.addCommand({
      id: ADD_NODE_COMMAND_ID,
      name: "\u5047\u767D\u677F\u6F14\u793A\uFF1A\u65B0\u589E\u72EC\u7ACB\u5361\u7247",
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;
        if (!(view instanceof FakeCanvasView)) {
          new import_plugin.Notice("\u5047\u767D\u677F\u6F14\u793A\uFF1A\u5F53\u524D\u8FD8\u6CA1\u6709\u6253\u5F00\u767D\u677F\u89C6\u56FE\u3002");
          return;
        }
        view.addStandaloneNode();
      }
    });
    this.addCommand({
      id: ADD_CONNECTED_NODE_COMMAND_ID,
      name: "\u5047\u767D\u677F\u6F14\u793A\uFF1A\u65B0\u589E\u8FDE\u63A5\u5361\u7247",
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;
        if (!(view instanceof FakeCanvasView)) {
          new import_plugin.Notice("\u5047\u767D\u677F\u6F14\u793A\uFF1A\u5F53\u524D\u8FD8\u6CA1\u6709\u6253\u5F00\u767D\u677F\u89C6\u56FE\u3002");
          return;
        }
        view.addConnectedNode();
      }
    });
    this.addCommand({
      id: ADD_NOTE_NODE_COMMAND_ID,
      name: "\u5047\u767D\u677F\u6F14\u793A\uFF1A\u65B0\u589E\u7B14\u8BB0\u8282\u70B9",
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;
        if (!(view instanceof FakeCanvasView)) {
          new import_plugin.Notice("\u5047\u767D\u677F\u6F14\u793A\uFF1A\u5F53\u524D\u8FD8\u6CA1\u6709\u6253\u5F00\u767D\u677F\u89C6\u56FE\u3002");
          return;
        }
        view.addStandaloneNode(void 0, "note");
      }
    });
    this.addCommand({
      id: ADD_FILE_NODE_COMMAND_ID,
      name: "\u5047\u767D\u677F\u6F14\u793A\uFF1A\u65B0\u589E\u6587\u4EF6\u8282\u70B9",
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;
        if (!(view instanceof FakeCanvasView)) {
          new import_plugin.Notice("\u5047\u767D\u677F\u6F14\u793A\uFF1A\u5F53\u524D\u8FD8\u6CA1\u6709\u6253\u5F00\u767D\u677F\u89C6\u56FE\u3002");
          return;
        }
        view.addStandaloneNode(void 0, "file");
      }
    });
    this.addCommand({
      id: ADD_URL_NODE_COMMAND_ID,
      name: "\u5047\u767D\u677F\u6F14\u793A\uFF1A\u65B0\u589E URL \u8282\u70B9",
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;
        if (!(view instanceof FakeCanvasView)) {
          new import_plugin.Notice("\u5047\u767D\u677F\u6F14\u793A\uFF1A\u5F53\u524D\u8FD8\u6CA1\u6709\u6253\u5F00\u767D\u677F\u89C6\u56FE\u3002");
          return;
        }
        view.addStandaloneNode(void 0, "url");
      }
    });
    this.addCommand({
      id: ADD_GROUP_NODE_COMMAND_ID,
      name: "\u5047\u767D\u677F\u6F14\u793A\uFF1A\u65B0\u589E\u5206\u7EC4\u8282\u70B9",
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;
        if (!(view instanceof FakeCanvasView)) {
          new import_plugin.Notice("\u5047\u767D\u677F\u6F14\u793A\uFF1A\u5F53\u524D\u8FD8\u6CA1\u6709\u6253\u5F00\u767D\u677F\u89C6\u56FE\u3002");
          return;
        }
        view.addStandaloneNode(void 0, "group");
      }
    });
    this.addCommand({
      id: REMOVE_SELECTED_NODE_COMMAND_ID,
      name: "\u5047\u767D\u677F\u6F14\u793A\uFF1A\u5220\u9664\u9009\u4E2D\u5361\u7247",
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;
        if (!(view instanceof FakeCanvasView)) {
          new import_plugin.Notice("\u5047\u767D\u677F\u6F14\u793A\uFF1A\u5F53\u524D\u8FD8\u6CA1\u6709\u6253\u5F00\u767D\u677F\u89C6\u56FE\u3002");
          return;
        }
        view.removeSelectedNode();
      }
    });
    this.addCommand({
      id: REMOVE_SELECTED_LINES_COMMAND_ID,
      name: "\u5047\u767D\u677F\u6F14\u793A\uFF1A\u5220\u9664\u9009\u4E2D\u8282\u70B9\u8FDE\u7EBF",
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;
        if (!(view instanceof FakeCanvasView)) {
          new import_plugin.Notice("\u5047\u767D\u677F\u6F14\u793A\uFF1A\u5F53\u524D\u8FD8\u6CA1\u6709\u6253\u5F00\u767D\u677F\u89C6\u56FE\u3002");
          return;
        }
        view.removeSelectedNodeLines();
      }
    });
    this.addCommand({
      id: SAVE_SCENE_COMMAND_ID,
      name: "\u5047\u767D\u677F\u6F14\u793A\uFF1A\u4FDD\u5B58\u767D\u677F\u6587\u4EF6",
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;
        if (!(view instanceof FakeCanvasView)) {
          new import_plugin.Notice("\u5047\u767D\u677F\u6F14\u793A\uFF1A\u5F53\u524D\u8FD8\u6CA1\u6709\u6253\u5F00\u767D\u677F\u89C6\u56FE\u3002");
          return;
        }
        void view.saveSceneFile();
      }
    });
    this.addCommand({
      id: LOAD_SCENE_COMMAND_ID,
      name: "\u5047\u767D\u677F\u6F14\u793A\uFF1A\u4ECE\u767D\u677F\u6587\u4EF6\u52A0\u8F7D",
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;
        if (!(view instanceof FakeCanvasView)) {
          new import_plugin.Notice("\u5047\u767D\u677F\u6F14\u793A\uFF1A\u5F53\u524D\u8FD8\u6CA1\u6709\u6253\u5F00\u767D\u677F\u89C6\u56FE\u3002");
          return;
        }
        void view.loadSceneFile();
      }
    });
    this.addCommand({
      id: OPEN_SCENE_FILE_COMMAND_ID,
      name: "\u5047\u767D\u677F\u6F14\u793A\uFF1A\u6253\u5F00\u767D\u677F\u6587\u4EF6",
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;
        if (!(view instanceof FakeCanvasView)) {
          new import_plugin.Notice("\u5047\u767D\u677F\u6F14\u793A\uFF1A\u5F53\u524D\u8FD8\u6CA1\u6709\u6253\u5F00\u767D\u677F\u89C6\u56FE\u3002");
          return;
        }
        void view.openSceneFile();
      }
    });
  }
  onEnable() {
    return void 0;
  }
  onDisable() {
    this.app.workspace.detachLeavesOfType(DEMO_VIEW_TYPE);
  }
  onunload() {
    this.app.workspace.detachLeavesOfType(DEMO_VIEW_TYPE);
  }
  onFailed(failure) {
    new import_plugin.Notice(`\u5047\u767D\u677F\u6F14\u793A\uFF1A\u63D2\u4EF6\u52A0\u8F7D\u5931\u8D25\uFF1A${failure.error.message}`);
  }
  async ensureDemoCanvasFile() {
    const existingFile = this.app.vault.getFileByPath(SCENE_FILE_PATH);
    if (existingFile !== null) {
      return existingFile;
    }
    const segments = SCENE_FOLDER_PATH.split("/").map((segment) => segment.trim()).filter((segment) => segment.length > 0);
    let current = "";
    for (const segment of segments) {
      current = current.length === 0 ? segment : `${current}/${segment}`;
      if (this.app.vault.getFolderByPath(current) !== null) {
        continue;
      }
      await this.app.vault.createFolder(current);
    }
    const initialPayload = serializeSceneForFile(
      createInitialViewState("\u767D\u677F\u6587\u4EF6\u9996\u6B21\u521B\u5EFA"),
      SCENE_FILE_PATH,
      null
    );
    return this.app.vault.create(SCENE_FILE_PATH, initialPayload);
  }
  async createUniqueCanvasFilePath() {
    const segments = SCENE_FOLDER_PATH.split("/").map((segment) => segment.trim()).filter((segment) => segment.length > 0);
    let current = "";
    for (const segment of segments) {
      current = current.length === 0 ? segment : `${current}/${segment}`;
      if (this.app.vault.getFolderByPath(current) !== null) {
        continue;
      }
      await this.app.vault.createFolder(current);
    }
    const now = /* @__PURE__ */ new Date();
    const stamp = `${now.getFullYear()}${padDatePart(now.getMonth() + 1)}${padDatePart(now.getDate())}-${padDatePart(now.getHours())}${padDatePart(now.getMinutes())}${padDatePart(now.getSeconds())}`;
    let suffixIndex = 0;
    while (true) {
      const suffix = suffixIndex === 0 ? "" : `-${suffixIndex + 1}`;
      const candidate = `${SCENE_FOLDER_PATH}/whiteboard-${stamp}${suffix}.canvas`;
      if (this.app.vault.getFileByPath(candidate) === null) {
        return candidate;
      }
      suffixIndex += 1;
    }
  }
  async createAndOpenNewCanvasFile(source) {
    const filePath = await this.createUniqueCanvasFilePath();
    const payload = serializeSceneForFile(createInitialViewState(source), filePath, null);
    const file = await this.app.vault.create(filePath, payload);
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.openFile(file, {
      active: true,
      state: {
        source
      }
    });
    await this.app.workspace.revealLeaf(leaf);
  }
  async openDemoView(source) {
    const file = await this.ensureDemoCanvasFile();
    const existingLeaf = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0] ?? null;
    if (existingLeaf !== null) {
      await existingLeaf.openFile(file, {
        active: true,
        state: {
          source
        }
      });
      await this.app.workspace.revealLeaf(existingLeaf);
      return;
    }
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.openFile(file, {
      active: true,
      state: {
        source
      }
    });
    await this.app.workspace.revealLeaf(leaf);
  }
};
//# sourceMappingURL=main.js.map
