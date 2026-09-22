/* =====================================================================
   DEVISE MADINA — ÉCRANS ET INTERACTIONS
   Aucun contrôle de sécurité ne repose sur ce fichier : si quelqu'un le
   modifie dans son navigateur, la base refuse quand même l'action.
   ===================================================================== */

(function () {
"use strict";

const {

  el, remplir, $, DEVISES, FORMES, CHEQUES, DUREES,
  formatNombre, lireNombre, lireTelephone, afficherTelephone, lienWhatsApp,
  afficherDate, tempsRestant, lireLocal, ecrireLocal
} = window.DM_OUTILS;
const api = window.DM_API;

// Anti-clickjacking : refus d'être affiché dans le cadre d'un autre site
if (window.top !== window.self) {
  document.documentElement.classList.add("dans-un-cadre");
}

const cfg = window.DM_CONFIG || {};
let profil = null;          // profil de la personne connectée
let filtreActuel = null;    // filtre de la liste des annonces
let maPosition = null;      // position GPS, seulement si l'utilisateur la donne

/* =====================================================================
   MESSAGES
   ===================================================================== */

let minuterieMessage;
function afficherMessage(texte, erreur = false) {
  const zone = $("message");
  zone.textContent = texte;
  zone.classList.toggle("erreur", erreur);
  zone.classList.remove("hidden");
  clearTimeout(minuterieMessage);
  minuterieMessage = setTimeout(() => zone.classList.add("hidden"), erreur ? 7000 : 4000);
}
const erreur = (e) => afficherMessage(e?.message || "Une erreur est survenue.", true);

/** Désactive un bouton pendant une action (évite les doubles clics). */
async function pendant(bouton, action) {
  if (bouton) bouton.disabled = true;
  try {
    return await action();
  } finally {
    if (bouton) bouton.disabled = false;
  }
}

/**
 * Ouvre une fenêtre et attend le choix de l'utilisateur.
 *   fenetre({ titre, contenu, boutons: [{ valeur, texte, classe }], grille })
 * Renvoie la « valeur » du bouton choisi (null si fermée avec Échap).
 */
function fenetre({ titre, contenu, boutons, grille = false }) {
  const boite = $("fenetre");
  $("fenetreTitre").textContent = titre;
  remplir($("fenetreContenu"), contenu);
  const zone = $("fenetreBoutons");
  zone.classList.toggle("grille", grille);
  return new Promise((resoudre) => {
    let fini = false;
    // Répond une seule fois, quel que soit le moyen de fermeture
    const terminer = (valeur) => {
      if (fini) return;
      fini = true;
      if (boite.open) boite.close();
      resoudre(valeur);
    };
    remplir(zone, boutons.map((b) => el("button", {
      type: "button",
      class: "gros-bouton " + (b.classe || ""),
      onClick: () => terminer(b.valeur)
    }, b.texte)));
    boite.oncancel = () => terminer(null);   // touche Échap / bouton Retour d'Android
    boite.onclose = () => terminer(null);
    boite.showModal();
  });
}

/* =====================================================================
   LISTES DÉROULANTES
   ===================================================================== */

function remplirListes() {
  const options = {
    devises: Object.entries(DEVISES).map(([v, d]) => [v, `${d.icone} ${d.nom} (${d.code})`]),
    formes: Object.entries(FORMES).map(([v, f]) => [v, `${f.icone} ${f.nom}`]),
    cheques: Object.entries(CHEQUES),
    durees: Object.entries(DUREES)
  };
  document.querySelectorAll("select[data-liste]").forEach((select) => {
    remplir(select, options[select.dataset.liste].map(([v, t]) => el("option", { value: v }, t)));
  });
  $("cDevise").value = "GNF";
}

/* =====================================================================
   AUTHENTIFICATION
   ===================================================================== */

function allerEtape(id) {
  document.querySelectorAll("#auth .etape").forEach((e) => e.classList.toggle("hidden", e.id !== id));
  const premierChamp = $(id).querySelector("input");
  if (premierChamp) premierChamp.focus();
}

function afficherAuth() {
  $("app").classList.add("hidden");
  $("auth").classList.remove("hidden");
  document.querySelectorAll("#auth input").forEach((i) => {
    if (i.type === "checkbox") i.checked = false; else i.value = "";
  });
  allerEtape("etapeChoix");
}

function lirePin(id, id2) {
  const pin = $(id).value.trim();
  if (!/^\d{4}$/.test(pin)) throw new Error("Le code PIN doit avoir 4 chiffres.");
  if (id2 && $(id2).value.trim() !== pin) throw new Error("Les deux codes PIN ne sont pas identiques.");
  return pin;
}

function lireTel(id) {
  const tel = lireTelephone($(id).value);
  if (!tel) throw new Error("Numéro guinéen invalide (9 chiffres, commence par 6).");
  return tel;
}

function brancherAuth() {
  document.querySelectorAll("[data-aller]").forEach((b) =>
    b.addEventListener("click", () => allerEtape(b.dataset.aller)));

  $("lienSupport").href = lienWhatsApp(cfg.whatsappAdmin,
    "Bonjour, j'ai oublié mon code PIN Devise Madina. Pouvez-vous m'envoyer un code ?");

  // Connexion
  $("etapePin").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const bouton = ev.submitter;
    pendant(bouton, async () => {
      try {
        await api.connexion(lireTel("pinTel"), lirePin("pinCode"));
        await entrerDansApp();
      } catch (e) {
        $("pinCode").value = "";
        erreur(e);
      }
    });
  });

  // Inscription
  $("etapeInscription").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const bouton = ev.submitter;
    pendant(bouton, async () => {
      try {
        const tel = lireTel("insTel");
        const nom = $("insNom").value.trim();
        if (nom.length < 2) throw new Error("Écris ton nom (au moins 2 lettres).");
        const pin = lirePin("insPin", "insPin2");
        if (!$("insConsentement").checked) throw new Error("Coche la case pour accepter.");
        await api.inscription(tel, nom, pin, true);
        await entrerDansApp();
        afficherMessage("Bienvenue " + nom + " ! Ton compte est créé.");
      } catch (e) {
        erreur(e);
      }
    });
  });

  // PIN oublié
  $("etapeReprise").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const bouton = ev.submitter;
    pendant(bouton, async () => {
      try {
        const code = $("repCode").value.trim();
        if (!/^\d{6}$/.test(code)) throw new Error("Le code reçu a 6 chiffres.");
        await api.reprise(lireTel("repTel"), code, lirePin("repPin", "repPin2"));
        await entrerDansApp();
        afficherMessage("Nouveau code PIN enregistré.");
      } catch (e) {
        erreur(e);
      }
    });
  });

  $("btnDeconnexion").addEventListener("click", async () => {
    await api.deconnexion();
    profil = null;
    afficherAuth();
  });
}

