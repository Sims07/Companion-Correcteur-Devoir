#!/bin/bash
# Double-clic macOS : demarre le lanceur LM Studio HTTPS existant sans mise en veille.
# La protection cesse automatiquement lorsque le lanceur se termine (Ctrl+C).
set -euo pipefail

DOSSIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
LANCEUR="${COMPAGNON_LMSTUDIO_LANCEUR:-$DOSSIER/Demarrer-Companion-LMStudio-HTTPS.command}"

if [ ! -f "$LANCEUR" ]; then
  printf 'Erreur : lanceur LM Studio HTTPS introuvable : %s\n' "$LANCEUR" >&2
  printf 'Place ce fichier .command dans le meme dossier que Demarrer-Companion-LMStudio-HTTPS.command.\n' >&2
  exit 1
fi

if [ "$(uname -s)" = "Darwin" ]; then
  if ! command -v caffeinate >/dev/null 2>&1; then
    printf 'Erreur : caffeinate est introuvable sur ce Mac.\n' >&2
    exit 1
  fi
  printf 'Mac maintenu eveille pendant le fonctionnement du proxy HTTPS (ecran libre de s\047eteindre).\n'
  printf 'Fermer le proxy avec Ctrl+C pour autoriser de nouveau la veille.\n\n'
  # Le lanceur HTTPS reste au premier plan : caffeinate ne vit pas plus longtemps que lui.
  exec caffeinate -i -s /bin/bash "$LANCEUR" "$@"
fi

# Fallback uniquement pour les tests et les environnements non macOS.
exec /bin/bash "$LANCEUR" "$@"
