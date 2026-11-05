# Stratégies de correction — plan progressif et invariants

## Invariants

- **Classique par défaut** : chaque ancienne configuration et chaque ancien profil, même sans champ `correctionMethod`, conserve le comportement génératif actuel.
- **Ne pas confondre le parcours** (une copie / série) **avec la stratégie d'analyse** (générative / décisionnelle). La vision et la correction des schémas sont des phases indépendantes.
- **Pas de repli silencieux** : un choix décisionnel non supporté doit produire une erreur explicite avant tout appel réseau ; il ne doit pas masquer une exécution classique.
- **Même contrat métier** : critères, sous-critères, preuves, notes plafonnées et revue du professeur sont conservés pour les deux stratégies.
- **Schémas scientifiques** : conserver, dans un premier temps, la classification et l'analyse graphique existantes, puis introduire les décisions par attendu seulement si une preuve visuelle suffit ; aucun double comptage avec le texte.
- **CPU local** : ne jamais faire cohabiter deux moteurs en mémoire sans mesurer les coûts de changement ; sérialiser le traitement par copie et conserver la politique de keep-alive existante.
- **Données privées** : ne transmettre qu'au fournisseur explicitement configuré ; aucune API publique ni bascule implicite.

## Lot 1 — Socle sans changement de comportement

Le type de stratégie est défini dans le domaine, transmis en option au port IA et persisté dans les profils locaux. La stratégie décisionnelle est affichée comme indisponible dans l'IHM ; le fournisseur refuse explicitement son activation tant qu'un adaptateur réellement testé n'est pas implémenté. Couverture : migration des configurations, choix par défaut, compatibilité du port, garde-fou HTTP et contrat UI.

## Lot 2 — Décisions par attendus

- Introduire le contrat `CriterionDecision` : `present | partial | absent | uncertain` avec preuve de la copie, sans convertir une pseudo-probabilité non calibrée en points.
- Barème déterministe : seuls les points définis par les attendus sont attribués ; les situations incertaines demandent une vérification, pas un zéro automatique.
- Première implémentation possible via prompts fermés et LLM d'analyse actuel, sans exiger un second modèle en RAM.
- Comparer sur un même jeu de copies et de barèmes avec le mode classique (précision, temps, tokens, taux d'alertes).
- Activer le choix dans la configuration IA *uniquement après tests verts* et conserver les résultats classiques.

## Lot 3 — Schémas, modèles spécialisés et optimisation

- Pour les schémas : réutiliser l'interprétation visuelle existante, puis appliquer les décisions sur les seuls attendus explicitement liés au schéma. Chaque preuve ambiguë reste vérifiable par le professeur.
- Ajouter un adaptateur spécialisé System One / Decision Model uniquement s'il est compatible avec les versions Ollama réellement utilisées ; ne jamais forcer une API non supportée.
- Mesurer les temps de chargement, de lecture, d'analyse, le débit, les appels et les coûts de changement de modèle sur 30 copies ; optimiser le contexte sans réduire la qualité scientifique.
- Observabilité et évaluations comparatives par stratégie, sans métriques techniques dans l'écran enseignant.

Chaque lot passe par une PR indépendante, les tests unitaires du domaine puis les tests d'intégration et quelques parcours Playwright ciblés. Fusion uniquement après CI verte et revue.
