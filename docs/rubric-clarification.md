# Vérifier et enrichir le barème

Lors de la préparation d'un devoir, l'enseignant peut lancer **une seule passe Ollama locale** qui propose deux types de décisions : des **clarifications de notation** et des **références scientifiques** utiles pour interpréter les critères biologiques. Le modèle reçoit uniquement le barème ; aucune copie d'étudiant n'est transmise.

## Parcours enseignant

1. Renseigner le barème et lancer « Vérifier avec l'IA locale ».
2. Lire les propositions, regroupées en questions de clarification ou enrichissements scientifiques, triées par impact. Le texte initial du professeur reste visible.
3. Pour les clarifications, choisir une réponse ou formuler une règle libre. Pour la science, accepter la **référence proposée**, l'adapter dans un champ éditable ou conserver le barème initial. Aucun choix n'est présélectionné ni automatiquement appliqué.
4. Consulter **l'aperçu des changements avant application** : comparatif des descriptions et des références scientifiques retenues.
5. Cliquer sur « Appliquer les modifications validées » ; la version initiale et la nouvelle sont archivées et la synthèse des différences est affichée immédiatement.

Les propositions non traitées ou refusées ne sont **jamais** ajoutées. Les réponses restent enregistrées localement, associées à la signature du barème. Une modification manuelle rend l'audit précédent obsolète.

## Distinction des informations

- **Texte du professeur** : description inchangée pour les enrichissements scientifiques.
- **Clarification approuvée** : ajout explicite à la description du critère ou sous-critère, comme auparavant.
- **Référence scientifique approuvée** : contenu dans `scientificExpectations` du critère ou sous-critère. Cela ne crée ni nouveau critère, ni nouveau malus, ni changement de points.

Les références scientifiques validées sont incluses dans le JSON du barème transmis au modèle lors de la correction, sans requête supplémentaire par légende. Les anciennes copies corrigées conservent leur barème historique et peuvent être recorrigées séparément.

## Feedback et confidentialité

L'audit est **facultatif** et strictement local (endpoint loopback Ollama) ; pas de cloud ni de copie. Pendant l'analyse, le bouton est désactivé, la phase réellement connue est affichée, un compteur de temps est visible et un bouton « Arrêter » permet l'annulation. On peut quitter le panneau pour consulter le diagnostic puis revenir sans perdre le résultat. En cas d'erreur, les décisions précédentes sont conservées. Les références sont conservées uniquement après validation du professeur.

## Historique

La version active affiche les modifications en langage naturel, sans imposer de lecture de JSON. L'historique fournit les comparatifs avant/après et conserve le modèle ayant proposé les enrichissements. Les critères, identifiants et points restent stables.
