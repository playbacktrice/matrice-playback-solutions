/* Matrice Playback Solutions — mise en commun du 16 novembre (Supabase).
 * Indépendant de la saisie locale : ne lit le stockage local que via window.MPS_LOCAL, n'y écrit jamais.
 * L'ouverture, les droits et la validation des fichiers sont contrôlés par le serveur. */
(function () {
"use strict";

var root = document.getElementById("commun-root");
var TRAME = window.TRAME;
var ITEMS = [];
function catLabel(c) { return (c.num ? c.num + ". " : "") + c.title; }
function itemLabel(i) { return i.title + (i.optional && i.title !== "Commentaires généraux" ? " (facultatif)" : ""); }
TRAME.forEach(function (c) { c.items.forEach(function (i) { ITEMS.push({ cat: c, item: i }); }); });

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
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }) + " à " +
         d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
}
function show() { root.replaceChildren.apply(root, Array.prototype.slice.call(arguments)); }

var cfg = window.MPS_CONFIG || {};
if (!window.supabase || !cfg.supabaseUrl) {
  show(el("p", { class: "banner warn", text: "La mise en commun est momentanément indisponible (connexion au service impossible). Les réponses locales ne sont pas concernées." }));
  return;
}
var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit", storageKey: "mps-commun-session" }
});

var needPassword = /type=(invite|recovery)/.test(location.hash);
var status = null, session = null, participants = [], submissions = [], syntheses = [];
var preview = null;          // { file, source }
var filters = { people: null, cat: "", item: "" };
var channel = null, pollTimer = null, openTimer = null;

function errMsg(e) {
  var m = (e && e.message) || String(e), code = e && e.code;
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Connexion au serveur impossible. Vérifier la connexion internet.";
  if (/Invalid login/i.test(m)) return "Email ou mot de passe incorrect.";
  if (code === "PT401") return "Ce compte n'est pas autorisé pour cette consultation. Contacter l'administrateur.";
  if (code === "PT403") return "La mise en commun n'est pas encore ouverte.";
  if (code === "PT409") return "Les réponses de ce compte ont déjà été transmises : une seule transmission par participant.";
  if (code === "PT422") return "Fichier refusé : " + m;
  if (/JWT|session/i.test(m)) return "La session a expiré. Merci de se reconnecter.";
  return "Erreur : " + m;
}
function msg(text, kind) { return el("p", { class: "msg " + (kind || ""), role: kind === "err" ? "alert" : "status", text: text }); }

/* ------------------------------------------------------------ Connexion */
function viewLogin(errText) {
  var email = el("input", { id: "c-email", type: "email", autocomplete: "username", required: true });
  var pass = el("input", { id: "c-pass", type: "password", autocomplete: "current-password", required: true });
  var btn = el("button", { type: "submit", class: "btn primary", text: "Se connecter" });
  var form = el("form", { class: "card auth" },
    el("h3", { text: "Connexion des participants" }),
    el("label", {}, el("span", { class: "lab", text: "Email" }), email),
    el("label", {}, el("span", { class: "lab", text: "Mot de passe" }), pass),
    btn,
    el("p", { class: "muted small", text: "Les comptes sont créés par l'administrateur (pas d'inscription en ligne). En cas d'oubli du mot de passe, contacter l'administrateur." }),
    errText ? msg(errText, "err") : null);
  form.addEventListener("submit", function (e) {
    e.preventDefault(); btn.disabled = true;
    sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value }).then(function (r) {
      btn.disabled = false;
      if (r.error) viewLogin(errMsg(r.error));
    }, function (err) { btn.disabled = false; viewLogin(errMsg(err)); });
  });
  show(form);
}