/* =====================================================================
   APPLICATION
   ===================================================================== */

async function entrerDansApp() {
  profil = await api.monProfil();
  if (!profil) {
    // Session sans profil (compte incomplet) : on repart de zéro
    await api.deconnexion();
    afficherAuth();
    return;
  }
  $("auth").classList.add("hidden");
  $("app").classList.remove("hidden");
  afficherProfil();
  afficherPage("Accueil");
}

function afficherPage(nom) {
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === "page" + nom));
  document.querySelectorAll(".nav-btn").forEach((b) => {
    const actif = b.dataset.page === nom;
    b.classList.toggle("active", actif);
    if (actif) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);

  if (nom === "Accueil" || nom === "Taux") chargerTaux();
  if (nom === "Annonces") chargerAnnonces();
  if (nom === "MesAnnonces") chargerMesAnnonces();
  if (nom === "Profil" && profil?.role === "admin") { chargerRevue(); chargerTableauBord(); }
}

/* ---------- Profil ---------- */

function afficherProfil() {
  const estAdmin = profil.role === "admin";
  $("bonjour").textContent = "Bonjour, " + profil.nom.split(" ")[0];
  $("profilNom").textContent = profil.nom;
  $("profilTel").textContent = afficherTelephone(profil.telephone);
  $("profilConfirme").textContent = profil.tel_confirme ? "✅ confirmé" : "⏳ pas encore confirmé";
  $("profilRole").textContent =
    estAdmin ? "Administrateur" : profil.role === "verifie" ? "✅ Vérifié" : "Membre";
  $("alerteBloque").classList.toggle("hidden", !profil.bloque);

  const lien = $("lienConfirmer");
  lien.classList.toggle("hidden", profil.tel_confirme);
  lien.href = lienWhatsApp(cfg.whatsappAdmin,
    "Bonjour, je veux confirmer mon numéro sur Devise Madina. Nom : " + profil.nom);

  // Simple affichage : la base vérifie le rôle à chaque action
  $("formTaux").classList.toggle("hidden", !estAdmin);
  $("formAdmin").classList.toggle("hidden", !estAdmin);
  $("revueAdmin").classList.toggle("hidden", !estAdmin);
  $("tableauBord").classList.toggle("hidden", !estAdmin);
}

/* ---------- Taux ---------- */

function carteTaux(devise, ligne) {
  const d = DEVISES[devise];
  return el("div", { class: "taux-carte taux-" + devise },
    el("span", { class: "pastille", "aria-hidden": "true" }, d.icone),
    el("small", { class: "taux-devise" }, "1 " + d.code),
    el("strong", {}, ligne ? formatNombre(ligne.valeur_gnf) : "—"),
    el("small", { class: "taux-unite" }, ligne ? "GNF" : "pas encore fixé"),
    ligne ? el("small", { class: "taux-date" }, afficherDate(ligne.modifie_le)) : null
  );
}

function dessinerTaux(lignes) {
  const parDevise = Object.fromEntries((lignes || []).map((l) => [l.devise, l]));
  for (const zone of [$("tauxAccueil"), $("tauxPage")]) {
    remplir(zone, ["USD", "EUR", "XOF"].map((d) => carteTaux(d, parDevise[d])));
  }
  for (const d of ["USD", "EUR", "XOF"]) {
    const champ = $("nouveau" + d);
    if (parDevise[d] && document.activeElement !== champ) champ.value = parDevise[d].valeur_gnf;
  }
}

