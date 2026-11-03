/* Démarche de rapprochement — outil de saisie (version hors ligne).
 * Aucune requête réseau. Réponses enregistrées localement (localStorage) et, si le navigateur le permet,
 * réécrites automatiquement dans un fichier JSON choisi par le participant (File System Access API).
 * Format JSON : "matrice-playback-solutions", formatVersion 1 (compatible avec la mise en commun en ligne). */
(function () {
"use strict";

var TRAME = window.TRAME;
var STORE_KEY = "mps-reponses-v1";        // inchangé depuis la première version
var LAST_FILE_KEY = "mps-dernier-export";  // date de la dernière sauvegarde dans un fichier
var FORMAT = "matrice-playback-solutions";
var FORMAT_VERSION = 1;
var AUTOSAVE_MS = 2 * 60 * 1000;
var ITEMS = [], REQUIRED = [], KNOWN = {};
TRAME.forEach(function (c) { c.items.forEach(function (i) { ITEMS.push(i); KNOWN[i.id] = true; if (!i.optional) REQUIRED.push(i.id); }); });

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
  (function add(list) { list.forEach(function (c) { if (Array.isArray(c)) add(c); else if (c != null && c !== false) e.append(c); }); })(kids);
  return e;
}
function fmt(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) + " à " +
         d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function hm(iso) { return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); }

/* ------------------------------------------------------------ Stockage local */
var storageOk = true;
function emptyState() { return { name: "", structure: "", answers: {}, createdAt: new Date().toISOString(), updatedAt: null }; }
function load() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyState();
    var s = JSON.parse(raw);
    if (!s || typeof s !== "object") return emptyState();
    s.answers = s.answers && typeof s.answers === "object" ? s.answers : {};
    s.name = typeof s.name === "string" ? s.name : "";
    s.structure = typeof s.structure === "string" ? s.structure : "";
    return s;
  } catch (e) { storageOk = false; return emptyState(); }
}
var state = load();
var saveTimer = null;
function saveLocal() {
  clearTimeout(saveTimer); saveTimer = null;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); storageOk = true; }
  catch (e) { storageOk = false; }
  renderStatus();
}
function changed() {
  state.updatedAt = new Date().toISOString();
  clearTimeout(saveTimer); saveTimer = setTimeout(saveLocal, 300);
  renderStatus();
}
function lastFileSave() { try { return localStorage.getItem(LAST_FILE_KEY); } catch (e) { return null; } }
function setLastFileSave(iso) { try { localStorage.setItem(LAST_FILE_KEY, iso); } catch (e) {} }
function dirty() {
  var l = lastFileSave();
  return !!state.updatedAt && hasContent() && (!l || new Date(state.updatedAt) > new Date(l));
}
function hasContent() {
  return !!(state.name.trim() || state.structure.trim() || ITEMS.some(function (i) { return state.answers[i.id] && state.answers[i.id].trim(); }));
}
window.addEventListener("storage", function (e) {
  if (e.key !== STORE_KEY) return;
  state = load(); renderTrame();
});

/* ------------------------------------------------------------ Export / import (format inchangé) */
function buildExport() {
  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    tool: "outil-hors-ligne-v2",
    participant: { name: (state.name || "").trim(), structure: (state.structure || "").trim() },
    exportedAt: new Date().toISOString(),
    updatedAt: state.updatedAt,
    note: "Le nom saisi n'est pas une authentification : les réponses sont rattachées au compte du participant lors de leur transmission.",
    categories: TRAME.map(function (c) {
      return { id: c.id, title: c.title, items: c.items.map(function (i) {
        return { id: i.id, title: i.title, answer: state.answers[i.id] || "" };
      }) };
    })
  };
}
function exportText() { return JSON.stringify(buildExport(), null, 2); }
function slug(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 40);
}
function fileName() { return "reponses_" + (slug(state.name) || "participant") + ".json"; }