function viewSetPassword(errText) {
  var p1 = el("input", { id: "c-new1", type: "password", autocomplete: "new-password", minlength: "10", required: true });
  var p2 = el("input", { id: "c-new2", type: "password", autocomplete: "new-password", minlength: "10", required: true });
  var btn = el("button", { type: "submit", class: "btn primary", text: "Enregistrer le mot de passe" });
  var form = el("form", { class: "card auth" }, el("h3", { text: "Définir le mot de passe" }),
    el("p", { class: "muted small", text: "10 caractères minimum." }),
    el("label", {}, el("span", { class: "lab", text: "Nouveau mot de passe" }), p1),
    el("label", {}, el("span", { class: "lab", text: "Confirmation" }), p2), btn,
    errText ? msg(errText, "err") : null);
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (p1.value.length < 10) return viewSetPassword("10 caractères minimum.");
    if (p1.value !== p2.value) return viewSetPassword("Les deux mots de passe ne correspondent pas.");
    btn.disabled = true;
    sb.auth.updateUser({ password: p1.value }).then(function (r) {
      if (r.error) return viewSetPassword(errMsg(r.error));
      needPassword = false;
      try { history.replaceState(null, "", location.pathname + "#commun"); } catch (x) {}
      refresh();
    });
  });
  show(form);
}

/* ------------------------------------------------------------ Chargement */
var loading = false, again = false;
function refresh() {
  if (!session) return viewLogin();
  if (needPassword) return viewSetPassword();
  if (loading) { again = true; return; }
  loading = true;
  sb.rpc("get_status").then(function (r) {
    if (r.error) throw r.error;
    status = r.data;
    if (!status.is_participant) return null;
    if (!status.is_open) return null;
    return Promise.all([
      sb.from("participants").select("user_id,display_name,role,active").order("display_name"),
      sb.from("submissions").select("id,user_id,declared_name,answers,file_updated_at,submitted_at").order("submitted_at"),
      sb.from("syntheses").select("*").order("published_at", { ascending: false })
    ]).then(function (res) {
      res.forEach(function (x) { if (x.error) throw x.error; });
      participants = res[0].data; submissions = res[1].data; syntheses = res[2].data;
    });
  }).then(function () { render(); }, function (err) { renderError(errMsg(err)); })
    .then(function () { loading = false; if (again) { again = false; refresh(); } });
}
function renderError(text) {
  show(el("div", { class: "banner error" }, el("span", { text: text }),
    el("button", { type: "button", class: "btn", text: "Réessayer", onclick: refresh })));
}

/* ------------------------------------------------------------ Rendu principal */
function header() {
  return el("div", { class: "row between" },
    el("span", { class: "muted" }, "Connecté : ", el("b", { text: status.display_name || (session.user && session.user.email) || "" }),
      status.is_admin ? " · administrateur" : ""),
    el("div", { class: "row" },
      el("button", { type: "button", class: "btn small", text: "Changer de mot de passe", onclick: function () { needPassword = true; viewSetPassword(); } }),
      el("button", { type: "button", class: "btn small", text: "Se déconnecter", onclick: function () { sb.auth.signOut(); } })));
}

function render() {
  if (!status.is_participant) {
    return show(header(), el("p", { class: "banner warn", text: "Ce compte n'est pas (ou plus) autorisé pour cette consultation. Contacter l'administrateur." }));
  }
  if (!status.is_open) return renderClosed();
  var canSubmit = status.can_submit !== undefined ? status.can_submit : !status.is_admin;
  var parts = [header()];
  if (status.rehearsal) parts.push(el("p", { class: "banner warn", text: "MODE RÉPÉTITION — accès anticipé réservé aux comptes de test. Les autres participants voient toujours la mise en commun fermée. Les données de test seront supprimées avant l'ouverture." }));
  if (!canSubmit) parts.push(el("p", { class: "banner", text: "Compte administrateur : consultation des réponses et publication de la synthèse. Ce compte ne transmet pas de réponses." }));
  else if (!status.has_submitted) parts.push(renderSubmit());
  else parts.push(el("p", { class: "banner ok", text: "Les réponses ont bien été transmises. Elles ne peuvent plus être modifiées. La copie locale reste disponible dans ce navigateur." }));
  parts.push(renderTabs());
  show.apply(null, parts);
}

