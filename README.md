# Écho Party 🎙️

Un équivalent gratuit et open-source de [Mimic Party](https://store.steampowered.com/app/5053820/Mimic_Party/),
jouable directement dans le navigateur via GitHub Pages.

Le principe : un joueur écoute un son au casque, puis le mime devant les autres sans dire un mot.
Les autres joueurs devinent à voix haute. Chacun son tour, et le jeu tient le score.

**La particularité de ce dépôt : le dossier [`son/`](./son) est lu automatiquement.** Ajoute
n'importe quel fichier audio dedans, republie le site, et il devient jouable — aucune ligne de
code à modifier.

## Mettre le jeu en ligne (GitHub Pages)

1. Crée un nouveau dépôt GitHub et mets-y tout le contenu de ce dossier (`index.html`,
   `style.css`, `script.js`, `son/`, ce `README.md`).
2. Dans les réglages du dépôt, va dans **Settings → Pages**, choisis la branche `main` et le
   dossier `/ (root)`, puis enregistre.
3. Après une minute environ, ton jeu est disponible à l'adresse
   `https://TON-PSEUDO.github.io/NOM-DU-DEPOT/`.
4. Pour ajouter des sons : dépose des fichiers `.mp3`/`.wav`/`.ogg`/`.m4a` dans le dossier `son/`
   (via l'interface GitHub « Add file » ou en les poussant avec `git`), attends que la page se
   republie, et ils apparaîtront automatiquement dans le jeu.

> Le jeu interroge l'API publique de GitHub (`api.github.com`) pour lister le contenu du dossier
> `son/` au chargement de la page. Ça fonctionne uniquement une fois le dépôt public et hébergé
> sur GitHub Pages (ou depuis n'importe quelle page qui connaît son propre `owner/repo`).

## Tester en local avant de publier

Si tu ouvres `index.html` directement depuis ton ordinateur (sans passer par GitHub Pages),
l'API GitHub n'a pas de dépôt à interroger. Le jeu affichera alors un écran « Aucun son trouvé »
avec un bouton **Choisir un dossier de sons**, qui te permet de sélectionner un dossier local
pour tester la partie sans rien publier.

## Mode en ligne (jouer avec un code de partie)

Depuis l'écran « Comment voulez-vous jouer ? », un deuxième mode est disponible : **En ligne
avec un code**. Chaque joueur ouvre le site sur son propre téléphone (même dans la même pièce),
un joueur crée la partie et reçoit un code à 4 lettres, les autres le rejoignent avec ce code.
L'avantage : c'est le téléphone du mime qui joue le son en privé — plus besoin de se passer
l'appareil ni de partager un casque.

Comme GitHub Pages ne peut pas faire tourner de serveur, ce mode s'appuie sur **Firebase
Realtime Database** (gratuit, sans carte bancaire) pour synchroniser les parties en temps réel.
Il faut relier ton propre projet Firebase une seule fois :

1. Va sur [console.firebase.google.com](https://console.firebase.google.com) et crée un projet
   (gratuit, quelques clics, aucune carte bancaire demandée).
2. Dans le projet, ouvre **Build → Realtime Database**, clique sur **Créer une base de
   données**, choisis un emplacement, puis démarre **en mode test** (règles ouvertes).
3. Dans les réglages du projet (icône ⚙️ → **Paramètres du projet**), descends jusqu'à
   **Vos applications**, clique sur l'icône `</>` (Web) pour enregistrer une application, donne-lui
   un nom, puis copie l'objet `firebaseConfig` affiché.
4. Colle ces valeurs dans le fichier [`firebase-config.js`](./firebase-config.js) de ce dépôt, à
   la place des `"REMPLACE_MOI"`.
5. Republie le dépôt (`git add`, `commit`, `push`) : le bouton « En ligne avec un code » fonctionne
   désormais.
6. Dans **Realtime Database → Règles**, tu peux ensuite remplacer les règles de test (qui
   expirent après 30 jours) par celles-ci, qui restent ouvertes indéfiniment — suffisant pour un
   jeu entre amis, le code de partie servant de mot de passe informel :
   ```json
   {
     "rules": {
       "rooms": {
         "$code": {
           ".read": true,
           ".write": true
         }
       }
     }
   }
   ```

### Comment se déroule une manche en ligne

- L'hôte crée la partie (choisit son prénom + la durée du mime) et obtient un code à partager.
- Les autres rejoignent avec le code + leur prénom ; l'hôte lance la partie une fois tout le
  monde arrivé (2 joueurs minimum).
- À chaque manche, l'appareil du joueur désigné comme mime affiche le bouton d'écoute — lui seul
  entend le son. Les autres appareils affichent « en attente ».
- Une fois prêt, le mime lance le minuteur : tous les appareils affichent le compte à rebours ;
  les devineurs tapent « J'ai deviné ! » quand ils trouvent, le mime peut terminer le tour en
  avance.
- À la révélation, tout le monde voit le nom du son et qui a deviné juste. L'hôte lance la manche
  suivante ; les points sont calculés automatiquement (1 point par bon devineur, +1 pour le mime
  si au moins une personne a trouvé).
- À la fin des sons disponibles, le classement final s'affiche pour tout le monde.

## Règles du jeu telles qu'implémentées

- 2 joueurs minimum, nombre illimité.
- À chaque manche, un joueur différent écoute un son au casque (bouton « rejouer » disponible)
  puis le mime pendant une durée réglable (30 à 90 secondes).
- Les autres joueurs devinent à voix haute ; à la fin de la manche, on coche qui a deviné juste.
- Un point pour chaque joueur qui devine juste, un point bonus pour le mime si au moins une
  personne a trouvé.
- La partie se termine quand tous les sons du dossier ont été joués ; un classement final
  s'affiche.

## Structure du dépôt

```
index.html          → structure des écrans du jeu (local + en ligne)
style.css           → identité visuelle
script.js           → chargement des sons + logique du mode "un seul appareil"
online.js           → logique du mode "en ligne avec un code" (Firebase)
firebase-config.js  → tes clés Firebase (à remplir, voir "Mode en ligne")
son/                → dépose ici tes fichiers audio
```

## Personnaliser

- **Durée par défaut** : modifie les options du menu déroulant dans `index.html`
  (`#durationSelect`).
- **Formats acceptés** : modifie la constante `AUDIO_EXT` en haut de `script.js`.
- **Barème de points** : modifie la fonction `applyPoints()` dans `script.js`.