async function chargerTaux() {
  dessinerTaux(lireLocal("dm_taux", []));        // dernière valeur connue d'abord
  try {
    const lignes = await api.lireTaux();
    ecrireLocal("dm_taux", lignes);
    dessinerTaux(lignes);
  } catch (e) {
    if (e.code !== "reseau") erreur(e);
  }
}

function brancherTaux() {
  $("formTaux").addEventListener("submit", (ev) => {
    ev.preventDefault();
    pendant(ev.submitter, async () => {
      try {
        const lignes = [];
        for (const d of ["USD", "EUR", "XOF"]) {
          const texte = $("nouveau" + d).value.trim();
          if (!texte) continue;
          const valeur = lireNombre(texte);
          if (valeur === null) throw new Error(`Taux ${DEVISES[d].code} invalide.`);
          lignes.push({ devise: d, valeur_gnf: valeur });
        }
        if (!lignes.length) throw new Error("Entre au moins un taux.");
        await api.enregistrerTaux(lignes);
        afficherMessage("Taux enregistrés.");
        chargerTaux();
      } catch (e) {
        erreur(e);
      }
    });
  });
}

/* ---------- Publier ---------- */

function brancherPublication() {
  // Afficher les champs « chèque » seulement si besoin
  document.querySelectorAll("select[data-cheque]").forEach((select) => {
    select.addEventListener("change", () =>
      $(select.dataset.cheque).classList.toggle("hidden", select.value !== "cheque"));
  });

  $("negociable").addEventListener("change", () => {
    $("taux").disabled = $("negociable").checked;
    if ($("negociable").checked) $("taux").value = "";
  });

  $("formAnnonce").addEventListener("submit", (ev) => {
    ev.preventDefault();
    pendant(ev.submitter, async () => {
      try {
        const annonce = lireFormulaireAnnonce();
        if (!(await publier(annonce))) return;
        $("formAnnonce").reset();
        remplirListes();
        $("taux").disabled = false;
        $("chequeA").classList.add("hidden");
        $("chequeC").classList.add("hidden");
      } catch (e) {
        erreur(e);
      }
    });
  });
}

/**
 * Publication commune à l'assistant en images et au formulaire rapide.
 * Renvoie true si l'annonce est bien partie.
 */
/* ---------- File d'attente hors ligne (phase 5) ---------- */

const CLE_ATTENTE = "dm_annonces_en_attente";

function ajouterEnAttente(annonce) {
  const file = lireLocal(CLE_ATTENTE, []);
  file.push(annonce);
  ecrireLocal(CLE_ATTENTE, file);
  majEtatReseau();
}

/** Envoie les annonces mises de côté quand internet revient. */
async function viderFileAttente() {
  let file = lireLocal(CLE_ATTENTE, []);
  if (!file.length || !navigator.onLine || !(await api.sessionActuelle())) return;
  const restantes = [];
  let envoyees = 0;
  for (const annonce of file) {
    try {
      await api.publierAnnonce(annonce);
      envoyees++;
    } catch (e) {
      if (e.code === "reseau") restantes.push(annonce);   // on réessaiera
      // toute autre erreur (doublon, limite…) : on abandonne cette annonce
    }
  }
  ecrireLocal(CLE_ATTENTE, restantes);
  majEtatReseau();
  if (envoyees) {
    afficherMessage(envoyees + " annonce(s) en attente publiée(s) !");
    chargerMesAnnonces();
  }
}

function majEtatReseau() {
  const enAttente = lireLocal(CLE_ATTENTE, []).length;
  const badge = $("etatReseau");
  if (!badge) return;
  badge.textContent = navigator.onLine
    ? (enAttente ? `🟢 ${enAttente} en attente` : "🟢")
    : (enAttente ? `🔴 ${enAttente} en attente` : "🔴");
  badge.title = navigator.onLine ? "Connecté" : "Hors ligne";
  badge.classList.toggle("hors-ligne", !navigator.onLine);
}

async function publier(annonce) {
  const ecart = ecartAvecTauxDuJour(annonce);
  if (ecart !== null && ecart > SEUIL_ECART_TAUX) {
    const continuer = await fenetre({
      titre: "🚨 Taux inhabituel",
      contenu: el("p", {}, `Ton taux est à ${formatNombre(ecart)} % du taux du jour. ` +
        "Les annonces avec un taux très différent sont signalées comme suspectes. Vérifie le chiffre."),
      boutons: [
        { valeur: false, texte: "✏️ Corriger", classe: "vert" },
        { valeur: true, texte: "Publier quand même", classe: "gris" }
      ]
    });
    if (!continuer) return false;
  }
  try {
    await api.publierAnnonce(annonce);
    afficherMessage("Annonce publiée !");
    return true;
  } catch (e) {
    // Pas de réseau : on garde l'annonce et on l'enverra au retour d'internet
    if (e.code === "reseau") {
      ajouterEnAttente(annonce);
      afficherMessage("📥 Pas d'internet : ton annonce partira dès le retour du réseau.");
      return true;
    }
    erreur(e);
    return false;
  }
}