function parseImport(data) {
  if (!data || data.format !== FORMAT) throw new Error("Ce fichier n'est pas un fichier JSON de réponses de la démarche.");
  if (data.formatVersion !== FORMAT_VERSION) throw new Error("Version de fichier JSON non prise en charge.");
  if (!Array.isArray(data.categories)) throw new Error("Fichier JSON incomplet : liste des réponses absente.");
  var answers = {}, seen = {}, unknown = [];
  data.categories.forEach(function (c) {
    if (!c || !Array.isArray(c.items)) throw new Error("Fichier JSON endommagé : catégorie sans réponses.");
    c.items.forEach(function (i) {
      if (!i || typeof i.id !== "string") throw new Error("Fichier JSON endommagé : rubrique sans identifiant.");
      if (typeof i.answer !== "string") throw new Error("Fichier JSON endommagé : réponse illisible (" + (i.title || i.id) + ").");
      if (seen[i.id]) throw new Error("Fichier JSON endommagé : rubrique en double (" + (i.title || i.id) + ").");
      seen[i.id] = true;
      if (KNOWN[i.id]) answers[i.id] = i.answer; else if (i.answer.trim()) unknown.push(i.title || i.id);
    });
  });
  if (unknown.length) throw new Error("Rubriques inconnues dans le fichier JSON (" + unknown.join(", ") + "). Import annulé pour ne rien perdre.");
  var p = data.participant || {};
  return { name: typeof p.name === "string" ? p.name : "", structure: typeof p.structure === "string" ? p.structure : "",
           answers: answers, updatedAt: data.updatedAt || data.exportedAt || null };
}
function countAnswers(answers) { return REQUIRED.filter(function (id) { return answers[id] && answers[id].trim(); }).length; }
function countOptional(answers) { return ITEMS.filter(function (i) { return i.optional && answers[i.id] && answers[i.id].trim(); }).length; }

