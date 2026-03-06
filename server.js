/**
 * ÉcoleDirecte+ — Proxy serveur local
 * Lance avec : node server.js
 * Puis ouvre : http://localhost:3000
 */

const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = 3000;
const ED_BASE = "https://api.ecoledirecte.com/v3";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Headers communs vers l'API EcoleDirecte
const ED_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent": "ecoledirecte-plus/1.0",
  "X-Token": "",
};

// ─── AUTH ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/login
 * Body : { identifiant, motdepasse }
 * Retourne le token + infos élève
 */
app.post("/api/login", async (req, res) => {
  const { identifiant, motdepasse } = req.body;
  if (!identifiant || !motdepasse) {
    return res.status(400).json({ error: "Identifiant et mot de passe requis" });
  }

  try {
    const payload = `data=${encodeURIComponent(
      JSON.stringify({ identifiant, motdepasse, isRelogin: false })
    )}`;

    const response = await fetch(`${ED_BASE}/login.awp?v=4`, {
      method: "POST",
      headers: ED_HEADERS,
      body: payload,
    });

    const data = await response.json();

    if (data.code !== 200) {
      return res.status(401).json({
        error: data.message || "Identifiants incorrects",
        code: data.code,
      });
    }

    // On récupère le token et l'id élève
    const token = data.token;
    const accounts = data.data?.accounts || [];
    const eleve = accounts.find((a) => a.typeCompte === "E") || accounts[0];

    if (!eleve) {
      return res.status(400).json({ error: "Aucun compte élève trouvé" });
    }

    res.json({
      token,
      eleve: {
        id: eleve.id,
        nom: eleve.nom,
        prenom: eleve.prenom,
        classe: eleve.profile?.classe?.libelle || "",
        etablissement: eleve.nomEtablissement || "",
        anneeScolaire: eleve.anneeScolaire || "",
        photo: eleve.profile?.photo || null,
      },
    });
  } catch (err) {
    console.error("[LOGIN]", err);
    res.status(500).json({ error: "Erreur de connexion au serveur EcoleDirecte" });
  }
});

// ─── HELPER FETCH AUTHENTIFIÉ ─────────────────────────────────────────────────

async function edFetch(url, token, method = "GET", body = null) {
  const opts = {
    method,
    headers: { ...ED_HEADERS, "X-Token": token },
  };
  if (body) {
    opts.body = `data=${encodeURIComponent(JSON.stringify(body))}`;
  }
  const res = await fetch(url, opts);
  return res.json();
}

// ─── NOTES ────────────────────────────────────────────────────────────────────

/**
 * GET /api/notes/:eleveId?token=xxx&annee=2025
 */
app.get("/api/notes/:eleveId", async (req, res) => {
  const { eleveId } = req.params;
  const { token } = req.query;

  if (!token) return res.status(401).json({ error: "Token manquant" });

  try {
    const data = await edFetch(
      `${ED_BASE}/eleves/${eleveId}/notes.awp?verbe=get&v=4`,
      token
    );

    if (data.code !== 200) {
      return res.status(400).json({ error: data.message, code: data.code });
    }

    const periodes = data.data?.periodes || [];
    const notes = data.data?.notes || [];

    // Calcul moyennes par matière
    const matieresMap = {};
    notes.forEach((note) => {
      const id = note.codeMatiere;
      if (!matieresMap[id]) {
        matieresMap[id] = {
          id,
          libelle: note.libelleMatiere,
          notes: [],
          moyenneEleve: note.moyenneMatiere || null,
          moyenneClasse: note.moyenneClasse || null,
          professeur: note.professeur || "",
          coeff: note.coeff || 1,
        };
      }
      matieresMap[id].notes.push({
        id: note.id,
        devoir: note.devoir,
        date: note.date,
        note: note.valeur,
        noteSur: note.noteSur,
        coeff: note.coeff,
        typeDevoir: note.typeDevoir,
        moyenneClasse: note.moyenneClasse,
        minNote: note.minNote,
        maxNote: note.maxNote,
      });
    });

    res.json({
      periodes: periodes.map((p) => ({
        id: p.idPeriode,
        libelle: p.periode,
        annuel: p.annuel,
        moyenneGenerale: p.ensembleMatieres?.moyenneGenerale || null,
        moyenneGeneraleClasse: p.ensembleMatieres?.moyenneClasse || null,
        rang: p.ensembleMatieres?.rang || null,
        effectif: p.ensembleMatieres?.effectif || null,
      })),
      matieres: Object.values(matieresMap),
      notes,
    });
  } catch (err) {
    console.error("[NOTES]", err);
    res.status(500).json({ error: "Erreur lors de la récupération des notes" });
  }
});

// ─── EMPLOI DU TEMPS ──────────────────────────────────────────────────────────

/**
 * GET /api/emploi/:eleveId?token=xxx&debut=2026-03-02&fin=2026-03-06
 */