/** Même calcul que prive.ecart_taux dans la base (simple aide à la saisie). */
function ecartAvecTauxDuJour(annonce) {
  if (annonce.taux === null) return null;
  const valeurs = Object.fromEntries(lireLocal("dm_taux", []).map((l) => [l.devise, Number(l.valeur_gnf)]));
  valeurs.GNF = 1;
  const va = valeurs[annonce.a_devise];
  const vc = valeurs[annonce.c_devise];
  if (!va || !vc) return null;
  const attendu = va / vc;
  return Math.round(1000 * Math.min(
    Math.abs(annonce.taux / attendu - 1),
    Math.abs(annonce.taux * attendu - 1))) / 10;
}

function lireFormulaireAnnonce() {
  const montant = lireNombre($("aMontant").value);
  if (montant === null) throw new Error("Indique le montant que tu as.");

  const negociable = $("negociable").checked;
  const taux = negociable ? null : lireNombre($("taux").value);
  if (!negociable && taux === null) throw new Error("Indique le taux ou coche « À négocier ».");

  const lieu = $("lieu").value.trim();
  if (lieu.length < 2) throw new Error("Indique la localisation.");

  const annonce = {
    a_devise: $("aDevise").value,
    a_forme: $("aForme").value,
    a_montant: montant,
    c_devise: $("cDevise").value,
    c_forme: $("cForme").value,
    taux,
    negociable,
    lieu,
    duree_heures: Number($("duree").value)
  };
  if (annonce.a_devise === annonce.c_devise && annonce.a_forme === annonce.c_forme) {
    throw new Error("Tu cherches exactement ce que tu as déjà.");
  }
  for (const [cote, prefixe] of [["a", "A"], ["c", "C"]]) {
    if (annonce[cote + "_forme"] === "cheque") {
      annonce[cote + "_cheque_type"] = $(cote + "ChequeType").value;
      annonce[cote + "_banque"] = $(cote + "Banque").value.trim();
      if (annonce[cote + "_banque"].length < 2) {
        throw new Error(prefixe === "A" ? "Indique la banque du chèque que tu as."
                                        : "Indique la banque du chèque recherché.");
      }
    }
  }
  return annonce;
}

/* ---------- Cartes d'annonces ---------- */

function coteEchange(classe, etiquette, devise, forme, montant, chequeType, banque) {
  const d = DEVISES[devise] || { icone: "", code: devise };
  const f = FORMES[forme] || { icone: "", nom: forme };
  return el("div", { class: "cote " + classe },
    el("div", { class: "etiquette" }, etiquette),
    el("div", { class: "montant" },
      montant != null ? `${formatNombre(montant)} ${d.code}` : `${d.icone} ${d.code}`),
    el("div", { class: "forme" }, `${f.icone} ${f.nom}`),
    chequeType ? el("div", { class: "forme" }, `${CHEQUES[chequeType] || ""} — ${banque || ""}`) : null
  );
}

// Au-delà de cet écart avec le taux du jour, on prévient (HYPOTHÈSE : 10 %)
const SEUIL_ECART_TAUX = 10;

function carteAnnonce(a, options = {}) {
  const tauxTexte = a.negociable ? "🤝 À négocier" : `💱 Taux : ${formatNombre(a.taux)}`;

  const badges = [];
  if (options.publique) {
    if (a.auteur_verifie) badges.push(el("span", { class: "badge ok" }, "✅ Vérifié"));
    else if (a.auteur_tel_confirme) badges.push(el("span", { class: "badge ok" }, "☑️ Numéro confirmé"));
    else badges.push(el("span", { class: "badge attention" }, "⚠️ Non vérifié"));
    if (a.avis_positifs || a.avis_negatifs) {
      badges.push(el("span", {
        class: "badge",
        "aria-label": `${a.avis_positifs} avis positifs, ${a.avis_negatifs} avis négatifs`
      }, `👍 ${a.avis_positifs} · 👎 ${a.avis_negatifs}`));
    }
  }
  if (options.statut) badges.push(options.statut);

  // Alerte « taux trop beau » (écart calculé par le serveur)
  const alerteTaux = options.publique && Number(a.ecart_taux) > SEUIL_ECART_TAUX
    ? el("p", { class: "alerte-taux", role: "note" },
        el("span", { "aria-hidden": "true" }, "🚨"),
        ` Taux très différent du taux du jour (${formatNombre(a.ecart_taux)} % d'écart). Méfiance !`)
    : null;

  return el("article", { class: "annonce" + (alerteTaux ? " suspecte" : "") },
    el("div", { class: "annonce-haut" },
      el("span", {}, ...badges),
      el("small", { class: "ligne-info" }, afficherDate(a.cree_le))
    ),
    el("div", { class: "echange" },
      coteEchange("jai", "💰 J'AI", a.a_devise, a.a_forme, a.a_montant, a.a_cheque_type, a.a_banque),
      el("div", { class: "fleche", "aria-label": "contre" }, "⇄"),
      coteEchange("cherche", "🔎 JE CHERCHE", a.c_devise, a.c_forme, null, a.c_cheque_type, a.c_banque)
    ),
    alerteTaux,
    el("p", { class: "ligne-info" }, tauxTexte),
    el("p", { class: "ligne-info" }, "📍 ", a.lieu),
    a.distance != null ? el("p", { class: "ligne-info" }, "📏 à ", afficherDistance(a.distance)) : null,
    el("p", { class: "ligne-info" }, "⏳ ", tempsRestant(a.expire_le)),
    options.publique ? el("p", { class: "ligne-info" }, "👤 ", a.auteur_nom) : null,
    options.actions ? el("div", { class: "actions" }, ...options.actions) : null
  );
}

