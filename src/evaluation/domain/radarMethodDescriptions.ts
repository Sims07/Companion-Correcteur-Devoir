import type { ScienceMethod } from './radarTimeline.ts';
import type { BiologyMethodId } from './radarMethodExclusions.ts';

/** Scientific descriptions of what the laboratory executes, not claims of accuracy.
 * Keep the ids in sync with the canonical method registries. */
export interface RadarMethodDescription {
  principle: string;
  steps: readonly string[];
  interest: string;
  limitations: string;
  radarScope: string;
}

export const SCIENCE_METHOD_DESCRIPTIONS: Record<ScienceMethod, RadarMethodDescription> = {
  'image-direct-v1': {
    principle: 'Méthode témoin : fournir au LLM multimodal les pixels du schéma et le barème de correction dans un même parcours génératif. Le modèle décide directement des points par critère, sans OCR, extraction de graphe ou détecteur géométrique en amont.',
    steps: [
      'Envoyer les images originales du schéma et les attendus du barème au modèle multimodal sélectionné.',
      'Demander les décisions, les justifications et les points par critère en une correction directe.',
      'Vérifier la structure de la réponse et comparer les décisions à la correction de référence du professeur.',
    ],
    interest: 'Référence indispensable pour savoir si un graphe, un guidage ou des détecteurs améliorent vraiment la qualité et la vitesse de correction.',
    limitations: 'Le modèle peut halluciner des structures, interpréter le sens attendu plutôt que le tracé et attribuer une note plausible mais incorrecte. Le format de sortie peut être incomplet ; une réparation éventuelle coûte un appel supplémentaire.',
    radarScope: 'A/B/C, D/E et Biologie S0–S5 emploient « Image → génératif direct » (sans OCR ni graphe). La batterie Relations S0–S5 reste une extraction indépendante « baseline », mesurée à part : elle n’est pas un préalable à la correction et ne prouve pas la qualité de la notation directe.',
  },
  'pixel-v1': {
    principle: 'Analyse géométrique locale des petites pointes de flèches, suivie d’une vérification par le modèle Vision. Le nom « petites pointes » désigne les extrémités en forme de triangle ou de coin, pas des flèches plus courtes.',
    steps: [
      'Transformer l’image en pixels sombres ou clairs en tenant compte du contraste, y compris les traits plus pâles.',
      'Chercher dans les quatre directions une pointe qui s’élargit en arrière, puis un trait fin qui la prolonge. Accepter sous conditions certains contacts avec d’autres structures.',
      'Localiser les pointes candidates et signaler celles qui restent incertaines ; transmettre leurs positions au modèle Vision.',
      'Faire vérifier les indices par le modèle, qui doit retrouver les deux extrémités, le sens et les éléments réellement reliés.',
    ],
    interest: 'Peut récupérer des pointes fines, peu contrastées ou proches d’un contour que des seuils plus stricts écartent.',
    limitations: 'Les lettres, croisements et petits détails peuvent créer de fausses pointes. Une pointe détectée ne prouve ni la connexion ni la signification biologique ; le modèle peut aussi ignorer ou mal interpréter un indice.',
    radarScope: 'La variante #439 (« pixel-arrows ») intervient dans la batterie Graphe des relations S0–S5. Les autres batteries du même essai ne sont pas automatiquement corrigées avec ce détecteur.',
  },
  'leaders-v1': {
    principle: 'Analyse géométrique locale des traits de rappel (« longs traits ») et de leur tête de flèche, suivie d’une vérification par le modèle Vision. Un long trait seul ne permet pas de conclure à une direction.',
    steps: [
      'Mesurer le contraste des pixels du schéma et chercher des formes orientées vers la droite, la gauche, le haut et le bas.',
      'Vérifier qu’une tête élargie se prolonge par une hampe fine sur une distance suffisante et que le tracé ne continue pas devant la pointe.',
      'Écarter autant que possible les coins, intersections et formes ressemblant à des flèches ; transmettre les positions candidates au modèle Vision.',
      'Laisser le modèle vérifier la continuité du trait et identifier les objets aux deux extrémités avant de proposer une relation.',
    ],
    interest: 'Favorise les flèches dont la hampe est longue et régulière et rejette une partie des petits détails isolés.',
    limitations: 'Une flèche courte, pâle, oblique ou touchant un contour peut être manquée. La détection du trait ne garantit pas que le modèle retrouve la bonne destination.',
    radarScope: 'La variante #438 (« pixel-leaders-v1 ») intervient dans la batterie Graphe des relations S0–S5. Les autres batteries utilisent leurs moteurs propres.',
  },
  'direct-v1': {
    principle: 'Extraction visuelle directe du graphe : le modèle Vision décrit les étiquettes, les flèches et les inclusions, sans indices fournis par un détecteur géométrique local.',
    steps: [
      'Présenter les pixels du schéma au modèle Vision sans barème de correction.',
      'Demander un inventaire structuré des étiquettes, des deux extrémités des flèches et des relations d’inclusion.',
      'Comparer ce graphe observé aux relations de référence et distinguer « absent » de « incertain ».',
    ],
    interest: 'Méthode témoin simple pour mesurer ce que le modèle sait observer sans prétraitement spécifique des pointes.',
    limitations: 'Le modèle peut reconstituer une relation biologiquement plausible au lieu de lire le sens réellement dessiné, ou confondre un croisement avec une connexion.',
    radarScope: 'La batterie Graphe S0–S5 utilise la consigne de base (« baseline ») ; les autres batteries suivent leur moteur de correction.',
  },
  'guided-v1': {
    principle: 'Lecture guidée trait par trait : des consignes de vérification imposent de dissocier chaque connexion des autres avant de déduire son sens.',
    steps: [
      'Pour chaque trait, repérer séparément les deux extrémités physiques.',
      'Suivre la ligne réellement dessinée, contrôler la pointe visible et éviter d’aligner automatiquement les flèches voisines.',
      'Contrôler les inclusions de contours sans déduire la réponse de la biologie attendue.',
    ],
    interest: 'Cherche à réduire les erreurs par anticipation du sens scientifique et les contaminations entre flèches successives.',
    limitations: 'Le guidage reste une consigne au même modèle Vision : il ne fournit aucune preuve géométrique indépendante et peut échouer sur des traits ambigus.',
    radarScope: 'Consigne « isolated-arrows-outside » pour le graphe et examen guidé pour la batterie de sensibilité biologique ; les autres batteries ne deviennent pas un nouvel algorithme de détection.',
  },
  'graph-first-v1': {
    principle: 'Chaîne « image → graphe observé → décision » : séparer la description visuelle des relations de l’application d’un barème.',
    steps: [
      'Observer dans l’image les étiquettes, flèches et contours et les convertir en graphe structuré.',
      'Faire dériver les décisions de correction des relations observées plutôt que de supposer une note à partir du sujet.',
      'Comparer les décisions obtenues à celles du professeur sur les batteries adaptées.',
    ],
    interest: 'Rend plus explicite la séparation entre faits visuels et jugement pédagogique.',
    limitations: 'Une erreur dans le graphe peut se propager à toutes les décisions. La stratégie d’essai n’emploie pas nécessairement le même moteur sur ses quatre batteries.',
    radarScope: 'La notation A/B/C et D/E peut employer « graph-first-v1 ». La batterie de graphe indépendant utilise une lecture isolée distincte.',
  },
  'graph-first-v2': {
    principle: 'Le modèle Vision extrait les relations explicites entre légendes, structures et contours avant de corriger selon le barème.',
    steps: [
      'Observer les légendes, flèches et structures présentes sur le dessin sans attribuer de points.',
      'Extraire les relations légende → cible et les inclusions en gardant les incertitudes.',
      'Comparer les relations au corrigé et produire les décisions pédagogiques.',
    ],
    interest: 'Distingue les erreurs de reconnaissance des liens des erreurs de décision.',
    limitations: 'Une relation erronée peut se propager à la note. Le modèle peut reconstituer un lien biologiquement plausible sans suivre le trait réel.',
    radarScope: 'Correction graphe v2 sur A/B/C, D/E et biologie ; le graphe indépendant S0–S5 conserve son extracteur distinct.',
  },
  'vision-then-analysis': {
    principle: 'Parcours en deux appels : Vision lit la photographie et le modèle d’analyse corrige sa transcription à partir du barème.',
    steps: [
      'Décrire les objets et relations visibles avec le modèle Vision.',
      'Transmettre la transcription textuelle au modèle d’analyse, sans image.',
      'Comparer les décisions produites aux références sur les batteries de test.',
    ],
    interest: 'Permet de combiner deux modèles spécialisés et de distinguer lecture et correction.',
    limitations: 'L’analyse ne revoit pas les pixels : une erreur OCR ou de connexion peut devenir définitive. Deux appels peuvent aussi coûter plus cher.',
    radarScope: 'Vision → analyse pour la notation ; la batterie de graphe utilise une observation visuelle indépendante.',
  },
  'direct-image-generative-thinking': {
    principle: 'Même méthode directe image + barème → LLM génératif, avec le mode Think demandé explicitement à Ollama compatible.',
    steps: [
      'Vérifier la disponibilité du mode Think sur le modèle et le serveur Ollama.',
      'Envoyer les mêmes images et critères que pour Think OFF.',
      'Évaluer décisions, erreurs et temps fournisseur sur les mêmes cas.',
    ],
    interest: 'Vérifie si le raisonnement demandé améliore les décisions sur les pièges visuels.',
    limitations: 'Think peut ne pas être pris en charge, être ignoré ou allonger la durée ; il ne garantit pas une meilleure lecture.',
    radarScope: 'Un parcours distinct de Think OFF. « Comparer Think OFF / ON » déclenche les deux et ne représente pas une troisième méthode.',
  },
  'direct-image-systemone': {
    principle: 'Envoyer directement les pixels au modèle décisionnel visuel System One avec le barème, sans OCR ni génératif intermédiaire.',
    steps: [
      'Vérifier que le modèle décisionnel et le protocole acceptent réellement les images.',
      'Transmettre la photographie et les critères de décision.',
      'Contrôler les décisions structurées sur les références de notation.',
    ],
    interest: 'Teste une décision visuelle native sans étape de transcription.',
    limitations: 'Tous les modèles décisionnels ne sont pas visuels : TEV1 texte ne peut pas utiliser System One image. Le graphe reste une batterie distincte.',
    radarScope: 'Ne se lance que sur un modèle System One compatible Vision ; aucun remplacement silencieux par Vision puis analyse.',
  },
};

