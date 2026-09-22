/* =====================================================================
   DEVISE MADINA — OUTILS
   Règle de sécurité : on ne construit JAMAIS de HTML avec du texte.
   Tout passe par el(), qui utilise textContent (le texte reste du texte).
   ===================================================================== */

(function () {
"use strict";

/**
 * Crée un élément HTML de façon sûre.
 *   el("p", { class: "x" }, "texte", autreElement)
 * - "class"  : classes CSS
 * - "onXxx"  : écouteur d'événement (fonction uniquement)
 * - autres   : attributs (valeurs converties en texte)
 */
function el(balise, attributs = {}, ...enfants) {
  const noeud = document.createElement(balise);
  for (const [nom, valeur] of Object.entries(attributs)) {
    if (valeur === null || valeur === undefined || valeur === false) continue;
    if (nom === "class") {
      noeud.className = valeur;
    } else if (/^on[A-Z]/.test(nom)) {
      if (typeof valeur === "function") {
        noeud.addEventListener(nom.slice(2).toLowerCase(), valeur);
      }
    } else if (/^on/i.test(nom)) {
      continue; // jamais d'attribut onclick="..." en texte
    } else {
      noeud.setAttribute(nom, valeur === true ? "" : String(valeur));
    }
  }
  for (const enfant of enfants.flat()) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    noeud.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)));
  }
  return noeud;
}

/** Vide un conteneur puis y met les nouveaux éléments. */
function remplir(conteneur, ...enfants) {
  conteneur.replaceChildren(...enfants.flat().filter(Boolean));
}

const $ = (id) => document.getElementById(id);

/* ---------- Listes (identiques à celles de la base) ---------- */

const DEVISES = {
  USD: { nom: "Dollar", code: "USD", icone: "💵" },
  EUR: { nom: "Euro", code: "EUR", icone: "💶" },
  XOF: { nom: "Franc CFA", code: "CFA", icone: "🌍" },
  GNF: { nom: "Franc guinéen", code: "GNF", icone: "🇬🇳" }
};

const FORMES = {
  especes: { nom: "Espèces", icone: "💵" },
  orange: { nom: "Orange Money", icone: "🟠" },
  mtn: { nom: "MTN Mobile Money", icone: "🟡" },
  wave: { nom: "Wave", icone: "🔵" },
  cheque: { nom: "Chèque", icone: "📝" }
};

const CHEQUES = {
  bancaire: "Chèque bancaire",
  certifie: "Chèque certifié",
  banque: "Chèque de banque"
};

const DUREES = { 24: "24 heures", 72: "3 jours", 168: "7 jours", 720: "30 jours" };

/* ---------- Nombres ---------- */

const formatFr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

function formatNombre(valeur) {
  const n = Number(valeur);
  return Number.isFinite(n) ? formatFr.format(n) : "—";
}

/** Lit un nombre tapé à la française (« 1 000,5 ») ; null si invalide. */
function lireNombre(texte) {
  // \u00a0 et \u202f : espaces insécables des claviers français
  const propre = String(texte ?? "").replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,4})?$/.test(propre)) return null;
  const n = Number(propre);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ---------- Téléphone ---------- */

/** « 622 00 00 00 » -> « +224622000000 » ; null si ce n'est pas un mobile guinéen. */
function lireTelephone(texte) {
  const chiffres = String(texte ?? "").replace(/\D/g, "").replace(/^(00)?224/, "");
  return /^6\d{8}$/.test(chiffres) ? "+224" + chiffres : null;
}

function afficherTelephone(tel) {
  const c = String(tel ?? "").replace("+224", "");
  return "+224 " + c.replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4");
}

/** Lien WhatsApp sûr (chiffres uniquement). */
function lienWhatsApp(numero, texte) {
  const chiffres = String(numero ?? "").replace(/\D/g, "");
  const url = new URL("https://wa.me/" + chiffres);
  if (texte) url.searchParams.set("text", texte);
  return url.href;
}

/* ---------- Dates ---------- */

const formatDate = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
});

function afficherDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDate.format(d);
}

/** « encore 5 h », « encore 2 j », « expirée » */
function tempsRestant(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (!(ms > 0)) return "expirée";
  const heures = Math.floor(ms / 3600000);
  if (heures < 1) return "moins d'1 h";
  if (heures < 48) return "encore " + heures + " h";
  return "encore " + Math.floor(heures / 24) + " j";
}

/* ---------- Stockage local (jamais bloquant) ---------- */

function lireLocal(cle, defaut = null) {
  try {
    const v = localStorage.getItem(cle);
    return v === null ? defaut : JSON.parse(v);
  } catch {
    return defaut;
  }
}

function ecrireLocal(cle, valeur) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    /* stockage plein ou bloqué : on continue sans */
  }
}

// Mis à disposition des autres fichiers
window.DM_OUTILS = Object.freeze({
  $,
  el,
  remplir,
  DEVISES,
  FORMES,
  CHEQUES,
  DUREES,
  formatNombre,
  lireNombre,
  lireTelephone,
  afficherTelephone,
  lienWhatsApp,
  afficherDate,
  tempsRestant,
  lireLocal,
  ecrireLocal
});
})();
