# Installation PWA

Sur Chrome ou Edge, ouvrir l'application en HTTPS puis utiliser **Installer l'application** dans le navigateur.
Sur iPhone/iPad, utiliser Safari → Partager → **Sur l'écran d'accueil**.
L'installation ne remplace pas Ollama : l'analyse IA nécessite toujours un serveur accessible.

La construction de production (`npm run build`) génère `dist/sw.js` avec
la liste exacte des ressources compilées. Le cache est limité à l'interface :
les copies, les données IndexedDB et les appels IA ne sont jamais ajoutés au
cache du service worker. La consultation de l'interface hors ligne fonctionne
après une première visite en ligne réussie ; les fonctions nécessitant Ollama
restent indisponibles si son serveur n'est pas joignable.

La portée du service worker, le manifeste et les icônes suivent automatiquement
le chemin de déploiement de GitHub Pages (`/Companion-Correcteur-Devoir/`).
Chaque nouvelle compilation renouvelle la version du cache.

## Transférer le stockage de localhost vers la PWA

Les origines localhost et GitHub Pages ne partagent ni localStorage ni IndexedDB.
Dans **Évaluer les modèles → Suivi & diagnostic → Occupation du stockage local → Sauvegarde et transfert** :

1. Depuis la version locale lancée avec npm run dev, cliquez **Télécharger ma sauvegarde**.
2. Dans la PWA publiée, ouvrez le même écran, sélectionnez le JSON puis **Restaurer la sauvegarde**.
3. Rechargez l’application pour afficher les devoirs, les évaluations et les réglages restaurés.

La sauvegarde inclut tous les sept magasins IndexedDB (copies, corrections, mémoire,
évaluations, campagnes, transcriptions et traces) et les clés localStorage
préfixées par companion- ou companion:. Le fichier contient aussi les images
archivées et peut comporter des informations sensibles : conservez-le localement,
comme les copies d’origine. Aucune requête au serveur n’est effectuée pour
sauvegarder ou restaurer.

**Mode par défaut : fusion.** Les enregistrements IndexedDB déjà présents sont
conservés, les devoirs/profils et historiques Biologie portant de nouveaux
identifiants sont ajoutés aux listes existantes (même si la PWA a initialisé
le radar biologique à vide). Les autres réglages déjà présents ne changent pas. Pour
retrouver la configuration de l’ancienne application dans une PWA neuve,
cochez « Mettre à jour les éléments de même identifiant » : cela met à jour les
clés et les enregistrements correspondants sans supprimer les données absentes
du fichier. Une confirmation explicite est demandée.

Conservez le fichier et les données de localhost tant que la restauration n’est
pas contrôlée (devoirs, historiques et réglages). Le fichier est un instantané
à la date d’export : il ne synchronise pas automatiquement les deux origines.

### Radar Biologie vide après un import antérieur

Avant cette correction, le mode fusion ignorait `companion:biology-teacher-radar:v1`
si la PWA avait déjà créé cette clé avec `[]`. Les résultats sont bien contenus
dans l'ancien fichier s'il affiche désormais **Radar Biologie : N observation(s)**,
avec N supérieur à zéro. **Réimportez ce même fichier en mode fusion** puis
rechargez l'application : aucune relance de batterie IA n'est nécessaire.

Si le fichier affiche **0 observation**, les résultats n'y figurent pas :
retournez sur le localhost d'origine (même navigateur et port), vérifiez le
radar, puis exportez une nouvelle sauvegarde. Ne supprimez pas les données
localhost tant que le radar n'a pas été restauré.

### Connexion de la PWA HTTPS à Ollama sur Mac

Depuis GitHub Pages, le site est en HTTPS tandis qu'Ollama local répond par
défaut sur `http://127.0.0.1:11434`. La configuration
`OLLAMA_ORIGINS=https://sims07.github.io` permet à Ollama d'accepter l'origine
du site, **mais ne peut pas contourner les restrictions du navigateur**.
Sur Safari, le contenu mixte HTTPS → HTTP localhost peut être bloqué
avant toute requête visible dans Réseau. Chrome et Edge disposent d'autorisations
d'accès au réseau local : utiliser la PWA dans l'un d'eux et accepter
l'autorisation demandée si elle apparaît.

Le bouton **Tester la connexion et détecter les modèles** affiche maintenant
un état de progression et, en cas d'échec, un diagnostic directement sous le
bouton (y compris dans la fenêtre de configuration des évaluations).
Une réponse HTTP 403/404 est distinguée d'un échec réseau, et une requête
restée en attente expire après 15 secondes.

Ne pas publier le port 11434 sur Internet ni utiliser un proxy cloud pour
contourner ces protections : les copies doivent rester locales. Sur Safari,
une alternative est l'application locale démarrée via `npm run dev`, ou un
reverse-proxy HTTPS de confiance sur le Mac.


### Plusieurs PWA sur le même domaine GitHub Pages

Le manifeste donne à Compagnon un identifiant stable et **propre à son
répertoire** : `/Companion-Correcteur-Devoir/`. Ne jamais utiliser `id: "."`
sur GitHub Pages : Chrome résout ce champ depuis l'origine
`https://sims07.github.io/`, ce qui provoque un conflit d'identité avec
d'autres PWA installées sur le même domaine (par exemple Saveurs & Notes).

Le `start_url` et le `scope` restent relatifs au fichier manifeste et
limités à `/Companion-Correcteur-Devoir/`.

Pour une installation Chrome déjà affectée, conserver les données et les
sauvegardes existantes. Une fois le nouveau manifeste déployé, installer
**Compagnon Correcteur** comme application distincte depuis Chrome. Si
Saveurs & Notes continue à proposer l'ouverture des liens Compagnon, vérifier
son installation d'origine ; ne supprimer aucune donnée de site sans sauvegarde.