function renderClosed() {
  var opens = new Date(status.opens_at), now = new Date(status.server_now);
  var diff = opens - now, skew = Date.now() - now.getTime();
  var count = el("b", { id: "countdown" });
  function tick() {
    var left = opens.getTime() - (Date.now() - skew);
    if (left <= 0) { clearInterval(openTimer); openTimer = null; refresh(); return; }
    var d = Math.floor(left / 86400000), h = Math.floor(left / 3600000) % 24, m = Math.floor(left / 60000) % 60, s = Math.floor(left / 1000) % 60;
    count.textContent = (d ? d + " j " : "") + h + " h " + String(m).padStart(2, "0") + " min " + String(s).padStart(2, "0") + " s";
  }
  clearInterval(openTimer); openTimer = setInterval(tick, 1000); tick();
  show(header(), el("div", { class: "card" },
    el("h3", { text: "La mise en commun n'est pas encore ouverte" }),
    el("p", {}, "Ouverture le ", el("b", { text: fmt(status.opens_at) }), " (heure du serveur). Temps restant : ", count),
    el("p", { class: "muted", text: "Aucune réponse n'est accessible avant cette heure. D'ici là, les réponses restent dans le navigateur de chaque participant ; une sauvegarde régulière est recommandée (onglet « Sauvegarder »)." })),
    diff > 0 ? null : msg("Ouverture imminente…"));
}

/* ------------------------------------------------------------ Transmission */
function renderSubmit() {
  var box = el("div", { class: "card wide" });
  var fileInput = el("input", { type: "file", accept: ".json,application/json", hidden: true });
  var out = el("div", { class: "stack" });
  function setPreview(file, source) {
    var p;
    try { p = validateLocal(file); } catch (e) { preview = null; out.replaceChildren(msg(e.message, "err")); return; }
    preview = { file: file, source: source, check: p };
    out.replaceChildren(renderPreview());
  }
  fileInput.addEventListener("change", function () {
    var f = fileInput.files[0]; fileInput.value = "";
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { out.replaceChildren(msg("Fichier trop volumineux.", "err")); return; }
    var rd = new FileReader();
    rd.onload = function () {
      var j; try { j = JSON.parse(rd.result); } catch (e) { out.replaceChildren(msg("Fichier illisible : ce n'est pas un fichier JSON valide.", "err")); return; }
      setPreview(j, "le fichier « " + f.name + " »");
    };
    rd.readAsText(f, "utf-8");
  });
  var localCount = window.MPS_LOCAL ? window.MPS_LOCAL.answeredCount() : 0;
  box.append(
    el("h3", { text: "1. Choisir les réponses à transmettre" }),
    el("div", { class: "row" },
      el("button", { type: "button", class: "btn", text: "Importer le fichier JSON de réponses…", onclick: function () { fileInput.click(); } }),
      localCount ? el("button", { type: "button", class: "btn", text: "Utiliser les réponses de ce navigateur (" + localCount + ")",
        onclick: function () { setPreview(window.MPS_LOCAL.buildExport(), "ce navigateur"); } }) : null),
    fileInput,
    el("p", { class: "muted small", text: "Aucune donnée n'est envoyée à cette étape : les réponses sont affichées pour vérification avant confirmation." }),
    out);
  if (preview) out.replaceChildren(renderPreview());
  return box;
}

