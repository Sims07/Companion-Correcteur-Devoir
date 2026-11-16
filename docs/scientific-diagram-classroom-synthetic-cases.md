# Batterie R1/R2/R3 — dessins de mitose synthétiques, style copie au crayon

## Images réellement utilisées

Les trois figures de cette batterie sont **les trois dessins générés précédemment** dans la conversation, et non des SVG redessinés dans le code. Les PNG synthétiques ont été encodés en WebP haute qualité pour être embarqués dans la PWA :

| Cas | Image dans le dépôt | Dimensions | Référence provisoire du nouveau dessin |
|---|---|---:|---:|
| R1 | `classroom-mitosis-r1.webp` | 744 × 510 | 9,17/10 |
| R2 | `classroom-mitosis-r2.webp` | 746 × 509 | 7,16/10 |
| R3 | `classroom-mitosis-r3.webp` | 814 × 487 | 8,01/10 |

Les visuels conservent le crayon, les hachures, les textes manuscrits synthétiques et les imperfections graphiques. Ils sont importés directement comme fichiers WebP dans le laboratoire et dans l'historique. **Aucun générateur SVG n'est utilisé pour R1/R2/R3**. Les anciens cas D/E, qui sont une paire de contrôle indépendante, restent inchangés.

## Confidentialité

Leur inspiration vient de remarques pédagogiques faites sur trois copies privées ; **aucune photographie de copie, aucun tracé original, aucune identité, aucune annotation manuscrite réelle et aucune note individuelle de l'enseignant n'ont été ajoutés au dépôt**. Les images sont les créations synthétiques précédemment produites, pas des anonymisations ni des retouches des feuilles d'élèves.

Les trois images utilisées pour les essais sont embarquées localement dans l'application. Il n'y a aucun service d'images externe. La destination des appels aux modèles demeure celle explicitement choisie dans le profil IA (par exemple Ollama local).

## Ce qui est réellement visible dans les trois dessins

- **R1** : prophase, métaphase, anaphase et télophase ; interphase pourtant obligatoire absente. Le titre est placé au-dessus, et non en dessous comme l'exige le barème de présentation courant.
- **R2** : interphase, prophase, anaphase et télophase. En interphase, une légende « chromosome » désigne le contenu du noyau sans chromosome individualisé ; en anaphase, le pointage « membrane plasmique » sur le bord est discutable ; la télophase ne montre pas de cloison centrale clairement identifiable. Les légendes, notamment « cytoplasme », ne doivent **pas** être déclarées fausses sur la seule base d'une erreur qui figurait dans l'ancien SVG.
- **R3** : pas d'interphase ; l'enveloppe nucléaire est représentée et légendée en métaphase ; les « microtubules » sont mentionnés sans structure nettement identifiable à l'extrémité du trait. Le titre comporte bien une coupe de racine de jacinthe, mais il se trouve au-dessus du dessin.

Les notes de référence sont recalculées à partir des **19 sous-critères du pilote sur ces nouveaux pixels**, et restent **provisoires, non validées par un professeur**. L'application ne doit pas les présenter comme les véritables notes des copies privées.

## Historique et radars

Le protocole de référence passe de **v8 (dessins vectoriels)** à **v9 (les trois images WebP réalistes)**. Les anciens rapports sont conservés dans l'historique, mais leurs images supprimées ne sont pas remplacées silencieusement par de nouvelles ; le lecteur affiche un avertissement. Les expériences v8 ne participent plus aux radars v9.

Seules les séries R1/R2/R3 complètes et réussies sont agrégées aux mesures de qualité graphique et de précision. Les tests conservent les règles existantes pour les mesures non exploitables, les durées natives et les répétitions.

## Vérification

- Empreintes SHA-256 des trois fichiers WebP et en-têtes raster, pour prévenir un retour accidentel des illustrations SVG.
- Tests unitaires de présence/absence des phases et de calibration des 19 critères.
- Tests de radar couvrant l'exclusion des anciennes séries v8, la combinaison avec A/B/C et l'exclusion des séries incomplètes.
- Test navigateur des trois images réellement décodées (dimensions originales), et de leur affichage dans le parcours R1/R2/R3.

**Limite** : une bonne note d'IA sur ces images synthétiques ne prouve pas sa fiabilité sur des photos de copies réelles. Une validation indépendante des 19 points par un enseignant reste requise. Le critère général « Compréhension » du pilote ne permet pas, à lui seul, de sanctionner chaque incohérence spécifique à une phase, par exemple l'enveloppe nucléaire en métaphase : ces erreurs doivent aussi être signalées dans la revue scientifique.
