# ÉcoleDirecte+ 🎓

Interface moderne pour EcoleDirecte avec proxy local Node.js.

## 🚀 Installation

### 1. Prérequis
- [Node.js](https://nodejs.org) v18+ installé

### 2. Installer les dépendances

```bash
cd ecoledirecte-plus
npm install
```

### 3. Lancer le serveur

```bash
node server.js
```

ou en mode développement (rechargement automatique) :

```bash
npm run dev
```

### 4. Ouvrir l'interface

Rendez-vous sur → **http://localhost:3000**

Connectez-vous avec vos identifiants EcoleDirecte habituels.

---

## 📡 Routes API disponibles

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/login` | Authentification |
| GET | `/api/notes/:id` | Notes & moyennes |
| GET | `/api/emploi/:id` | Emploi du temps (semaine) |
| GET | `/api/devoirs/:id` | Cahier de textes |
| GET | `/api/messages/:id` | Messagerie reçue |
| GET | `/api/absences/:id` | Absences & retards |

---

## 🔒 Sécurité

- Vos identifiants transitent **uniquement** vers `api.ecoledirecte.com` via votre machine locale.
- Rien n'est stocké, aucune donnée n'est envoyée à des tiers.
- Le token de session est gardé en mémoire (disparaît à la fermeture du navigateur).

---

## 🛠️ Stack

- **Backend** : Node.js + Express
- **Proxy** : node-fetch vers `api.ecoledirecte.com/v3`
- **Frontend** : HTML/CSS/JS vanilla (aucun framework)
