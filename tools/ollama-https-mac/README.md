# Ollama local en HTTPS pour Safari (macOS)

Lanceur **autonome** (un seul fichier `.command`) pour connecter la PWA de correction à un Ollama installé sur le Mac, même lorsque la PWA est ouverte en HTTPS sur Safari. Fonctionne sans tunnel ni service distant : les images, copies et prompts restent entre la PWA et **Ollama local** (à condition de choisir un modèle local).

## Installation (Mac)

1. Installer **Ollama**, **Python 3** et **OpenSSL** s'ils ne sont pas déjà présents.
2. Télécharger `Demarrer-Compagnon-Ollama-HTTPS.command` depuis ce dossier (le bouton « Download raw file » de GitHub) et le rendre exécutable une fois avec `chmod +x ~/Downloads/Demarrer-Compagnon-Ollama-HTTPS.command` (ou utiliser un ZIP préservant son bit exécutable). Selon les protections macOS, faire clic droit → **Ouvrir** lors du premier lancement.
3. Double-cliquer dessus. Le certificat racine et le certificat HTTPS sont générés **localement**. Accepter l'import du certificat dans le trousseau de session si demandé.
4. Sur **le même Mac**, ouvrir l'URL `https://localhost:11435/` dans Safari, puis utiliser **`https://localhost:11435`** comme URL Ollama dans les réglages de la PWA (sans `/api`).
5. Garder le Terminal ouvert ; `Ctrl+C` arrête le proxy sans arrêter un Ollama déjà actif.

## Utiliser un iPhone / iPad sur le même réseau privé

Le Terminal indique une adresse HTTPS sur le réseau local (par exemple `https://192.168.1.25:11435` : cette IP est **fictive**). Transférer **uniquement** `~/Library/Application Support/Compagnon-Ollama-HTTPS/Compagnon-Ollama-CA.cer` via AirDrop, puis installer le profil iOS dans Réglages → Général → VPN et gestion de l’appareil, et activer la confiance dans Réglages → Général → Informations → Réglages des certificats de confiance. Utiliser dans la PWA l'URL réseau affichée, **pas** `localhost` sur l'iPhone. Ne jamais transférer les fichiers `*.key`.

**Attention :** le serveur écoute par défaut sur le réseau du Mac (`0.0.0.0:11435`) pour permettre l'accès iPhone. L'origine CORS est filtrée pour les navigateurs, mais **CORS n'est pas un mécanisme d'authentification** : les appareils ayant accès au port peuvent appeler le proxy sans navigateur. N'utiliser que sur un réseau de confiance, refuser toute redirection Internet de ce port et restreindre au besoin l'accès dans le pare-feu macOS. Ne pas utiliser sur un réseau public.

## Configuration et confidentialité

| Variable d'environnement | Effet | Défaut |
| --- | --- | --- |
| `COMPAGNON_HTTPS_PORT` | Port HTTPS du proxy | `11435` |
| `COMPAGNON_OLLAMA_PORT` | Port local d'Ollama (sur `127.0.0.1`) | `11434` |
| `COMPAGNON_ORIGINES_SUPPLEMENTAIRES` | Origines HTTPS additionnelles séparées par des virgules (sans slash final) | Vide |
| `COMPAGNON_HTTPS_HOME` | Dossier de stockage local des certificats et du script Python généré | `~/Library/Application Support/Compagnon-Ollama-HTTPS` |
| `COMPAGNON_NE_PAS_OUVRIR_SAFARI` | Ne pas ouvrir Safari automatiquement si définie | Non défini |

Origines autorisées par défaut : `https://sims07.github.io` (domaine **public** de la PWA), ainsi que localhost sur le port `5173` pour le développement. Ce domaine de projet n'est pas un renseignement personnel ni un secret. Toute autre origine doit être autorisée explicitement.

Les certificats **et leurs clés privées** sont créés au premier démarrage dans le dossier de l'utilisateur (permissions restreintes) et ne figurent **jamais** dans Git. Aucun nom de machine, adresse personnelle, identifiant, token, copie ou donnée d'étudiant n'est livré dans ce dossier.

Le proxy transmet les routes `/api/*` et `/v1/*`, notamment les flux de réponses Ollama. Il ne journalise pas le contenu des copies. Le certificat racine est réutilisé, et le certificat serveur est renouvelé pour intégrer les adresses IP privées du Mac.

## Tests

Sur une machine avec Python 3 et OpenSSL :

```bash
python3 -m unittest discover -s tools/ollama-https-mac -p 'test_*.py' -v
```

Les tests utilisent un faux Ollama et un certificat temporaire : ils vérifient CORS, HTTPS, API native et OpenAI, flux, erreurs et absence de clé privée dans le code distribué.