/* ---------- Liste publique ---------- */

function dessinerFiltres() {
  const choix = [[null, "Tout"], ...Object.entries(DEVISES).map(([v, d]) => [v, `${d.icone} ${d.code}`])];
  const boutons = choix.map(([valeur, texte]) =>
    el("button", {
      type: "button",
      class: "filtre",
      "aria-pressed": String(filtreActuel === valeur),
      onClick: () => { filtreActuel = valeur; dessinerFiltres(); chargerAnnonces(); }
    }, texte));

  // « Près de moi » : demande la position seulement si on clique dessus
  boutons.push(el("button", {
    type: "button",
    class: "filtre",
    "aria-pressed": String(Boolean(maPosition)),
    onClick: (ev) => {
      if (maPosition) { maPosition = null; dessinerFiltres(); chargerAnnonces(); return; }
      if (!navigator.geolocation) { afficherMessage("Position non disponible.", true); return; }
      const bouton = ev.currentTarget;
      bouton.textContent = "📍 Recherche…";
      navigator.geolocation.getCurrentPosition((p) => {
        maPosition = { lat: p.coords.latitude, lng: p.coords.longitude };
        dessinerFiltres();
        chargerAnnonces();
      }, () => {
        dessinerFiltres();
        afficherMessage("Position refusée.", true);
      }, { timeout: 15000, maximumAge: 300000 });
    }
  }, "📍 Près de moi"));

  remplir($("filtres"), boutons);
}

/** Distance à vol d'oiseau, en mètres (formule de Haversine). */
function distance(a, b) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}

function afficherDistance(metres) {
  return metres < 1000 ? `${metres} m` : `${formatNombre(Math.round(metres / 100) / 10)} km`;
}

/* ---------- Conseils de prudence (avant chaque contact) ---------- */

const CONSEILS = [
  ["💵", "D'abord les espèces", "N'envoie jamais d'argent Mobile Money avant d'avoir reçu les espèces en main."],
  ["🏪", "Lieu public", "Rencontre-toi dans un endroit fréquenté du marché, jamais dans un lieu isolé."],
  ["🔍", "Vérifie les billets", "Compte et vérifie chaque billet avant de donner quoi que ce soit."],
  ["🚨", "Taux trop beau = danger", "Un taux beaucoup plus avantageux que le taux du jour cache souvent une arnaque."]
];

function conseilsPrudence() {
  return fenetre({
    titre: "🛡️ Avant de contacter",
    contenu: el("ul", { class: "conseils" }, CONSEILS.map(([icone, titre, texte]) =>
      el("li", {},
        el("span", { class: "conseil-icone", "aria-hidden": "true" }, icone),
        el("span", {}, el("b", {}, titre), el("br"), texte)
      ))),
    boutons: [
      { valeur: false, texte: "Annuler", classe: "gris" },
      { valeur: true, texte: "✅ J'ai compris", classe: "vert" }
    ]
  });
}

/* ---------- Signaler ---------- */

const MOTIFS = [
  ["arnaque", "🦊", "Arnaque"],
  ["faux_billets", "💸", "Faux billets"],
  ["faux_taux", "📉", "Faux taux"],
  ["pas_venu", "🚷", "N'est pas venu"],
  ["insulte", "🤬", "Insultes"],
  ["autre", "❔", "Autre"]
];

async function signalerAnnonce(a, bouton) {
  const motif = await fenetre({
    titre: "🚩 Signaler cette annonce",
    contenu: el("p", { class: "aide" }, "Pourquoi ? Choisis une image."),
    boutons: MOTIFS.map(([valeur, icone, texte]) => ({ valeur, texte: `${icone} ${texte}`, classe: "motif" }))
      .concat([{ valeur: null, texte: "Annuler", classe: "gris" }]),
    grille: true
  });
  if (!motif) return;
  try {
    await api.signaler(a.id, motif);
    bouton.disabled = true;
    bouton.textContent = "🚩 Signalé";
    afficherMessage("Merci. L'administrateur va vérifier.");
  } catch (e) {
    erreur(e);
  }
}

/* ---------- Avis 👍 / 👎 ---------- */

