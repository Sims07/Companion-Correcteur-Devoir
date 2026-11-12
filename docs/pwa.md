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
