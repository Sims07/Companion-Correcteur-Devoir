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