function zoneAvis(a) {
  const boutons = [true, false].map((positif) => el("button", {
    type: "button",
    class: "bouton-avis " + (positif ? "pouce-haut" : "pouce-bas"),
    "aria-pressed": String(a.mon_avis === positif),
    onClick: (ev) => pendant(ev.currentTarget, async () => {
      try {
        await api.donnerAvis(a.id, positif);
        a.mon_avis = positif;
        boutons.forEach((b, i) => b.setAttribute("aria-pressed", String((i === 0) === positif)));
        afficherMessage("Merci pour ton avis !");
      } catch (e) {
        erreur(e);
      }
    })
  }, positif ? "👍 Bien passé" : "👎 Mal passé"));
  return el("div", { class: "zone-avis" },
    el("p", { class: "aide" }, "L'échange s'est bien passé ?"),
    el("div", { class: "avis-boutons" }, boutons)
  );
}

/* ---------- Contacter ---------- */

function boutonContacter(a) {
  if (a.est_a_moi) return [el("span", { class: "badge" }, "C'est ton annonce")];
  const zone = el("div", { class: "plein" });

  async function reveler() {
    const contact = await api.contacter(a.id);
    const d = DEVISES[a.a_devise]?.code || a.a_devise;
    const message = `Bonjour ${contact.nom}, je vous contacte pour votre annonce Devise Madina : ` +
      `${formatNombre(a.a_montant)} ${d}.`;
    remplir(zone,
      el("p", { class: "ligne-info" }, "📞 ", el("b", {}, afficherTelephone(contact.telephone))),
      el("a", {
        class: "gros-bouton whatsapp",
        href: lienWhatsApp(contact.telephone, message),
        target: "_blank",
        rel: "noopener noreferrer"
      }, "💬 Ouvrir WhatsApp"),
      el("a", { class: "gros-bouton gris", href: "tel:" + contact.telephone }, "📞 Appeler"),
      zoneAvis(a)
    );
  }

  const bouton = el("button", {
    type: "button",
    class: "gros-bouton whatsapp",
    onClick: async () => {
      // Les conseils sont montrés avant CHAQUE premier contact
      if (!a.deja_contacte && !(await conseilsPrudence())) return;
      pendant(bouton, async () => {
        try {
          await reveler();
          a.deja_contacte = true;
        } catch (e) {
          erreur(e);
        }
      });
    }
  }, el("span", { "aria-hidden": "true" }, "💬"), a.deja_contacte ? "Revoir le contact" : "Contacter");
  zone.append(bouton);
  if (a.deja_contacte) zone.append(zoneAvis(a));

  const boutonSignaler = el("button", {
    type: "button",
    class: "bouton-signaler",
    disabled: a.deja_signale,
    onClick: () => signalerAnnonce(a, boutonSignaler)
  }, a.deja_signale ? "🚩 Signalé" : "🚩 Signaler");

  return [zone, boutonSignaler];
}

let numeroChargement = 0;   // ignore les réponses d'un ancien filtre

async function chargerAnnonces() {
  dessinerFiltres();
  const zone = $("listeAnnonces");
  const numero = ++numeroChargement;
  remplir(zone, el("p", { class: "vide" }, "Chargement…"));
  try {
    const annonces = await api.annoncesActives(filtreActuel);
    if (numero !== numeroChargement) return;
    // Dernières annonces connues, pour les afficher plus tard sans internet
    if (!filtreActuel) ecrireLocal("dm_annonces", { le: Date.now(), annonces });
    $("banniereHorsLigne").classList.add("hidden");
    // Distance et tri, seulement si l'utilisateur a donné sa position
    if (maPosition) {
      for (const a of annonces) {
        a.distance = a.lat != null && a.lng != null
          ? distance(maPosition, { lat: Number(a.lat), lng: Number(a.lng) })
          : null;
      }
      annonces.sort((x, y) => (x.distance ?? Infinity) - (y.distance ?? Infinity));
    }
    if (!annonces.length) {
      remplir(zone, el("p", { class: "carte vide" }, "Aucune annonce pour le moment."));
      return;
    }
    remplir(zone, annonces.map((a) => carteAnnonce(a, { publique: true, actions: boutonContacter(a) })));
  } catch (e) {
    if (numero !== numeroChargement) return;
    // Hors ligne : on montre les dernières annonces connues, avec leur date
    const cache = lireLocal("dm_annonces", null);
    if (e.code === "reseau" && cache?.annonces?.length) {
      const banniere = $("banniereHorsLigne");
      banniere.textContent = "🔴 Pas d'internet — annonces du " + afficherDate(cache.le);
      banniere.classList.remove("hidden");
      remplir(zone, cache.annonces
        .filter((a) => !filtreActuel || a.a_devise === filtreActuel)
        .map((a) => carteAnnonce(a, { publique: true, actions: boutonContacter(a) })));
      return;
    }
    remplir(zone, el("p", { class: "carte vide" }, e.message));
  }
}

/* ---------- Mes annonces ---------- */

function statutAnnonce(a) {
  if (a.statut === "retiree") return el("span", { class: "badge" }, "Retirée");
  if (a.statut === "masquee") return el("span", { class: "badge fini" }, "Masquée par l'admin");
  if (new Date(a.expire_le) <= new Date()) return el("span", { class: "badge fini" }, "Expirée");
  return el("span", { class: "badge ok" }, "En ligne");
}