app.get("/api/emploi/:eleveId", async (req, res) => {
  const { eleveId } = req.params;
  const { token, debut, fin } = req.query;

  if (!token) return res.status(401).json({ error: "Token manquant" });

  const dateDebut = debut || getMonday();
  const dateFin = fin || getFriday();

  try {
    const data = await edFetch(
      `${ED_BASE}/E/${eleveId}/emploidutemps.awp?verbe=get&dateDebut=${dateDebut}&dateFin=${dateFin}&v=4`,
      token
    );

    if (data.code !== 200) {
      return res.status(400).json({ error: data.message, code: data.code });
    }

    const cours = (data.data || []).map((c) => ({
      id: c.id,
      date: c.date,
      heureDebut: c.start_datetime,
      heureFin: c.end_datetime,
      matiere: c.matiere,
      professeur: c.prof,
      salle: c.salle,
      annule: c.isAnnule || false,
      modifie: c.isModifie || false,
      couleur: c.color || null,
      contenuDeSeance: c.contenuDeSeance || null,
    }));

    res.json({ cours });
  } catch (err) {
    console.error("[EMPLOI]", err);
    res.status(500).json({ error: "Erreur emploi du temps" });
  }
});

// ─── CAHIER DE TEXTES (DEVOIRS) ───────────────────────────────────────────────

/**
 * GET /api/devoirs/:eleveId?token=xxx&debut=2026-03-02&fin=2026-03-13
 */
app.get("/api/devoirs/:eleveId", async (req, res) => {
  const { eleveId } = req.params;
  const { token, debut, fin } = req.query;

  if (!token) return res.status(401).json({ error: "Token manquant" });

  const dateDebut = debut || getMonday();
  const dateFin = fin || getNextMonday(14);

  try {
    const data = await edFetch(
      `${ED_BASE}/Eleves/${eleveId}/cahierdetexte.awp?verbe=get&dateDebut=${dateDebut}&dateFin=${dateFin}&v=4`,
      token
    );

    if (data.code !== 200) {
      return res.status(400).json({ error: data.message, code: data.code });
    }

    const devoirs = [];
    const raw = data.data || {};

    Object.entries(raw).forEach(([date, matieres]) => {
      if (typeof matieres !== "object") return;
      Object.values(matieres).forEach((m) => {
        if (!m.aFaire) return;
        devoirs.push({
          id: m.id,
          date,
          matiere: m.matiere?.libelle || "?",
          codeMatiere: m.matiere?.code || "",
          contenu: stripHtml(m.aFaire?.contenu || ""),
          fait: m.aFaire?.fait || false,
          documents: m.aFaire?.documents || [],
        });
      });
    });

    // Trier par date
    devoirs.sort((a, b) => a.date.localeCompare(b.date));

    res.json({ devoirs });
  } catch (err) {
    console.error("[DEVOIRS]", err);
    res.status(500).json({ error: "Erreur cahier de textes" });
  }
});

// ─── MESSAGES ─────────────────────────────────────────────────────────────────

/**
 * GET /api/messages/:eleveId?token=xxx
 */
app.get("/api/messages/:eleveId", async (req, res) => {
  const { eleveId } = req.params;
  const { token } = req.query;

  if (!token) return res.status(401).json({ error: "Token manquant" });

  try {
    const data = await edFetch(
      `${ED_BASE}/eleves/${eleveId}/messages.awp?verbe=get&typeRecuperation=received&v=4`,
      token
    );

    if (data.code !== 200) {
      return res.status(400).json({ error: data.message, code: data.code });
    }

    const messages = (data.data?.messages?.received || []).map((m) => ({
      id: m.id,
      de: m.from?.name || "Inconnu",
      sujet: m.subject,
      date: m.date,
      lu: m.read,
      brouillon: m.draft || false,
    }));

    res.json({ messages });
  } catch (err) {
    console.error("[MESSAGES]", err);
    res.status(500).json({ error: "Erreur messagerie" });
  }
});

// ─── ABSENCES ─────────────────────────────────────────────────────────────────

/**
 * GET /api/absences/:eleveId?token=xxx
 */
app.get("/api/absences/:eleveId", async (req, res) => {
  const { eleveId } = req.params;
  const { token } = req.query;

  if (!token) return res.status(401).json({ error: "Token manquant" });

  try {
    const data = await edFetch(
      `${ED_BASE}/eleves/${eleveId}/viescolaire.awp?verbe=get&v=4`,
      token
    );

    if (data.code !== 200) {
      return res.status(400).json({ error: data.message, code: data.code });
    }

    const absences = (data.data?.absencesRetards || []).map((a) => ({
      id: a.id,
      date: a.date,
      heureDebut: a.heureDebut,
      heureFin: a.heureFin,
      type: a.typeElement, // Absence, Retard, etc.
      justifie: a.justifie,
      justification: a.justification || null,
      matiere: a.matiere || null,
      commentaire: a.commentaire || null,
    }));

    res.json({ absences });
  } catch (err) {
    console.error("[ABSENCES]", err);
    res.status(500).json({ error: "Erreur absences" });
  }
});

// ─── UTILITAIRES ──────────────────────────────────────────────────────────────

function getMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

function getFriday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) + 4;
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

function getNextMonday(days = 7) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

// ─── LANCEMENT ────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n✅  ÉcoleDirecte+ proxy démarré !`);
  console.log(`📡  http://localhost:${PORT}\n`);
});
