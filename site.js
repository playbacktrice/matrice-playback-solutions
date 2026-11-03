/* Démarche de rapprochement — site en ligne : navigation, thème, et récupération des réponses
 * éventuellement saisies sur ce site avant l'outil hors ligne (clé "mps-reponses-v1", jamais effacée ici). */
(function () {
"use strict";
var TRAME = window.TRAME;
var STORE_KEY = "mps-reponses-v1";
var $ = function (s) { return document.querySelector(s); };

/* Thème */
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

/* Navigation (les anciennes adresses #accueil, #trame, #fichier mènent à « La démarche ») */
var VIEWS = ["demarche", "commun"];
function route() {
  var h = location.hash.slice(1), v = VIEWS.indexOf(h) >= 0 ? h : "demarche";
  if (h.indexOf("access_token=") >= 0 || h.indexOf("error=") >= 0) v = "commun";
  VIEWS.forEach(function (x) { $("#v-" + x).hidden = x !== v; });
  document.querySelectorAll(".tabs a").forEach(function (a) {
    if (a.dataset.v === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}
window.addEventListener("hashchange", route);

/* Réponses saisies sur ce site avec la version précédente */
function loadLegacy() {
  try {
    var s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (!s || typeof s !== "object" || !s.answers) return null;
    return s;
  } catch (e) { return null; }
}
function buildExport() {
  var s = loadLegacy() || { name: "", answers: {} };
  return {
    format: "matrice-playback-solutions", formatVersion: 1, tool: "site-v1",
    participant: { name: (s.name || "").trim(), structure: (s.structure || "").trim() },
    exportedAt: new Date().toISOString(), updatedAt: s.updatedAt || null,
    categories: TRAME.map(function (c) {
      return { id: c.id, title: c.title, items: c.items.map(function (i) { return { id: i.id, title: i.title, answer: (s.answers[i.id] || "") }; }) };
    })
  };
}
function answeredCount() {
  var s = loadLegacy(); if (!s) return 0;
  var n = 0; TRAME.forEach(function (c) { c.items.forEach(function (i) { if (s.answers[i.id] && String(s.answers[i.id]).trim()) n++; }); });
  return n;
}
function renderRescue() {
  var n = answeredCount(), box = $("#rescue");
  if (!n) { box.replaceChildren(); return; }
  var btn = document.createElement("button");
  btn.type = "button"; btn.className = "btn"; btn.textContent = "Télécharger ces réponses (JSON)";
  btn.addEventListener("click", function () {
    var s = loadLegacy() || {};
    var blob = new Blob([JSON.stringify(buildExport(), null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "reponses_" + ((s.name || "participant").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "participant") + ".json";
    document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });
  var p = document.createElement("p");
  p.textContent = n + " réponse" + (n > 1 ? "s" : "") + " saisie" + (n > 1 ? "s" : "") + " sur ce site " + (n > 1 ? "sont enregistrées" : "est enregistrée") +
    " dans ce navigateur. " + (n > 1 ? "Téléchargez-les" : "Téléchargez-la") + ", puis importez le fichier dans l'outil de saisie (bouton « Importer un fichier… ») pour continuer.";
  var wrap = document.createElement("div"); wrap.className = "rescue";
  wrap.append(p, btn);
  box.replaceChildren(wrap);
}

/* Accès en lecture seule pour la mise en commun (collective.js) */
window.MPS_LOCAL = { buildExport: buildExport, answeredCount: answeredCount };

renderThemeBtn();
renderRescue();
route();
})();
