/* =====================================================================
   DEVISE MADINA — ACCÈS AU SERVEUR (Supabase)
   Aucune règle de sécurité ici : c'est la base qui décide.
   Ce fichier ne fait que transmettre les demandes et traduire les erreurs.
   ===================================================================== */

(function () {
"use strict";

const cfg = window.DM_CONFIG;

const configurationManquante =
  !cfg || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.supabaseUrl) ||
  !cfg.supabaseCle || cfg.supabaseCle.startsWith("COLLER");

const sb = configurationManquante
  ? null
  : window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseCle, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });

/* ---------- Messages d'erreur compréhensibles ---------- */

const MESSAGES = {
  // fonction serveur « pin »
  identifiants: "Numéro ou code PIN incorrect.",
  bloque: "Trop d'erreurs. Réessaie plus tard.",
  reprise_requise: "Trop d'erreurs : demande un code à l'administrateur (bouton « J'ai oublié mon code PIN »).",
  trop_de_tentatives: "Trop de tentatives depuis ce réseau. Réessaie dans une heure.",
  telephone: "Numéro guinéen invalide (9 chiffres, commence par 6).",
  nom: "Nom invalide (2 à 40 lettres).",
  consentement: "Coche la case pour accepter.",
  pin_format: "Le code PIN doit avoir 4 chiffres.",
  pin_faible: "Ce code PIN est trop facile à deviner. Choisis-en un autre.",
  deja_inscrit: "Ce numéro a déjà un compte. Utilise « J'ai déjà un compte » ou « J'ai oublié mon code PIN ».",
  code_invalide: "Code incorrect ou périmé. Redemande un code à l'administrateur.",
  // base de données
  NON_CONNECTE: "Connecte-toi d'abord.",
  PROFIL_INCOMPLET: "Ton profil est incomplet.",
  COMPTE_BLOQUE: "Ton compte est suspendu en attendant une vérification.",
  LIMITE_JOUR: "Tu as déjà publié 5 annonces aujourd'hui. Réessaie demain.",
  LIMITE_ACTIVES: "Tu as déjà 10 annonces en ligne. Retire-en une d'abord.",
  DOUBLON: "Tu as déjà publié cette annonce.",
  ANNONCE_INTROUVABLE: "Cette annonce n'est plus disponible.",
  SA_PROPRE_ANNONCE: "C'est ta propre annonce.",
  LIMITE_CONTACTS: "Limite de contacts atteinte pour aujourd'hui.",
  TAUX_ECART_TROP_GRAND: "Changement trop grand (plus de 50 %). Vérifie le chiffre.",
  ADMIN_REQUIS: "Réservé à l'administrateur.",
  NUMERO_INCONNU: "Aucun compte avec ce numéro (ou compte administrateur).",
  CONTACT_REQUIS: "Tu dois d'abord contacter cette personne.",
  LIMITE_SIGNALEMENTS: "Trop de signalements aujourd'hui. Réessaie demain.",
  DECISION_INVALIDE: "Action inconnue.",
  AVIS_INVALIDE: "Avis invalide.",
  signalements_motif_check: "Choisis un motif dans la liste.",
  montant_plafonne: "Montant trop élevé.",
  echange_utile: "Choisis une devise ou une forme différente de ce que tu as.",
  lieu_check: "Localisation invalide (2 à 60 caractères, sans symboles < >).",
  cheque_a: "Indique le type de chèque et la banque (2 à 40 caractères).",
  cheque_c: "Indique le type de chèque et la banque recherchés (2 à 40 caractères).",
  "row-level security": "Action non autorisée.",
  "permission denied": "Action non autorisée.",
  erreur_serveur: "Le serveur a un problème. Réessaie dans un moment.",
  reseau: "Pas de connexion internet. Réessaie."
};

class ErreurApp extends Error {
  constructor(code, details = {}) {
    super(MESSAGES[code] || "Une erreur est survenue. Réessaie.");
    this.code = code;
    this.details = details;
  }
}

/** Traduit une erreur Supabase en message clair. */
function traduire(erreur) {
  const texte = String(erreur?.message || "");
  if (/fetch|network|Failed to/i.test(texte)) return new ErreurApp("reseau");
  const cle = Object.keys(MESSAGES).find((k) => texte.includes(k));
  if (!cle) console.warn("Erreur non traduite :", texte);
  return new ErreurApp(cle || "inconnue");
}

async function verifier(promesse) {
  let reponse;
  try {
    reponse = await promesse;
  } catch (e) {
    throw traduire(e);
  }
  if (reponse.error) throw traduire(reponse.error);
  return reponse.data;
}

/* ---------- Comptes (fonction serveur « pin ») ---------- */

