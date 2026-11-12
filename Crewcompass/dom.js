// Tiny DOM helpers. Text always goes in as text nodes, never as HTML.
export function h(tag, attrs = {}, ...children) {
  const svgTags = ["svg", "path", "line", "rect", "circle", "g", "text", "polyline", "polygon", "title", "defs", "linearGradient", "stop"];
  const el = svgTags.includes(tag)
    ? document.createElementNS("http://www.w3.org/2000/svg", tag)
    : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.setAttribute("class", v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "html") throw new Error("html attribute is not allowed");
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function mount(parent, ...children) {
  parent.replaceChildren();
  append(parent, children);
}

let toastTimer;
export function toast(message, isError = false) {
  document.querySelector(".toast")?.remove();
  const t = h("div", { class: "toast" + (isError ? " err" : ""), role: "status" }, message);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 4200);
}
