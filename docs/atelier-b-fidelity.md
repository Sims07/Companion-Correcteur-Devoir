# Fidélité Atelier B

La maquette retenue définit une composition, pas seulement des couleurs : une colonne permanente pour le devoir, les étapes et les copies ; une zone centrale consacrée à l'original et aux décisions de correction.

Cette PR intègre la navigation verticale, retire le doublon d'onglets, rassemble les copies dans la même colonne et replie les ajustements facultatifs. Les actions existantes sont conservées.

Le parcours Playwright vérifie la géométrie des panneaux, la navigation, les contrôles accessibles et les affichages desktop et mobile. Les captures de test contiennent uniquement des données fictives.

## Barème : tableau de préparation

L'éditeur enseignant affiche une feuille de critères numérotés et un résumé latéral synchronisé avec le barème. Le résumé indique les critères définis, le total de points, le niveau pédagogique et si la correction peut démarrer. Les modifications restent dans les vrais champs éditables existants. Le lien « Voir les critères disponibles » ouvre le panneau réutilisation présent sur la page, sans créer de copie liée. Sur les écrans étroits, la synthèse passe après les critères ; le mode Évaluation des modèles conserve sa composition indépendante.
