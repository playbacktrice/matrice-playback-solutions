/* Matrice Playback Solutions — réponses enregistrées dans le navigateur (localStorage),
 * export / réimport JSON. Aucun envoi réseau, aucune fonctionnalité IA. */
(function () {
"use strict";

var TRAME = window.TRAME;
var STORE_KEY = "mps-reponses-v1";
var FORMAT = "matrice-playback-solutions";
var FORMAT_VERSION = 1;
var ALL_IDS = [];
TRAME.forEach(function (c) { c.items.forEach(function (i) { ALL_IDS.push(i.id); }); });

var $ = function (s) { return document.querySelector(s); };
function el(tag, attrs) {
  var e = document.createElement(tag), kids = Array.prototype.slice.call(arguments, 2);
  Object.keys(attrs || {}).forEach(function (k) {
    var v = attrs[k];
    if (v == null || v === false) return;
    if (k === "text") e.textContent = v;
    else if (k === "style") e.style.cssText = v;
    else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  });
  (function add(list) {
    list.forEach(function (c) { if (Array.isArray(c)) add(c); else if (c != null && c !== false) e.append(c); });
  })(kids);
  return e;
}
function fmt(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) + " à " +
         d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/* ------------------------------------------------------------ Stockage */
var storageOk = true;
function emptyState() { return { name: "", answers: {}, createdAt: new Date().toISOString(), updatedAt: null }; }
function load() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyState();
    var s = JSON.parse(raw);
    if (!s || typeof s !== "object") return emptyState();
    s.answers = s.answers && typeof s.answers === "object" ? s.answers : {};
    s.name = typeof s.name === "string" ? s.name : "";
    return s;
  } catch (e) { storageOk = false; return emptyState(); }
}
var state = load();
var saveTimer = null;
function saveNow() {
  clearTimeout(saveTimer); saveTimer = null;
  state.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    storageOk = true;
    setSaveBar("Enregistré dans ce navigateur le " + fmt(state.updatedAt) + ".");
  } catch (e) {
    storageOk = false;
    setSaveBar("Enregistrement automatique impossible dans ce navigateur (navigation privée ou stockage bloqué). Exporte ton fichier régulièrement pour ne rien perdre.", true);
  }
}
function scheduleSave() { setSaveBar("Enregistrement…"); clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 400); }
window.addEventListener("beforeunload", function () { if (saveTimer) saveNow(); });
document.addEventListener("visibilitychange", function () { if (document.hidden && saveTimer) saveNow(); });
// Si la page est ouverte dans deux onglets, l'autre onglet est mis à jour
window.addEventListener("storage", function (e) {
  if (e.key !== STORE_KEY) return;
  state = load(); renderTrame(); renderProgress(); renderExportSummary();
  setSaveBar("Réponses mises à jour depuis un autre onglet.");
});
function setSaveBar(msg, err) { var b = $("#savebar"); b.textContent = msg; b.className = err ? "err" : ""; renderReminder(); }

/* Rappel discret de sauvegarde : date du dernier export, stockée à part (le format JSON ne change pas) */
var LAST_EXPORT_KEY = "mps-dernier-export";
function lastExport() { try { return localStorage.getItem(LAST_EXPORT_KEY); } catch (e) { return null; } }
function renderReminder() {
  var r = $("#backup-reminder"); if (!r) return;
  var hasAnswers = ALL_IDS.some(function (id) { return state.answers[id] && state.answers[id].trim(); });
  if (!hasAnswers) { r.replaceChildren(); return; }
  var le = lastExport();
  var stale = !le || (state.updatedAt && new Date(state.updatedAt) > new Date(le));
  r.replaceChildren(
    document.createTextNode(le ? "· Dernière sauvegarde téléchargée le " + fmt(le) + (stale ? " (modifications depuis). " : ". ") : "· Aucune sauvegarde téléchargée pour l'instant. "),
    stale ? el("a", { href: "#fichier", text: "Télécharger une sauvegarde" }) : "");
}

