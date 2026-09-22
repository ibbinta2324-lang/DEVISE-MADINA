/* =====================================================================
   DEVISE MADINA — ASSISTANT DE PUBLICATION (phase 4)
   Une question par écran, des images et des couleurs plutôt que du texte.
   Le texte reste présent en complément (et pour TalkBack).
   Aucune sécurité ici : la base vérifie tout au moment de publier.
   ===================================================================== */

(function () {
"use strict";

const { el, remplir, DEVISES, FORMES, CHEQUES, formatNombre, lireNombre } = window.DM_OUTILS;

/* ---------- Données visuelles ---------- */

const SYMBOLES = { USD: "$", EUR: "€", XOF: "CFA", GNF: "FG" };

// HYPOTHÈSE : endroits connus à faire valider par l'équipe sur le terrain
const LIEUX = [
  ["🏬", "Marché de Madina"],
  ["🚌", "Gare routière de Madina"],
  ["🕌", "Mosquée de Madina"],
  ["🚦", "Carrefour de Madina"],
  ["🏦", "Devant une banque"]
];

// HYPOTHÈSE : banques présentes en Guinée, à compléter
const BANQUES = ["Ecobank", "Orabank", "UBA", "Société Générale", "Afriland", "Vista Bank", "BICIGUI", "Access Bank"];

// Taille d'une « liasse » pour l'image du montant. HYPOTHÈSE : ordres de grandeur du marché.
const LIASSE = { USD: 100, EUR: 100, XOF: 10000, GNF: 1000000 };

// Plafonds (identiques à la base, pour prévenir avant l'envoi)
const PLAFONDS = { USD: 1e6, EUR: 1e6, XOF: 1e9, GNF: 1e10 };

const DUREES = [[24, "1", "jour"], [72, "3", "jours"], [168, "7", "jours"], [720, "30", "jours"]];

/** Billet dessiné (pas d'image de vrais billets : poids et droits). */
function billet(devise, classe = "") {
  return el("span", { class: `billet billet-${devise} ${classe}`, "aria-hidden": "true" },
    el("span", { class: "billet-coin" }, SYMBOLES[devise]),
    el("span", { class: "billet-symbole" }, SYMBOLES[devise]),
    el("span", { class: "billet-coin bas" }, SYMBOLES[devise])
  );
}

/** Pastille aux couleurs du moyen de paiement (pas de logo officiel sans autorisation). */
function logoForme(forme, classe = "") {
  const contenu = { especes: "💵", orange: "OM", mtn: "MoMo", wave: "W", cheque: "📝" }[forme];
  return el("span", { class: `logo-forme forme-${forme} ${classe}`, "aria-hidden": "true" }, contenu);
}

/* ---------- Taux de référence ---------- */

/** Valeur en GNF de chaque devise, d'après les derniers taux connus. */
function valeursGnf(taux) {
  const v = { GNF: 1 };
  for (const l of taux || []) v[l.devise] = Number(l.valeur_gnf);
  return v;
}

/** Devise « forte » (la plus chère) et « faible » d'une paire. */
function sensTaux(a, c, valeurs) {
  const va = valeurs[a] ?? (a === "GNF" ? 1 : null);
  const vc = valeurs[c] ?? (c === "GNF" ? 1 : null);
  if (va == null || vc == null) {
    // Sans taux connu : la devise étrangère est la « forte »
    return a === "GNF" ? { forte: c, faible: a, ref: null } : { forte: a, faible: c, ref: null };
  }
  return va >= vc
    ? { forte: a, faible: c, ref: va / vc }
    : { forte: c, faible: a, ref: vc / va };
}

function arrondiJoli(n) {
  if (n >= 100) return Math.round(n);
  if (n >= 10) return Math.round(n * 10) / 10;
  return Math.round(n * 100) / 100;
}

/* =====================================================================
   L'ASSISTANT
   ===================================================================== */

function creer(conteneur, options) {
  const { publier, tauxDuJour, apresPublication } = options;
  let s;              // état de l'annonce en cours
  let etape;          // nom de l'écran affiché
  let historique;     // pour le bouton ◀

  function reinitialiser() {
    s = {
      a_devise: null, a_forme: null, a_cheque_type: null, a_banque: null, montant: "",
      c_devise: null, c_forme: null, c_cheque_type: null, c_banque: null,
      taux: "", tauxTouche: false, negociable: false,
      lieu: null, lat: null, lng: null, duree_heures: 24
    };
    historique = [];
    etape = "aDevise";
  }

  /** Ordre des écrans (les écrans « chèque » n'apparaissent que si besoin). */
  function ordre() {
    return ["aDevise", "aForme", s.a_forme === "cheque" ? "aCheque" : null, "montant",
            "cDevise", "cForme", s.c_forme === "cheque" ? "cCheque" : null,
            "taux", "lieu", "recap"].filter(Boolean);
  }

  function aller(nouvelle) {
    historique.push(etape);
    etape = nouvelle;
    dessiner();
  }

  function suivant() {
    const liste = ordre();
    aller(liste[liste.indexOf(etape) + 1]);
  }

  function retour() {
    if (!historique.length) return;
    etape = historique.pop();
    dessiner();
  }

  /* ---------- Éléments communs ---------- */

  function tuile({ visuel, texte, choisi, action, classe = "" }) {
    return el("button", {
      type: "button",
      class: "tuile " + classe,
      "aria-pressed": String(Boolean(choisi)),
      onClick: action
    }, visuel, el("span", { class: "tuile-texte" }, texte));
  }

  function entete(icone, question, cote) {
    const liste = ordre();
    const position = liste.indexOf(etape);
    return el("div", { class: "assistant-entete" },
      el("div", { class: "assistant-barre" },
        el("button", {
          type: "button",
          class: "bouton-retour",
          "aria-label": "Retour",
          disabled: historique.length === 0,
          onClick: retour
        }, "◀"),
        el("div", { class: "progression", role: "progressbar",
          "aria-valuemin": "1", "aria-valuemax": String(liste.length), "aria-valuenow": String(position + 1),
          "aria-label": `Étape ${position + 1} sur ${liste.length}` },
          liste.map((_, i) => el("span", { class: i < position ? "fait" : i === position ? "actuel" : "" })))
      ),
      el("h3", { class: "question " + (cote || "") },
        el("span", { class: "question-icone", "aria-hidden": "true" }, icone),
        el("span", {}, question))
    );
  }

  function boutonSuivant(actif, texte = "Suivant") {
    return el("button", {
      type: "button",
      class: "gros-bouton vert bouton-suivant",
      disabled: !actif,
      onClick: suivant
    }, el("span", { "aria-hidden": "true" }, "➡️"), texte);
  }

  /* ---------- Clavier géant ---------- */

  function clavier(valeur, changer, { virgule = false, zeros = false } = {}) {
    const touches = ["1", "2", "3", "4", "5", "6", "7", "8", "9",
                     virgule ? "," : zeros ? "000" : "", "0", "⌫"];
    return el("div", { class: "clavier" }, touches.map((t) => t === ""
      ? el("span")
      : el("button", {
          type: "button",
          class: "touche" + (t === "⌫" ? " effacer" : ""),
          "aria-label": t === "⌫" ? "Effacer" : t === "000" ? "trois zéros" : t,
          onClick: () => {
            let v = valeur();
            if (t === "⌫") v = v.slice(0, -1);
            else if (t === ",") { if (!v.includes(",")) v = (v || "0") + ","; }
            else if (v.replace(/\D/g, "").length < 13) v = (v === "0" ? "" : v) + t;
            changer(v);
          }
        }, t)));
  }

  /** Image des liasses : 1 liasse = LIASSE[devise] */
  function liasses(devise, montant) {
    const n = Math.floor(montant / LIASSE[devise]);
    if (n < 1) return el("div", { class: "liasses" }, billet(devise, "mini"));
    const affichees = Math.min(n, 10);
    return el("div", { class: "liasses", "aria-hidden": "true" },
      Array.from({ length: affichees }, () => el("span", { class: "liasse" }, billet(devise, "mini"))),
      n > 10 ? el("span", { class: "liasse-plus" }, "× " + formatNombre(n)) : null
    );
  }

  /* ---------- Les écrans ---------- */

  function ecranDevise(cote) {
    const champ = cote === "a" ? "a_devise" : "c_devise";
    const autre = cote === "a" ? null : s.a_devise;
    return [
      entete(cote === "a" ? "💰" : "🔎",
        cote === "a" ? "Qu'est-ce que tu as ?" : "Qu'est-ce que tu cherches ?",
        cote === "a" ? "jai" : "cherche"),
      el("div", { class: "tuiles" }, Object.entries(DEVISES).map(([code, d]) => tuile({
        visuel: billet(code),
        texte: `${d.nom} (${d.code})`,
        choisi: s[champ] === code,
        classe: code === autre && s.a_forme === "especes" ? "attenuee" : "",
        action: () => { s[champ] = code; s.tauxTouche = false; suivant(); }
      })))
    ];
  }

  function ecranForme(cote) {
    const champ = cote + "_forme";
    const interdit = cote === "c" && s.c_devise === s.a_devise ? s.a_forme : null;
    return [
      entete("👛", "Sous quelle forme ?", cote === "a" ? "jai" : "cherche"),
      el("div", { class: "tuiles" }, Object.entries(FORMES)
        .filter(([code]) => code !== interdit)   // pas d'échange identique
        .map(([code, f]) => tuile({
          visuel: logoForme(code),
          texte: f.nom,
          choisi: s[champ] === code,
          action: () => {
            s[champ] = code;
            if (code !== "cheque") { s[cote + "_cheque_type"] = null; s[cote + "_banque"] = null; }
            suivant();
          }
        })))
    ];
  }

  function ecranCheque(cote) {
    const typeChamp = cote + "_cheque_type";
    const banqueChamp = cote + "_banque";
    const saisie = el("input", {
      type: "text", maxlength: "40", class: "saisie-libre",
      placeholder: "Autre banque", "aria-label": "Autre banque",
      value: s[banqueChamp] && !BANQUES.includes(s[banqueChamp]) ? s[banqueChamp] : ""
    });
    const pret = () => s[typeChamp] && s[banqueChamp] && s[banqueChamp].trim().length >= 2;
    const bouton = boutonSuivant(pret());
    const maj = () => { bouton.disabled = !pret(); };
    saisie.addEventListener("input", () => {
      s[banqueChamp] = saisie.value;
      conteneur.querySelectorAll(".tuile.banque").forEach((b) => b.setAttribute("aria-pressed", "false"));
      maj();
    });

    const groupeType = el("div", { class: "tuiles trois" }, Object.entries(CHEQUES).map(([code, nom]) => {
      const b = tuile({
        visuel: el("span", { class: "logo-forme forme-cheque", "aria-hidden": "true" },
          { bancaire: "📝", certifie: "✅", banque: "🏦" }[code]),
        texte: nom,
        choisi: s[typeChamp] === code,
        action: () => {
          s[typeChamp] = code;
          groupeType.querySelectorAll(".tuile").forEach((t) => t.setAttribute("aria-pressed", String(t === b)));
          maj();
        }
      });
      return b;
    }));

    const groupeBanque = el("div", { class: "tuiles banques" }, BANQUES.map((nom) => {
      const b = tuile({
        visuel: el("span", { class: "initiales", "aria-hidden": "true" }, nom.slice(0, 2).toUpperCase()),
        texte: nom,
        classe: "banque",
        choisi: s[banqueChamp] === nom,
        action: () => {
          s[banqueChamp] = nom;
          saisie.value = "";
          groupeBanque.querySelectorAll(".tuile").forEach((t) => t.setAttribute("aria-pressed", String(t === b)));
          maj();
        }
      });
      return b;
    }));

    return [
      entete("📝", "Quel chèque ?", cote === "a" ? "jai" : "cherche"),
      groupeType,
      el("p", { class: "sous-question" }, "🏦 Quelle banque ?"),
      groupeBanque,
      saisie,
      bouton
    ];
  }

  function ecranMontant() {
    const affichage = el("div", { class: "ecran-montant", "aria-live": "polite" });
    const image = el("div");
    const alerte = el("p", { class: "alerte-taux hidden" }, "🚫 Montant trop élevé");
    const bouton = boutonSuivant(false);

    function maj() {
      const n = lireNombre(s.montant) || 0;
      remplir(affichage,
        el("span", { class: "montant-chiffres" }, s.montant ? formatNombre(n) : "0"),
        el("span", { class: "montant-devise" }, DEVISES[s.a_devise].code));
      remplir(image, n > 0 ? liasses(s.a_devise, n) : null);
      const tropGrand = n > PLAFONDS[s.a_devise];
      alerte.classList.toggle("hidden", !tropGrand);
      bouton.disabled = !(n > 0) || tropGrand;
    }
    maj();
    return [
      entete("🔢", "Combien ?", "jai"),
      el("div", { class: "montant-zone" }, billet(s.a_devise), affichage),
      image,
      alerte,
      clavier(() => s.montant, (v) => { s.montant = v; maj(); },
        { zeros: true }),
      bouton
    ];
  }

  function ecranTaux() {
    const valeurs = valeursGnf(tauxDuJour());
    const { forte, faible, ref } = sensTaux(s.a_devise, s.c_devise, valeurs);
    if (!s.tauxTouche) {
      s.taux = ref ? String(arrondiJoli(ref)).replace(".", ",") : "";
      s.tauxTouche = true;
    }
    const pas = ref ? Math.max(arrondiJoli(ref / 200), 0.01) : 1;

    const valeur = el("span", { class: "montant-chiffres" });
    const bouton = boutonSuivant(false);
    const zoneTaux = el("div", { class: "zone-taux" });
    const ecart = el("p", { class: "aide" });

    function maj() {
      const n = lireNombre(s.taux.replace(/,$/, ""));
      valeur.textContent = s.taux ? formatNombre(n ?? 0) : "…";
      zoneTaux.classList.toggle("desactive", s.negociable);
      bouton.disabled = !(s.negociable || n > 0);
      if (ref && n > 0 && !s.negociable) {
        const e = Math.abs(n / ref - 1) * 100;
        ecart.textContent = e < 1 ? "✅ Comme le taux du jour"
          : e > 10 ? `🚨 ${formatNombre(Math.round(e))} % d'écart avec le taux du jour`
          : `≈ ${formatNombre(Math.round(e))} % d'écart avec le taux du jour`;
        ecart.className = "aide " + (e > 10 ? "alerte-taux" : "");
      } else {
        ecart.textContent = ref ? "" : "Pas de taux du jour pour cette paire : tape ton taux.";
        ecart.className = "aide";
      }
    }

    const changer = (delta) => {
      const n = lireNombre(s.taux.replace(/,$/, "")) || ref || 0;
      s.taux = String(arrondiJoli(Math.max(n + delta, pas))).replace(".", ",");
      s.negociable = false;
      negocier.setAttribute("aria-pressed", "false");
      maj();
    };

    const negocier = tuile({
      visuel: el("span", { class: "logo-forme forme-negocier", "aria-hidden": "true" }, "🤝"),
      texte: "À négocier",
      classe: "large",
      choisi: s.negociable,
      action: () => {
        s.negociable = !s.negociable;
        negocier.setAttribute("aria-pressed", String(s.negociable));
        maj();
      }
    });

    remplir(zoneTaux,
      el("div", { class: "equation" },
        el("span", { class: "equation-cote" }, el("b", {}, "1"), billet(forte, "moyen")),
        el("span", { class: "egal" }, "="),
        el("span", { class: "equation-cote" }, valeur, billet(faible, "moyen"))
      ),
      el("div", { class: "plus-moins" },
        el("button", { type: "button", class: "touche grande", "aria-label": "Diminuer", onClick: () => changer(-pas) }, "−"),
        el("button", { type: "button", class: "touche grande", "aria-label": "Augmenter", onClick: () => changer(pas) }, "+")
      ),
      ecart,
      clavier(() => s.taux, (v) => { s.taux = v; s.negociable = false; negocier.setAttribute("aria-pressed", "false"); maj(); },
        { virgule: true })
    );
    maj();

    return [
      entete("💱", `Ton taux : 1 ${DEVISES[forte].code} = ? ${DEVISES[faible].code}`, "cherche"),
      negocier,
      zoneTaux,
      bouton
    ];
  }

  function ecranLieu() {
    const saisie = el("input", {
      type: "text", maxlength: "60", class: "saisie-libre",
      placeholder: "Autre endroit", "aria-label": "Autre endroit",
      value: s.lieu && !LIEUX.some(([, n]) => n === s.lieu) ? s.lieu : ""
    });
    const bouton = boutonSuivant(Boolean(s.lieu && s.lieu.trim().length >= 2));
    saisie.addEventListener("input", () => {
      s.lieu = saisie.value;
      bouton.disabled = saisie.value.trim().length < 2;
    });

    const gps = tuile({
      visuel: el("span", { class: "logo-forme forme-gps", "aria-hidden": "true" }, "📍"),
      texte: s.lat ? "Position ajoutée ✅" : "Ajouter ma position",
      classe: "large",
      choisi: Boolean(s.lat),
      action: () => {
        if (!navigator.geolocation) return;
        gps.querySelector(".tuile-texte").textContent = "Recherche…";
        navigator.geolocation.getCurrentPosition((p) => {
          const { latitude, longitude } = p.coords;
          // On ne garde la position que si elle est en Guinée (comme la base)
          if (latitude >= 7 && latitude <= 13 && longitude >= -15.5 && longitude <= -7.5) {
            s.lat = Math.round(latitude * 1e5) / 1e5;
            s.lng = Math.round(longitude * 1e5) / 1e5;
            gps.querySelector(".tuile-texte").textContent = "Position ajoutée ✅";
            gps.setAttribute("aria-pressed", "true");
          } else {
            gps.querySelector(".tuile-texte").textContent = "Hors de Guinée ❌";
          }
        }, () => {
          gps.querySelector(".tuile-texte").textContent = "Position refusée ❌";
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
      }
    });

    return [
      entete("📍", "Où es-tu ?", ""),
      el("div", { class: "tuiles" }, LIEUX.map(([icone, nom]) => tuile({
        visuel: el("span", { class: "logo-forme forme-lieu", "aria-hidden": "true" }, icone),
        texte: nom,
        choisi: s.lieu === nom,
        action: () => { s.lieu = nom; suivant(); }
      }))),
      saisie,
      gps,
      bouton
    ];
  }

  function ecranRecap() {
    const d = (code) => DEVISES[code].code;
    const n = lireNombre(s.montant);
    const tauxN = lireNombre(s.taux.replace(/,$/, ""));
    const { forte, faible } = sensTaux(s.a_devise, s.c_devise, valeursGnf(tauxDuJour()));
    const modifier = (cible) => el("button", {
      type: "button", class: "bouton-modifier", "aria-label": "Modifier", onClick: () => aller(cible)
    }, "✏️");

    const publierBouton = el("button", {
      type: "button",
      class: "gros-bouton vert bouton-publier",
      onClick: async () => {
        publierBouton.disabled = true;
        try {
          const ok = await publier(annonceFinale());
          if (ok) { reinitialiser(); etape = "fini"; dessiner(); }
        } finally {
          publierBouton.disabled = false;
        }
      }
    }, el("span", { "aria-hidden": "true" }, "✅"), "Publier");

    return [
      entete("✅", "Vérifie et publie", ""),
      el("div", { class: "recap" },
        el("div", { class: "cote jai" },
          el("div", { class: "etiquette" }, "💰 J'AI", modifier("aDevise")),
          billet(s.a_devise, "moyen"),
          el("div", { class: "montant" }, `${formatNombre(n)} ${d(s.a_devise)}`, modifier("montant")),
          el("div", { class: "forme" }, logoForme(s.a_forme, "mini"), " ", FORMES[s.a_forme].nom),
          s.a_banque ? el("div", { class: "forme" }, `${CHEQUES[s.a_cheque_type]} — ${s.a_banque}`) : null
        ),
        el("div", { class: "fleche", "aria-label": "contre" }, "⇄"),
        el("div", { class: "cote cherche" },
          el("div", { class: "etiquette" }, "🔎 JE CHERCHE", modifier("cDevise")),
          billet(s.c_devise, "moyen"),
          el("div", { class: "montant" }, d(s.c_devise)),
          el("div", { class: "forme" }, logoForme(s.c_forme, "mini"), " ", FORMES[s.c_forme].nom),
          s.c_banque ? el("div", { class: "forme" }, `${CHEQUES[s.c_cheque_type]} — ${s.c_banque}`) : null
        )
      ),
      el("p", { class: "ligne-recap" },
        s.negociable ? "🤝 À négocier" : `💱 1 ${d(forte)} = ${formatNombre(tauxN)} ${d(faible)}`,
        modifier("taux")),
      el("p", { class: "ligne-recap" }, "📍 ", s.lieu, s.lat ? " (📡 position)" : "", modifier("lieu")),
      el("p", { class: "sous-question" }, "📅 Combien de temps ?"),
      el("div", { class: "tuiles quatre" }, DUREES.map(([heures, chiffre, unite]) => {
        const b = tuile({
          visuel: el("span", { class: "calendrier", "aria-hidden": "true" }, chiffre),
          texte: unite,
          choisi: s.duree_heures === heures,
          action: () => {
            s.duree_heures = heures;
            b.parentElement.querySelectorAll(".tuile").forEach((t) => t.setAttribute("aria-pressed", String(t === b)));
          }
        });
        return b;
      })),
      publierBouton
    ];
  }

  function ecranFini() {
    return [
      el("div", { class: "fini" },
        el("div", { class: "fini-icone", "aria-hidden": "true" }, "🎉"),
        el("h3", {}, "Annonce publiée !"),
        el("button", {
          type: "button", class: "gros-bouton bleu",
          onClick: () => apresPublication()
        }, el("span", { "aria-hidden": "true" }, "📋"), "Voir mes annonces"),
        el("button", {
          type: "button", class: "gros-bouton gris",
          onClick: () => { reinitialiser(); dessiner(); }
        }, el("span", { "aria-hidden": "true" }, "➕"), "Nouvelle annonce")
      )
    ];
  }

  /** Données envoyées à la base (mêmes colonnes que le formulaire classique). */
  function annonceFinale() {
    const taux = s.negociable ? null : lireNombre(s.taux.replace(/,$/, ""));
    return {
      a_devise: s.a_devise,
      a_forme: s.a_forme,
      a_montant: lireNombre(s.montant),
      a_cheque_type: s.a_forme === "cheque" ? s.a_cheque_type : undefined,
      a_banque: s.a_forme === "cheque" ? s.a_banque.trim() : undefined,
      c_devise: s.c_devise,
      c_forme: s.c_forme,
      c_cheque_type: s.c_forme === "cheque" ? s.c_cheque_type : undefined,
      c_banque: s.c_forme === "cheque" ? s.c_banque.trim() : undefined,
      taux,
      negociable: s.negociable,
      lieu: s.lieu.trim(),
      duree_heures: s.duree_heures,
      lat: s.lat ?? undefined,
      lng: s.lng ?? undefined
    };
  }

  function dessiner() {
    const ecrans = {
      aDevise: () => ecranDevise("a"),
      aForme: () => ecranForme("a"),
      aCheque: () => ecranCheque("a"),
      montant: ecranMontant,
      cDevise: () => ecranDevise("c"),
      cForme: () => ecranForme("c"),
      cCheque: () => ecranCheque("c"),
      taux: ecranTaux,
      lieu: ecranLieu,
      recap: ecranRecap,
      fini: ecranFini
    };
    conteneur.dataset.etape = etape;
    remplir(conteneur, ecrans[etape]());
    const titre = conteneur.querySelector(".question");
    // Au premier affichage, on ne bouge pas la page ; ensuite on suit l'assistant
    if (dejaAffiche) {
      if (titre) { titre.tabIndex = -1; titre.focus({ preventScroll: true }); }
      conteneur.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    dejaAffiche = true;
  }

  let dejaAffiche = false;
  reinitialiser();
  dessiner();
  return { recommencer: () => { reinitialiser(); dessiner(); } };
}

window.DM_ASSISTANT = Object.freeze({ creer, billet, logoForme });
})();
