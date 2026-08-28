/**
 * Property inspector for the selected object.
 *
 * Every object type is edited through the same declarative field list, and
 * each committed change becomes a single undoable command. The compass gets
 * explicit numeric size and rotation controls in addition to its canvas
 * handles, so the transform is reachable without a mouse.
 */
import { requestRender } from "../render/renderer.js";
import { centreOn } from "../render/view.js";
import {
  COMPASS_STYLES, DASH_STYLES, FONT_FAMILIES, MARKER_TYPES, deleteObject, getObject,
  legendEntryForObject, on, state, updateLegendEntry, updateObject,
} from "../state/store.js";
import { titleCase } from "../gen/nameGen.js";
import { openTextEditor } from "../tools/text.js";

const $ = (id) => document.getElementById(id);

function field(object, { key, label, type, options, min, max, step, wide }) {
  const id = `inspect-${key}`;
  const wrapper = document.createElement(type === "checkbox" ? "p" : "span");
  wrapper.className = type === "checkbox" ? "check span-2" : (wide ? "span-2" : "");

  const control = document.createElement(type === "select" ? "select" : "input");
  control.id = id;
  if (type !== "select") control.type = type;
  control.disabled = state.locked;
  const initial = object[key];

  if (type === "select") {
    for (const option of options) {
      const element = document.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      control.append(element);
    }
    control.value = String(object[key]);
  } else if (type === "checkbox") {
    control.checked = Boolean(object[key]);
  } else {
    if (min !== undefined) control.min = String(min);
    if (max !== undefined) control.max = String(max);
    if (step !== undefined) control.step = String(step);
    control.value = type === "range" ? String(Math.round((object[key] ?? 0) * 100)) : String(object[key] ?? "");
  }

  const labelElement = document.createElement("label");
  labelElement.setAttribute("for", id);
  labelElement.textContent = label;

  const read = () => {
    if (type === "checkbox") return control.checked;
    if (type === "range") return Number(control.value) / 100;
    if (type === "number") return Number(control.value);
    return control.value;
  };

  if (type === "range" || type === "number") {
    control.addEventListener("input", () => {
      object[key] = read();
      requestRender();
    });
  }
  control.addEventListener("change", () => {
    const next = read();
    // `input` may already have previewed the change, so rewind to the value
    // the field was rendered with and let the command record the real diff.
    object[key] = initial;
    updateObject(object.id, { [key]: next }, `Edit ${object.type}`);
    requestRender();
  });

  if (type === "checkbox") {
    wrapper.append(control, labelElement);
  } else {
    wrapper.append(labelElement, control);
  }
  return wrapper;
}

const COMMON_ALPHA = { key: "alpha", label: "Opacity", type: "range", min: 0, max: 100 };