export const BIOLOGY_METHOD_DESCRIPTIONS: Record<BiologyMethodId, RadarMethodDescription> = {
  contract: {
    principle: 'Correction par contrats de question : confronter la réponse à des attendus explicites avant d’attribuer les points.',
    steps: [
      'Décomposer la référence pédagogique en décisions par question ou sous-critère.',
      'Examiner la réponse avec le modèle de correction sélectionné.',
      'Comparer les décisions et la note avec la référence sur les copies et les cas pièges.',
    ],
    interest: 'Facilite l’audit des décisions critère par critère et des erreurs omises.',
    limitations: 'La précision dépend de la lecture de la copie, des attendus et du modèle. Un contrat ne supprime pas les hallucinations.',
    radarScope: 'Batteries de correction biologique A/B/C et D/E/F/G ; ce protocole ne correspond pas au détecteur de flèches du radar de schémas.',
  },
  standard: {
    principle: 'Correction à partir du barème standard, sans décomposition supplémentaire en contrats de question dans ce protocole.',
    steps: [
      'Fournir au modèle la réponse et les critères du barème.',
      'Collecter la note et les décisions par sous-critère.',
      'Mesurer leur accord avec les références du professeur, notamment sur les cas pièges.',
    ],
    interest: 'Constitue une base de comparaison pour estimer l’apport réel des contrats par question.',
    limitations: 'Peut accorder des points à une notion absente ou mal lire une réponse ; une note globale proche du professeur ne suffit pas.',
    radarScope: 'Batteries biologiques A/B/C et D/E/F/G ; aucun prétraitement géométrique n’est ajouté.',
  },
  pilot: {
    principle: 'Ancienne campagne pilote conservée à titre d’historique ; sa procédure exacte dépend des traces enregistrées.',
    steps: [
      'Consulter le protocole et les moteurs réellement déclarés dans l’historique.',
      'Comparer uniquement des essais ayant les mêmes cas et les mêmes références.',
    ],
    interest: 'Permet de retrouver et contextualiser les premières expérimentations.',
    limitations: 'Il ne s’agit pas d’une méthode stable relançable dans les batteries actuelles ; ne pas attribuer arbitrairement son score à un autre protocole.',
    radarScope: 'Historique seulement ; les nouvelles campagnes proposent « Barème standard » ou « Contrats par question ».',
  },
};