// Vérification locale (le serveur refait toutes les vérifications)
function validateLocal(j) {
  if (!j || j.format !== "matrice-playback-solutions") throw new Error("Ce fichier n'est pas un fichier de réponses de la démarche.");
  if (j.formatVersion !== 1) throw new Error("Version de fichier non prise en charge.");
  var known = {}; ITEMS.forEach(function (x) { known[x.item.id] = true; });
  var answers = {}, seen = {};
  (j.categories || []).forEach(function (c) {
    (c.items || []).forEach(function (i) {
      if (!known[i.id]) throw new Error("Sous-catégorie inconnue dans le fichier : " + (i.title || i.id));
      if (typeof i.answer !== "string") throw new Error("Réponse non textuelle : " + (i.title || i.id));
      if (seen[i.id]) throw new Error("Sous-catégorie en double : " + (i.title || i.id));
      seen[i.id] = true; answers[i.id] = i.answer;
    });
  });
  var filled = Object.keys(answers).filter(function (k) { return answers[k].trim(); });
  if (!filled.length) throw new Error("Ce fichier ne contient aucune réponse.");
  var optional = {}; ITEMS.forEach(function (x) { if (x.item.optional) optional[x.item.id] = true; });
  var n = filled.filter(function (k) { return !optional[k]; }).length;
  return { answers: answers, count: n, optionalCount: filled.length - n, name: (j.participant && j.participant.name) || "", structure: (j.participant && j.participant.structure) || "" };
}

function renderPreview() {
  var p = preview.check;
  var confirm = el("input", { type: "checkbox", id: "c-confirm" });
  var send = el("button", { type: "button", class: "btn primary", text: "Transmettre définitivement", disabled: true });
  var result = el("div");
  confirm.addEventListener("change", function () { send.disabled = !confirm.checked; });
  send.addEventListener("click", function () {
    send.disabled = true; confirm.disabled = true;
    sb.rpc("submit_responses", { p_file: preview.file }).then(function (r) {
      if (r.error) { result.replaceChildren(msg(errMsg(r.error), "err")); confirm.disabled = false; send.disabled = !confirm.checked; if (r.error.code === "PT409") refresh(); return; }
      preview = null; refresh();
    }, function (err) { result.replaceChildren(msg(errMsg(err), "err")); confirm.disabled = false; send.disabled = !confirm.checked; });
  });
  var nameWarn = status.display_name && p.name && p.name.trim().toLowerCase().indexOf(status.display_name.trim().toLowerCase()) < 0;
  return el("div", { class: "stack" },
    el("h3", { text: "2. Vérifier avant de transmettre" }),
    el("p", {}, "Source : " + preview.source + " · Nom indiqué : ", el("b", { text: p.name || "(aucun)" }),
      p.structure ? " (" + p.structure + ")" : "",
      " · " + p.count + " rubrique" + (p.count > 1 ? "s" : "") + " renseignée" + (p.count > 1 ? "s" : "") + " sur " + ITEMS.filter(function (x) { return !x.item.optional; }).length +
      (p.optionalCount ? " · " + p.optionalCount + " commentaire" + (p.optionalCount > 1 ? "s" : "") + " facultatif" + (p.optionalCount > 1 ? "s" : "") : "") + "."),
    nameWarn ? msg("Le nom indiqué dans le fichier diffère du nom du compte (" + status.display_name + "). Les réponses seront enregistrées au nom du compte.", "warn") : null,
    el("div", { class: "preview" }, TRAME.map(function (c) {
      return el("div", { class: "pv-cat", style: "--cc:var(--" + c.id + ")" },
        el("h4", { text: catLabel(c) }),
        c.items.map(function (i) {
          var a = p.answers[i.id] || "";
          return el("div", { class: "pv-item" }, el("b", { text: itemLabel(i) }),
            a.trim() ? el("div", { class: "pre", text: a }) : el("div", { class: "muted small", text: "Pas de réponse" }));
        }));
    })),
    el("h3", { text: "3. Confirmer" }),
    el("label", { class: "check" }, confirm, " Confirmation : ces réponses sont définitives. Après transmission, elles ne pourront plus être modifiées et seront visibles, nominativement, par les participants et l'administrateur."),
    el("div", { class: "row" }, send, el("button", { type: "button", class: "btn", text: "Annuler", onclick: function () { preview = null; render(); } })),
    result);
}

