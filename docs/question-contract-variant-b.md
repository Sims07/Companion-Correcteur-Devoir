# Variante B : question, réponse et contrat pédagogique

La variante B conserve les modèles et les points du barème. Elle modifie le contexte de jugement : réponse rattachée à une question, consigne précise, relation attendue, formulations acceptées et contradictions. Aucun exemple de biologie n’est inscrit dans les prompts génériques. Ce prototype n’est ni un modèle entraîné, ni une preuve d’amélioration pédagogique.

## Préparation

Dans Barème, ouvrir un critère textuel et cocher « Variante B — question et contrat de correction ». Choisir une question précise ou toute la copie pour un critère transversal. Les questions utilisent des identifiants uniques au devoir (1, 2a, 1.2). Réutiliser le même numéro et la même consigne pour les critères d’une même question. Les critères sans contrat gardent le fonctionnement habituel.

Décrire une relation complète, pas une liste de mots-clés. Les équivalences sont des alternatives acceptables, pas des exigences supplémentaires. Les contradictions ne créent pas de malus. Le contrat fournit le contexte pédagogique aux unités déjà pondérées : sous-critères, ou critère entier. Les règles ET/OU décrites restent interprétées par le modèle ; cette première version ne contient pas de compilateur logique ni de nouveaux paliers de crédit partiel.

Les contrats sont sauvegardés avec le devoir et conservés lors des imports/exports JSON, y compris les exports partiels de critères. Une modification change la signature d’évaluation. Désactiver le contrat le retire : exporter la variante B avant de préparer une référence A.

## Rattachement vérifiable

Le format vérifiable de transcription est :

```text
Question 1
Énoncé imprimé éventuel
Réponse :
Texte étudiant, y compris sa continuation sur les pages suivantes.
Question 2
Énoncé imprimé éventuel
Réponse :
Autre réponse étudiante.
```

Les titres doivent être isolés sur leur ligne ; Q1 est également accepté. Les repères de page et le texte sont conservés à l’intérieur de la réponse. Une question peut couvrir plusieurs pages ; ne pas répéter son titre pour une simple continuation. Les numéros ambigus, répétés, absents, les réponses vides ou les séparations énoncé/réponse absentes bloquent l’analyse avant tout appel de notation. Aucune absence n’est convertie en zéro. Une vraie absence doit être confirmée par le professeur, pas inventée dans la transcription.

En lecture d’image, le modèle reçoit une consigne supplémentaire de conservation des numéros et de séparation de l’énoncé. Cette extraction n’est pas garantie : l’aperçu « Réponses utilisées par la variante B » permet de contrôler le texte. Pour le pilote, utiliser Outils IA → Évaluation des modèles → transcription de référence, qui est éditable. Corriger les repères d’après les originaux, puis relancer l’analyse seule. Les photos, rotations et modèles restent ceux de la configuration choisie.

## Exécution

- Génératif : un appel par critère, avec uniquement sa réponse et sa consigne si le critère est rattaché. Le contrat est présent dans le prompt. Le mode incrémental est imposé pour éviter un retour à une correction globale qui perdrait le rattachement, même dans l’évaluateur.
- Décisionnel : les critères d’une même question/consigne partagent un appel System One ; groupes strictement séquentiels, ordre final du barème conservé. La recherche des preuves utilise la même réponse isolée que le modèle.
- Transversal : transcription entière, comme auparavant ; son contrat, s’il existe, est conservé.
- Les stratégies internes de double avis/arbitrage et la décision directe sur image sont refusées avec un contrat ; l’évaluation indépendante de plusieurs configurations reste possible.
- Les contrats sont réservés aux critères textuels. Les schémas restent sur leur parcours visuel.

Les traces montrent le contexte réellement envoyé. Les versions de prompts distinguent ce changement. Les tests logiciels vérifient les limites de contexte et le transport, pas la justesse d’un LLM.

## Comparaison A/B

1. Constituer un petit jeu de réponses textuelles corrigées par le professeur, avec plusieurs questions par copie, inversions, omissions, paraphrases et continuations de page. Réserver d’autres copies au test final.
2. Préparer et vérifier une transcription unique par copie ; la réutiliser strictement à l’identique pour A et B. Exporter le barème B. Pour A, utiliser le même barème et les mêmes points sans contrats.
3. Conserver le modèle, ses réglages, le matériel et le mode incrémental. Pour le décisionnel, noter que le regroupement par question peut changer le nombre d’appels : mesurer le coût total.
4. Comparer par attendu : décisions correctes, faux positifs, faux négatifs, vérifications, erreurs de rattachement, latence et temps enseignant. Compter les blocages, ne pas les exclure du bilan.
5. Inclure le temps de préparation des contrats dans le coût du lot. Conserver B seulement si le gain net et la qualité sont meilleurs ; aucune supériorité n’est présumée.

Le regroupement de réponses entre étudiants (variante C) et le modèle spécialisé d’inférence ne font pas partie de cette expérience.

## Préremplir depuis la feuille d’examen

Dans Barème → « Préparer les contrats depuis la feuille d’examen », importer le sujet (PDF, photos, TXT ou Markdown) puis, si disponible, la correction type. Un seul document contenant les deux convient. Le document déjà transcrit lors de l’import du barème ou de la lecture du sujet peut être réutilisé sans nouvel appel de vision. Les textes préparés sont conservés localement par devoir.

Le barème doit déjà contenir les critères et points du professeur : le préparer avec l’import existant si nécessaire. Le bouton « Préparer les contrats » utilise le modèle génératif renseigné et la connexion IA actuelle ; il ne change pas les modèles de correction. Même avec un modèle décisionnel pour la notation, cette tâche de rédaction nécessite un modèle génératif. Les critères textuels sont préparés séquentiellement, avec arrêt possible. Les schémas ne sont pas traités par ce préremplissage.

L’aperçu distingue les extraits littéraux vérifiés, les propositions/reformulations à valider et les informations absentes. Un extrait annoncé par le modèle n’est marqué comme tel que si sa citation et sa valeur sont retrouvées dans la source déclarée. Ce contrôle de présence ne garantit pas la pertinence scientifique de l’association : relire l’aperçu. Sans corrigé, aucune équivalence n’est exigée et le modèle est invité à laisser les champs non documentés vides. Une citation invalide est déclassée en proposition, jamais présentée comme un extrait validé.

Les propositions sont modifiables puis appliquées ensemble sur les critères sélectionnés. Les contrats préexistants ne sont pas présélectionnés. Les poids, sous-critères et autres propriétés du barème sont conservés ; une modification du barème pendant la préparation rend l’aperçu caduc. Une association ambiguë doit être précisée avant application. Le document est limité à un budget de contexte explicite : un texte trop long est refusé, jamais tronqué silencieusement. Les documents Word ne sont pas pris en charge dans ce panneau : exporter en PDF ou coller le texte.