function fieldsFor(object) {
  if (object.type === "text") {
    return [
      { key: "font", label: "Font", type: "select", options: [...FONT_FAMILIES, ...state.customFonts.map((font) => font.family)].map((family) => ({ value: family, label: family })), wide: true },
      { key: "size", label: "Size", type: "number", min: 6, max: 400, step: 1 },
      { key: "rotation", label: "Rotation", type: "number", min: -360, max: 360, step: 1 },
      { key: "color", label: "Colour", type: "color" },
      COMMON_ALPHA,
      { key: "bold", label: "Bold", type: "checkbox" },
      { key: "italic", label: "Italic", type: "checkbox" },
      { key: "halo", label: "Outline halo", type: "checkbox" },
      { key: "outlineColor", label: "Halo colour", type: "color" },
      { key: "outlineWidth", label: "Halo width", type: "number", min: 0, max: 40, step: 1 },
    ];
  }
  if (object.type === "marker") {
    return [
      { key: "markerType", label: "Structure", type: "select", options: MARKER_TYPES.map((type) => ({ value: type, label: titleCase(type) })), wide: true },
      { key: "size", label: "Size", type: "number", min: 8, max: 400, step: 1 },
      COMMON_ALPHA,
      { key: "color", label: "Ink", type: "color" },
      { key: "fill", label: "Fill", type: "color" },
    ];
  }
  if (object.type === "compass") {
    return [
      { key: "style", label: "Style", type: "select", options: COMPASS_STYLES.map((style) => ({ value: style.id, label: style.label })), wide: true },
      { key: "size", label: "Size", type: "number", min: 12, max: 1200, step: 1 },
      { key: "rotation", label: "Rotation", type: "number", min: -360, max: 360, step: 1 },
      { key: "color", label: "Colour", type: "color" },
      COMMON_ALPHA,
      { key: "letters", label: "Cardinal letters", type: "checkbox" },
    ];
  }
  return [
    { key: "kind", label: "Preset", type: "select", options: ["river", "road", "border"].map((kind) => ({ value: kind, label: titleCase(kind) })), wide: true },
    { key: "startWidth", label: "Start width", type: "number", min: 0.5, max: 120, step: 0.5 },
    { key: "endWidth", label: "End width", type: "number", min: 0.5, max: 120, step: 0.5 },
    { key: "color", label: "Colour", type: "color" },
    COMMON_ALPHA,
    { key: "dash", label: "Line style", type: "select", options: DASH_STYLES.map((dash) => ({ value: dash, label: titleCase(dash) })) },
    { key: "wobble", label: "Wobble", type: "range", min: 0, max: 100 },
    { key: "casing", label: "Dark casing", type: "checkbox" },
    { key: "beneathTerrain", label: "Draw beneath terrain", type: "checkbox" },
  ];
}

export function renderInspector() {
  const panel = $("inspector");
  panel.innerHTML = "";
  const object = getObject(state.selectedId);

  if (!object) {
    const hint = document.createElement("p");
    hint.className = "muted";
    hint.textContent = "Select an object with the Select tool to edit it.";
    panel.append(hint);
    return;
  }

  const entry = legendEntryForObject(object.id);
  const heading = document.createElement("p");
  heading.className = "inspector-title";
  heading.append(document.createTextNode(entry?.name ?? titleCase(object.type)));
  const kind = document.createElement("span");
  kind.className = "legend-kind";
  kind.textContent = object.type;
  heading.append(kind);
  panel.append(heading);

  if (entry) {
    const nameLabel = document.createElement("label");
    nameLabel.setAttribute("for", "inspect-name");
    nameLabel.textContent = "Name";
    const nameInput = document.createElement("input");
    nameInput.id = "inspect-name";
    nameInput.value = entry.name;
    nameInput.disabled = state.locked;
    nameInput.addEventListener("change", () => {
      updateLegendEntry(entry.id, { name: nameInput.value.trim() || entry.name }, "Rename entry");
    });
    panel.append(nameLabel, nameInput);
  }

  const grid = document.createElement("div");
  grid.className = "inspector-grid";
  for (const spec of fieldsFor(object)) grid.append(field(object, spec));
  panel.append(grid);

  const actions = document.createElement("div");
  actions.className = "button-row";

  if (object.type === "text") {
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit label text";
    edit.disabled = state.locked;
    edit.addEventListener("click", () => openTextEditor(object, object));
    actions.append(edit);
  }

  const focus = document.createElement("button");
  focus.type = "button";
  focus.textContent = "Centre view";
  focus.addEventListener("click", () => {
    const anchor = object.points?.length
      ? object.points[Math.floor(object.points.length / 2)]
      : object;
    centreOn(anchor.x, anchor.y);
    requestRender();
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "danger";
  remove.textContent = "Delete";
  remove.disabled = state.locked;
  remove.addEventListener("click", () => {
    deleteObject(object.id);
    requestRender();
  });

  actions.append(focus, remove);
  panel.append(actions);
}

export function initInspector() {
  on("selection", renderInspector);
  on("objects", renderInspector);
  on("legend", renderInspector);
  on("document", renderInspector);
  renderInspector();
}