/* ------------------------------------------------------------ Consultation */
var tab = "reponses";
function renderTabs() {
  var wrap = el("div", { class: "stack" });
  var tabs = el("div", { class: "subtabs", role: "tablist" },
    el("button", { type: "button", role: "tab", "aria-selected": String(tab === "reponses"), text: "Réponses de tous (" + submissions.length + ")", onclick: function () { tab = "reponses"; render(); } }),
    el("button", { type: "button", role: "tab", "aria-selected": String(tab === "synthese"), text: "Synthèse", onclick: function () { tab = "synthese"; render(); } }));
  wrap.append(tabs, tab === "reponses" ? renderConsult() : renderSynthese());
  return wrap;
}

function nameOf(uid) {
  var p = participants.filter(function (x) { return x.user_id === uid; })[0];
  return p ? p.display_name : "Participant";
}

function renderConsult() {
  var active = participants.filter(function (p) { return p.active && p.role === "participant"; });
  var subIds = {}; submissions.forEach(function (s) { subIds[s.user_id] = s; });
  var statusList = el("p", { class: "muted small" }, "Transmissions : " + submissions.length + "/" + active.length + " — ",
    active.map(function (p, i) { return [i ? ", " : "", el("span", { class: subIds[p.user_id] ? "ok-txt" : "", text: p.display_name + (subIds[p.user_id] ? " ✓" : " (en attente)") })]; }));
  if (!submissions.length) return el("div", { class: "stack" }, statusList, el("p", { class: "banner", text: "Aucune réponse transmise pour l'instant. Elles apparaîtront ici au fur et à mesure." }));

  if (!filters.people) filters.people = {};
  var people = submissions.map(function (s) { return s.user_id; });
  var selected = people.filter(function (u) { return filters.people[u] !== false; });

  var chips = el("div", { class: "filters", role: "group", "aria-label": "Participants" },
    submissions.slice().sort(function (x, y) { return nameOf(x.user_id).localeCompare(nameOf(y.user_id), "fr"); }).map(function (s) {
      var on = filters.people[s.user_id] !== false;
      return el("button", { type: "button", class: "chip", "aria-pressed": String(on), text: nameOf(s.user_id),
        onclick: function () { filters.people[s.user_id] = !on; render(); } });
    }));
  var catSel = el("select", { id: "f-cat", "aria-label": "Catégorie" },
    el("option", { value: "", text: "Toutes les catégories" }),
    TRAME.map(function (c) { return el("option", { value: c.id, text: catLabel(c), selected: filters.cat === c.id }); }));
  catSel.addEventListener("change", function () { filters.cat = catSel.value; filters.item = ""; render(); });
  var itemSel = el("select", { id: "f-item", "aria-label": "Sous-catégorie" },
    el("option", { value: "", text: "Toutes les sous-catégories" }),
    ITEMS.filter(function (x) { return !filters.cat || x.cat.id === filters.cat; })
      .map(function (x) { return el("option", { value: x.item.id, text: x.item.title, selected: filters.item === x.item.id }); }));
  itemSel.addEventListener("change", function () { filters.item = itemSel.value; render(); });

  var synItems = latestItems();
  var shown = ITEMS.filter(function (x) { return (!filters.cat || x.cat.id === filters.cat) && (!filters.item || x.item.id === filters.item); });
  var subs = submissions.filter(function (s) { return selected.indexOf(s.user_id) >= 0; })
    .sort(function (x, y) { return nameOf(x.user_id).localeCompare(nameOf(y.user_id), "fr"); });
  // Champs facultatifs : affichés seulement si au moins un participant sélectionné les a renseignés (sauf sélection explicite)
  shown = shown.filter(function (x) {
    return !x.item.optional || filters.item === x.item.id || subs.some(function (s) { return s.answers && s.answers[x.item.id] && s.answers[x.item.id].trim(); });
  });
  var cols = "repeat(" + Math.max(subs.length, 1) + ", minmax(0, 1fr))";
  var head = el("div", { class: "cmp-head", style: "grid-template-columns:" + cols },
    subs.map(function (s) { return el("div", { class: "cmp-head-cell", text: nameOf(s.user_id) }); }));
  var groups = [], lastCat = null;
  shown.forEach(function (x) {
    if (x.cat !== lastCat) { groups.push(el("h3", { class: "cmp-cat", style: "--cc:var(--" + x.cat.id + ")", text: catLabel(x.cat) })); lastCat = x.cat; }
    groups.push(el("section", { class: "cmp" + (x.item.optional ? " cmp-optional" : ""), style: "--cc:var(--" + x.cat.id + ")" },
      el("header", {}, el("b", { text: itemLabel(x.item) }), el("span", { class: "muted small", text: " — " + x.item.hint })),
      el("div", { class: "cmp-grid", style: "grid-template-columns:" + cols }, subs.map(function (s) {
        var a = (s.answers && s.answers[x.item.id]) || "";
        return el("div", { class: "cmp-cell" }, el("div", { class: "who", text: nameOf(s.user_id) }),
          a.trim() ? el("div", { class: "pre", text: a }) : el("div", { class: "muted small", text: "Pas de réponse" }));
      })),
      (synItems && synItems.items[x.item.id] && synItems.items[x.item.id].trim()) ? synBox(synItems, synItems.items[x.item.id]) : null));
  });
  // Navigation rubrique par rubrique quand une sous-catégorie est sélectionnée
  var nav = null;
  if (filters.item) {
    var all = ITEMS.filter(function (x) { return !filters.cat || x.cat.id === filters.cat; });
    var idx = all.map(function (x) { return x.item.id; }).indexOf(filters.item);
    nav = el("div", { class: "row between cmp-nav" },
      el("button", { type: "button", class: "btn small", text: "← Rubrique précédente", disabled: idx <= 0,
        onclick: function () { filters.item = all[idx - 1].item.id; render(); } }),
      el("button", { type: "button", class: "btn small", text: "Rubrique suivante →", disabled: idx < 0 || idx >= all.length - 1,
        onclick: function () { filters.item = all[idx + 1].item.id; render(); } }));
  }
  return el("div", { class: "stack" }, statusList,
    el("div", { class: "card filters-card" },
      el("div", { class: "row" }, el("span", { class: "lab", text: "Participants" }), chips),
      el("div", { class: "row" }, catSel, itemSel)),
    subs.length ? [head, groups, nav] : el("p", { class: "banner", text: "Sélectionner au moins un participant." }),
    el("p", { class: "muted small", text: "Réponses originales, telles que transmises, sans modification ni traitement par IA." }));
}

