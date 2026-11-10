# Tests des prompts scientifiques renforcés — 10 novembre 2026

Cette série vérifie les modifications de la PR #357 et leur complément : contexte sémantique sans rappel de la chaîne attendue, observation des deux extrémités avant déduction du sens, gestion explicite des dessins multiples et des preuves contradictoires. Les prompts directs passent en révision 3. Les images, références et barèmes des tests restent identiques.

## Préparer une seule configuration

Mettre l’application à jour puis ouvrir Évaluation des modèles → Schémas scientifiques. Sélectionner uniquement le profil Qwen 3.5 4B local, avec `qwen3.5:4b` comme modèle génératif d’analyse **et** modèle de lecture Vision : le graphe utilise le modèle Vision, tandis que la correction directe utilise le modèle d’analyse.

Choisir « Image → modèle génératif — sans OCR, Think OFF » dans « Méthode de correction scientifique à tester ». Éviter « Comparer toutes les méthodes compatibles » pour cette série. Régler « Passages par schéma » sur « 1 passage rapide » : le réglage est également utilisé par les six variantes et le graphe. Ce premier tri ne mesure pas la répétabilité.

## Trois lancements, trois exports

| Ordre | Section et action | Export à conserver |
| --- | --- | --- |
| 1 | « Tester la compréhension sémantique : 6 variantes contrôlées » ; sélectionner « Comparer standard / questions ciblées (mêmes images) », puis « Tester les 6 variantes sémantiques » | « Exporter les mesures JSON » → renommer `qwen4b-prompts-renforces-semantique.json` |
| 2 | « Observer un graphe de relations avant le barème (Ollama ou OpenAI-compatible) » ; cliquer « Extraire les relations des 6 schémas » | « Exporter l’analyse du graphe JSON » → renommer `qwen4b-prompts-renforces-graphe.json` |
| 3 | Même section ; cliquer « Tester avec agrandissement ciblé » | Exporter immédiatement → renommer `qwen4b-prompts-renforces-graphe-zoom.json` |

Exporter le graphe sans zoom avant de lancer le zoom : le nouveau résultat remplace le précédent à l’écran. Aucun import d’image ni saisie de barème nécessaire. Ces trois lancements représentent 24 lectures initiales (12 + 6 + 6), avec des appels supplémentaires possibles pour les réparations et jusqu’à deux zooms par dessin. Aucune durée n’est garantie sur le Mac Intel.

## Ce que les résultats doivent permettre de vérifier

| Variante | Comportement recherché |
| --- | --- |
| S0 | Relations témoins reconnues ; référence provisoire 3/3 |
| S1 | Flèche inversée rejetée, sans rejeter les autres relations ; 2/3 |
| S2 | Mauvaise cible rejetée ; 2/3 |
| S3 | Noyau hors du contour cellulaire détecté ; 2/3 |
| S4 | Changement de disposition sans changement du jugement ; 3/3 |
| S5 | Première flèche laissée incertaine ; aucune note totale de référence imposée |

Pour le graphe, examiner les décisions par relation plutôt qu’attendre nécessairement une note globale. Une indécision n’est pas une erreur scientifique détectée. Un zoom qui augmente les réponses certaines sans améliorer leur exactitude n’est pas un progrès.

## Répétabilité après ce premier tri

Transmettre les trois JSON avant de multiplier les combinaisons. Une fois le meilleur candidat identifié, refaire **ce parcours seulement** avec « 3 répétitions » pour vérifier la stabilité des décisions, puis confirmer sur les dessins D/E et des copies manuscrites avec référence enseignante. Les mêmes résultats faux répétés ne constituent pas une réussite.

Si Qwen reste insuffisant et que du temps est disponible, reproduire les trois lancements sur un seul profil distant avec le modèle réellement nommé `saluki-27b` dans les champs utilisés. Le nom du profil ou l’utilisation d’une API compatible OpenAI ne suffit pas à identifier le modèle servi. Ne pas changer à la fois le modèle, les images, le barème et les paramètres.

Ce protocole est une validation expérimentale des prompts ; les tests logiciels verts ne prouvent pas un gain de précision visuelle. Les références S0–S5 restent des références synthétiques provisoires.