async function chargerMesAnnonces() {
  const zone = $("mesAnnonces");
  remplir(zone, el("p", { class: "vide" }, "Chargement…"));
  try {
    const annonces = await api.mesAnnonces();
    if (!annonces.length) {
      remplir(zone, el("p", { class: "carte vide" }, "Tu n'as encore publié aucune annonce."));
      return;
    }
    remplir(zone, annonces.map((a) => {
      const enLigne = a.statut === "active" && new Date(a.expire_le) > new Date();
      const actions = [];
      if (enLigne) {
        actions.push(el("button", {
          type: "button", class: "petit-bouton",
          onClick: (ev) => pendant(ev.currentTarget, async () => {
            try { await api.retirerAnnonce(a.id); chargerMesAnnonces(); } catch (e) { erreur(e); }
          })
        }, "⏸️ Retirer"));
      }
      actions.push(el("button", {
        type: "button", class: "petit-bouton rouge",
        onClick: async (ev) => {
          const bouton = ev.currentTarget;
          const ok = await fenetre({
            titre: "🗑️ Supprimer cette annonce ?",
            contenu: el("p", {}, "Elle disparaîtra définitivement."),
            boutons: [
              { valeur: false, texte: "Annuler", classe: "gris" },
              { valeur: true, texte: "🗑️ Supprimer", classe: "rouge" }
            ]
          });
          if (!ok) return;
          pendant(bouton, async () => {
            try { await api.supprimerAnnonce(a.id); chargerMesAnnonces(); } catch (e) { erreur(e); }
          });
        }
      }, "🗑️ Supprimer"));
      return carteAnnonce(a, { statut: statutAnnonce(a), actions });
    }));
  } catch (e) {
    remplir(zone, el("p", { class: "carte vide" }, e.message));
  }
}

/* ---------- Outils admin ---------- */

const NOMS_MOTIFS = Object.fromEntries(MOTIFS.map(([v, icone, texte]) => [v, `${icone} ${texte}`]));

async function chargerRevue() {
  const zone = $("listeSignalements");
  try {
    const lignes = await api.adminSignalements();
    if (!lignes.length) {
      remplir(zone, el("p", { class: "vide" }, "Aucun signalement en attente 🎉"));
      return;
    }
    remplir(zone, lignes.map((s) => {
      const decider = (decision) => async (ev) => {
        try {
          await api.adminDecider(s.cible, decision);
          afficherMessage(decision === "bloquer" ? "Compte bloqué." : "Signalements rejetés.");
          chargerRevue();
        } catch (e) {
          erreur(e);
        }
      };
      return el("div", { class: "signalement" + (s.bloque ? " bloque" : "") },
        el("p", {}, el("b", {}, s.nom), " — ", afficherTelephone(s.telephone)),
        el("p", { class: "aide" },
          `${s.nb_nouveaux} signalement(s), dont ${s.nb_fiables} après contact · ` +
          `👍 ${s.avis_positifs} · 👎 ${s.avis_negatifs}`),
        el("p", {}, (s.motifs || []).map((m) => NOMS_MOTIFS[m] || m).join(" · ")),
        s.bloque ? el("p", { class: "badge fini" },
          s.bloque_raison === "signalements" ? "⛔ Bloqué automatiquement" : "⛔ Bloqué") : null,
        el("div", { class: "actions" },
          el("button", { type: "button", class: "petit-bouton rouge", onClick: decider("bloquer") }, "⛔ Bloquer"),
          el("button", { type: "button", class: "petit-bouton", onClick: decider("rejeter") }, "✔️ Rejeter"),
          el("a", {
            class: "petit-bouton",
            href: lienWhatsApp(s.telephone),
            target: "_blank",
            rel: "noopener noreferrer"
          }, "💬 Écrire")
        )
      );
    }));
  } catch (e) {
    remplir(zone, el("p", { class: "vide" }, e.message));
  }
}

const NOMS_STATS = {
  comptes: "👥 Comptes",
  verifies: "✅ Vérifiés",
  tel_confirmes: "☑️ Numéros confirmés",
  bloques: "⛔ Bloqués",
  nouveaux_7j: "🆕 Nouveaux (7 j)",
  annonces_en_ligne: "📢 Annonces en ligne",
  annonces_7j: "🗓️ Annonces (7 j)",
  contacts_7j: "💬 Contacts (7 j)",
  signalements_a_voir: "🚩 Signalements à voir"
};

async function chargerTableauBord() {
  try {
    const stats = await api.adminStats();
    remplir($("stats"), Object.entries(NOMS_STATS).map(([cle, nom]) =>
      el("div", { class: "stat" },
        el("span", { class: "stat-nombre" }, formatNombre(stats[cle] ?? 0)),
        el("span", { class: "stat-nom" }, nom))));

    const lignes = await api.historiqueTaux();
    remplir($("historiqueTaux"), lignes.length
      ? lignes.map((h) => el("p", { class: "ligne-info" },
          `${DEVISES[h.devise].icone} 1 ${DEVISES[h.devise].code} : ` +
          (h.ancienne_val ? `${formatNombre(h.ancienne_val)} → ` : "") +
          `${formatNombre(h.nouvelle_val)} GNF · ${afficherDate(h.modifie_le)}`))
      : el("p", { class: "vide" }, "Aucun changement enregistré."));
  } catch (e) {
    remplir($("stats"), el("p", { class: "vide" }, e.message));
  }
}

