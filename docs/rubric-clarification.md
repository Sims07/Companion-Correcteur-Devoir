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


## Enrichissements successifs et restitution dans l'éditeur

Chaque nouvel audit part du **barème courant**. Une application conserve les descriptions et
références scientifiques déjà approuvées, puis ajoute uniquement les nouvelles décisions
validées. Le bilan cumulé compare le barème actif avec le barème précédant la plus ancienne
application encore conservée dans l'historique local (maximum 20 applications).

Chaque critère enrichi indique les précisions IA toujours présentes, leurs sous-critères,
le modèle Ollama, la date et la position de l'application dans l'historique conservé.
Les références scientifiques présentes sans correspondance historique apparaissent avec
« provenance non enregistrée » : l'interface n'affirme pas qu'elles proviennent de l'enseignant.
Les anciennes versions restent consultables même après un retrait ciblé.

L'enseignant peut retirer **un seul ajout approuvé** depuis le critère, après confirmation.
Le barème courant est mis à jour pour les prochaines corrections, sans modifier les points
ni les snapshots historiques ; les anciennes corrections ne sont pas rétroactivement modifiées.

L'application refuse un ajout strictement dupliqué (espaces/casse normalisés), une réponse
différente à une question de clarification déjà décidée et quelques oppositions scientifiques
explicites (présent/absent, obligatoire/facultatif, doit/ne doit pas). Ce contrôle déterministe
ne prétend pas détecter **toutes** les contradictions biologiques : la validation du professeur
reste nécessaire. En cas de blocage, l'application explique pourquoi et empêche l'application
tant que le point n'est pas adapté ou que l'ancien ajout n'a pas été retiré.

Une édition manuelle du barème invalide l'étiquette « version IA active » mais ne supprime
pas les ajouts encore présents. Le bilan cumulé mentionne explicitement qu'il peut aussi
inclure les modifications manuelles.

## Limites de génération avec Thinking

Lorsque Thinking est désactivé, la vérification locale garde son plafond historique de **3 584 tokens de génération** et ne force pas la fenêtre de contexte du modèle. Lorsque Thinking est activé, elle demande explicitement à Ollama **16 384 tokens de génération** et **24 576 tokens de contexte** : le raisonnement du modèle utilise une partie de ces tokens avant la réponse JSON. Le plafond n'est pas une cible de longueur : le modèle s'arrête normalement dès qu'il a terminé.

Le budget correspondant à la préférence actuelle est affiché avant la vérification et le budget de la requête en cours reste visible pendant l'analyse. En cas de réponse interrompue par `done_reason: "length"`, l'interface donne le plafond utilisé et les tokens réellement générés lorsqu'ils sont fournis par Ollama. Elle ne transforme jamais une réponse incomplète en barème appliqué : le barème et les décisions précédentes restent conservés. Un contexte plus grand demande davantage de mémoire locale ; l'enseignant peut désactiver Thinking si le modèle est trop lent ou si les ressources locales sont insuffisantes.

## Génération progressive et suivi réel (audit Ollama)

La requête d'audit envoie désormais `stream: true` avec les mêmes paramètres
`think`, `format: "json"`, `num_predict` et `num_ctx`. Ollama fournit des
événements NDJSON : les fragments `message.thinking` sont uniquement comptés
(nombre de caractères reçus), et les fragments `message.content` sont
assemblés pour reconstituer **la réponse JSON complète**. Le raisonnement
interne n'est ni affiché ni ajouté au barème.

Le panneau annonce les étapes effectivement observées (attente, raisonnement,
rédaction JSON, validation), le nombre d'événements et les caractères reçus.
Le nombre exact de tokens apparaît uniquement lorsque le serveur fournit
`eval_count` dans l'événement final : aucun calcul approximatif n'est présenté
comme une valeur Ollama. Si aucun événement n'arrive pendant une longue période,
l'interface le signale sans affirmer que le modèle est bloqué.

Une réponse sans événement final `done: true`, un `done_reason: "length"`,
un JSON invalide ou une annulation ne peuvent pas être validés comme audit
terminé. Les enrichissements précédemment appliqués sont préservés. Le suivi
réseau limite les rafraîchissements et la taille de son aperçu pour éviter une
surcharge de l'interface sur les longues générations.