/* ------------------------------------------------------------ Thème */
function currentTheme() {
  var t = document.documentElement.dataset.theme;
  if (t) return t;
  return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function renderThemeBtn() { $("#theme-btn").textContent = currentTheme() === "dark" ? "☀ Thème clair" : "☾ Thème sombre"; }
$("#theme-btn").addEventListener("click", function () {
  var next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("mps-theme", next); } catch (e) {}
  renderThemeBtn();
});

/* ------------------------------------------------------------ Navigation */
var VIEWS = ["accueil", "trame", "fichier", "commun"];
function route() {
  var h = location.hash.slice(1), v = VIEWS.indexOf(h) >= 0 ? h : "accueil";
  if (h.indexOf("q-") === 0 || /^c\d$/.test(h)) v = "trame";
  if (h.indexOf("access_token=") >= 0 || h.indexOf("error=") >= 0) v = "commun"; // retour d'un lien de connexion
  VIEWS.forEach(function (x) { $("#v-" + x).hidden = x !== v; });
  document.querySelectorAll(".tabs a").forEach(function (a) {
    if (a.dataset.v === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  if (v === "fichier") renderExportSummary();
  if (VIEWS.indexOf(h) >= 0) window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

/* ------------------------------------------------------------ Accueil */
function renderCatList() {
  $("#cat-list").replaceChildren.apply($("#cat-list"), TRAME.map(function (c) {
    return el("li", { style: "--cc:var(--" + c.id + ")" },
      el("b", { text: c.num + ". " + c.title }),
      el("span", { text: c.items.map(function (i) { return i.title; }).join(" · ") }));
  }));
}

/* ------------------------------------------------------------ Trame */
var answered = function (id) { return !!(state.answers[id] && state.answers[id].trim()); };
function renderTrame() {
  var nameInput = $("#p-name");
  if (document.activeElement !== nameInput) nameInput.value = state.name || "";
  var body = $("#trame-body"), focusedId = document.activeElement && document.activeElement.id;
  body.replaceChildren.apply(body, TRAME.map(function (c) {
    return el("section", { class: "cat", id: c.id, style: "--cc:var(--" + c.id + ")" },
      el("header", {},
        el("span", { class: "num", text: "CATÉGORIE " + c.num + " · " + c.items.length + " SOUS-CATÉGORIES" }),
        el("h2", { text: c.title }),
        el("p", { class: "intro", text: c.intro })),
      c.items.map(function (i) {
        var ta = el("textarea", { id: "a-" + i.id, maxlength: "20000", "aria-describedby": "h-" + i.id });
        ta.value = state.answers[i.id] || "";
        var meter = el("div", { class: "qm", text: (ta.value.length ? ta.value.length + " caractères" : "") });
        ta.addEventListener("input", function () {
          state.answers[i.id] = ta.value;
          meter.textContent = ta.value.length ? ta.value.length + " caractères" : "";
          renderProgress(); scheduleSave();
        });
        return el("div", { class: "q", id: "q-" + i.id },
          el("label", { for: "a-" + i.id },
            el("span", { class: "qt", text: i.title }),
            el("span", { class: "qh", id: "h-" + i.id, text: i.hint })),
          ta, meter);
      }));
  }));
  if (focusedId) { var f = document.getElementById(focusedId); if (f) f.focus(); }
  renderProgress();
}

$("#p-name").addEventListener("input", function (e) {
  state.name = e.target.value;
  e.target.classList.toggle("missing", !state.name.trim());
  scheduleSave(); renderExportSummary();
});

function renderProgress() {
  var n = ALL_IDS.filter(answered).length;
  $("#progress-count").textContent = n + "/" + ALL_IDS.length;
  var toc = $("#toc");
  toc.replaceChildren.apply(toc, TRAME.map(function (c) {
    var done = c.items.filter(function (i) { return answered(i.id); }).length;
    return el("div", { class: "tc", style: "--cc:var(--" + c.id + ")" },
      el("a", { href: "#" + c.id, text: c.num + ". " + c.title, onclick: jump(c.id) }),
      el("small", { text: done + "/" + c.items.length + " renseignées" }),
      c.items.map(function (i) {
        return el("a", { class: "ti" + (answered(i.id) ? " done" : ""), href: "#q-" + i.id, text: i.title, title: i.title, onclick: jump("q-" + i.id) });
      }));
  }));
}
function jump(id) {
  return function (e) {
    e.preventDefault();
    var t = document.getElementById(id); if (!t) return;
    t.scrollIntoView({ block: "start" });
    var ta = t.querySelector("textarea"); if (ta && id.indexOf("q-") === 0) ta.focus({ preventScroll: true });
  };
}

/* ------------------------------------------------------------ Export */
function buildExport() {
  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    participant: { name: (state.name || "").trim() },
    exportedAt: new Date().toISOString(),
    updatedAt: state.updatedAt,
    note: "Le nom saisi n'est pas une authentification : ce fichier sera rattaché à un compte vérifié lors de la transmission définitive.",
    categories: TRAME.map(function (c) {
      return { id: c.id, title: c.title, items: c.items.map(function (i) {
        return { id: i.id, title: i.title, answer: state.answers[i.id] || "" };
      }) };
    })
  };
}
function slug(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 40);
}
function renderExportSummary() {
  var n = ALL_IDS.filter(answered).length;
  $("#export-summary").textContent = (state.name.trim() ? "Nom : " + state.name.trim() + " · " : "Nom non renseigné · ") +
    n + " sous-catégorie" + (n > 1 ? "s" : "") + " renseignée" + (n > 1 ? "s" : "") + " sur " + ALL_IDS.length + ".";
}
$("#export-btn").addEventListener("click", function () {
  var msg = $("#export-msg");
  if (!state.name.trim()) {
    msg.className = "msg err"; msg.textContent = "Renseigne d'abord ton nom (onglet Mes réponses) : il identifie ton fichier.";
    return;
  }
  if (saveTimer) saveNow();
  var data = buildExport();
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  var d = new Date(), stamp = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") +
    "_" + String(d.getHours()).padStart(2, "0") + "h" + String(d.getMinutes()).padStart(2, "0");
  var a = el("a", { href: URL.createObjectURL(blob), download: "matrice-playback-solutions_" + (slug(state.name) || "reponses") + "_" + stamp + ".json" });
  document.body.append(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  try { localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString()); } catch (e) {}
  renderReminder();
  msg.className = "msg ok"; msg.textContent = "Fichier téléchargé (" + ALL_IDS.filter(answered).length + " réponses). Retrouve-le dans ton dossier Téléchargements.";
});

/* ------------------------------------------------------------ Import */
function parseImport(data) {
  if (!data || data.format !== FORMAT) throw new Error("Ce fichier n'est pas un export de la Matrice Playback Solutions.");
  if (data.formatVersion > FORMAT_VERSION) throw new Error("Ce fichier provient d'une version plus récente de la Matrice. Recharge la page puis réessaie.");
  var answers = {}, unknown = [];
  (data.categories || []).forEach(function (c) {
    (c.items || []).forEach(function (i) {
      if (typeof i.answer !== "string") return;
      if (ALL_IDS.indexOf(i.id) >= 0) answers[i.id] = i.answer; else if (i.answer.trim()) unknown.push(i.title || i.id);
    });
  });
  if (unknown.length) throw new Error("Ce fichier contient des réponses à des sous-catégories inconnues (" + unknown.join(", ") + "). Import annulé pour ne rien perdre.");
  return { name: (data.participant && typeof data.participant.name === "string") ? data.participant.name : "", answers: answers, updatedAt: data.updatedAt || data.exportedAt || null };
}
$("#import-btn").addEventListener("click", function () { $("#import-file").value = ""; $("#import-file").click(); });
$("#import-file").addEventListener("change", function (e) {
  var file = e.target.files[0], msg = $("#import-msg"), box = $("#import-confirm");
  msg.textContent = ""; box.hidden = true;
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { msg.className = "msg err"; msg.textContent = "Fichier trop volumineux."; return; }
  var reader = new FileReader();
  e.target.value = ""; // permet de re-choisir le même fichier
  reader.onload = function () {
    var parsed;
    try { parsed = parseImport(JSON.parse(reader.result)); }
    catch (err) { msg.className = "msg err"; msg.textContent = err instanceof SyntaxError ? "Fichier illisible : ce n'est pas un fichier JSON valide." : err.message; return; }
    var n = Object.keys(parsed.answers).filter(function (k) { return parsed.answers[k].trim(); }).length;
    var current = ALL_IDS.filter(answered).length;
    var apply = function () {
      state.name = parsed.name; state.answers = parsed.answers; saveNow();
      renderTrame(); renderExportSummary(); box.hidden = true;
      msg.className = "msg ok"; msg.textContent = "Import terminé : " + n + " réponse" + (n > 1 ? "s" : "") + (parsed.name ? " de " + parsed.name : "") + ".";
    };
    if (!current && !state.name.trim()) { apply(); return; }
    box.replaceChildren(
      el("span", { text: "Ce fichier (" + (parsed.name || "sans nom") + ", " + n + " réponse" + (n > 1 ? "s" : "") + (parsed.updatedAt ? ", modifié le " + fmt(parsed.updatedAt) : "") +
        ") va remplacer les " + current + " réponse" + (current > 1 ? "s" : "") + " actuellement dans ce navigateur." }),
      el("div", { class: "row" },
        el("button", { type: "button", class: "btn primary", text: "Remplacer", onclick: apply }),
        el("button", { type: "button", class: "btn", text: "Annuler", onclick: function () { box.hidden = true; } })));
    box.hidden = false;
  };
  reader.onerror = function () { msg.className = "msg err"; msg.textContent = "Lecture du fichier impossible."; };
  reader.readAsText(file, "utf-8");
});

/* ------------------------------------------------------------ Effacement */
function renderClear(confirming) {
  var row = $("#clear-row");
  if (!confirming) {
    row.replaceChildren(el("button", { type: "button", id: "clear-btn", class: "btn danger", text: "Effacer", onclick: function () { renderClear(true); } }));
    return;
  }
  row.replaceChildren(
    el("span", { text: "Effacer définitivement toutes les réponses de ce navigateur ?" }),
    el("button", { type: "button", class: "btn danger solid", text: "Oui, effacer", onclick: function () {
      state = emptyState();
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      renderTrame(); renderExportSummary(); renderClear(false);
      $("#import-msg").className = "msg ok"; $("#import-msg").textContent = "Réponses effacées de ce navigateur.";
    } }),
    el("button", { type: "button", class: "btn", text: "Annuler", onclick: function () { renderClear(false); } }));
}

/* ------------------------------------------------------------ Démarrage */
// Accès en lecture seule pour la mise en commun (collective.js) : aucune écriture dans le stockage local
window.MPS_LOCAL = { buildExport: buildExport, answeredCount: function () { return ALL_IDS.filter(answered).length; } };

renderThemeBtn();
renderCatList();
renderTrame();
renderExportSummary();
renderClear(false);
route();
if (!storageOk) setSaveBar("Ce navigateur bloque l'enregistrement automatique. Exporte ton fichier régulièrement.", true);
else if (state.updatedAt) setSaveBar("Réponses retrouvées (dernier enregistrement le " + fmt(state.updatedAt) + ").");
else {
  try { localStorage.setItem("mps-probe", "1"); localStorage.removeItem("mps-probe"); setSaveBar("Tes réponses s'enregistrent automatiquement dans ce navigateur."); }
  catch (e) { storageOk = false; setSaveBar("Ce navigateur bloque l'enregistrement automatique (navigation privée ?). Exporte ton fichier régulièrement.", true); }
}
})();
