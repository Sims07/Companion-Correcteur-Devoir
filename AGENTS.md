# Consignes pour les évolutions du Compagnon

## Principes de livraison
- Développer sur une branche dédiée et proposer une PR GitHub.
- Chaque modification doit inclure les tests adaptés à la pyramide de tests : domaine/unitaire pour les règles, intégration pour les interactions, parcours navigateur pour les comportements visibles.
- Ne considérer la fonctionnalité terminée qu'après CI verte, relecture du diff et fusion de la PR.
- Préserver la confidentialité des copies et privilégier l'exécution locale avec Ollama.

## Contrat UX obligatoire pour toute action asynchrone
Toute action susceptible d'attendre un chargement, un appel IA ou réseau, un import, un calcul ou une sauvegarde doit offrir :
1. **Avant lancement :** une action principale facilement repérable, avec un libellé explicite et un contraste suffisant (pas de petit lien perdu en haut d'une carte).
2. **Dès le clic :** un état « en cours » visible, immédiat et compréhensible ; empêcher un deuxième lancement et désactiver les actions incompatibles sans bloquer les autres vues utiles.
3. **Pendant :** un feedback sur l'étape réellement connue (attente du serveur, lecture, validation), une durée visible si l'action peut être longue et une animation non intrusive. Ne jamais inventer un pourcentage ou un temps modèle non mesuré.
4. **Interruption :** lorsque possible, un bouton Arrêter qui transmet un AbortSignal et empêche qu'une réponse tardive écrase les résultats existants.
5. **Fin :** confirmation explicite avec résultat exploitable ; en erreur, explication et réessai sans perdre les données déjà validées.
6. **Navigation :** une tâche encore active reste identifiable en revenant sur l'écran. Son état ne doit pas être uniquement dans un composant qui se démonte lors d'un changement d'onglet.
7. **Accessibilité :** boutons accessibles au clavier, statuts annoncés via role=status/alert, états disabled réels, respect de prefers-reduced-motion.
8. **Tests :** couvrir au moins un lancement en cours, le double-clic ou double lancement, la réussite, l'échec et l'annulation ; pour un workflow long, tester une navigation pendant l'attente.

La vérification locale du barème (`rubricAuditTask.ts` et `RubricAuditPanel.tsx`) sert d'exemple de référence. Les guides existants de l'expérience enseignant conservent leur priorité.