async function appelerPin(corps, { sansSession = false } = {}) {
  let data;
  try {
    const r = await sb.functions.invoke("pin", { body: corps });
    data = r.data;
    if (r.error) {
      // Réponse d'erreur HTTP : on essaie de lire son contenu
      try { data = await r.error.context.json(); } catch { data = null; }
      if (!data) throw new ErreurApp(r.error.name === "FunctionsFetchError" ? "reseau" : "erreur_serveur");
    }
  } catch (e) {
    if (e instanceof ErreurApp) throw e;
    throw new ErreurApp("reseau");
  }
  if (!data?.ok) {
    const err = new ErreurApp(data?.raison || "erreur_serveur", data || {});
    if (data?.raison === "bloque" && data.attendre_sec) {
      err.message = "Trop d'erreurs. Réessaie dans " + Math.ceil(data.attendre_sec / 60) + " minute(s).";
    }
    if (data?.raison === "identifiants" && data.essais_restants) {
      err.message += " Encore " + data.essais_restants + " essai(s) avant blocage.";
    }
    throw err;
  }
  if (sansSession) return;                       // suppression de compte : rien à ouvrir
  const { error } = await sb.auth.setSession(data.session);
  if (error) throw traduire(error);
}

const connexion = (telephone, pin) =>
  appelerPin({ action: "connexion", telephone, pin });

const inscription = (telephone, nom, pin, consentement) =>
  appelerPin({ action: "inscription", telephone, nom, pin, consentement });

const reprise = (telephone, code, pin) =>
  appelerPin({ action: "reprise", telephone, code, pin });

async function deconnexion() {
  try { await sb.auth.signOut(); } catch { /* hors ligne : session locale effacée quand même */ }
}

async function sessionActuelle() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

/* ---------- Profil ---------- */

async function monProfil() {
  const session = await sessionActuelle();
  if (!session) return null;
  return verifier(
    sb.from("profils")
      .select("id, nom, telephone, role, bloque, tel_confirme")
      .eq("id", session.user.id)
      .maybeSingle()
  );
}

/* ---------- Taux ---------- */

const lireTaux = () =>
  verifier(sb.from("taux").select("devise, valeur_gnf, modifie_le"));

const enregistrerTaux = (lignes) =>
  verifier(sb.from("taux").upsert(lignes, { onConflict: "devise" }));

/* ---------- Annonces ---------- */

const publierAnnonce = (annonce) =>
  verifier(sb.from("annonces").insert(annonce));

const annoncesActives = (deviseCherchee) =>
  verifier(sb.rpc("annonces_actives", { p_devise_cherchee: deviseCherchee || null }));

async function mesAnnonces() {
  const session = await sessionActuelle();
  return verifier(
    sb.from("annonces").select("*")
      .eq("auteur", session.user.id)
      .order("cree_le", { ascending: false })
  );
}

const retirerAnnonce = (id) =>
  verifier(sb.from("annonces").update({ statut: "retiree" }).eq("id", id));

const supprimerAnnonce = (id) =>
  verifier(sb.from("annonces").delete().eq("id", id));

async function contacter(idAnnonce) {
  const lignes = await verifier(sb.rpc("contacter", { p_annonce: idAnnonce }));
  if (!lignes?.length) throw new ErreurApp("ANNONCE_INTROUVABLE");
  return lignes[0];
}

/* ---------- Confiance (phase 3) ---------- */

const donnerAvis = (idAnnonce, positif) =>
  verifier(sb.rpc("donner_avis", { p_annonce: idAnnonce, p_positif: positif }));

const signaler = (idAnnonce, motif) =>
  verifier(sb.rpc("signaler", { p_annonce: idAnnonce, p_motif: motif }));

/* ---------- Administration ---------- */

const adminSignalements = () => verifier(sb.rpc("admin_signalements"));

const adminDecider = (idCible, decision) =>
  verifier(sb.rpc("admin_decider", { p_cible: idCible, p_decision: decision }));

const adminStatut = (telephone, action) =>
  verifier(sb.rpc("admin_statut", { p_telephone: telephone, p_action: action }));

const adminStats = () => verifier(sb.rpc("admin_stats"));

const historiqueTaux = () =>
  verifier(sb.from("taux_historique")
    .select("devise, ancienne_val, nouvelle_val, modifie_le")
    .order("modifie_le", { ascending: false })
    .limit(10));

/* ---------- Suppression du compte (phase 6) ---------- */

async function supprimerMonCompte() {
  await appelerPin({ action: "supprimer" }, { sansSession: true });
  try { await sb.auth.signOut(); } catch { /* le compte n'existe déjà plus */ }
}

const adminCodeReprise = (telephone) =>
  verifier(sb.rpc("admin_code_reprise", { p_telephone: telephone }));

const adminConfirmerTelephone = (telephone) =>
  verifier(sb.rpc("admin_confirmer_telephone", { p_telephone: telephone }));

// Mis à disposition de app.js
window.DM_API = Object.freeze({
  configurationManquante,
  sb,
  ErreurApp,
  connexion,
  inscription,
  reprise,
  deconnexion,
  sessionActuelle,
  monProfil,
  lireTaux,
  enregistrerTaux,
  publierAnnonce,
  annoncesActives,
  mesAnnonces,
  retirerAnnonce,
  supprimerAnnonce,
  contacter,
  adminCodeReprise,
  adminConfirmerTelephone,
  donnerAvis,
  signaler,
  adminSignalements,
  adminDecider,
  adminStatut,
  adminStats,
  historiqueTaux,
  supprimerMonCompte
});
})();
