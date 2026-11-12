import { api } from "../api.js";
import { h, mount, toast } from "../ui/dom.js";
import { card, pageHeader, skeletons, errorState } from "../ui/components.js";
import { download } from "../format.js";

export async function render(root, ctx) {
  mount(root, pageHeader("Health digest for Earth"), skeletons(1));
  try {
    const [md, js] = await Promise.all([api.digest("md"), api.digest("json")]);
    mount(root,
      pageHeader("Health digest for Earth", "A short summary a crew can send over a slow link. Callsigns only, no raw data.",
        h("div", { class: "row" },
          h("button", { class: "btn primary", onclick: async () => { try { await navigator.clipboard.writeText(md.text); toast("Digest copied."); } catch { toast("Select the text in the preview and copy it.", true); } } }, "Copy digest"),
          window.__NO_DOWNLOAD__ ? null : h("button", { class: "btn", onclick: () => download("crewcompass-digest.md", md.text, "text/markdown") }, "Download .md"),
          window.__NO_DOWNLOAD__ ? null : h("button", { class: "btn", onclick: () => download("crewcompass-digest.json", js.text, "application/json") }, "Download .json"))),
      h("div", { class: "grid cols-3" },
        card("Size", h("div", {}, h("div", { class: "mono", style: "font-size:30px" }, `${md.bytes.toLocaleString()} B`), h("p", { class: "muted small" }, "Markdown version. JSON is " + js.bytes.toLocaleString() + " B."))),
        card("What it carries", h("p", { class: "dim small" }, "Crew status level and reason, any cause finding with its confidence, the top suggested actions, and the CO2 summary.")),
        card("What it leaves out", h("p", { class: "dim small" }, "Raw check-in answers, reaction times, and names. Only callsigns leave the vehicle."))),
      h("div", { style: "margin-top:20px" }, card("Preview", h("pre", { class: "digest" }, md.text))));
  } catch (e) { mount(root, pageHeader("Health digest for Earth"), errorState(e, () => render(root, ctx))); }
}
