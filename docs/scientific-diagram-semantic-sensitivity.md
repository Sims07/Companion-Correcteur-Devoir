# Protocole de sensibilité sémantique des schémas scientifiques

## Pourquoi cette suite distincte de D/E ?

D/E teste les **traits de rappel de légende** dans une mitose. Cela ne mesure pas les **flèches de processus**, les **connexions biologiques** ou l'**appartenance d'une structure à un compartiment**.

La suite S0–S5, accessible dans **Outils IA → Évaluation des modèles → Schémas scientifiques → Tester la compréhension sémantique**, est un laboratoire **facultatif**. Elle ne change ni le barème enseignant, ni la correction réelle.

## Protocole contrôlé

Tous les dessins contiennent exactement les mêmes mots (ADN, ARN, Protéine, Cellule, Noyau) et utilisent un barème commun de **3 attendus indépendants** :

- la flèche orientée ADN vers ARN ;
- la flèche orientée ARN vers Protéine ;
- le noyau dessiné **à l'intérieur** du contour cellulaire.

| Dessin | Mutation | Référence provisoire |
| --- | --- | --- |
| S0 | Témoin, toutes les relations correctes | 3/3 |
| S1 | Inversion de la première flèche | 2/3 |
| S2 | ADN relié à Protéine, plutôt qu'à ARN | 2/3 |
| S3 | Noyau (et ADN) hors du contour cellulaire | 2/3 |
| S4 | Disposition verticale, relations conservées | 3/3 |
| S5 | Première flèche sans pointe discernable | Note de référence **non définie** ; enseignant requis |

Les six SVG sont générés dans le navigateur, convertis **en PNG localement**, puis soumis au pipeline d'évaluation habituel. **Aucune réponse de référence, aucun identifiant de variante ni score ne sont transmis au modèle**. Les attendus du barème restent transmis comme dans une correction normale, ce n'est donc **pas** encore une lecture à l'aveugle.

La série fonctionne avec les profils et méthodes déjà proposés dans ce laboratoire, y compris Think si le modèle Ollama local le supporte. Un passage est proposé par défaut ; les répétitions 3/5 sont destinées à mesurer la stabilité. Des modèles distants ne sont utilisés que si l'utilisateur les sélectionne explicitement.

## Interpréter les métriques

- **Mutations détectées** : pour S1/S2/S3, la relation doit être reconnue présente dans S0 **et** absente dans la variante fautive, au même numéro de répétition et pour le même modèle/méthode.
- **Non mesurables** : témoin absent, réponse indécidable, variante/répétition manquante ; on n'assimile pas cela à un échec scientifique.
- **Faux positifs témoins** : une relation correcte de S0 ou S4 est jugée absente ou partielle.
- **Disposition préservée** : chaque attendu doit être reconnu présent sur S0 et S4.
- **Abstentions** : décision indécidable ou absente ; S5 sert à tester explicitement l'incertitude, pas à imposer une note.

La note seule ne démontre pas que le sens d'une flèche a été vu. **Aucun test automatisé ne prétend valider la qualité d'un vrai modèle** : les tests navigateur simulent le fournisseur IA. Les images, clés, URLs d'API, prompts et sorties brutes ne figurent pas dans le JSON exporté.

## Prochaines expériences (hors de cette PR)

1. Comparaison directe / questions visuelles ciblées, à images et profils identiques.
2. Extraction **sans barème** d'un graphe de relations (départs, pointes, inclusions, nombres), comparaison ensuite avec le corrigé validé par l'enseignant.
3. Agrandissement conditionnel du détail **complet** (départ, trajet et pointe), uniquement quand une relation est ambiguë.

La suite S0–S5 fournit un point de référence commun pour mesurer les gains réels de ces méthodes. Les références restent à valider avec un enseignant de biologie, notamment le cas S5.