function brancherCompte() {
  $("btnSupprimerCompte").addEventListener("click", async (ev) => {
    const bouton = ev.currentTarget;
    const ok = await fenetre({
      titre: "🗑️ Supprimer ton compte ?",
      contenu: el("p", {}, "Ton compte, tes annonces et tes avis seront effacés " +
        "définitivement. On ne pourra pas les récupérer."),
      boutons: [
        { valeur: false, texte: "Annuler", classe: "gris" },
        { valeur: true, texte: "🗑️ Oui, supprimer", classe: "rouge" }
      ]
    });
    if (!ok) return;
    pendant(bouton, async () => {
      try {
        await api.supprimerMonCompte();
        profil = null;
        afficherAuth();
        afficherMessage("Ton compte a été supprimé.");
      } catch (e) {
        erreur(e);
      }
    });
  });
}

function brancherAdmin() {
  const resultat = $("resultatAdmin");

  const NOMS_STATUT = {
    verifier: "✅ Badge « Vérifié » attribué",
    retirer: "↩️ Badge retiré",
    bloquer: "⛔ Compte bloqué",
    debloquer: "🔓 Compte débloqué"
  };
  document.querySelectorAll("[data-statut]").forEach((bouton) =>
    bouton.addEventListener("click", () => pendant(bouton, async () => {
      try {
        const tel = lireTel("adminTel");
        await api.adminStatut(tel, bouton.dataset.statut);
        remplir(resultat, el("p", {}, NOMS_STATUT[bouton.dataset.statut] + " : " + afficherTelephone(tel)));
        resultat.classList.remove("hidden");
        chargerRevue();
      } catch (e) {
        erreur(e);
      }
    })));

  $("btnConfirmerTel").addEventListener("click", (ev) => pendant(ev.currentTarget, async () => {
    try {
      const tel = lireTel("adminTel");
      await api.adminConfirmerTelephone(tel);
      remplir(resultat, el("p", {}, "☑️ Numéro confirmé : " + afficherTelephone(tel)));
      resultat.classList.remove("hidden");
    } catch (e) {
      erreur(e);
    }
  }));

  $("btnCodeReprise").addEventListener("click", (ev) => pendant(ev.currentTarget, async () => {
    try {
      const tel = lireTel("adminTel");
      const code = await api.adminCodeReprise(tel);
      remplir(resultat,
        el("p", {}, "Code pour " + afficherTelephone(tel) + " (valable 30 minutes) :"),
        el("span", { class: "code" }, code),
        el("a", {
          class: "gros-bouton whatsapp",
          href: lienWhatsApp(tel, "Votre code Devise Madina : " + code +
            ". Il est valable 30 minutes. Ne le donnez à personne."),
          target: "_blank",
          rel: "noopener noreferrer"
        }, "💬 Envoyer ce code à ce numéro")
      );
      resultat.classList.remove("hidden");
    } catch (e) {
      erreur(e);
    }
  }));
}

/* =====================================================================
   DÉMARRAGE
   ===================================================================== */

async function demarrer() {
  remplirListes();
  // Assistant en images (phase 4) : il publie par la même fonction publier()
  window.DM_ASSISTANT.creer($("assistant"), {
    publier,
    tauxDuJour: () => lireLocal("dm_taux", []),
    apresPublication: () => afficherPage("MesAnnonces")
  });
  brancherAuth();
  brancherTaux();
  brancherPublication();
  brancherCompte();
  brancherAdmin();
  document.querySelectorAll(".nav-btn").forEach((b) =>
    b.addEventListener("click", () => afficherPage(b.dataset.page)));

  // Mode hors ligne (phase 5)
  majEtatReseau();
  window.addEventListener("online", () => { majEtatReseau(); viderFileAttente(); });
  window.addEventListener("offline", majEtatReseau);
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* pas bloquant */ });
  }

  if (api.configurationManquante) {
    // js/config.js pas encore rempli : on l'explique au lieu d'un écran vide
    $("ecranConfig").classList.remove("hidden");
    $("ecranChargement").classList.add("hidden");
    return;
  }

  try {
    if (await api.sessionActuelle()) {
      await entrerDansApp();
      viderFileAttente();
    } else {
      afficherAuth();
    }
    // Si la session expire ou si l'utilisateur se déconnecte ailleurs
    api.sb.auth.onAuthStateChange((evenement) => {
      if (evenement === "SIGNED_OUT") { profil = null; afficherAuth(); }
    });
  } catch (e) {
    afficherAuth();
    erreur(e);
  } finally {
    $("ecranChargement").classList.add("hidden");
  }
}

demarrer();
})();