/* ------------------------------------------------------------ Synthèse */
function synAuthor(s) {
  if (!s.published_by) return "Générée et mise en ligne par une IA (Claude) le " + fmt(s.published_at);
  return "Mise en ligne le " + fmt(s.published_at) + " par " + nameOf(s.published_by);
}
function synLabel(s) {
  return s.ai_assisted ? el("span", {}, el("span", { class: "ai-badge", text: "IA" }), " Synthèse générée par une IA (Claude) à partir des réponses transmises")
                       : el("span", { class: "muted", text: "Note rédigée sans IA" });
}
// Synthèse IA la plus récente qui contient des synthèses par question
function latestItems() {
  for (var i = 0; i < syntheses.length; i++) if (syntheses[i].items && Object.keys(syntheses[i].items).length) return syntheses[i];
  return null;
}
function synBox(s, text) {
  return el("div", { class: "syn-q" },
    el("div", { class: "syn-q-head" }, el("span", { class: "ai-badge", text: "IA" }), " Synthèse de la question",
      el("span", { class: "muted small", text: " · générée par une IA (Claude) le " + fmt(s.published_at) })),
    el("div", { class: "pre", text: text }));
}
function renderSynVersion(s) {
  var items = s.items || {};
  var hasItems = Object.keys(items).length > 0;
  var body = [];
  if (s.content && s.content.trim()) body.push(el("div", { class: "stack" }, hasItems ? el("h4", { text: "Synthèse générale" }) : null, el("div", { class: "pre", text: s.content })));
  if (hasItems) {
    TRAME.forEach(function (c) {
      var its = c.items.filter(function (i) { return items[i.id] && items[i.id].trim(); });
      if (!its.length) return;
      body.push(el("div", { class: "pv-cat", style: "--cc:var(--" + c.id + ")" }, el("h4", { text: catLabel(c) }),
        its.map(function (i) { return el("div", { class: "pv-item" }, el("b", { text: i.title }), el("div", { class: "pre", text: items[i.id] })); })));
    });
  }
  return el("article", { class: "card syn" },
    el("div", { class: "row between" }, synLabel(s), el("span", { class: "muted small", text: synAuthor(s) })), body);
}
function renderSynthese() {
  var list = syntheses.length ? [renderSynVersion(syntheses[0])] : [el("p", { class: "banner", text: "Aucune synthèse mise en ligne pour l'instant." })];
  if (syntheses.length > 1) list.push(el("details", { class: "older" }, el("summary", { text: "Versions précédentes (" + (syntheses.length - 1) + ")" }),
    syntheses.slice(1).map(renderSynVersion)));
  var admin = null;
  if (status.is_admin) {
    var ta = el("textarea", { id: "syn-content", maxlength: "100000", placeholder: "Texte de la note" });
    var yes = el("input", { type: "radio", name: "syn-ai", value: "1", id: "syn-ai-1" });
    var no = el("input", { type: "radio", name: "syn-ai", value: "0", id: "syn-ai-0" });
    var res = el("div");
    var btn = el("button", { type: "button", class: "btn", text: "Mettre en ligne la note" });
    btn.addEventListener("click", function () {
      if (!ta.value.trim()) return res.replaceChildren(msg("La note est vide.", "err"));
      if (!yes.checked && !no.checked) return res.replaceChildren(msg("Indiquer si le texte a été généré par une IA.", "err"));
      btn.disabled = true;
      sb.rpc("publish_synthesis", { p_content: ta.value, p_ai_assisted: yes.checked }).then(function (r) {
        btn.disabled = false;
        if (r.error) return res.replaceChildren(msg(errMsg(r.error), "err"));
        refresh();
      });
    });
    admin = el("details", { class: "card admin-note" }, el("summary", { text: "Ajouter une note manuelle (administrateur)" }),
      el("p", { class: "muted small", text: "Les synthèses par question sont générées et mises en ligne par l'IA (Claude). Ce formulaire permet d'ajouter une note complémentaire ; chaque mise en ligne s'ajoute aux précédentes. Les réponses originales ne sont jamais modifiées." }),
      ta,
      el("div", { class: "row" }, el("span", { class: "lab", text: "Générée par une IA ?" }),
        el("label", { class: "check" }, yes, " Oui"), el("label", { class: "check" }, no, " Non")),
      btn, res);
  }
  return el("div", { class: "stack" }, list, admin);
}

/* ------------------------------------------------------------ Temps réel */
function subscribe() {
  if (channel) { sb.removeChannel(channel); channel = null; }
  if (!session) return;
  channel = sb.channel("mps-commun").on("postgres_changes", { event: "*", schema: "public", table: "sync_state" }, function () {
    if (!preview) refresh();
  }).subscribe();
  clearInterval(pollTimer);
  pollTimer = setInterval(function () { if (!document.hidden && !preview && status && status.is_open) refresh(); }, 30000);
}

sb.auth.onAuthStateChange(function (event, s) {
  if (event === "PASSWORD_RECOVERY") needPassword = true;
  if (event === "TOKEN_REFRESHED") { session = s; if (s) sb.realtime.setAuth(s.access_token); return; }
  session = s;
  if (!s) { clearInterval(pollTimer); clearInterval(openTimer); if (channel) { sb.removeChannel(channel); channel = null; } status = null; preview = null; viewLogin(); return; }
  sb.realtime.setAuth(s.access_token);
  setTimeout(function () { subscribe(); refresh(); }, 0);
});
})();