function download() {
  saveLocal();
  var blob = new Blob([exportText()], { type: "application/json" });
  var a = el("a", { href: URL.createObjectURL(blob), download: fileName() });
  document.body.append(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  setLastFileSave(new Date().toISOString());
  flash("Fichier JSON téléchargé : " + fileName() + " (dossier Téléchargements).", "ok");
  renderStatus();
}

/* ------------------------------------------------------------ Sauvegarde automatique dans un fichier */
var FSA = typeof window.showSaveFilePicker === "function";
var handle = null, autoActive = false, autoError = null, lastAutoWrite = null, writing = false;

function idb(mode, fn) {
  return new Promise(function (res, rej) {
    var r = indexedDB.open("mps-outil", 1);
    r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
    r.onerror = function () { rej(r.error); };
    r.onsuccess = function () {
      try {
        var tx = r.result.transaction("kv", mode), st = tx.objectStore("kv"), q = fn(st);
        tx.oncomplete = function () { res(q && q.result); r.result.close(); };
        tx.onerror = function () { rej(tx.error); r.result.close(); };
      } catch (e) { r.result.close(); rej(e); }
    };
  });
}
function storeHandle(h) { return idb("readwrite", function (s) { return h ? s.put(h, "fichier") : s.delete("fichier"); }).catch(function () {}); }
function loadHandle() { return idb("readonly", function (s) { return s.get("fichier"); }).catch(function () { return null; }); }

function writeFile() {
  if (!handle || writing) return Promise.resolve(false);
  writing = true;
  saveLocal();
  var text = exportText();
  return handle.createWritable().then(function (w) {
    return w.write(text).then(function () { return w.close(); });
  }).then(function () {
    lastAutoWrite = new Date().toISOString(); setLastFileSave(lastAutoWrite);
    autoActive = true; autoError = null; writing = false; renderStatus(); return true;
  }, function (err) {
    writing = false; autoActive = false;
    autoError = "L'écriture dans le fichier JSON a échoué (" + (err && err.name === "NotAllowedError" ? "autorisation retirée" : "fichier inaccessible") + "). La sauvegarde automatique est arrêtée.";
    renderStatus(); return false;
  });
}
function chooseFile() {
  window.showSaveFilePicker({ suggestedName: fileName(), types: [{ description: "Fichier JSON de réponses", accept: { "application/json": [".json"] } }] })
    .then(function (h) { handle = h; return storeHandle(h).then(writeFile); })
    .then(function (ok) { if (ok) flash("Sauvegarde automatique activée dans « " + handle.name + " ».", "ok"); })
    .catch(function (e) { if (e && e.name !== "AbortError") { autoError = "Impossible d'utiliser ce fichier JSON."; renderStatus(); } });
}
function reactivate() {
  if (!handle) return;
  handle.requestPermission({ mode: "readwrite" }).then(function (p) {
    if (p === "granted") return writeFile().then(function (ok) { if (ok) flash("Sauvegarde automatique réactivée.", "ok"); });
    autoError = "Autorisation refusée : la sauvegarde automatique reste inactive."; renderStatus();
  }).catch(function () { autoError = "Le fichier JSON n'est plus accessible. Choisissez un nouveau fichier JSON."; handle = null; storeHandle(null); renderStatus(); });
}
function stopAuto() { handle = null; autoActive = false; autoError = null; storeHandle(null); renderStatus(); }
setInterval(function () { if (autoActive && dirty()) writeFile(); }, AUTOSAVE_MS);
document.addEventListener("visibilitychange", function () {
  if (document.hidden) { if (saveTimer) saveLocal(); if (autoActive && dirty()) writeFile(); }
});
// Avertissement à la fermeture : le navigateur affiche son propre message générique
// Le message doit être NON vide : Safari (et l'ancien comportement de Chrome/Edge) n'affiche l'avertissement
// que si returnValue contient une chaîne. Les navigateurs affichent toutefois leur propre texte générique.
var LEAVE_MSG = "Assurez-vous d'avoir téléchargé une sauvegarde de vos réponses au format JSON avant de quitter cette page.";
window.onbeforeunload = function (e) {
  if (saveTimer) saveLocal();
  if (!dirty()) return undefined;       // fichier JSON à jour : aucun avertissement
  if (e) { e.preventDefault(); e.returnValue = LEAVE_MSG; }
  return LEAVE_MSG;
};

/* ------------------------------------------------------------ Barre de sauvegarde */
var flashTimer = null;
var BASE_TITLE = document.title;
function flash(text, kind) {
  var m = $("#save-msg"); m.textContent = text; m.className = "msg " + (kind || "");
  clearTimeout(flashTimer); flashTimer = setTimeout(function () { m.textContent = ""; }, 8000);
}
function renderStatus() {
  var alert = $("#st-alert"), actions = $("#st-actions");
  if (!alert) return;
  var lf = lastFileSave(), d = dirty();
  // Alerte unique : erreurs éventuelles, puis modifications non enregistrées dans le fichier JSON
  if (autoError) {
    alert.className = "st-alert err"; alert.textContent = "⚠ " + autoError;
  } else if (!storageOk) {
    alert.className = "st-alert err"; alert.textContent = "⚠ Ce navigateur bloque l'enregistrement local (navigation privée ?). Seul le fichier JSON conserve vos réponses.";
  } else if (d) {
    alert.className = "st-alert warn";
    alert.textContent = "⚠ Modifications non sauvegardées dans votre fichier JSON" +
      (autoActive && handle ? " (écriture automatique dans moins de 2 minutes)" : "") +
      ". Pensez à télécharger une sauvegarde avant de quitter cette page.";
  } else if (lf && hasContent()) {
    alert.className = "st-alert ok"; alert.textContent = "✓ Fichier JSON à jour.";
  } else { alert.className = "st-alert"; alert.textContent = ""; }
  document.title = (d ? "● " : "") + BASE_TITLE;

  var btns = [];
  if (FSA && !handle) btns.push(el("button", { type: "button", class: "btn primary", text: "Activer la sauvegarde automatique…", onclick: chooseFile }));
  if (FSA && handle && !autoActive) btns.push(el("button", { type: "button", class: "btn primary", text: "Réactiver la sauvegarde automatique", onclick: reactivate }));
  if (FSA && handle && autoActive) btns.push(el("button", { type: "button", class: "btn", text: "Enregistrer maintenant", onclick: function () { writeFile().then(function (ok) { if (ok) flash("Fichier JSON enregistré.", "ok"); }); } }));
  btns.push(el("button", { type: "button", class: "btn" + (FSA ? "" : " primary"), text: "Télécharger une sauvegarde JSON", onclick: download }));
  btns.push(el("button", { type: "button", class: "btn", text: "Importer un fichier JSON…", onclick: function () { $("#import-file").value = ""; $("#import-file").click(); } }));
  if (FSA && handle) btns.push(el("button", { type: "button", class: "btn link", text: "Changer de fichier JSON", onclick: function () { stopAuto(); chooseFile(); } }));
  actions.replaceChildren.apply(actions, btns);

  var n = countAnswers(state.answers);
  $("#progress-count").textContent = n + "/" + REQUIRED.length;
}

/* ------------------------------------------------------------ Import */
$("#import-file").addEventListener("change", function (e) {
  var file = e.target.files[0], box = $("#import-confirm");
  e.target.value = ""; box.hidden = true;
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return flash("Fichier JSON trop volumineux.", "err");
  var rd = new FileReader();
  rd.onload = function () {
    var p;
    try { p = parseImport(JSON.parse(rd.result)); }
    catch (err) { return flash(err instanceof SyntaxError ? "Fichier illisible : ce n'est pas un fichier JSON valide." : err.message, "err"); }
    var n = countAnswers(p.answers), o = countOptional(p.answers), cur = countAnswers(state.answers) + countOptional(state.answers);
    var apply = function () {
      state.name = p.name; state.structure = p.structure; state.answers = p.answers;
      state.updatedAt = new Date().toISOString(); saveLocal();
      setLastFileSave(state.updatedAt);       // le contenu correspond exactement au fichier importé
      if (handle && autoActive) writeFile();
      renderTrame(); box.hidden = true;
      flash("Fichier JSON importé : " + n + " réponse" + (n > 1 ? "s" : "") + " sur " + REQUIRED.length + (o ? " et " + o + " commentaire" + (o > 1 ? "s" : "") : "") + (p.name ? " (" + p.name + ")" : "") + ".", "ok");
    };
    if (!cur && !state.name.trim() && !state.structure.trim()) return apply();
    box.replaceChildren(
      el("span", { text: "Le fichier JSON « " + file.name + " » (" + (p.name || "sans nom") + ", " + n + " réponse" + (n > 1 ? "s" : "") + (p.updatedAt ? ", modifié le " + fmt(p.updatedAt) : "") +
        ") va remplacer les réponses actuellement enregistrées sur cet ordinateur." }),
      el("div", { class: "row" },
        el("button", { type: "button", class: "btn primary", text: "Remplacer", onclick: apply }),
        el("button", { type: "button", class: "btn", text: "Annuler", onclick: function () { box.hidden = true; } })));
    box.hidden = false;
  };
  rd.onerror = function () { flash("Lecture du fichier JSON impossible.", "err"); };
  rd.readAsText(file, "utf-8");
});

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
var VIEWS = ["demarche", "reponses"];
function route() {
  var h = location.hash.slice(1), v = VIEWS.indexOf(h) >= 0 ? h : "demarche";
  if (h.indexOf("q-") === 0 || /^c\d$/.test(h)) v = "reponses";
  VIEWS.forEach(function (x) { $("#v-" + x).hidden = x !== v; });
  document.querySelectorAll(".tabs a").forEach(function (a) {
    if (a.dataset.v === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  if (VIEWS.indexOf(h) >= 0) window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

/* ------------------------------------------------------------ Questionnaire */
var answered = function (id) { return !!(state.answers[id] && state.answers[id].trim()); };
function renderTrame() {
  var ni = $("#p-name"), si = $("#p-structure");
  if (document.activeElement !== ni) ni.value = state.name || "";
  if (document.activeElement !== si) si.value = state.structure || "";
  var body = $("#trame-body"), focusedId = document.activeElement && document.activeElement.id;
  body.replaceChildren.apply(body, TRAME.map(function (c) {
    var req = c.items.filter(function (i) { return !i.optional; }).length;
    return el("section", { class: "cat" + (c.optional ? " cat-optional" : ""), id: c.id, style: "--cc:var(--" + c.id + ")" },
      el("header", {},
        c.optional ? el("span", { class: "num", text: "FACULTATIF" }) : el("span", { class: "num", text: "CATÉGORIE " + c.num + " · " + req + " RUBRIQUES" }),
        el("h2", { text: c.title }),
        el("p", { class: "intro", text: c.intro })),
      c.items.map(function (i) {
        var ta = el("textarea", { id: "a-" + i.id, maxlength: "20000", "aria-describedby": "h-" + i.id, class: i.optional ? "short" : null });
        ta.value = state.answers[i.id] || "";
        var meter = el("div", { class: "qm", text: (ta.value.length ? ta.value.length + " caractères" : "") });
        ta.addEventListener("input", function () {
          state.answers[i.id] = ta.value;
          meter.textContent = ta.value.length ? ta.value.length + " caractères" : "";
          changed(); renderToc();
        });
        var showTitle = !(c.optional);
        return el("div", { class: "q" + (i.optional ? " q-optional" : ""), id: "q-" + i.id },
          el("label", { for: "a-" + i.id },
            showTitle ? el("span", { class: "qt" }, i.title, i.optional ? el("span", { class: "opt", text: " — facultatif" }) : null) : null,
            el("span", { class: "qh", id: "h-" + i.id, text: i.hint })),
          ta, meter);
      }));
  }));
  if (focusedId) { var f = document.getElementById(focusedId); if (f) f.focus(); }
  renderToc(); renderStatus();
}
["p-name", "p-structure"].forEach(function (id) {
  $("#" + id).addEventListener("input", function (e) {
    state[id === "p-name" ? "name" : "structure"] = e.target.value;
    changed();
  });
});
function renderToc() {
  var toc = $("#toc");
  toc.replaceChildren.apply(toc, TRAME.map(function (c) {
    var reqItems = c.items.filter(function (i) { return !i.optional; });
    var done = reqItems.filter(function (i) { return answered(i.id); }).length;
    return el("div", { class: "tc", style: "--cc:var(--" + c.id + ")" },
      el("a", { href: "#" + c.id, text: (c.num ? c.num + ". " : "") + c.title, onclick: jump(c.id) }),
      reqItems.length ? el("small", { text: done + "/" + reqItems.length + " renseignées" }) : null,
      c.optional ? null : c.items.map(function (i) {
        return el("a", { class: "ti" + (answered(i.id) ? " done" : "") + (i.optional ? " opt" : ""), href: "#q-" + i.id, text: i.title, title: i.title, onclick: jump("q-" + i.id) });
      }));
  }));
  $("#progress-count").textContent = countAnswers(state.answers) + "/" + REQUIRED.length;
}
function jump(id) {
  return function (e) {
    e.preventDefault();
    var t = document.getElementById(id); if (!t) return;
    t.scrollIntoView({ block: "start" });
    var ta = t.querySelector("textarea"); if (ta && id.indexOf("q-") === 0) ta.focus({ preventScroll: true });
  };
}

/* ------------------------------------------------------------ Effacement */
function renderClear(confirming) {
  var row = $("#clear-row");
  if (!confirming) {
    row.replaceChildren(el("button", { type: "button", id: "clear-btn", class: "btn link danger", text: "Effacer les réponses de cet ordinateur…", onclick: function () { renderClear(true); } }));
    return;
  }
  row.replaceChildren(
    el("span", { text: "Effacer définitivement les réponses enregistrées sur cet ordinateur ? Les fichiers JSON déjà sauvegardés ne sont pas touchés." }),
    el("button", { type: "button", class: "btn danger solid", text: "Oui, effacer", onclick: function () {
      state = emptyState(); stopAuto();
      try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(LAST_FILE_KEY); } catch (e) {}
      renderTrame(); renderClear(false); flash("Réponses effacées de cet ordinateur.", "ok");
    } }),
    el("button", { type: "button", class: "btn", text: "Annuler", onclick: function () { renderClear(false); } }));
}

/* ------------------------------------------------------------ Démarrage */
renderThemeBtn();
renderTrame();
renderClear(false);
route();
try { localStorage.setItem("mps-probe", "1"); localStorage.removeItem("mps-probe"); } catch (e) { storageOk = false; renderStatus(); }
if (FSA) {
  loadHandle().then(function (h) {
    if (!h) return;
    handle = h;
    return h.queryPermission({ mode: "readwrite" }).then(function (p) {
      if (p === "granted") { autoActive = true; if (dirty()) writeFile(); }
      renderStatus();
    });
  }).catch(function () { renderStatus(); });
}
// Accès en lecture seule pour les tests
window.MPS_OUTIL = { buildExport: buildExport, parseImport: parseImport };
})();
