# Audit de couverture — 14 novembre 2026

## Mesure reproductible

Source : artefact \`coverage-reports\` de la CI GitHub Actions \`Tests\`, exécution [43617967933](https://github.com/Sims07/Companion-Correcteur-Devoir/actions/runs/43617967933), branche main.

| Mesure | Lignes couvertes / totales | Couverture |
| --- | ---: | ---: |
| Ensemble Vitest hors UI | 5 270 / 6 938 | **75,95 %** |
| Domaine + application | 3 084 / 4 194 | **73,53 %** |
| Branches (ensemble) | 5 667 / 9 016 | **62,85 %** |

La couverture Vitest exclut \`src/ui/**\`, mesuré par les tests navigateur Playwright ; ce pourcentage ne représente donc **pas** une couverture bout en bout de tous les écrans. Les tests E2E n'augmentent pas le pourcentage V8.

## Causes principales (avant correction)

1. La configuration ne découvrait que \`tests/**/*.test.ts\`. Les tests co-localisés \`src/**/*.test.ts\`, \`src/**/*.test.tsx\` et les \`tests/**/*.test.tsx\` n'étaient **pas exécutés** dans la CI Vitest. Plusieurs modules avec une suite métier existante apparaissaient à 0 % ou presque ; il est erroné de conclure qu'ils n'ont aucun test.
2. La couverture était produite et le badge mis à jour sans **seuil bloquant**. Une CI verte ne garantissait donc pas 80 %.
3. Plusieurs zones critiques sont réellement peu couvertes : campagne scientifique interrompue, diagnostics anonymisés, récupération de résultat, évaluation des flèches et cas indéterminés.

## Priorités métier constatées sur le rapport initial

| Module | Lignes non couvertes | Risque métier |
| --- | ---: | --- |
| \`scientificDiagramProtocol.ts\` | 111 | Barème / suivi de protocole scientifique |
| \`arrowDirectionsLeaderV1.ts\` | 89 | Sens et détection des flèches |
| \`pilotEvaluationProtocol.ts\` | 75 | Comparabilité des essais et notation |
| \`evaluationCampaignIssues.ts\` | 63 | Diagnostic des tests manquants et échoués |
| \`pilotCriterionConcurrency.ts\` | 59 | Exécution parallèle et annulation |
| \`visualDecisionEvaluation.ts\` | 57 | Décision IA sur image |
| \`scientificDiagramRelationGraphV2.ts\` | 56 | Structure des relations biologiques |
| \`evaluationIssueReport.ts\` | 50 | Partage des erreurs sans fuite de copie |
| \`ollamaProvider.ts\` | 125 | Communication IA et délais / annulation |

## Stratégie

- Réactiver les suites co-localisées et JSX pour mesurer ce qui est réellement testé.
- Ajouter des tests unitaires sur les rapports d'échec (0 valide, note manquante, répétition non exécutée, catégories d'erreurs, absence de données privées).
- Bloquer les PR par un seuil **80 % des lignes** dans la commande de couverture Vitest, exécutée en CI.
- Conserver les tests de composants et les parcours E2E, en appliquant la pyramide : surtout règles métier, puis contrats d'intégration, enfin parcours enseignants.
- Les branches (62,85 % à l'origine) restent une dette technique visible ; 80 % de lignes ne prouve ni 80 % de branches ni la qualité scientifique du jugement d'un modèle. Prioriser progressivement les décisions contradictoires, les annulations et les sorties IA indéterminées.

Commandes : \`npm test\`, \`npm run test:coverage\`, \`npm run test:coverage:core\`, \`npm run test:e2e\`.

## Suites historiques réactivées progressivement

Le premier essai de découverte complète (CI [43637964360](https://github.com/Sims07/Companion-Correcteur-Devoir/actions/runs/43637964360)) a exécuté **1 670 tests**, dont **1 617 réussis** et **53 échecs** dans **25 suites**. Auparavant ces suites n'étaient pas exécutées par Vitest. Les échecs couvrent des contrats manifestement modifiés (libellé du bouton d'arrêt, prompts, réseau) et d'autres à analyser comme risques métier (classification scientifique, notation, parcours professeur). Ce constat ne démontre ni que les tests sont tous périmés ni que le code de production est correct.

La PR #461 a placé temporairement les 25 fichiers dans `test.exclude`, masquant aussi les 200 tests qui réussissaient déjà dans ces fichiers. L’audit de [l’issue #462](https://github.com/Sims07/Companion-Correcteur-Devoir/issues/462) a reproduit les 53 échecs et réintégré les 253 tests dans la commande Vitest normale. Le seuil de 80 % continue à s’appliquer. Les adaptateurs IA sont testés avec des réponses simulées.

| Suites | Décision vérifiée |
| --- | --- |
| rubricSubcriteriaSuggestion, scientificDiagram | Garder les intitulés courts avec points explicites (O2, A, B). Une confiance visuelle invalide entraîne une relecture. |
| arbitrationDecision, teacherAnnotations | Accepter les alias français dans un objet JSON entouré de prose. Le juge doit choisir un avis existant pour chaque critère litigieux. Les annotations invalides restent comptées. |
| backgroundCorrectionReviewNavigation, teacherJourney | Tester une archive rattachée à un autre devoir et un maximum non fini. Un malus négatif est autorisé. |
| gradingJudgeShape, systemOneCoverage, systemOneReviewTriage | Fournir une preuve pour une note ; une question d’alignement couvre la copie entière. Sans preuve localisée, les points proposés restent à confirmer. |
| scientificPageClassification, scientificRubricRouting | Tester le signal d’incertitude et les numéros de pages structurés. Un schéma prédit avec confiance insuffisante reste ambigu. |
| scientificDiagramFixtures | Une précision non mesurée vaut null. Le changement de cible D/E peut être détecté dans le graphe même si le détail de notation du trait manque. |
| backgroundDecisionBatch, aiModelProfiles, modelEvaluation | Le mode décisionnel regroupe les critères, le mode génératif testé les sépare. Respecter la pénalité par défaut et l’arrêt immédiat d’une campagne. |
| ollamaDiagnostic, ollamaProvider, ollamaSelectiveArbitration | Comparer de vraies propositions structurées. Ne pas dupliquer la transcription de copie dans la sortie brute de son événement Vision. Conserver la somme justifiée des sous-critères. Vérifier les désaccords transmis au juge. |
| ollamaRubricImportProgress, rubricStructuring | Vérifier le titre récupéré, la description à préciser et la conservation du texte et de l’ordre des pages lors du regroupement. Une réponse HTTP simulée est consommable une seule fois. |
| openAiCompatibleTransport, openAiScientificDiagramAnalyzer | Une seule fin logique par flux ; conserver la qualité d’image dans l’aperçu expurgé. Le repli après rejet du schéma demande effectivement un objet JSON. Vérifier la charge envoyée dans le dialecte du fournisseur. |
| relationGraphV2Client | Une racine HTTPS explicitement configurée peut désigner un serveur Ollama. Une adresse avec chemin, une image vide ou un modèle manquant doivent être rejetés avant tout appel. |
| TeacherWorkspaceNavigation, BiologyRunMonitor | Vérifier le bouton de réglage de l’IA selon son état et le libellé d’arrêt immédiat. |
