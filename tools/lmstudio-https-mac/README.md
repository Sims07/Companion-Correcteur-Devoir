# LM Studio + HTTPS : empêcher la veille du Mac mini

Le lanceur **`Demarrer-Companion-LMStudio-HTTPS-Sans-Veille.command`** démarre le fichier
`Demarrer-Companion-LMStudio-HTTPS.command` déjà installé sur le Mac. Il ne modifie
**ni Caddy, ni le Caddyfile, ni les certificats, ni les réglages LM Studio**.

## Installation

1. Conserver le lanceur HTTPS actuel dans son dossier `Companion-LMStudio-HTTPS`.
2. Télécharger `Demarrer-Companion-LMStudio-HTTPS-Sans-Veille.command` dans **ce même dossier**.
3. Dans Terminal, rendre le nouveau fichier exécutable avec `chmod +x` suivi du chemin du fichier
   (glisser-déposer le fichier dans Terminal pour éviter de retaper le chemin).
4. Désormais, **double-cliquer sur `Demarrer-Companion-LMStudio-HTTPS-Sans-Veille.command`**
   à la place de l'ancien. Laisser la fenêtre Terminal ouverte pendant les corrections.

Le nouveau lanceur exécute en pratique :

```bash
caffeinate -i -s /bin/bash "Demarrer-Companion-LMStudio-HTTPS.command"
```

- `-i` empêche la veille liée à l'inactivité.
- `-s` empêche la veille du système sur secteur (Mac mini).
- **L'écran peut s'éteindre normalement** : on n'utilise pas `-d`.
- `Ctrl+C` (ou la fin du lanceur) libère automatiquement la protection. Aucune
  tâche `caffeinate` permanente ni mot de passe administrateur.
- Si le lanceur HTTPS quitte immédiatement en laissant Caddy fonctionner en service
  d'arrière-plan, la protection cesse également : dans ce cas, il faut lancer
  Caddy au premier plan ou rattacher `caffeinate -w` à son PID.

Le serveur LM Studio doit toujours être démarré et le proxy HTTPS accessible sur le réseau
local. Aucune copie ni image n'est transmise par ce lanceur.

Pour un lanceur situé ailleurs, renseigner `COMPAGNON_LMSTUDIO_LANCEUR` avec son chemin
absolu avant d'exécuter ce fichier.

## Tests

```bash
python3 -m unittest discover -s tests/python -p 'test_mac_https_keep_awake.py' -v
```

Les tests simulent macOS et `caffeinate` sans toucher aux réglages d'énergie.
