# Plan : refonte gameplay, RPG open world sur Abalone

> Statut : plan de travail en français, approuvé par @Varadiell le 2026-10-24, en attente de la
> Decision [#313](https://github.com/TidyMaze/ab-alone/issues/313). Les specs en anglais de
> `docs/specs/rpg/` le remplaceront, section par section (voir section 0).

## Contexte

**Ce que tu as demandé**

AB-ALONE devient avant tout un RPG open world (inspiré de Diablo et WoW). Abalone reste le système
de combat. Les éléments demandés :
- un monde en grille hexagonale, parcouru avec une seule boule ;
- des biomes qui changent les combats ;
- 1 hexagone du monde = 1 plateau d'Abalone, et plusieurs plateaux pour certains boss ;
- des classes asymétriques, chacune avec sa propre ressource ;
- 4 capacités + 1 ultime par classe, toutes avec un temps de recharge ;
- des niveaux de 1 à 100 ;
- un arbre passif façon runes de LoL (1 point par niveau) et un arbre actif (1 point tous les
  5 niveaux) ;
- des stats pour chaque boule, et une boule qui disparaît à 0 PV ;
- des quêtes, des boss, du PvP, un hub, des marchands, de l'équipement, des donjons, un
  événement battle royale ;
- la récolte et l'artisanat façon New World.

**Ce qui entre en conflit avec les specs actuelles** (à faire valider par un `Decision`, section 0)

- `game-design.md` §1, pilier 1 : « if a trick needs a new move type, we drop the trick ».
- `game-design.md` §1, pilier 3, et §4 : « no stat grind », « no health, no levels, no buffs ».
- `rules.md` §5 (le sumito) et la phrase d'intro du §10 : « a mode never changes a move or a push ».
  Ce plan, lui, ajoute une condition de Poids.
- `world.md` §1 : Hollow n'a pas d'atmosphère.
- `world.md` §4 : pas de journal de quêtes.
- `world.md` §6 : pas d'interface plate pendant un match.
- `SPEC.md` §4 phase 5 et l'issue #50 : le hub est un graphe de salles.
- `SPEC.md` §6 : le classement est hors du périmètre.

**Les 4 choix que tu as validés**

1. Univers **science-fantasy**. On garde le lore : le CSV Ballast, la lune Hollow et le
   verre-scorie. Le verre-scorie donne des pouvoirs, et chaque classe est une « lignée ».
2. Réseau **façon Diablo, en P2P**. Le monde est déterministe et le même pour tous, mais chaque
   joueur a sa propre instance. On joue en groupe de 4 maximum, en P2P. Le PvP et le BR passent
   par des salons P2P. La règle #36 (pas de serveur) tient toujours.
3. **Un héros et son escouade**. Ta boule du monde est le héros. En combat, il est accompagné de
   « Fragments ». **Le héros meurt s'il tombe à 0 PV ou s'il est éjecté, et sa mort fait perdre
   le combat.** C'est un choix assumé : le héros est la pièce la plus forte (ses stats, la source
   des capacités), mais aussi la plus exposée. Beaucoup de risque, beaucoup de gain. Pour que ça
   reste lisible et jouable, le jeu affiche une alerte « Danger du bord », la Garde limite les
   dégâts d'une seule capacité, et plusieurs classes ont des réponses pour protéger le héros
   (section 6.6).
4. **Combat déterministe**. Aucun jet de dé en combat. Le hasard ne sert que pour le butin,
   l'artisanat et la génération du monde.

**Ce qu'on vise**

Une spec gameplay complète, chiffrée et testable, ajoutée au repo en suivant CONTRIBUTING.md.

Chaque règle porte une étiquette, comme dans `rules.md` :
- **FINAL** : décidé ;
- **TUNE** : valeur de départ, à régler en playtest ;
- **PROPOSAL** : proposé ici, un owner confirme.

Ici, tout est PROPOSAL et tous les nombres sont TUNE, sauf mention contraire.

Ce plan a été relu par une revue critique indépendante. Ses corrections sont intégrées :
- les durées des effets ;
- la poussée pondérée ;
- la limite d'éjections ;
- les mouvements bonus ;
- la boucle du Nécromancien ;
- le combat de groupe ;
- le déterminisme ;
- les budgets de points.

---

## 0. Livraison : comment ce plan devient la spec

1. **Issue `Decision`** « Pivot : RPG open world construit sur Abalone ». Elle contient :
   - le contexte et les 4 choix ;
   - les piliers révisés (section 1) ;
   - la liste complète des conflits (voir Contexte) et les specs touchées.

   Elle doit être visible par @TidyMaze (projet à plusieurs). Un owner la ferme par `Decided: …`.
2. Ensuite :
   - un **Epic « Phase R : RPG open world »**, avec sa milestone ;
   - des Tasks « Update spec for #N », en sous-issues de l'Epic #56 (Project setup).
3. **4 PRs de docs**, une par Task, ouvertes en brouillon. Les specs sont en anglais (convention du
   repo), dans `docs/specs/rpg/`.

   | PR | Contenu |
   |---|---|
   | 1 | `rpg/README.md` (index, piliers, glossaire, boucles), `rpg/combat.md`, `rpg/stats.md`, et le delta de `rules.md` (§10.5 « RPG combat », avec des exemples Given/When/Then) |
   | 2 | `rpg/classes.md`, `rpg/talents.md`, `rpg/progression.md` |
   | 3 | `rpg/open-world.md`, `rpg/biomes.md`, `rpg/quests.md`, `rpg/dungeons-bosses.md` |
   | 4 | `rpg/items.md`, `rpg/economy.md`, `rpg/gathering-crafting.md`, `rpg/pvp-br.md`, `rpg/roadmap.md`, et les mises à jour de `SPEC.md`, `game-design.md`, `world.md`, `tech.md` |

   Ce sont des PRs docs-only : @TidyMaze les merge avec l'admin bypass.
4. On ajoute un commentaire avec le lien vers la Decision sur les issues touchées :
   - #50 (hub) et #6 (Epic phase 5) ;
   - #49 et #35 (battle royale) ;
   - #175 (boss en coop) et #42 (encounters) ;
   - #163 (MCP : `legal_moves` ne sait pas encore décrire les capacités).

---

## 1. Piliers révisés (remplacent `game-design.md` §1)

1. **Abalone au cœur.**
   - Le coup de base reste celui d'Abalone : 1 à 3 boules alignées, un pas en ligne ou de côté, et
     le sumito.
   - Le Poids ajoute une condition de plus à la poussée. Si tous les Poids valent 1, on retrouve
     exactement l'Abalone classique : c'est un invariant testé.
   - Les tables d'Abalone classique (hot-seat, 1v1 en ligne, défi du jour) restent jouables au hub.
2. **Lisible et déterministe.**
   - Pas de dés.
   - Chaque menace est annoncée un tour à l'avance (le *tell*). Les ultimes qui éjectent beaucoup
     sont annoncés deux tours à l'avance.
   - Tout l'état du combat est public.
   - Les dégâts et les poussées s'affichent en aperçu avant de valider.
3. **Le joueur et le héros progressent tous les deux.**
   - La compétence compte plus que les stats.
   - Le PvP classé est normalisé (tout le monde a les mêmes stats).
   - Contre un boss, on recommence en moins de 5 s, avec la même graine.
4. **Chaque règle est testable.** Une règle se décrit par une position de départ et une liste
   d'actions. Chaque capacité est écrite avec les primitives de la section 6.10.
5. **Seul, ensemble.**
   - L'ambiance reste solitaire.
   - On joue en groupe de 4 maximum.
   - Pas de chat libre : seulement des emotes et des pings (décision déjà prise).
6. **Le contenu est de la donnée.** Classes, capacités, runes, objets, biomes, monstres, quêtes et
   recettes sont des fichiers de données. Le moteur reste générique.

---

## 2. Univers science-fantasy (delta de `world.md`)

- **Le verre-scorie se souvient.** Il fusionne avec les survivants et garde la mémoire de ce qu'il a
  touché : la chaleur, le temps, la roche, les morts… Chaque mémoire donne une **lignée**, c'est-à-dire
  une classe (section 8).
- **Hollow a été terraformée par le verre.** Des poches d'atmosphère se sont formées : cratères
  vitrifiés, forêts pétrifiées, mers de sel. C'est le monde ouvert.
- **Le Ballast** s'est échoué en surface. Il sert de hub, et son Pont est le donjon final : Tally,
  c'est-à-dire The Ballast Mind.
- **Tally** reste l'IA comptable. Elle donne la quête principale, puis devient le boss final.
  C'est un retournement voulu. Elle parle en lignes de registre : « Ligne 4 : trois coquilles en
  excédent. Corrigez. »
- **Les autres survivants.** La Colonie : des mineurs arrivés avant le Ballast, à moitié vitrifiés,
  qui servent de marchands et de donneurs de quêtes. Il existe aussi des factions (section 13.5).
  Le titre garde son sens : tu es le dernier verre encore clair.
- **La direction artistique ne change pas.** On garde la palette, les glyphes et l'accessibilité de
  `world.md` §5 et §8. Chaque biome ajoute sa palette, dans ce cadre.

---

## 3. Boucles de jeu

| Échelle | Boucle | Référence |
|---|---|---|
| Quelques secondes | Rouler de tuile en tuile, repérer une meute, un nœud de récolte ou un coffre | Diablo, Dofus |
| 2 à 5 min | Un combat sur le plateau de la tuile : placement, tours, victoire, butin | Dofus, BG3 |
| 30 à 60 min | Quêtes de zone, un donjon, récolte, puis retour au hub pour fabriquer, vendre et dépenser ses talents | WoW, New World |
| Plusieurs semaines | Atteindre le niveau 100, construire son build (runes, capacités, légendaires), Mythique+, raids, saisons | Diablo 3 et 4, WoW |

---

## 4. Monde ouvert hexagonal

### 4.1 Grille
- **Coordonnées axiales `(q, r)`**, avec la même convention que le plateau (`rules.md` §1).
- **1 case du monde = 1 tuile.** Le continent a un rayon de 60, soit environ 11 000 tuiles. Il est
  découpé en 10 zones de biome (section 5), plus le hub.
- **Une tuile porte :**
  - un biome ;
  - une graine : `hash(graine_monde, q, r)` ;
  - un contenu (section 4.3) ;
  - des drapeaux : découverte, nettoyée, nœuds récoltés.
- **Pavage tuile vers plateau.** Des hexagones de rayon 4 pavent la grille hexagonale sans trou.
  Le centre du plateau de la tuile `(q, r)` se trouve en `q·(9, −4) + r·(4, 5)`, en coordonnées de
  combat. Deux tuiles voisines donnent donc deux plateaux qui se touchent exactement. Cela sert aux
  combats sur plusieurs tuiles (section 4.6).

### 4.2 Déplacement de la boule unique
- **Hors combat, le temps est réel.** Un clic ou un tap calcule un chemin (A*) qui tient compte du
  coût de chaque biome. La boule avance d'une tuile par pas.
- **Durée d'un pas : 300 ms × le coût du biome.**

  | Biome | Coût |
  |---|---|
  | Plaines | 1 |
  | Forêt | 1,2 |
  | Marais | 1,5 |
  | Montagne | 1,5 |
  | Glace | 0,8, mais on glisse d'une tuile de plus |

- **Élan (la monture).** Le pas dure 20 % de moins au niveau 20, et 35 % de moins au niveau 40.
- **Balises (les waypoints de Diablo 2).** On les active en passant dessus. Ensuite, on s'y
  téléporte depuis la carte pour 1 Lueur.
- **Brouillard d'exploration.** Les tuiles jamais vues sont sombres. Elles se dévoilent dans un rayon
  de 3 autour de la boule. La carte (touche M) affiche le pourcentage découvert de chaque zone.
- **PV entre deux combats.** Les PV du héros restent ceux de la fin du combat précédent. Hors
  combat, il récupère 5 % de ses PV max par seconde. Il récupère tout d'un coup sur une Balise ou
  au hub.

### 4.3 Contenu d'une tuile

| Contenu | Effet | Part des tuiles (indicative) |
|---|---|---|
| Vide | Simple passage | 55 % |
| Meute | Combat d'escarmouche. La meute est visible et patrouille sur 3 tuiles | 15 % |
| Élite ou Champion | Combat d'élite, meilleur butin | 3 % |
| Nœud de récolte | 1 à 3 nœuds (section 14) | 15 % |
| PNJ ou avant-poste | Quêtes, marchand, Balise | 2 % |
| Coffre ou cache | Butin, parfois piégé (un combat se lance) | 3 % |
| Énigme | Un puzzle d'Abalone (« éjecte en 3 coups »), récompense fixe | 1 % |
| Entrée de donjon | Ouvre une instance (section 17) | rare |
| Événement | Un événement dynamique de 5 à 10 min (section 22) | change au fil du temps |
| Boss de zone ou rare nommé | Combat de boss, réapparition lente | rare |

### 4.4 Engagement
- **Une meute t'engage** si ta boule entre dans son rayon d'aggro : 1 tuile, ou 2 pour une élite.
  C'est une embuscade, et la meute joue en premier.
- **Tu peux engager toi-même** en cliquant sur la meute. Dans ce cas, tu joues en premier.
- **Le niveau du monstre** s'affiche avec une couleur *et* un glyphe : gris (6 niveaux ou plus
  sous toi, aucune XP), vert, jaune, orange, rouge (5 niveaux ou plus au-dessus).
- **Aucune meute ne rejoint un combat en cours.** Pas de renfort surprise (pilier 2).

### 4.5 La tuile devient un plateau
- **Animation.** La tuile se déplie en plateau d'Abalone, en 1,2 s environ. C'est le moment
  signature du jeu. En mouvement réduit, on n'anime qu'un seul plan.
- **Taille et terrain.** Le rayon du plateau dépend du format de combat (section 6.8). Le terrain
  est tiré avec `graine_tuile` et la table du biome (section 5). La même tuile donne donc le même
  plateau, à tout le monde et à chaque fois.
- **Contrainte du générateur.**
  - Aucune case spéciale n'est posée sur une case de départ.
  - En PvP, la position de départ est symétrique (réflexion par rapport à un point).

### 4.6 Combats sur plusieurs tuiles (boss, raids)
- **Un seul plateau, cousu.** Un combat sur plusieurs tuiles se joue sur la réunion des plateaux de
  ces tuiles (pavage, section 4.1). Les cases de part et d'autre d'une couture sont voisines, comme
  partout ailleurs.
- **Aucune règle spéciale.** Tout se fait normalement à travers les coutures : pas en ligne, pas de
  côté, sumito, portée des capacités. Une boule poussée hors de la réunion des plateaux est éjectée.
- **Un tour = 1 Mouvement**, comme d'habitude, n'importe où sur la réunion des plateaux.
- **Caméra.** Une vue d'ensemble dézoomée, puis un zoom sur la région où se trouve le groupe
  sélectionné.

### 4.7 Monde et réseau (P2P façon Diablo)
- **Le monde** est généré à partir d'une graine de version, la même pour tous.
- **L'état du monde** (quêtes, nœuds, coffres) est local à chaque joueur.
- **En groupe (4 joueurs maximum)**, on s'invite par lien ou par code, comme pour le 1v1.
  - Le chef de groupe ne gère que deux choses : qui est connecté, et la position du groupe sur la
    carte.
  - Aucun pair n'a autorité sur le combat (`SPEC.md` §3). Chaque pair valide chaque action dans le
    log signé.
  - La graine d'un combat est tirée par commit-reveal entre les pairs.
- **Présence au hub.** Une salle Trystero publique, en best effort. Elle n'est jamais nécessaire
  pour jouer.

### 4.8 Jour, nuit et météo (v2)
- **Cycle de 40 min réelles**, calculé à partir de l'heure UTC : il est le même pour tous.
- **La nuit :** monstres +10 % de stats, rares en circulation, XP +10 %.
- **La météo**, par zone :
  - pluie : foudre +25 %, feu −25 % ;
  - tempête de sable : portée −1.

---

## 5. Biomes

### 5.1 Types de cases (catalogue commun, une règle par type, un glyphe obligatoire)

| Case | Règle exacte | Glyphe |
|---|---|---|
| Normale | — | — |
| Roc (obstacle) | **Infranchissable** : une boule ne peut ni y entrer, ni y être poussée.<br>**Poussée bloquée** : un Roc juste derrière une file rend la poussée illégale, comme une boule alliée.<br>**Projectiles** : il arrête les projectiles « en ligne » | Bloc hachuré |
| Gouffre | **Une case vide à l'intérieur du plateau** : une boule poussée dedans est éjectée.<br>**Déjà dans le moteur** : `Board::void`, comme les piliers de Ballast | Cercle noir cerclé |
| Glace | **Qui glisse** : une boule poussée, ou qui se déplace seule, et qui entre sur la Glace.<br>**Jusqu'où** : elle glisse dans la même direction tant que la case suivante est de la Glace libre. Elle s'arrête sur la première case qui n'est pas de la Glace (si elle est libre), ou juste avant un obstacle ou une boule.<br>**Ordre** : les boules glissent une par une, en commençant par celle de devant.<br>**Une seule éjection par action** : une fois qu'une boule a été éjectée, les suivantes s'arrêtent au bord.<br>**Groupes** : un groupe de 2 ou 3 qui bouge volontairement ne glisse pas | Flocon |
| Boue | +1 Poids, et aucun mouvement de côté | Vagues épaisses |
| Fourré | −50 % de dégâts sur les capacités lancées à 2 cases ou plus vers la boule qui s'y trouve | Feuilles |
| Hauteur | Les capacités lancées depuis cette case gagnent +1 de portée et +20 % de dégâts | Chevron |
| Pente | **Direction** : la case a une direction.<br>**Poussée** : une poussée dans le sens de la pente compte +1 Poids pour le groupe qui pousse, et −1 dans l'autre sens (minimum 1).<br>**Rotation** : la direction tourne avec la case | Flèche |
| Lave | Une boule qui finit le tour de son entité sur la Lave perd 10 % de ses PV max | Flamme |
| Eau | **Choc** : le Choc reçu est divisé par deux.<br>**Mouillé** : la boule devient Mouillée (la foudre lui fait +50 %).<br>**Feu** : sa Brûlure s'éteint | Gouttes |
| Sables mouvants | **Enracinée** : une boule qui commence son tour dessus est Enracinée.<br>**S'extraire** : elle peut toujours sortir avec un Pas (section 6.3).<br>**Aspirée** : si elle commence 2 tours de suite sur les Sables, elle est éjectée. Le tell s'affiche après le premier tour | Spirale |
| Évent | **Compte à rebours** de N tours, visible.<br>**Effet à zéro** : la boule qui s'y trouve est poussée d'1 case dans la direction gravée. Ça compte comme du terrain avec un tell de 2 tours ou plus : l'éjection est possible | Flèche et chiffre |
| Sanctuaire | Un allié qui finit son tour dessus récupère 5 % de ses PV max et +5 de ressource | Étoile |
| Corruption | **Vitrification** : une boule qui finit son tour dessus gagne 1 cumul de Vitrification (−10 % d'ARM et de RES par cumul, 3 au maximum).<br>**Guérison** : elle en perd 1 par tour passé ailleurs | Fissure |
| Cristal | Une capacité « en ligne » qui touche un Cristal repart une fois sur la case suivante de l'axe | Losange |
| Ronces | Une boule poussée dans la case subit des dégâts égaux à 5 % de ses PV max | Épines |

### 5.2 Les 10 biomes (une zone de niveau chacun, comme dans WoW)

| # | Biome (zone) | Niveaux | Cases spéciales (part) | Règle globale | Ressources | Monstres | Affinité |
|---|---|---|---|---|---|---|---|
| 1 | **Plaines de Lumen** (prairie vitreuse) | 1-10 | Fourré 10 %, Roc 5 % | Aucune. Zone de tutoriel (section 11) | Lin de verre, Fleur-lueur, Fer, Pierre, Bois tendre | Coquilles errantes, Rôdeurs | — |
| 2 | **Sylve de Cendre** (forêt pétrifiée) | 10-20 | Roc (arbres) 10 %, Fourré 20 %, Ronces 5 % | Portée max des capacités −1 | Bois de cendre, herbes, chitine | Mantes, Tisseuses | Assassin |
| 3 | **Tourbières de Suie** (marais) | 15-25 | Boue 25 %, Eau 15 %, Gouffre 3 % | Poison : +1 tour de durée | Champignons, Tourbe, herbes rares | Gonfleurs (explosifs), Noyés | Nécromancien |
| 4 | **Dunes de Verre** (désert) | 20-35 | Sables 10 %, Pente 15 %, Roc 5 % | Ressource gagnée −10 %, sauf pour les capacités de feu | Silice, Or, Sel, cristaux bruts | Scarabées-fouisseurs, Mirages | Mage |
| 5 | **Crêtes de Fer** (montagnes) | 30-45 | Roc 15 %, Pente 25 %, Hauteur 10 % | Bord irrégulier : 0 à 4 cases du bord sont des Gouffres | Fer, Argent, Pierre, Verre-étoile (T3) | Golems, Harpies | Guerrier, Gardien |
| 6 | **Toundra Blanche** (glacier) | 40-55 | Glace 30 %, Roc 5 % | Gelé dure 1 tour de plus | Givre-cristal, chitine épaisse, pêche sous la glace | Ours-coques, Spectres de givre | Chronomancien |
| 7 | **Littoral Mort** (mer de sel) | 45-60 | Eau 30 % | **Marée** : tous les 6 tours, le côté mer du bord (5 cases) devient un Gouffre pendant 2 tours. Tell 2 tours avant | Poissons, Perles, Sel, Algues | Crabes-lest, Sirènes | Guérisseur |
| 8 | **Caldeira** (volcan) | 55-70 | Lave 15 %, Évent 5 %, Roc 10 % | Brûlure +50 % | Obsidienne, Soufre, Orichalque (T4) | Salamandres, Forgés | Mage, Guerrier |
| 9 | **Terres Vitrifiées** (cœur du gisement) | 70-85 | Corruption 20 %, Gouffre 8 %, Cristal 10 % | Une boule qui meurt laisse une case Corruption | Scorie-mère (T5), Essences | Vitrifiés, Échos | Nécromancien, Géomancien |
| 10 | **Le Puits** (abysses) | 85-100 | Un mélange, plus des Éboulements (une case devient Roc, tell 1 tour avant) | Obscurité : portée −1, sauf sur un Sanctuaire | T5, gemmes parfaites | Abominations, Chœurs perdus | Toutes |
| H | **Le Ballast** et les avant-postes | — | Pas de combat, sauf les duels et l'arène | — | — | — | — |

**Affinité de biome.** Sur son biome, une classe affine génère +10 % de ressource. Le Géomancien,
en plus, tire sa ressource du terrain (section 8.8).

### 5.3 Monstres

**Archétypes.** Comme les classes, en plus simple : 1 ou 2 capacités chacun.

| Archétype | Profil | Multiplicateurs |
|---|---|---|
| Brute | Lourde | PV ×1,3, ATQ ×1,1, Poids 2 |
| Rôdeur | Frappe les boules isolées | ATQ ×1,3, PV ×0,8, VIT +5 |
| Lanceur | À distance | PUI ×1,3, PV ×0,7 |
| Chaman | Soigne, pose des boucliers | PUI ×1,1, RES ×1,3 |
| Bâtisseur | Pose des Rocs | ARM ×1,3 |
| Explosif | À sa mort, repousse ses voisins d'1 case, sans éjection | PV ×0,6 |
| Porteur | Bouclier frontal | ARM ×1,6, Poids 2 |
| Invocateur | — | PUI ×1,2, PV ×0,8 |

**Stats d'un monstre** de niveau L = stats de base d'un héros de niveau L (section 7.2) ×
archétype × rareté.

| Rareté | Facteur de stats | Menace |
|---|---|---|
| Sbire | ×0,5 | 0,5 |
| Normal | ×0,7 | 1 |
| Champion (bleu, 1 affixe) | ×1,0 | 2 |
| Élite (jaune, 2 ou 3 affixes, PV ×3) | ×1,5 | 4 |
| Rare nommé (réapparaît après 30 min) | — | — |
| Boss | Sur mesure | — |

**Budget de menace d'une rencontre.**
- Escarmouche : 6.
- Élite : 12 (1 élite et des sbires).
- Salle de donjon : 14.

**Affixes d'élite** (comme dans Diablo 3 et 4) :
- Blindé : +50 % d'ARM.
- Massif : +1 Poids.
- Givrant : laisse de la Glace derrière lui.
- Brûlant : laisse de la Lave.
- Vampirique.
- Écho : rejoue tes Mouvements en miroir, comme The Echo.
- Pilier : Inamovible (section 6.11), mais ne bouge pas.
- Grappin.
- Bouclier.
- Invocateur.
- Explosif.
- Téléporteur.

**IA.** Elle agit toujours dans le même ordre :
1. **Action.** Choisie par une liste de priorités, comme une rotation de WoW. Elle ne regarde que
   les 3 meilleures cibles selon une heuristique.
2. **Mouvement.** Alpha-bêta sur l'état du combat, avec un budget en nœuds (jamais en temps).
3. **Action rapide.**

Les monstres affichent toujours leur **intention** pour leurs capacités majeures : la capacité et sa
cible, comme dans Slay the Spire.

---

## 6. Combat RPG sur le plateau

### 6.0 Glossaire (FINAL une fois validé)

| Terme | Sens |
|---|---|
| **Entité** | Un joueur (son héros, ses Fragments, ses Revenants) ou une meute IA (un chef et ses monstres). Une entité ne déplace que ses propres boules |
| **Camp** | Un groupe d'entités alliées |
| **Tour** | Le tour d'une entité |
| **Round** | Chaque entité vivante a joué une fois |
| **Mouvement** | Le coup d'Abalone : un groupe de 1 à 3 boules, une direction |
| **Pas** | Une boule, une case, sans poussée, jamais hors du plateau ni sur un obstacle |
| **Perte** | Une boule morte ou éjectée qui compte pour la déroute |
| **Action, Action rapide, Préparation** | Les emplacements d'action d'un tour (section 6.3) |
| **Tell** | Une menace annoncée à l'avance, visible par tous |
| **Intention** | La prochaine capacité majeure d'un monstre, et sa cible |

### 6.1 Déroulé d'un combat
1. **Déclenchement** (section 4.4), puis génération du plateau (section 4.5).
2. **Placement**, comme dans Dofus.
   - On choisit une formation parmi 3 : Ligne, Coin, Flèche. Chacune est un sous-ensemble du
     placement standard.
   - On peut ensuite échanger le héros avec un Fragment de départ.
   - En PvP, le placement dure 20 s.
3. **Initiative.**
   - Hors PvP, c'est le camp qui engage qui joue en premier.
   - En PvP, c'est le héros avec la plus haute VIT. En cas d'égalité, on départage avec la graine
     du combat, tirée par commit-reveal.
4. **Tours** (sections 6.2 et 6.3), jusqu'à la victoire (section 6.7).
5. **Fin du combat.**
   - On reçoit l'XP et le butin.
   - Les recharges et les ressources sont remises à zéro.
   - Les Fragments perdus reviennent : il n'y a aucune perte permanente.

### 6.2 Ordre des tours
- **En solo**, deux entités jouent en alternance stricte, comme dans Abalone.
- **En groupe**, la rencontre fait apparaître **une meute par joueur**. Le niveau de chaque meute est
  le plus haut des deux valeurs : le niveau minimum de la zone, ou le niveau de son joueur.
  - **Ordre des tours :** les camps alternent, comme une frise à la Dofus : J1, M1, J2, M2, etc.
  - **Dans un camp**, l'ordre suit la VIT du héros, ou du chef pour une meute.
  - **Les boules alliées** (d'une autre entité du même camp) bloquent une poussée comme les tiennes.
    Elles ne poussent jamais avec toi.
- **Chaque entité a ses propres** ressources, recharges et durées. Elles avancent à son tour.

### 6.3 Structure exacte d'un tour

**Début du tour**
1. L'entité gagne sa ressource (section 8).
2. Ses recharges baissent de 1.
3. Les effets « début de tour » s'appliquent : dégâts sur la durée, Sables, Évents.

**Phase d'action** (l'ordre est libre)
- **1 Mouvement.** Il est obligatoire s'il existe un coup légal (on garde le zugzwang d'Abalone).
  Sinon, l'entité passe son Mouvement.
- **1 Action.** Une capacité de type Action, ou l'ultime.
- **1 Action rapide.** Une capacité Rapide, un consommable, ou une **Préparation**.

**Fin du tour**
1. Les effets « fin de tour » s'appliquent : Lave, Sanctuaire, Corruption.
2. Les durées des statuts **que porte cette entité** baissent de 1.
3. On vérifie la victoire.

**Exemple d'ordre libre :** Action, puis Mouvement, puis Action rapide.

**Précisions**
- **Durées.** Un statut qui dure « N tours » s'applique jusqu'à la fin du N-ième tour de l'entité
  qui le *subit*. Un Gelé « 1 tour » prive donc bien la cible d'un tour.
- **Recharge N.** La capacité est indisponible pendant tes N prochains tours. Avec une recharge de
  0, elle est utilisable une fois à chaque tour.
- **Pas bonus.** On a droit à **1 Pas bonus par tour au maximum**, toutes sources confondues
  (capacités, runes). Les déplacements de soi par une capacité (Charge, Clignement, Pas de l'ombre,
  Danse des lames) ne comptent pas comme Pas bonus. Ils ne poussent jamais et ne sortent jamais du
  plateau.
- **Préparation.** C'est une réaction armée, publique et visible.
  - Elle se déclenche toute seule pendant le tour adverse, sans demander l'avis du joueur. Ça
    convient au P2P.
  - On peut en avoir 2 armées au maximum.
  - Elles se déclenchent dans l'ordre où on les a armées.
  - Une Préparation ne se déclenche jamais à cause de l'effet d'une autre Préparation : pas de
    réaction en chaîne.
- **Résolution atomique.** L'état du combat est vérifié après chaque effet élémentaire. Une boule à
  0 PV disparaît aussitôt, et la victoire est vérifiée à ce moment-là. Si les deux héros d'un
  combat en 1 contre 1 meurent par le même effet, c'est l'entité active qui perd.

### 6.4 Poussée pondérée (le seul changement au sumito)
- Chaque boule a un **Poids** entier de 1 à 5, affiché par des pastilles.
- Un groupe de `n` boules en ligne pousse une file adverse de `m` boules si, et seulement si :
  1. `n > m`. C'est la règle classique, qu'on ne touche pas.
  2. La somme des Poids du groupe est strictement plus grande que celle de la file. On compte la
     Pente et les bonus.
  3. La case qui suit la file est vide ou hors du plateau. Une boule de son camp, un Roc ou une
     boule Inamovible juste derrière rendent la poussée illégale.
- **Invariant (FINAL proposé).** Si tous les Poids valent 1, la condition 2 revient à `n > m`. On
  retrouve exactement l'Abalone classique. Un test de propriété le vérifie (même perft, mêmes
  parties aléatoires).
- **Le Poids sert surtout à se défendre.** Une boule lourde résiste aux petits groupes. À l'attaque,
  il permet de percer une défense lourde. Seules les capacités qui le disent en toutes lettres
  poussent à nombre égal : Percée, Avalanche.
- On reste à 3 boules par groupe, et un mouvement de côté ne pousse jamais.
- L'aperçu affiche le compte : « 2 contre 1 · Poids 4 contre 3 ».
- **Exemples pour `rules.md` :**
  - Un Guerrier (Poids 3) seul contre un Fragment (Poids 1) : illégal, car 1 n'est pas plus grand
    que 1.
  - Guerrier (Poids 3) + Fragment (Poids 1) contre un Gardien seul (Poids 3) : légal, car 2 > 1 et
    4 > 3.
  - Deux Fragments (Poids 2 en tout) contre un Gardien seul (Poids 3) : illégal. Le Poids défend.
  - Trois Fragments contre deux Fragments : légal, comme en Abalone classique.
  - Trois Fragments contre un Guerrier seul qui est sur la Boue (Poids 4) : illégal.
  - Avec Percée : Guerrier + Fragment (Poids 4) contre deux Fragments (Poids 2) devient légal, à
    2 contre 2.

### 6.5 Dégâts (déterministes, en entiers)

**Types de dégâts**
- **Physique**, réduit par l'ARM.
- **Magique**, réduit par la RES.
- **Pur**, jamais réduit.
- Les éléments (Feu, Givre, Foudre, Ombre, Lumière, Temps) ne sont que des **étiquettes de
  synergie**. Il n'existe pas de résistance par élément.

**Formule**

`Dégâts = max(1, ⌊(Base + Ratio × Stat) × K / (K + Défense) × (1 + Σbonus)⌋)`

- `Stat` vaut l'ATQ ou la PUI ; `Défense` vaut l'ARM ou la RES.
- `K = 100 × g(niveau de l'attaquant)`, avec `g(L) = 1 + 0,09 × (L − 1)`. La réduction reste donc
  la même du niveau 1 au niveau 100. C'est la formule d'armure de LoL, ajustée au niveau.
- Les calculs se font en entiers et en points de base, dans un ordre fixe (section 24.1).

**Choc (dégâts physiques d'une poussée)**
1. Le déplacement est résolu d'abord.
2. Ensuite, la première boule de la file subit 100 % de l'ATQ de la boule de tête du groupe.
3. Les autres boules de la file subissent 50 %.

Une boule éjectée ne subit pas de Choc : elle est déjà perdue. Un mouvement de côté ne fait pas de
Choc.

**Modificateurs de position**
- **Isolement** (le « critique » déterministe) : une boule sans aucun allié adjacent subit +25 % de
  dégâts.
- **Formation** : −10 % de dégâts subis par allié adjacent, jusqu'à −30 %. La cohésion d'Abalone
  devient une règle de combat.
- **Écart de niveau** : ±5 % de dégâts par niveau d'écart, plafonné à ±25 %. Désactivé en PvP
  normalisé.

**Garde du héros**
Une seule capacité ne peut pas retirer à un héros plus de 35 % de ses PV max, après réductions. Ça
empêche de tuer un héros d'un seul coup.

### 6.6 Mort, éjection, héros, Cimetière, Revenants

**0 PV**
- La boule disparaît aussitôt : elle se fend puis s'effrite (400 ms).
- Elle laisse une **Dépouille** sur sa case. Une Dépouille ne bloque rien.

**Éjection d'une boule ordinaire**
- La boule meurt aussitôt, quels que soient ses PV. C'est l'esprit d'Abalone.

**Le héros : beaucoup de risque, beaucoup de gain (FINAL, ton choix)**
- Un héros éjecté meurt sur le coup, comme une boule ordinaire.
- Un héros mort, à 0 PV ou éjecté, fait perdre son entité, aussitôt.
- En contrepartie, le héros est la pièce la plus forte du plateau : il a les stats les plus hautes,
  c'est de lui que partent les capacités, et il a le Poids de sa classe.
- **Ce qui garde la règle lisible et jouable :**
  - **Alerte « Danger du bord »** : un glyphe s'affiche sur le héros dès qu'une poussée adverse
    légale pourrait l'éjecter au prochain tour. Le calcul se fait avec `legal_moves`, et l'info est
    publique, donc l'adversaire la voit aussi.
  - **Garde du héros** (6.5) : une seule capacité ne peut pas lui retirer plus de 35 % de ses PV
    max.
  - **Des réponses de classe** : Ancrage, Forteresse et Interposition (Gardien), Transfert et Aube
    (Guérisseur), Instant suspendu et Stase (Chronomancien), Pont (Géomancien), Insaisissable
    (Assassin).
  - **La Formation** protège le héros quand l'escouade l'entoure.
- Les boss sont Résilients ou Inéjectables (section 18). Les chefs de meute d'élite ont +1 Poids.

**Les Pertes**
- Une mort et une éjection valent toutes deux une Perte.

**Le Cimetière**
- C'est la liste ordonnée des boules perdues. Pour chacune : son identifiant, son camp, ses stats
  d'origine, la cause (mort ou éjection) et le tour.
- **Chaque entrée ne peut être relevée qu'une seule fois.**

**Les Revenants** (section 8.6)
- Un Revenant est une boule relevée par le Nécromancien.
- Quand il disparaît :
  - il ne laisse pas de Dépouille ;
  - il ne compte pas comme une Perte ;
  - il ne donne ni Essence, ni Moisson ;
  - il ne remet aucun compteur à zéro.
- **Règle du score** : relever une boule ne rend jamais la Perte à son camp d'origine.

### 6.7 Victoire, défaite, fuite, anti-blocage
- **Déroute.** Une entité est mise en déroute quand ses Pertes atteignent son seuil (section 6.8).
  Elle quitte alors le plateau, et toutes ses boules disparaissent.
- **Héros mort (0 PV ou éjecté).** Son entité est vaincue et quitte le plateau. En solo, c'est la
  défaite.
- **Mort du chef de meute.** Le reste de la meute fuit.
- **Fin du combat.** Un camp perd quand toutes ses entités ont quitté le plateau.
- **Objectifs spéciaux.** Escorter une boule PNJ, survivre N tours, ou tenir des cases.
- **Fuite (hors boss, PvP et BR).**
  - Le héros doit commencer son tour sur le bord, sans ennemi adjacent.
  - La fuite est une **Canalisation d'1 tour**, à la place de son Mouvement.
  - Au début de son tour suivant, il quitte le plateau avec son escouade.
  - On ne gagne aucune récompense, et l'équipement perd 5 % de durabilité.
  - Si on le pousse ou on le déplace avant, la fuite est interrompue.
- **Anti-blocage.**
  - La triple répétition reste un match nul (elle se déclenche rarement : l'état compte aussi les
    PV, les recharges et les ressources).
  - **60 tours d'entité sans Perte** : match nul. Remplace les « 100 demi-coups » de `rules.md` §9.
  - **Usure**, à partir du tour 20 de chaque entité (12 en escarmouche) : les soins reçus baissent
    de 10 % par tour, jusqu'à −80 %.
  - **Brèche**, à partir du tour 30 (18 en escarmouche) :
    - l'anneau extérieur se fissure, avec un tell de 2 tours, puis devient un Gouffre ;
    - ensuite, un nouvel anneau tous les 5 tours, jusqu'au rayon 2 ;
    - c'est la mécanique de The Hull et de la battle royale.
  - **Match nul en escarmouche** : les deux camps battent en retraite, sans XP.
  - **Match nul contre un boss** : c'est une défaite (FINAL existant).

### 6.8 Formats de combat

**En solo**

| Format | Plateau | Boules du joueur | Ennemis | Seuil de déroute | Durée visée |
|---|---|---|---|---|---|
| Escarmouche | rayon 3 (37 cases) | héros + 5 | menace 6 (4 à 7 boules) | 3 | 2 à 4 min |
| Élite | rayon 4 (61 cases) | héros + 8 | menace 12 | 4 | 4 à 6 min |
| Salle de donjon | rayon 4 | héros + 10 | menace 14 | 5 | 4 à 7 min |
| Boss, PvP, arène | rayon 4, ou plusieurs tuiles | héros + 13 (14 boules, comme en Abalone) | 14, ou le boss | 6 (comme en Abalone) | 8 à 15 min |
| Battle royale | rayon 8 | héros + 9 (10 boules, la spec BR existante) | 5 joueurs | — (le héros meurt ou est éjecté, ou il ne reste aucune boule) | 15 à 25 min |

**En groupe** (une meute par joueur, chaque meute à sa menace solo)

| Format | Duo | Trio | Quatuor |
|---|---|---|---|
| Escarmouche | rayon 4, héros + 4 chacun | rayon 4, héros + 3 | rayon 4, héros + 3 |
| Élite et donjon | rayon 4, héros + 6 | rayon 5, héros + 5 | rayon 5, héros + 4 |
| Boss | rayon 5, héros + 8 | 2 tuiles, héros + 6 | 2 ou 3 tuiles, héros + 5 |
| Raid | — | — | 3 à 7 tuiles, héros + 6 |

En groupe, le seuil de déroute de chaque entité vaut 40 % de ses boules, arrondi au-dessus.

### 6.9 L'escouade : les Fragments
- Ce sont des éclats de verre du héros (c'est cohérent avec le lore).
- **Stats dérivées du héros :**
  - 40 % de ses PV ;
  - 50 % de son ATQ ;
  - 50 % de son ARM et de sa RES ;
  - Poids 1 ;
  - aucune PUI, aucune capacité.
- **Bonus :** l'Étendard (section 12) et le trait de la classe (section 8).
- **Portée des capacités.** Elle se mesure depuis le héros, sauf pour les capacités marquées
  « Escouade ». Le placement du héros est donc la clé du combat, comme Kerrigan dans SC2 ou les
  héros de Warcraft 3.

### 6.10 Langage des capacités (primitives, entièrement en données)

**Ciblage**

| Ciblage | Description |
|---|---|
| Soi | Le héros |
| Adjacent | Une case voisine du héros |
| Cible | Une boule ou une case à portée hexagonale, sans ligne de vue |
| En ligne | Le long d'un des 3 axes, à partir du héros ; s'arrête sur la première boule ou le premier obstacle |
| Zone | Un rayon r autour d'une case |
| Groupe | 1 à 3 boules alignées |
| Plateau | Tout le plateau |

**Effets (12 primitives)**

| Primitive | Description |
|---|---|
| Dégâts | — |
| Soin | — |
| Bouclier | — |
| Déplacement forcé | Pousser, attirer, téléporter, échanger, glisser |
| Modif de stat | Pour une durée |
| Statut | Voir section 6.11 |
| Terrain | Créer ou changer une case, pour une durée |
| Invocation | — |
| Réanimation | — |
| Marque | Un déclencheur différé |
| Ressource | Gagner ou voler de la ressource |
| Tour | Un Pas bonus, ou restreindre le tour adverse |

**Limites d'éjection** (FINAL proposé ; elles prolongent la règle « une éjection par coup au
maximum » de `rules.md` §5)
1. **Une éjection au maximum par action.** Une action, c'est un Mouvement, une capacité, un
   consommable, ou un effet de terrain venu d'une seule source.
   - Si une capacité marquée Éjecteur pourrait éjecter plusieurs boules, son lanceur choisit
     laquelle.
   - Les autres boules s'arrêtent sur la dernière case du plateau.
2. **Exception : le terrain avec un tell d'au moins 2 tours** (Brèche, Marée, Séisme, Évent, Pont
   qui expire). Il peut retirer plusieurs boules, parce qu'on a deux tours pour fuir.
3. **Règle d'or des déplacements forcés.** Une capacité sans le mot-clé **Éjecteur** ne sort jamais
   une boule du plateau. Ça vaut aussi pour une glissade sur la Glace qu'elle provoque. La boule
   s'arrête sur la dernière case du plateau et subit un Choc. Les capacités Éjecteur sont des
   ultimes, ou ont un tell.

**Contrôles de masse.** Un contrôle dur en zone (Étourdi, Gelé) touche **3 boules au maximum**,
choisies par le lanceur.

**Ordre de résolution des effets à plusieurs cibles.**
1. Du plus proche du point d'origine au plus loin.
2. Puis dans l'ordre fixe des cases : r croissant, puis q croissant.

**Fiche de chaque capacité.** Chaque capacité indique :
- son type : Action, Rapide ou Préparation ;
- son coût et sa recharge (en tours de son entité) ;
- sa portée et son ciblage ;
- son effet, chiffré ;
- son **contre-jeu**, écrit noir sur blanc.

**Canalisation.** C'est une règle universelle, inspirée de la concentration de BG3 : une capacité
canalisée est interrompue si la boule qui la canalise est poussée ou déplacée. C'est
l'interruption naturelle d'Abalone.

### 6.11 Statuts et mots-clés

**Mots-clés de déplacement**

| Mot-clé | Effet exact |
|---|---|
| **Inamovible** | Rien ne peut la déplacer, ni elle-même, ni un effet. Une file qui la contient ne peut pas être poussée, et elle bloque comme un Roc |
| **Inéjectable** | On peut la pousser, mais une poussée ou un effet qui l'éjecterait est illégal. Ne se cumule pas. La boule ne peut plus redevenir Inéjectable pendant les 2 tours qui suivent (Lassitude) |

**Statuts**

| Statut | Effet exact |
|---|---|
| Ancré | Inamovible |
| Stase | Inamovible, ne peut pas être ciblée et ne peut pas agir |
| Insaisissable | Inamovible ; esquive la prochaine capacité à cible unique ; peut agir, mais pas se déplacer d'elle-même |
| Enraciné | Ne se déplace pas de son plein gré, mais peut être poussé |
| Étourdi | Ne peut pas être sélectionné ; ni capacité, ni Préparation |
| Gelé | Étourdi, avec +30 % d'ARM |
| Silence | Le héros ne lance aucune capacité |
| Aveuglé | Ne peut pas être la tête d'une poussée |
| Provocation | Les capacités à cible unique de l'adversaire doivent viser la boule provocante si elle est à portée |
| Saignement, Poison, Brûlure | Des dégâts au début du tour. Le Poison divise aussi les soins reçus par 2 |
| Alourdi / Allégé | Poids ±1 ou ±2, borné entre 1 et 5 |
| Marqué | Les prochains dégâts subis augmentent de X % |
| Bouclier | Absorbe X dégâts |

**Rendements décroissants**

Les contrôles sont regroupés en **catégories**. Après un contrôle, la cible est immunisée contre
toute sa catégorie pendant 2 tours.

| Catégorie | Statuts |
|---|---|
| Dur | Étourdi, Gelé, Stase (quand un adversaire la pose) |
| Mobilité | Enraciné |
| Lancer | Silence, Aveuglé |

Une réaction élémentaire (section 8.5) qui produit un Étourdi est bloquée par cette immunité.

**Ténacité.** Elle réduit d'1 tour les contrôles de 2 tours ou plus.

### 6.12 Entre deux combats : défaite, nouvel essai, reprise
- **Défaite dans le monde.**
  - Le héros repart à sa dernière Balise.
  - L'équipement perd 10 % de durabilité.
  - On ne perd pas d'XP.
  - La meute récupère tous ses PV.
- **Défaite contre un boss de donjon.**
  - On recommence aussitôt (en moins de 5 s), devant le boss, avec la même graine. C'est l'esprit
    souls-like qu'on garde.
  - Le compteur d'essais et la télémétrie réutilisent `encounter/telemetry.rs`.
- **Reprise après rechargement de la page.**
  - L'état du combat est sauvegardé après chaque action, dans IndexedDB (store `combat`), sur le
    modèle de `savegame.ts`.
  - En ligne, on rattrape le retard avec le log de coups (#226).

---

## 7. Statistiques

### 7.1 Liste et règle sur le plateau

| Stat | Rôle | Règle sur le plateau |
|---|---|---|
| PV | Points de vie | À 0, la boule disparaît (6.6) |
| ATQ (Attaque) | Dégâts physiques | Choc de poussée (6.5), capacités physiques |
| PUI (Puissance) | Dégâts magiques, soins, boucliers | Ratio des capacités |
| ARM (Armure) | Défense physique | `K/(K+ARM)` |
| RES (Résistance) | Défense magique | `K/(K+RES)` |
| POI (Poids, de 1 à 5) | Masse | Poussée pondérée (6.4) : surtout pour résister, parfois pour percer |
| VIT (Vitesse) | Tempo | Initiative (6.1, 6.2). Au-delà de 10, +1 % de ressource gagnée par tranche de 2 VIT. +0,5 % de vitesse de déplacement dans le monde par point |
| Hâte (objets) | Recharges | Par tranche de 25 : −1 tour sur les recharges de 3 tours ou plus (au moins 1 tour). **Plafond : −2 tours au total. Ne touche jamais les ultimes** |
| Ténacité (objets, runes) | Résistance aux contrôles | 50 ou plus : les contrôles de 2 tours ou plus durent 1 tour de moins |
| Vol de vie (objets) | Survie | Un pourcentage des dégâts infligés rendu en PV |
| Chance, Rendement (outils) | Hors combat | Section 14 |

**Le Lest contre la Vitesse.** Chaque point de Poids au-dessus de la base de la classe retire
3 VIT. Les objets donnent **+1 Poids au plus, en tout**. C'est l'arbitrage central : un tank lourd
est lent, un assassin léger peut être éjecté.

### 7.2 Croissance par niveau
- **Héros de base, niveau 1 :** PV 120, ATQ 12, PUI 12, ARM 20, RES 20, VIT 10. Le Poids dépend de
  la classe (section 8.0).
- **Par niveau :**
  - PV, ATQ, PUI, ARM et RES sont multipliées par `g(L) = 1 + 0,09 × (L − 1)`, soit environ ×10
    au niveau 100.
  - VIT : +0,1 par niveau.
  - Le Poids ne monte jamais avec le niveau.
- **Les multiplicateurs de classe** sont dans la section 8.0. L'équipement ajoute de +0 % au niveau
  1 jusqu'à environ +120 % en fin de jeu.
- `stats.md` contiendra un tableau qui compare un Gardien et un Assassin aux niveaux 1, 50 et 100.

---

## 8. Classes (8 au lancement, 4 plus tard)

### 8.0 Vue d'ensemble

| Classe | Rôle | Ressource | Mécanique unique | Poids | Multiplicateurs | Difficulté |
|---|---|---|---|---|---|---|
| Gardien | Tank, contrôle de zone | Rempart (gagné en encaissant) | Ancrage, interdire l'éjection | 3 | PV ×1,3 ; ARM et RES ×1,5 ; ATQ ×0,8 | ★ |
| Guerrier | Combattant, poussée | Rage (gagnée en poussant) | Poussée à nombre égal, écrasement, poussée à 4 boules | 3 | PV ×1,15 ; ATQ ×1,3 | ★ |
| Assassin | Dégâts en rafale, mobilité | Énergie et points de combo | Téléportation, exécution des boules isolées | 1 | ATQ ×1,4 ; PV ×0,8 ; VIT +5 | ★★★ |
| Guérisseur | Soutien | Foi (mana) | Soins, échange de places, lien vital | 2 | PUI ×1,3 ; RES ×1,2 | ★★ |
| Mage | Dégâts à distance, éléments | Mana et Surchauffe | Réactions élémentaires, glace qui fait glisser | 1 | PUI ×1,4 ; PV ×0,85 | ★★ |
| Nécromancien | Invocateur, usure | Essence (gagnée sur les morts) | Relever les boules mortes ou éjectées, des deux camps | 2 | PUI ×1,25 | ★★★ |
| Chronomancien | Contrôle du tempo | Grains de sable (charges de 0 à 6) | Ramener le plateau en arrière, brider le tour adverse | 1 | PUI ×1,2 ; VIT +3 | ★★★ |
| Géomancien | Contrôle du terrain | Strates (gagnées sur le terrain) | Créer, détruire et faire tourner des cases | 2 | PUI ×1,15 ; ARM ×1,2 | ★★ |

**Lire une capacité.** Chaque capacité indique : Type, Coût, Recharge (CD, en tours), Portée,
l'effet, puis son contre-jeu.

**Déblocage.**
- Les capacités 1, 2, 5 et 6 forment le palier 1 (niveau 5).
- Les capacités 3, 4, 7 et 8 forment le palier 2 (niveau 15, avec 2 points dans la branche).
- Les ultimes demandent le niveau 30 et 4 points dans la branche.

**Rangs.** Les rangs 2 et 3 de chaque capacité sont expliqués en section 10. Les variantes
détaillées des 80 capacités iront dans `rpg/classes.md`.

### 8.1 Gardien (lignée de l'Ancre)

*Le verre a fusionné avec le lest du vaisseau.*

- **Ressource : Rempart** (de 0 à 100, départ à 0).
  - +5 à chaque tour.
  - +10 à chaque fois qu'une boule alliée subit des dégâts ou est poussée.
  - Ne baisse jamais.
- **Trait « Sentinelle » :** les alliés adjacents au héros ont +15 % d'ARM et de RES.
- **Escouade :** les Fragments ont +20 % de PV.

**Branche Bastion**
1. **Ancrage** (Rapide, 20, CD 3, portée 2)
   - Effet : un allié devient Ancré jusqu'à ton prochain tour.
   - *Contre :* contourner la boule, ou la frapper avec des dégâts magiques.
2. **Provocation** (Action, 20, CD 3, rayon 2)
   - Effet : Provocation sur les ennemis touchés, pendant 1 tour.
   - *Contre :* utiliser des capacités de zone.
3. **Interposition** (Préparation, 25, CD 3, portée 2)
   - Effet : la prochaine capacité ennemie qui vise l'allié choisi touche le héros à la place.
   - *Contre :* l'appâter avec une petite capacité.
4. **Mur de boucliers** (Action, 30, CD 4, portée 3)
   - Effet : 3 cases vides alignées deviennent un Roc allié pendant 2 tours.
   - *Contre :* attendre la fin, ou passer par un autre axe.

**Ultime : Forteresse** (Action, 80, CD 8)
- Effet : toutes les boules alliées sont Inéjectables pendant 1 tour (Lassitude ensuite).
- *Contre :* gagner par les dégâts plutôt que par l'éjection.

**Branche Représailles**
5. **Coup de bouclier** (Action, 15, CD 1, adjacent)
   - Effet : 80 % de l'ATQ. La cible recule d'1 case si la case est libre (sans éjection).
6. **Épines** (Rapide, 20, CD 3)
   - Effet : pendant 2 tours, chaque boule de tête qui pousse une file alliée adjacente au héros
     subit 60 % de la PUI.
7. **Bélier** (Rapide, 30, CD 3)
   - Effet : si le héros fait partie du groupe, ta prochaine poussée de ce tour compte +2 Poids.
8. **Chaîne d'ancre** (Action, 25, CD 3, en ligne, portée 3)
   - Effet : attire d'1 case vers le héros la première boule ennemie de la ligne.

**Ultime : Séisme du Lest** (Action, 80, CD 8, Éjecteur)
- Effet : les ennemis dans un rayon de 2 subissent 100 % de l'ATQ et reculent d'1 case en
  s'éloignant du héros. Au plus 1 éjection, choisie par le lanceur.
- *Contre :* ne pas se coller au héros près du bord.

### 8.2 Guerrier (lignée du Bélier)

*Les mineurs du front de taille.*

- **Ressource : Rage** (de 0 à 100).
  - +15 par poussée réussie.
  - +10 quand le héros perd au moins 10 % de ses PV max en un coup.
  - +25 par Perte infligée.
  - −10 à chaque tour sans poussée.
- **Trait « Élan » :** quand le héros mène une poussée (il est la tête du groupe), le Choc fait
  +50 %.
- **Escouade :** les Fragments ont +10 % d'ATQ.

**Branche Assaut**
1. **Charge** (Action, 0, CD 2)
   - Effet : le héros avance seul en ligne, jusqu'à 2 cases vides. Si un ennemi est juste après,
     il subit un Choc de 100 % de l'ATQ, sans être poussé. Le héros gagne +20 Rage.
   - *Contre :* garder une case d'écart.
2. **Fendoir** (Action, 25, CD 1, adjacent)
   - Effet : 120 % de l'ATQ, et +50 % de plus sur une boule Isolée.
3. **Percée** (Rapide, 30, CD 3)
   - Effet : ta prochaine poussée de ce tour est légale **à nombre égal** (`n = m`), tant que le
     Poids reste strictement supérieur.
   - *Contre :* ajouter du Poids (Boue, Ancrage).
4. **Cri de guerre** (Rapide, 20, CD 4, rayon 2)
   - Effet : les alliés gagnent +20 % d'ATQ pendant 2 tours. Les ennemis perdent 1 Poids pendant
     1 tour.

**Ultime : Avalanche** (Action, 100, CD 8)
- Effet : ce tour, ton Mouvement peut être **un groupe de 4 boules**, en ligne uniquement, qui
  pousse une file de 3 boules au plus. Le Choc est doublé, et la poussée éjecte au plus une boule.
- *Contre :* la Rage du Guerrier est visible. Quand elle est pleine, reste loin du bord.

**Branche Brute**
5. **Tourbillon** (Action, 40, CD 3)
   - Effet : 70 % de l'ATQ à chaque ennemi adjacent.
6. **Peau de fer** (Rapide, 30, CD 4)
   - Effet : un bouclier de 30 % des PV max et +1 Poids, pendant 2 tours.
7. **Écrasement** (Action, 35, CD 3)
   - Effet : pousse une file contre un obstacle ou une boule, ce qui est normalement illégal. Rien
     ne bouge, mais la boule coincée subit 150 % de l'ATQ.
8. **Exécution** (Action, 50, CD 4, adjacent)
   - Effet : 200 % de l'ATQ sur une boule qui a moins de 30 % de ses PV. Si elle meurt, +25 Rage.

**Ultime : Titan** (Rapide, 100, CD 9)
- Effet : pendant 2 tours, le héros passe à Poids 5 et devient Inamovible. Chaque boule qu'il
  pousse prend un Choc à +100 %.
- *Contre :* le contourner et viser son escouade.

### 8.3 Assassin (lignée de l'Éclat)

*Le verre tranchant.*

- **Ressource : Énergie** (de 0 à 100, +30 par tour, fixe).
- **Points de combo** (de 0 à 5) : les capacités génératrices en donnent, les finisseurs les
  consomment tous. Comme le voleur de WoW.
- **Trait « Opportuniste » :** +30 % de dégâts sur les boules Isolées.
- Poids 1 : l'Assassin peut être éjecté facilement. C'est le prix de sa mobilité.

**Branche Lames**
1. **Entaille** (Action, 25, CD 0, adjacent)
   - Effet : 90 % de l'ATQ, Saignement (20 % de l'ATQ, 2 tours), +1 combo.
2. **Pas de l'ombre** (Rapide, 30, CD 2, portée 3)
   - Effet : téléporte le héros sur une case vide adjacente à un ennemi, +1 combo.
   - *Contre :* rester en Formation, sans case vide autour.
3. **Éventration** (Action, 35, CD 1, finisseur)
   - Effet : 50 % de l'ATQ par point de combo. Si la cible meurt, 2 combos sont rendus.
4. **Lame empoisonnée** (Rapide, 20, CD 3)
   - Effet : les 3 attaques suivantes appliquent un Poison (20 % de la PUI, 3 tours).

**Ultime : Danse des lames** (Action, 60, CD 8)
- Effet : le héros saute de case vide en case vide et frappe jusqu'à 4 ennemis à portée 3, pour
  120 % de l'ATQ chacun. Il finit à côté de la dernière cible.

**Branche Ombres**
5. **Croc-en-jambe** (Rapide, 25, CD 3, adjacent)
   - Effet : −2 Poids pendant 1 tour (minimum 1). Prépare une poussée de l'escouade.
6. **Insaisissable** (Rapide, 30, CD 4)
   - Effet : le héros est Insaisissable jusqu'à ton prochain tour.
7. **Fumigène** (Action, 40, CD 4, zone de rayon 1)
   - Effet : pendant 2 tours, les alliés dans la zone ne peuvent pas être ciblés à portée 2 ou plus.
     La zone reste visible.
8. **Marque de mort** (Rapide, 20, CD 4, portée 4)
   - Effet : la cible est Marquée (+20 % de dégâts subis) pendant 3 tours. Si elle meurt, +50
     Énergie.

**Ultime : Assassinat** (Action, 60 Énergie et 5 combos, CD 9, portée 5)
- Effet : téléportation au contact de la cible, puis 300 % de l'ATQ, ou 400 % si elle est Isolée.
  Contre un héros, la Garde (35 % des PV max) s'applique. Si la cible meurt, le héros devient
  Insaisissable pendant 1 tour.
- *Contre :* garder son héros en Formation.

### 8.4 Guérisseur (lignée de la Lueur)

*La lumière intérieure.*

- **Ressource : Foi** (de 0 à 100, départ à 50, +15 par tour).
- **Lumière accumulée :** le soin en trop devient un bouclier, jusqu'à 10 % des PV max.
- **Trait « Grâce » :** la première fois qu'un allié descend sous 25 % de ses PV, il reçoit un
  bouclier de 50 % de la PUI.

**Branche Restauration**
1. **Rayon de soin** (Action, 20, CD 0, portée 4)
   - Effet : soigne 100 % de la PUI.
2. **Égide** (Rapide, 25, CD 2, portée 4)
   - Effet : un bouclier de 80 % de la PUI pendant 2 tours.
3. **Source** (Action, 35, CD 4, portée 3)
   - Effet : une case vide devient un Sanctuaire pendant 3 tours. À la fin du tour, elle soigne
     50 % de la PUI sur la case et les cases adjacentes.
4. **Purification** (Rapide, 15, CD 2, portée 3)
   - Effet : retire tous les statuts négatifs.

**Ultime : Aube** (Action, 80, CD 8)
- Effet : soigne tous les alliés de 150 % de la PUI, les purifie, et les rend Inéjectables pendant
  1 tour (avec Lassitude).

**Branche Discipline**
5. **Transfert** (Rapide, 25, CD 3, portée 3)
   - Effet : échange la place de 2 alliés. Sauve une boule au bord.
   - *Contre :* la recharge est visible. Menacer deux bords à la fois.
6. **Éblouissement** (Action, 30, CD 3, portée 3)
   - Effet : la cible est Aveuglée pendant 1 tour.
7. **Lien vital** (Rapide, 20, CD 4)
   - Effet : pendant 3 tours, 2 alliés se partagent les dégâts à 50/50.
8. **Halo de répulsion** (Action, 35, CD 4)
   - Effet : les ennemis adjacents (3 au plus) reculent d'1 case, sans éjection.

**Ultime : Martyr** (Rapide, 60, CD 9)
- Effet : pendant 2 tours, le héros prend tous les dégâts reçus par les alliés, réduits de 50 %, et
  il est Ancré.
- *Contre :* le frapper fort pendant ce temps (la Garde s'applique quand même).

### 8.5 Mage (lignée de la Fournaise)

*Le verre se souvient de la chaleur.*

- **Ressource : Mana** (de 0 à 150, départ à 100, +10 par tour).
- **Surchauffe :** chaque sort lancé dans le même tour coûte +50 %.
- **Trait « Résonance » :** les sorts posent des états (Brûlé, Gelé, Chargé). Deux états
  différents sur la même boule déclenchent une réaction :
  - Brûlé + Gelé = **Vapeur** : Étourdi pendant 1 tour (soumis aux rendements décroissants).
  - Gelé + Chargé = **Bris** : dégâts ×1,5 et −1 Poids.
  - Brûlé + Chargé = **Explosion** : 60 % de la PUI dans un rayon de 1.

**Branche Feu et Foudre**
1. **Trait de feu** (Action, 20, CD 0, en ligne, portée 5)
   - Effet : 100 % de la PUI. La cible est Brûlée (20 % de la PUI, 2 tours).
2. **Clignement** (Rapide, 25, CD 3, portée 3)
   - Effet : téléportation sur une case vide.
3. **Chaîne d'éclairs** (Action, 35, CD 2, portée 4)
   - Effet : 80 % de la PUI, puis 2 rebonds sur des boules adjacentes (−25 % à chaque rebond). Les
     cibles sont Chargées.
4. **Mur de flammes** (Action, 40, CD 4, portée 4)
   - Effet : 3 cases alignées deviennent de la Lave pendant 3 tours.

**Ultime : Météore** (Action, 100, CD 8, portée 6, tell 1 tour, Éjecteur)
- Effet : une zone de rayon 1 est marquée. Au début de ton tour suivant, elle subit 250 % de la PUI
  et les boules reculent d'1 case vers l'extérieur. Au plus 1 éjection.
- *Contre :* sortir de la zone.

**Branche Givre et Arcane**
5. **Lance de glace** (Action, 25, CD 1, portée 4)
   - Effet : 120 % de la PUI, et +50 % de plus sur une boule Gelée.
6. **Bouclier de mana** (Rapide, 0, CD 4)
   - Effet : pendant 2 tours, les dégâts sont payés en mana plutôt qu'en PV (2 PV = 1 mana).
7. **Nova de givre** (Action, 35, CD 3)
   - Effet : jusqu'à 3 ennemis adjacents sont Gelés pendant 1 tour.
8. **Sol verglacé** (Action, 30, CD 3, zone de rayon 1, portée 4)
   - Effet : les cases vides de la zone deviennent de la Glace pendant 3 tours.
   - Combo signature : pousser une boule sur la Glace pour qu'elle glisse hors du plateau. C'est un
     Mouvement, donc l'éjection est permise.

**Ultime : Zéro absolu** (Action, 100, CD 9)
- Effet : jusqu'à 3 ennemis dans un rayon de 3 sont Gelés pendant 1 tour. Les cases vides du rayon
  de 2 deviennent de la Glace pendant 2 tours.

### 8.6 Nécromancien (lignée de l'Ossuaire)

*Le verre se souvient des morts.*

- **Ressource : Essence** (de 0 à 100, départ à 0).
  - +20 à chaque Perte sur le plateau, quel que soit le camp. Rappel : les Revenants ne comptent
    pas.
  - +5 par tour.
- **Pacte de sang** (Rapide, une fois par tour) : le héros perd 10 % de ses PV max et gagne +20
  Essence.
- **Trait « Moisson » :** chaque Perte sur le plateau soigne le héros de 5 % de ses PV max.
- **Escouade « Serviteurs d'os » :** les Fragments ont −20 % de PV, mais chaque Fragment perdu donne
  +10 Essence.
- **Revenant :**
  - C'est une boule relevée, qui devient alliée du Nécromancien.
  - PV : 40 % de ses PV max d'origine, plus 20 % de la PUI du héros.
  - Elle garde son Poids d'origine, mais n'a aucune capacité. Un boss relevé en garde une.
  - **Décrépitude :** elle perd 10 % de ses PV max à chaque tour.
  - **3 Revenants au plus en même temps.**
  - Voir les règles de la section 6.6 : chaque entrée du Cimetière n'est relevée qu'une fois, un
    Revenant ne laisse pas de Dépouille, et il ne compte pas comme une Perte.

**Branche Réanimation**
1. **Siphon** (Action, 20, CD 1, portée 4)
   - Effet : 80 % de la PUI. Le héros récupère 50 % des dégâts infligés, et +10 Essence.
2. **Relever les morts** (Action, 30, CD 2, portée 3)
   - Effet : une Dépouille se relève en Revenant sur sa case, si la case est libre.
3. **Rappel du vide** (Action, 45, CD 4)
   - Effet : une boule **éjectée** revient du Cimetière en Revenant, sur une case vide du bord, à
     3 cases au plus du héros.
4. **Explosion de cadavre** (Action, 25, CD 2, portée 4)
   - Effet : consomme une Dépouille. Inflige 30 % des PV max d'origine dans un rayon de 1, et
     repousse les boules d'1 case sans éjection. Comme dans Diablo 2.

**Ultime : Armée des morts** (Action, 100, CD 10)
- Effet : jusqu'à 3 entrées du Cimetière se relèvent d'un coup en Revenants à 60 % des PV. La
  limite de 3 est ignorée pendant 3 tours, puis les Revenants en trop s'effritent.

**Branche Malédictions** (comme dans Diablo 2)
5. **Décrépitude** (Action, 25, CD 3, zone de rayon 1, portée 4)
   - Effet : −1 Poids et −20 % d'ATQ, pendant 2 tours.
6. **Sacrifice** (Rapide, 0, CD 3)
   - Effet : détruit un Revenant. Le héros gagne +40 Essence, et un bouclier égal aux PV qu'il
     restait au Revenant.
7. **Retour de souffrance** (Rapide, 20, CD 4, portée 4)
   - Effet : pendant 2 tours, la cible subit elle-même 50 % des dégâts qu'elle inflige.
8. **Prison d'os** (Action, 30, CD 4, portée 3)
   - Effet : les cases vides autour de la cible deviennent des Rocs pendant 2 tours.

**Ultime : Peste** (Action, 80, CD 8)
- Effet : tous les ennemis subissent un Poison de mort (15 % de la PUI, 3 tours). Chaque ennemi qui
  meurt pendant ce temps se relève en Revenant, dans la limite de 3.

### 8.7 Chronomancien (lignée du Sablier)

*Le verre se souvient du temps. Inspiré du Xélor de Dofus.*

- **Ressource : Grains de sable** (charges de 0 à 6, départ à 2).
  - +1 par tour.
  - +1 de plus si tu ne lances aucune capacité du tour.
- **Paradoxe :** si tu dépenses plus de 4 grains dans le même tour, tu en as 2 de moins au tour
  suivant.
- **Mécanique :** la classe lit l'historique du combat, que le moteur garde déjà.
- **Trait « Instant suspendu » :** une fois par combat, quand une boule alliée devrait être éjectée,
  la poussée échoue et la boule passe en Stase pendant 1 tour, sur sa case.

**Branche Rétrochronie**
1. **Mine temporelle** (Rapide, 1, CD 2, portée 4)
   - Effet : une case est marquée. Au début de ton tour suivant, la boule qui s'y trouve subit
     150 % de la PUI. Le tell est visible.
2. **Retour** (Action, 2, CD 2, portée 4)
   - Effet : une boule, alliée ou ennemie, revient sur la case qu'elle occupait au début du tour
     précédent de son entité, si la case est libre. Sinon, l'effet échoue et les grains sont rendus.
   - *Contre :* occuper son ancienne case.
3. **Rembobiner les blessures** (Rapide, 1, CD 3, portée 4)
   - Effet : un allié retrouve les PV qu'il avait au début de ton tour précédent, s'ils étaient plus
     élevés.
4. **Déjà-vu** (Préparation, 2, CD 4)
   - Effet : marque un allié. Si l'adversaire le déplace pendant son tour (sans l'éjecter), il
     revient à sa case d'origine à la fin de ce tour, si elle est libre.

**Ultime : Paradoxe** (Action, 6, CD 10, 1 fois par combat)
- Effet : toutes les boules présentes reviennent à leur position du début de ton tour précédent.
  Les PV, les Pertes et les recharges ne bougent pas. Une boule créée entre-temps reste en place,
  ou se décale sur la case libre la plus proche, en suivant l'ordre fixe.
- *Contre :* l'ultime défait aussi tes propres progrès.

**Branche Accélération**
5. **Hâte** (Rapide, 2, CD 3, portée 3)
   - Effet : un allié gagne un Pas bonus. Il compte dans la limite d'un Pas bonus par tour.
6. **Lenteur** (Action, 2, CD 3, portée 4)
   - Effet : la cible est Aveuglée pendant 1 tour. Si c'est un héros, ses recharges prennent +1 tour.
7. **Stase** (Action, 3, CD 4, portée 4)
   - Effet : n'importe quelle boule passe en Stase pendant 1 tour. Sur un allié au bord, ça le
     protège. Sur un ennemi, ça bloque une file (il devient Inamovible).
8. **Sablier** (Rapide, 1, CD 3)
   - Effet : la plus courte des recharges du héros baisse d'1 tour (sauf l'ultime).

**Ultime : Arrêt du temps** (Action, 6, CD 10, 1 fois par combat)
- Effet : au prochain tour de l'entité adverse ciblée, elle n'a droit qu'à son Mouvement (ni Action,
  ni Action rapide), et ses durées et ses recharges ne baissent pas. Contre un boss, on ajoute
  simplement +2 tours à toutes ses recharges, pour ne pas sauter ses tells.
- *Contre :* la jauge de grains est visible. Se préparer quand elle arrive à 6.

### 8.8 Géomancien (lignée de la Strate)

*Le verre se souvient de la roche.*

- **Ressource : Strates** (de 0 à 100).
  - +10 par tour.
  - +5 par boule alliée posée sur une case spéciale au début du tour.
  - La ressource dépend donc du biome.
- **Trait « Marche-pierre » :** le héros ignore les effets négatifs du terrain.

**Branche Terre**
1. **Soulèvement** (Action, 25, CD 2, portée 4)
   - Effet : une case vide devient un Roc pendant 3 tours.
2. **Glyphe de pierre** (Rapide, 20, CD 3, portée 3)
   - Effet : un allié gagne +1 Poids et +30 % d'ARM, pendant 2 tours.
3. **Pont** (Action, 40, CD 4, portée 4)
   - Effet : comble un Gouffre ou ajoute une case au-delà du bord, pendant 2 tours. Une boule
     poussée sur le Pont n'est pas éjectée. Quand le Pont expire, la boule qui est dessus est
     éjectée (la durée restante est visible et sert de tell).
   - C'est la seule capacité qui agrandit le plateau.
4. **Pente** (Rapide, 20, CD 2, portée 4)
   - Effet : donne une direction de Pente à une case, pendant 3 tours.

**Ultime : Rempart tellurique** (Action, 90, CD 9, portée 4)
- Effet : un anneau de 6 Rocs se forme autour d'une case, pendant 2 tours. Selon la case, c'est une
  forteresse ou une prison.

**Branche Faille**
5. **Sables** (Action, 25, CD 3, portée 4)
   - Effet : 3 cases vides deviennent des Sables mouvants pendant 3 tours.
6. **Secousse** (Action, 30, CD 3, en ligne, portée 4)
   - Effet : chaque boule de la ligne glisse d'1 case dans la direction perpendiculaire choisie, si
     la case est libre. Sans éjection.
7. **Effondrement** (Action, 40, CD 4, portée 4, tell, Éjecteur)
   - Effet : une case est marquée. À la fin du prochain tour adverse, elle devient un Gouffre
     pendant 3 tours. C'est The Hull, mais jouable par le joueur.
   - *Contre :* sortir de la case.
8. **Rotation** (Action, 45, CD 5, portée 3)
   - Effet : fait tourner de 60° les 7 cases d'un hexagone. Les boules et le terrain tournent avec,
     et les Pentes aussi.
   - Conditions : le centre doit avoir ses 6 voisins sur le plateau, et aucune des 7 cases ne doit
     contenir de boule Inamovible. Aucune éjection n'est possible.

**Ultime : Séisme** (Action, 100, CD 9, tell 2 tours, Éjecteur)
- Effet : 2 côtés du bord, au choix (9 cases), se fissurent. Au début de ton 2e tour suivant, ils
  deviennent des Gouffres pendant 2 tours. C'est du terrain avec un tell d'au moins 2 tours.
- *Contre :* quitter ces deux côtés à temps.

### 8.9 Classes de la v2 (des rôles encore libres)
- **Marionnettiste** (lignée du Fil ; comme le Dark Archon et l'Infestor de SC2)
  - Il prend le contrôle d'une boule ennemie le temps d'un Pas.
  - Il lie deux boules ennemies.
  - Ressource : Fils.
- **Artificier** (comme les Terrans de SC2 et le Steamer de Dofus)
  - Il pose des tourelles, des mines et des drones sur les cases.
  - Ressource : Pièces.
- **Magnétiseur**
  - Il joue avec des polarités + et − : il attire ou repousse à distance, sans contact.
  - Ressource : Charge.
- **Chantre** (lié à The Choir)
  - Il joue des auras qui changent à chaque tour, comme les couplets d'un chant.
  - Ressource : Mesure.

---

## 9. Arbre passif : les Cinq Voies (sur le modèle des runes de LoL)

### 9.1 Structure et budget : 99 points, du niveau 2 au niveau 100

| Bloc | Contenu | Rangs | Points |
|---|---|---|---|
| **Voie principale** : Clé de voûte | 1 au choix parmi 4 | 5 (le rang 1 débloque, les rangs 2 à 5 renforcent) | 5 |
| Voie principale : runes | 3 rangées de 3 runes, **2 runes par rangée au maximum** (LoL n'en autorise qu'une) | 5 | 30 |
| **Voie secondaire** | 2 runes prises dans 2 rangées différentes d'une autre Voie (sans sa Clé de voûte) | 5 | 10 |
| **Éclats** | 3 rangées (Offensif, Flexible, Défensif) de 3 éclats | 6 | 54 |
| **Total** | | | **99** |

**Paliers**
- La rangée 1 demande la Clé de voûte.
- La rangée 2 demande 8 points dans la Voie.
- La rangée 3 demande 16 points dans la Voie.
- La Voie secondaire s'ouvre à 20 points dans la Voie principale.

**Plafond des Éclats**
- Rang maximum d'un éclat : `min(6, 1 + ⌊niveau / 16⌋)`.
- Au niveau 80, on atteint le rang 6. Les points disponibles ne dépassent donc jamais les points
  qu'on peut dépenser, et on ne peut pas tout mettre dans les stats dès le départ.

**Au niveau 100**
- L'arbre est complet.
- Le build se joue sur la Voie principale et la Clé de voûte.
- Les Éclats servent de réservoir de stats final, comme le Parangon de Diablo.

**Réinitialisation**
- Chez le Maître des Voies, au hub.
- Gratuite avant le niveau 20, puis `10 or × niveau`.
- Changer de Voie principale remet tout à zéro.

**Une seule Clé de voûte active à la fois.**

### 9.2 Contenu des Voies

Les noms viennent de la version française de LoL. Les effets sont adaptés à Abalone.

#### Précision : dégâts soutenus et poussée

**Clés de voûte**
- **Attaque soutenue** : 3 coups sur la même boule en 2 tours, puis elle subit +12 % de dégâts
  pendant 3 tours.
- **Tempo mortel** : chaque tour d'affilée avec une poussée donne +1 cumul (4 au maximum). Chaque
  cumul donne +5 % d'ATQ et de PUI.
- **Conquérant** : les dégâts infligés donnent des cumuls (6 au maximum). À 6 cumuls, on se soigne
  de 8 % des dégâts infligés.
- **Jeu de jambes** : tous les 3 tours, la prochaine attaque soigne de 10 % et donne un Pas bonus.

**Runes**
- **Rangée 1**
  - Surplus de soins : le soin en trop devient un bouclier.
  - Triomphe : quand on inflige une Perte, on se soigne de 10 % et on gagne de l'or.
  - Présence d'esprit : quand on inflige une Perte, on gagne +15 de ressource.
- **Rangée 2**
  - Légende : Hâte.
  - Légende : Lignée (Vol de vie).
  - Légende : Ténacité.
- **Rangée 3**
  - Coup de grâce : plus de dégâts sur une cible sous 40 % de ses PV.
  - Abattage : plus de dégâts contre une cible qui a plus de PV max.
  - Dernier rempart : plus de dégâts quand le héros a peu de PV.

#### Domination : dégâts en rafale, éjection, chasse

**Clés de voûte**
- **Électrocution** : 3 sources différentes sur la même boule en un tour déclenchent des dégâts
  magiques en plus.
- **Moisson noire** : des dégâts en plus sur une cible sous 50 % de ses PV. Chaque Perte infligée
  donne une âme qui reste pour le combat.
- **Grêle de lames** : les 2 premières capacités du combat coûtent 50 % de moins.
- **Bourreau du bord** (nouveau) : chaque éjection causée donne +1 Poids au héros (+2 au maximum,
  en restant dans la limite de 5) et +20 de ressource.

**Runes**
- **Rangée 1**
  - Coup bas : plus de dégâts sur une cible sous contrôle.
  - Goût du sang : un soin quand on touche un héros.
  - Impact soudain : plus de pénétration après une téléportation ou une charge.
- **Rangée 2**
  - Trophées : +1 % par Perte infligée dans le combat (+10 % au maximum).
  - Guetteur : +1 de portée sur les boules Isolées.
  - Pression du bord : +15 % de dégâts sur les boules du bord.
- **Rangée 3**
  - Chasseur ultime : −1 tour de recharge sur l'ultime.
  - Chasseur ingénieux : recharge plus courte des consommables.
  - Chasseur implacable : déplacement plus rapide dans le monde.

#### Sorcellerie : ressource et capacités

**Clés de voûte**
- **Lucine** : une Lueur compagne. Une capacité lancée sur un allié lui donne aussi un bouclier ;
  lancée sur un ennemi, elle ajoute des dégâts.
- **Comète arcanique** : une capacité de dégâts appelle une comète. Elle frappe la case au tour
  suivant (tell), dans un rayon de 1.
- **Ruée de phase** : 3 capacités en 2 tours donnent un Pas bonus et rendent le héros Insaisissable
  pendant 1 tour.
- **Surcharge** (nouveau) : ressource maximale +30 %. Quand la ressource est pleine, la capacité
  suivante est gratuite.

**Runes**
- **Rangée 1**
  - Cape de nimbe : un Pas bonus après l'ultime.
  - Ruban de mana : ressource maximale augmentée.
  - Orbe annulant : un bouclier contre les dégâts magiques en rafale.
- **Rangée 2**
  - Transcendance : Hâte.
  - Célérité : VIT.
  - Concentration absolue : plus de dégâts quand le héros a plus de 70 % de ses PV.
- **Rangée 3**
  - Brûlure : les capacités rendent la cible Brûlée.
  - Arpenteur : plus de stats sur une case spéciale.
  - Tempête grandissante : PUI +1 % par tour de combat.

#### Volonté : tank, Poids, ancrage

**Clés de voûte**
- **Poigne de l'immortel** : au contact, tous les 3 tours, une frappe en % des PV max, un soin, et
  des PV max en plus jusqu'à la fin du combat.
- **Répercussion** : après avoir contrôlé une cible, +50 % d'ARM et de RES pendant 2 tours, puis
  une onde de choc.
- **Gardien** : un bouclier sur un allié adjacent quand il prend des dégâts.
- **Roc inébranlable** (nouveau) : le héros compte +2 Poids pour *résister* aux poussées (pas pour
  pousser). Il gagne +20 % d'ARM et de RES quand il est sur le bord.

**Runes**
- **Rangée 1**
  - Démolition : plus de dégâts contre les Rocs et les structures.
  - Fontaine de vie.
  - Coup de bouclier.
- **Rangée 2**
  - Conditionnement : ARM et RES augmentées après 6 tours.
  - Second souffle : régénération.
  - Plaque d'os : moins de dégâts sur 3 coups après une rafale.
- **Rangée 3**
  - Croissance excessive : PV max augmentés quand une Perte a lieu à côté.
  - Revitalisation : soins et boucliers reçus augmentés.
  - Inébranlable : Ténacité, et le premier contrôle est ignoré.

#### Inspiration : utilitaire et vie hors combat

**Clés de voûte**
- **Renforcement glacial** : tes contrôles posent de la Glace sous la cible.
- **Grimoire descellé** : une fois par combat, on peut échanger une capacité équipée.
- **Premier coup** : si tu agis en premier, plus de dégâts et de l'or.
- **Pionnier** (nouveau) : au placement, on peut changer le type de 2 cases de son côté du plateau.

**Runes**
- **Rangée 1**
  - Pas furtif : un Pas bonus tous les 4 tours.
  - Bottes magiques : déplacement plus rapide dans le monde.
  - Sablier de poche : une Stase sur soi-même par combat.
- **Rangée 2** (rangée « vie », pour un build de récolteur)
  - Prospecteur : meilleur rendement de récolte.
  - Artisan : meilleure qualité d'artisanat.
  - Négociant : vente +10 %, achat −10 %.
- **Rangée 3**
  - Perspicacité cosmique : Hâte.
  - Connaissance du terrain : +5 % de stats sur son biome d'affinité.
  - Livraison de rations : un consommable gratuit par combat.

#### Éclats (6 rangs, environ +2 % par rang)
- **Offensif** : Force adaptative (ATQ ou PUI, la plus haute), Hâte, Pénétration.
- **Flexible** : Force adaptative, VIT, PV qui augmentent avec le niveau.
- **Défensif** : PV, Ténacité, ARM et RES.

---

## 10. Arbre actif : 20 points (niveaux 5, 10, 15, …, 100)

**Branches**
- Chaque classe a 2 branches (section 8).
- Une branche contient 4 capacités et 1 ultime, soit 10 capacités par classe.

**Rangs d'une capacité**

| Rang | Coût | Effet |
|---|---|---|
| R1 | 1 point | Débloque la capacité |
| R2 (Amélioration) | 1 point | +25 % d'effet, **ou** −1 tour de recharge, selon la capacité |
| R3 (Variante) | **2 points** | On choisit A ou B, comme les améliorations de Diablo 4. On peut changer de variante gratuitement au hub |

Exemple : la Charge du Guerrier. Variante A : « traverse 1 ennemi ». Variante B : « Étourdit 1 tour ».

**Budget**
- Une capacité au maximum coûte 4 points. Les 5 capacités équipées au maximum coûtent donc
  exactement 20 points, et on ne les a qu'au niveau 100.
- Chaque capacité débloquée en plus, pour la souplesse, coûte des rangs ailleurs. Il faut choisir
  entre profondeur et souplesse.

**Paliers**
- Palier 1 : niveau 5.
- Palier 2 : niveau 15, avec 2 points dans la branche.
- Ultime : niveau 30, avec 4 points dans la branche. Au niveau 30, on a 6 points, et l'ultime
  arrive avec le 6e point, comme au niveau 6 dans LoL.

**Équipement des capacités**
- 4 emplacements de capacité et 1 emplacement d'ultime.
- Hors combat, on équipe librement les capacités débloquées.
- Réinitialisation payante au hub.

**Exemple : progression d'un Guerrier**

| Niveau | Point dépensé |
|---|---|
| 5 | Charge |
| 10 | Fendoir |
| 15 | Percée |
| 20 | Charge R2 |
| 25 | Tourbillon |
| 30 | Avalanche (4 points dans Assaut) |
| 35 | Fendoir R2 |
| 40 et 45 | Charge R3 |

---

## 11. Progression : niveaux 1 à 100

### Tutoriel : niveaux 1 à 4, sur l'île de Lumen
- Des combats sans aucune capacité : de l'Abalone pur, avec les PV et le Poids.
- Les quêtes apprennent dans l'ordre : sélectionner, pousser, le sumito, éjecter, la Formation,
  l'Isolement.
- Au niveau 5, l'épreuve de lignée donne la première capacité. C'est cohérent avec « 0 talent au
  niveau 1 ».

### Sources d'XP
- Combats : environ 40 %.
- Quêtes : environ 40 %.
- Exploration : environ 10 %.
- Donjons et événements : environ 10 %.
- La récolte et l'artisanat donnent surtout de l'XP de métier.

### Courbe (TUNE)
- `XP_requise(n → n+1) = C(n) × XP_ref(n)`, avec `C(n) = 4 + n/3` et `XP_ref(n) = 50 + 10n`.
- Temps visés : niveau 10 en 1 h 30, niveau 30 en 12 h, niveau 60 en 45 h, niveau 100 en environ
  110 h.

### Écart de niveau
- Un monstre gris (6 niveaux ou plus sous toi) ne donne aucune XP.
- Un monstre plus fort donne +10 % d'XP par niveau d'écart, +40 % au maximum.

### Repos (comme dans WoW)
- Hors ligne ou au hub, on accumule un bonus d'XP de +100 %, jusqu'à 1,5 niveau.

### Mort
- Voir section 6.12.
- Option **Hardcore** : à la création du personnage, on peut choisir la mort définitive.

### Déblocages par niveau

| Niveau | Déblocage |
|---|---|
| 2 | 1er point passif, choix de la Voie principale |
| 5 | 1re capacité (épreuve de lignée), Balises |
| 8 | Premier donjon : Les Cales du Ballast |
| 10 | Duels, 2e capacité, quête de l'Élan |
| 15 | Palier 2 des capacités, recherche de groupe |
| 20 | Voie secondaire, Élan 1 |
| 25 | Arène, donjons Héroïques des zones déjà finies |
| 30 | Ultime |
| 40 | Élan 2, réputations au rang Honoré |
| 50 | Niveau de monde Cauchemar (après le donjon d'accès) |
| 70 | Niveau de monde Enfer |
| 80 | Éclats au rang 6 |
| 100 | Mythique+, Tourment, Failles, saisons |

---

## 12. Équipement et butin

### Emplacements du héros (10)

| Emplacement | Rôle |
|---|---|
| Noyau | L'arme. Il fixe l'ATQ ou la PUI de base, et son type dépend de la classe |
| Relique | La main secondaire : bouclier, orbe, grimoire ou sablier |
| Coque | L'armure : PV, ARM, RES |
| Lest | +0 ou +1 Poids, contre de la VIT |
| Halo | — |
| Amulette | — |
| 2 Anneaux | — |
| Étendard | Les stats de l'escouade, et un bonus d'escouade |
| Talisman | Hors combat |

Les 5 outils de récolte ont leurs propres emplacements, à part.

### Raretés (une couleur **et** un glyphe)

| Rareté | Contenu |
|---|---|
| Commun | — |
| Magique | 1 ou 2 affixes |
| Rare | 3 ou 4 affixes |
| Légendaire | 3 affixes, plus 1 **Aspect** qui modifie une capacité (comme dans Diablo 4) |
| Unique | Effet fixe, pensé pour un build |
| Ensemble | Bonus à 2 et à 4 pièces (comme dans Diablo 2 et 3) |

### Niveau d'objet et Score d'équipement
- Le niveau d'un objet (iLvl) est celui du monstre qui le donne, ou de la recette.
- Ses stats valent `base(emplacement) × g(iLvl)`.
- Le Score d'équipement affiché est la moyenne des objets.

### Affixes
- PV, ATQ, PUI, ARM, RES, VIT.
- Hâte, Ténacité, Vol de vie.
- +% de dégâts contre les boules Isolées, +% de Choc.
- +Poids : uniquement sur le Lest, rare, et dans la limite de +1 au total.
- +ressource par tour.
- +1 de portée pour une capacité.
- +1 rang pour une capacité : rare, et sans dépasser le rang maximum.
- Immunité à un type de case.
- Bonus de récolte.

### Exemples d'Aspects
- **Coque du Monolithe** : Ancrage dure 1 tour de plus.
- **Noyau de la Fournaise** : Trait de feu traverse 1 boule.
- **Sablier fêlé** : Retour peut viser une boule au bord sans échouer, en la posant sur la case
  libre la plus proche de son ancienne case.
- **Faux du Puits** : Relever les morts n'a plus de recharge, mais coûte 50 Essence.

### Ensembles
- 2 ensembles par classe, en fin de jeu.
- Exemple, **Ancre du Ballast** (Gardien) :
  - 2 pièces : Forteresse coûte 20 Rempart de moins.
  - 4 pièces : chaque poussée ennemie bloquée par un Ancrage rend 15 Rempart.

### Gemmes et châsses (comme dans Diablo 2)

| Gemme | Effet |
|---|---|
| Rubis | PV ou ATQ |
| Saphir | PUI ou RES |
| Émeraude | VIT |
| Topaze | Or et butin |
| Diamant | ARM, ou toutes les stats |
| Crâne | Vol de vie |
| Ambre-scorie | Unique, sur le Lest |

- 5 qualités, de Ébréchée à Parfaite.
- Le **Creuset** fusionne 3 gemmes en 1.

### Durabilité
- −1 par combat, et −10 % à chaque mort.
- Le forgeron répare.

### Butin personnel (comme dans Diablo 3 et 4)
- Chaque joueur a son propre butin, donc aucun conflit en P2P.
- Les tirages utilisent la graine `(sauvegarde, id du combat)`.
- **Lié quand équipé** (comme dans WoW) : un objet qu'on a équipé ne peut plus être échangé. Les
  matériaux restent échangeables.

### Inventaire
- 40 cases.
- Un sac de matériaux séparé, sans limite.
- Un coffre au hub, avec 4 onglets.

---

## 13. Marchands et économie

### 13.1 Monnaies

| Monnaie | Usage |
|---|---|
| **Or** | Partout |
| **Lueur** | Voyages et artisanat (comme l'Azoth de New World). Se récolte sur les Fissures |
| **Éclats de verre** | Le Parieur. Fin de jeu |
| **Marques de réputation** | Une par faction |
| **Honneur** | PvP |
| **Jetons de Brèche** | Battle royale |

### 13.2 Marchands

| Marchand | Services |
|---|---|
| Intendance (marchand général) | Consommables, réactifs de raffinage, sacs |
| Forgeron | Réparer, acheter et vendre de l'équipement, **recycler** un objet en matériaux |
| Joaillier | Gemmes, ouverture de châsses, retrait de gemmes |
| Alchimiste | Potions, recettes |
| Maître des Voies | Réinitialisations |
| **Le Parieur** (le Joueur du Ballast, comme Kadala dans Diablo 3) | Un objet mystère, pour l'emplacement de son choix, contre des Éclats |
| Marchand itinérant | Un stock qui change chaque jour (graine UTC, même fonction que `client/src/daily.ts`) |
| Intendants de faction | Récompenses de réputation |
| Quartier-maître PvP et BR | Honneur et Jetons, contre des cosmétiques, des titres et des objets de gabarit |
| Gardien des Balises | Voyages, Élan |
| Banquier | Coffre, et plus de place contre de l'or |

### 13.3 Prix
- **Valeur d'un objet** = `base(emplacement) × rareté × iLvl`.
  - Facteurs de rareté : Commun 1, Magique 2, Rare 4, Légendaire 10, Unique 15, Ensemble 12.
- **Revente** : 20 % de la valeur.
- **Rachat** : les 10 derniers objets vendus.
- **Ce qui retire de l'or du jeu** : réparations, réinitialisations, voyages, frais d'artisanat,
  châsses, place au coffre, le Parieur.

### 13.4 Échanges entre joueurs (P2P)
- Fenêtre d'échange directe, avec double confirmation, signée par les deux pairs.
- Seuls les objets non liés s'échangent.
- **Pas d'hôtel des ventes** : il faudrait un serveur (#36).
- **Limite assumée** : les sauvegardes sont locales, donc on peut les falsifier et dupliquer des
  objets.
  - Les échanges et le PvE en groupe restent entre amis.
  - Le PvP classé est normalisé (section 19).
  - L'inspection montre l'équipement comme « auto-déclaré, non vérifié ».

### 13.5 Factions et réputation (comme dans WoW)
- Rangs : Neutre, Amical, Honoré, Révéré, Exalté. Ils débloquent des recettes, des cosmétiques, de
  l'Élan et des titres.

| Faction | Thème |
|---|---|
| La Colonie | Artisanat |
| Les Vitrifiés pacifiques | Lore, récolte |
| L'Ordre du Registre (les fidèles de Tally) | Quêtes quotidiennes, donjons |
| Les Pilleurs de lest | PvP, battle royale, réputation trouble |

---

## 14. Récolte (comme dans New World)

### 5 métiers, niveaux 0 à 100

| Métier | Outil | Ressources |
|---|---|---|
| Minage | Pioche | Minerais, pierre, gemmes brutes |
| Herboristerie | Faucille | Herbes, fibres, champignons, et la **Lueur** sur les Fissures |
| Bûcheronnage | Hache | Bois |
| Décorticage | Couteau | Chitine et coques des monstres-scarabées (remplace le dépeçage, colle au lore) |
| Pêche | Canne | Poissons, perles, sel |

### Paliers
- T1 (métier 0), T2 (20), T3 (40), T4 (60), T5 (80). Ils suivent les zones.
- Exemple, les minerais : Fer, puis Argent et Or, puis Verre-étoile, puis Orichalque, puis
  Scorie-mère.

### Nœuds
- 0 à 3 par tuile.
- Ils réapparaissent après 10 à 30 minutes réelles, pour chaque joueur.
- Les **veines riches** sont rares et rapportent ×3.

### Récolter
- Un clic lance une Canalisation de 3 s. Elle est plus courte avec un bon outil et un bon niveau.
- Une aggro l'interrompt.
- Rendement : la base, plus le bonus de l'outil.
- **Chance** : gemme, schéma, Lueur pure ou trophée.

### Outils
- De T1 à T5, fabriqués en Ingénierie.
- Bonus possibles : vitesse, chance, rendement, « aucune aggro pendant la récolte ».

### Filons (v2, mini-jeu)
- Une veine riche ouvre un petit plateau de rayon 2.
- Il faut éjecter le bloc de minerai en N coups au plus. C'est un puzzle d'Abalone.
- Réussite : rendement ×5.

### XP
- Chaque récolte donne de l'XP de métier, et un peu d'XP de héros.

---

## 15. Raffinage et artisanat (comme dans New World)

### 15.1 Raffinage

5 stations, au hub et dans les avant-postes :

| Station | Transformation |
|---|---|
| Fonderie | Minerai en lingot |
| Tannerie | Chitine en plaque |
| Tisserie | Fibre en toile |
| Scierie | Bois en planche |
| Taillerie | Pierre en bloc, gemme brute en gemme taillée |

Recette d'un palier :
- le matériau raffiné du palier d'en dessous ;
- le matériau brut du palier ;
- un **réactif** : Flux, Solvant, Sablon, Tanin ou Huile (on l'achète ou on le récolte).

Exemple : Acier = Lingot de fer + Flux + Charbon.

### 15.2 Artisanat

7 métiers, niveaux 0 à 100 :

| Métier | Fabrique |
|---|---|
| Forge | Noyaux physiques, Lests |
| Atelier arcanique | Noyaux magiques, Reliques |
| Armurerie | Coques, Halos |
| Joaillerie | Anneaux, Amulettes, taille des gemmes |
| Ingénierie | Outils, Étendards, pièges, bombes |
| Alchimie | Potions, huiles, élixirs |
| Cuisine | Repas, bonus pour les N prochains combats |

### 15.3 Recettes et qualité
- **Où apprendre une recette** : en montant le métier, avec un schéma lâché par un monstre, ou
  auprès d'une faction.
- **Qualité** : l'iLvl tombe dans une fourchette, selon le niveau du métier et le palier des
  matériaux. Le tirage utilise la graine de la sauvegarde.
- **Influencer le résultat** :
  - un **Catalyseur** garantit un affixe ;
  - la **Lueur** remonte l'iLvl minimum ;
  - on peut sertir une gemme dès la fabrication.
- **Artisanat ou butin** :
  - l'artisanat donne le contrôle des affixes ;
  - le butin donne la chance de tomber sur un Légendaire ou un Unique ;
  - en fin de jeu, des **objets nommés fabricables** demandent un composant rare lâché par un boss.

### 15.4 Consommables de combat
- 1 par tour, en Action rapide. 3 au maximum par combat.

| Consommable | Effet |
|---|---|
| Potion de soin | Soigne 30 % des PV |
| Tonique | +30 de ressource |
| Antidote | — |
| Huile | Ajoute un élément aux attaques |
| Bombe | Dégâts dans un rayon de 1, et recul sans éjection |
| Lest liquide | +1 Poids pendant 2 tours |

### 15.5 Commandes
- Le tableau de la Colonie propose des quêtes de métier. Exemple : « 5 lingots d'acier ».

---

## 16. Quêtes

### Types

| Type | Exemple | Référence |
|---|---|---|
| Principale | La Comptabilité de Tally : retrouver les 5 « sièges » (les boss qui existent déjà) | WoW |
| Zone | Une chaîne de 8 à 15 quêtes par zone | WoW |
| Secondaire | Une quête sur un PNJ ou un lieu | BG3 |
| Classe | Lignée : une variante cosmétique de l'ultime et un titre | WoW |
| Quotidienne et hebdomadaire | Graine UTC, tableau de contrats | New World, WoW |
| Primes | 5 objectifs par zone, puis un coffre | Diablo 3 |
| Exploration | Découvrir 100 % d'une zone : un titre et de l'XP | WoW |
| Métier | Commandes | New World |
| **Énigme** | Un puzzle d'Abalone : « éjecte en 3 coups », « sauve la boule au bord ». Rangé dans le Codex | Nouveau |
| Escorte | Protéger une boule PNJ jusqu'à une case de sortie | WoW |
| Événement mondial | 5 à 10 minutes | Diablo 4 |

### Objectifs (primitives)
- Vaincre(monstre, n), ou Vaincre(élite ou boss).
- Atteindre(tuile).
- Récolter(objet, n), Fabriquer(objet, n).
- Livrer(objet, PNJ), Parler(PNJ).
- Énigme(id), Escorter(id).
- Survivre(n tours), Contrôler(cases, n tours).

### Récompenses
- XP, or, un objet au choix parmi 3, réputation, recettes, Lueur.
- Jamais de point de talent : ils ne viennent que des niveaux.

### Interface
- Un journal de 25 quêtes actives (on change `world.md` §4).
- Un suivi des quêtes à l'écran.
- Des marqueurs `!` et `?` sur la carte, toujours avec un glyphe en plus de la couleur.

### En groupe
- On peut partager une quête.
- Un objectif de combat compte pour chaque membre présent.

### Données et ton
- **Format d'une quête** : `id, niveau, prérequis, étapes[objectifs], récompenses`. L'état est rangé
  dans la sauvegarde du héros.
- **Ton** : Tally parle en lignes de registre, les colons parlent avec lassitude.

---

## 17. Donjons

### Principe
- **Instanciés.** On y entre par une tuile spéciale.
- **Intérieur** : une petite carte hexagonale de 15 à 40 tuiles, rangées en salles. Une salle
  contient un combat, un événement, un coffre, un piège ou une énigme.
- **Fin** : un boss, souvent sur plusieurs tuiles.
- **Groupe** de 1 à 4. En groupe, il y a une meute par joueur (section 6.2), et donc pas de bonus de
  PV pour les ennemis.
- **Génération** : des plans faits à la main, avec des variations par graine. Comme Diablo 2 : les
  grandes lignes restent fixes, les salles changent.

### Difficultés
- **Normal**.
- **Héroïque** : au niveau maximum de la zone, avec 1 affixe.
- **Mythique** : au niveau 100, avec une **Clé de Brèche** de +1 à +20 (comme les Mythique+ de WoW).
  - Les affixes changent chaque semaine (graine de la semaine UTC).
  - Un **budget de tours** remplace le chronomètre. Si on le respecte, la clé monte d'un niveau.

### Affixes Mythiques
- Fortifié.
- Tyrannique.
- Volcanique.
- Explosif.
- Verglacé.
- Sanguin : une mort crée un Sanctuaire pour les ennemis.
- Nécrotique.
- Tectonique.

### Récompenses et Balise
- Coffre de fin : 2 objets, avec une chance de Légendaire.
- Bonus de première victoire de la semaine.
- Une Balise à mi-donjon.

### Donjons de la v1 (ils reprennent les 5 boss existants)

| Donjon | Niveau | Biome | Boss final |
|---|---|---|---|
| Les Cales du Ballast | 8 | Intérieur du vaisseau | **The Echo** (apprend à lire les tells) |
| Le Terrier de Cendre | 15 | Sylve | La Reine Tisseuse (nouveau boss) |
| La Tourbière Engloutie | 22 | Marais | Le Noyé-qui-compte (nouveau boss) |
| La Mine de Verre-étoile | 38 | Crêtes | **The Hull** (3 tuiles, le plateau s'effondre) |
| La Fournaise Chantante | 50 | Caldeira | **The Choir** |
| La Chapelle de Verre | 65 | Terres Vitrifiées | **The Chaplain** |
| Le Gouffre du Lest | 80 | Le Puits | Le Marcheur d'abîme (nouveau boss) |
| **Le Pont de Tally** (raid) | 95-100 | Le Ballast | **The Ballast Mind** (raid en fleur, sur 7 tuiles) |

---

## 18. Combats de boss

### Ce qu'on garde
La grille de `game-design.md` §3.3 et §7 :
- un tell ;
- une réponse par le placement ;
- des phases visibles ;
- un réglage par l'échelle de bots qui tourne chaque nuit en CI, puis par des playtests.

### Les deux changements clés
1. **Les phases se déclenchent sur un pourcentage de PV du boss** (par exemple 70 % et 35 %),
   plus sur un nombre de boules. Ça corrige les phases jamais atteintes relevées dans
   `boss-balance.md` §5.
2. **Un boss ne sort que s'il a gagné une échelle de bots RPG.** Le bot joueur utilise les
   capacités de sa classe (section 24.2). Ce n'est pas encore prouvé pour The Chaplain et The
   Ballast Mind (0 sur 10 dans `boss-balance.md`) : ils restent bloqués tant qu'ils n'ont pas de
   fixture de victoire.

### Anatomie d'un boss RPG
- **La Boule-Cœur** : beaucoup de PV, un Poids de 3 à 5. Elle est **Inéjectable**, ou
  **Résiliente** : éjectée, elle perd 25 % de ses PV max et revient au centre.
- **Des renforts.**
- **Des capacités**, dont les recharges sont visibles.
- **Une intention** affichée.
- **Un enrage** : au bout de N tours, la Brèche (section 6.7) s'avance plus tôt.

### Mécaniques natives d'Abalone
- Une canalisation qui s'arrête si on pousse le lanceur.
- Des zones marquées qu'il faut quitter.
- Des cases à occuper, sinon tout le groupe prend des dégâts.
- Une boule-bombe à éjecter avant la fin du compte à rebours.
- Un totem à détruire.
- Un bouclier frontal (le boss est vulnérable par l'arrière).
- Des boules liées, à tuer dans le même tour.
- Les mécaniques des boss existants : conversion, miroir, armées, effondrement.
- Le changement de région (multi-tuiles).

### Les 5 boss existants, convertis
- On garde leur hook et leur tell, en ajoutant des PV, des capacités et des phases en pourcentage.
- **The Chaplain** ne convertit que des Fragments, jamais un héros.
- **The Echo** ne copie que le **Mouvement**, pas les capacités.
- **The Hull** (3 tuiles en ligne) : en phase 2, le plateau du milieu s'effondre. On migre par
  simples Mouvements, à travers les coutures (section 4.6).
- **The Ballast Mind** (raid en fleur sur 7 tuiles) : un pétale par joueur, et le centre s'ouvre en
  phase 3. C'est un clin d'œil à la marguerite belge.

### Boss du monde et raids
- **Boss du monde** :
  - ils apparaissent selon un horaire UTC calculé par graine, toutes les 3 heures ;
  - ils sont visibles sur la carte ;
  - jusqu'à 4 joueurs en coop ;
  - une récompense par semaine.
- **Raids** :
  - 4 joueurs ;
  - 3 à 5 boss ;
  - sur plusieurs tuiles.

---

## 19. PvP

### Duel
- N'importe où hors combat, sur invitation, sans enjeu.

### Arènes
- **1v1** : 14 boules chacun.
- **2v2** : plateau de rayon 5, 7 boules par joueur.
- **3v3** : en v2.

### Normalisation (c'est le point clé sans serveur)
- En arène classée, tout le monde joue un **gabarit de niveau 100** : les stats sont fixes.
- Seuls comptent la classe, les Voies, les capacités, les variantes et les cosmétiques.
- Une **arène libre**, non classée, garde le vrai équipement.

### Classement
- Une cote locale, de type Elo, calculée à partir des logs de match signés.
- Elle est affichée comme **« non vérifiée »**.
- Elle demande un `Decision`, car `SPEC.md` §6 met le classement hors du périmètre.

### Équilibrage
- Chaque capacité a un contre écrit.
- En PvP, les contrôles durent 1 tour de moins, avec un minimum d'1 tour.
- Rendements décroissants par catégorie (section 6.11).
- La Garde du héros s'applique (section 6.5).
- Minuteur de tour de 60 s, en simple rappel : on réclame un dépassement avec la mécanique déjà
  prévue par `rules.md` §10.2.

### Champ de bataille (v2)
- Contrôle de cases : 3 cases-objectifs, 1 point par tour pour chaque case tenue, premier à 30.

### Zones contestées (v2)
- Une salle P2P par zone, de 8 à 16 joueurs, avec un drapeau PvP qu'on active soi-même.

### Récompenses
- L'Honneur, puis des cosmétiques, des titres, de l'Élan et des objets de gabarit.

---

## 20. Battle royale : la Grande Brèche

### Base
On part de la spec BR existante (`game-design.md` §6, `rules.md` §10.4) :
- 6 joueurs ;
- un plateau de rayon 8 ;
- la Brèche ;
- le commit-reveal ;
- une initiative qui tourne ;
- 10 boules par joueur.

### Ce que le RPG ajoute
- **Tout le monde est normalisé.**
  - Un héros de niveau 20, sur gabarit, sans équipement.
  - 2 capacités du palier 1, au choix.
  - Pas d'ultime au départ.
- **Butin dans la partie**, comme dans PUBG ou Fortnite.
  - Des coffres posés sur des cases. On les ramasse en finissant un Mouvement dessus.
  - Ils donnent des objets temporaires : un ultime, des stats, des consommables.
- **Élimination.** Un joueur est éliminé quand son héros meurt (0 PV ou éjection), ou quand il n'a
  plus aucune boule. Toutes ses boules disparaissent aussitôt (règle existante).
- **Un ordre de tour** contient 1 Action, 1 Action rapide et 1 Mouvement au maximum.
  - Les ordres se résolvent dans l'ordre d'initiative.
  - Chaque ordre est validé au moment où vient son tour. S'il est devenu illégal, il ne fait rien.
  - Ça fonctionne tel quel avec l'option C existante.

### Calendrier
- Chaque jour à 20 h UTC, et le week-end.
- Le calendrier est déterministe. On rejoint un salon P2P, et des bots remplissent les places
  vides.

### Récompenses
- Jetons de Brèche, XP de héros, réputation auprès des Pilleurs.

### v2 : la Brèche à deux échelles
- 19 tuiles du monde.
- **Dans le monde** : déplacement, butin sur les tuiles, tempête qui avance de tuile en tuile.
- **Sur le plateau** : quand deux joueurs se croisent, ils se battent sur le plateau de la tuile.

---

## 21. Hub et social

### Le Ballast, la capitale

| Salle | Contenu |
|---|---|
| Pont | Tally, la quête principale, puis le raid final |
| **Mess** | Les **tables d'Abalone classique** : hot-seat, 1v1 en ligne, défi du jour, boss classiques. Les modes existants restent intacts |
| Soute | Marchands, banquier, Parieur |
| Fournaise | Stations de raffinage et d'artisanat |
| Chapelle | Le Maître des Voies |
| Baie de lancement | Arènes, battle royale, recherche de groupe |
| Archives | Le Codex, les terminaux (#20), les journaux audio (#21) |

### Avant-postes
- Chacun propose un marchand, une Balise, une station de raffinage et un tableau de contrats.

### Présence des autres joueurs
- Les autres boules sont visibles, en best effort.
- On communique avec 4 emotes et des pings.
- On peut **inspecter** un joueur : son équipement s'affiche comme « non vérifié ».

### Groupes et guildes
- On forme un groupe par lien ou par code. Une recherche publique existe, en best effort.
- Guildes en v2 : une liste signée, gardée en local.
- Pas de chat libre (décision existante).

---

## 22. Exploration et secrets

- **Découverte** : un pourcentage par zone.
- **Codex** : le bestiaire, la flore, le lore, les énigmes résolues, les boss qu'on peut rejouer.
- **Secrets** : des coffres cachés, des élites rares qui réapparaissent à heures fixes, des cartes au
  trésor.
- **Événements dynamiques** (comme dans Diablo 4) :
  - défendre un convoi, purger une Fissure, chasser un rare ;
  - de 5 à 10 minutes ;
  - ils apparaissent selon une graine UTC.

---

## 23. Fin de jeu (niveau 100)

- **Mythique+.**
- **Raids.**
- **Failles du Vide** (comme les Grandes failles de Diablo 3) : une suite de combats aléatoires, avec
  un budget de tours. Elles vont du niveau 1 au niveau 100, avec un classement local signé.
- **Niveaux de monde** : Normal, Cauchemar, Enfer, Tourment. Chaque niveau augmente les stats, le
  butin et l'iLvl. On débloque le suivant avec un donjon d'accès. Ce sont des paliers de contenu, pas
  un réglage de difficulté (à confirmer, voir section 26).
- **Saisons** de 3 mois.
- **Chasse** aux Légendaires, aux Uniques et aux ensembles.
- **Codex** à compléter.
- **Hardcore.**

---

## 24. Architecture technique (implémentations simples)

**Principes** : tout est pur, déterministe et piloté par les données. On code en TDD avec 100 % de
couverture. Pas de serveur.

### 24.1 Déterminisme (obligatoire)
- **Entiers uniquement.**
  - Stats en entiers.
  - Pourcentages en points de base.
  - Un ordre fixe pour multiplier, puis arrondir à l'entier inférieur.
  - Pas de nombres à virgule flottante dans les règles.
- **Ordre fixe partout.**
  - Les unités sont dans un `Vec` trié par id.
  - Les cases sont parcourues dans un ordre fixe : r croissant, puis q croissant.
  - On ne parcourt jamais une `HashMap`. Aujourd'hui, `Board` stocke ses cases dans une `HashMap`
    std, dont l'ordre de parcours change d'un processus à l'autre.
- **Le hash d'état couvre tout** : plateau, terrain et durées, PV, statuts, recharges, ressources,
  Cimetière, Préparations.
- **Les graines de combat** sont tirées par commit-reveal en ligne.

### 24.2 Moteur
- **`abalone-core`**
  - `Board` passe à une région de cases arbitraire (un masque) plutôt qu'à un rayon limité par
    `MAX_RADIUS = 5`. C'est nécessaire pour la battle royale au rayon 8 et pour les combats sur
    plusieurs tuiles.
  - Une couche de terrain : type de case et durée.
  - Chaque case connaît son occupant : camp et id d'unité.
  - Une règle de poussée `Classic` ou `Weighted`, avec un test de propriété qui vérifie que
    `Weighted` avec tous les Poids à 1 donne `Classic`.
- **Nouvelle crate `abalone-rpg`**
  - Le combat : `Unit`, `Entity`, `CombatState`.
  - Les actions : `Action` (Move, Ability, Consumable, Flee, Step).
  - `apply_action`, une fonction pure, qui renvoie des `Effects` (le contrat de rendu actuel).
  - Un interpréteur des 12 primitives.
  - Les formules, les statuts, les limites d'éjection, la victoire.
  - **L'IA des monstres** : un ordre fixe, les 3 meilleures cibles pour les capacités, puis
    l'alpha-bêta. On adapte `search.rs` à un trait d'état de combat qui voit le terrain, les
    statuts et les hooks (c'est la suite déjà demandée dans `boss-balance.md` §6).
  - **Le bot joueur**, pour l'échelle d'équilibrage : le même agent, avec un script de rotation par
    classe. Il est spécifié dès R1.
- **Nouvelle crate `abalone-world`**
  - La carte (biomes, graine, pavage), l'A*, les rencontres, les nœuds.
  - Les quêtes, sous forme de machine à états.
  - Le butin, l'artisanat, l'XP.
  - La validation des talents : budgets 99 et 20, paliers, coûts 1/1/2.
  - La sauvegarde, versionnée.

### 24.3 Données
- **Dossier `data/`**, en RON ou en JSON :
  - classes, capacités, runes ;
  - cases, biomes, monstres ;
  - objets, recettes ;
  - quêtes, donjons.
- **Chargement** : les fichiers sont inclus dans le binaire avec `include_str!`.
- **Tests d'intégrité** :
  - chaque référence existe ;
  - les budgets de points sont justes ;
  - aucun coût ne dépasse la ressource max ;
  - chaque capacité a un contre-jeu ;
  - chaque Éjecteur a un tell, ou c'est un ultime ;
  - chaque contrôle de masse touche 3 cibles au plus.

### 24.4 Pont `abalone-wasm`
- Des fonctions pour le monde et pour le combat, en JSON versionné.

### 24.5 Client
- **Scènes**
  - `world.ts` : les tuiles en instanced mesh, le brouillard, la caméra.
  - La transition de la tuile au plateau.
  - Le plateau réutilise le rendu actuel. On y ajoute :
    - les décalques de terrain et leurs glyphes ;
    - un anneau de PV autour de chaque boule ;
    - les pastilles de Poids ;
    - les statuts ;
    - l'intention ;
    - l'aperçu des dégâts et des poussées.
- **Interface (`world.md` §6)**
  - La barre d'actions 4 + 1 est **gravée sur le cadre du plateau**, donc dans le monde du jeu. Une
    version plate existe en option d'accessibilité.
  - Touches de la barre :
    - capacités : 1 à 4 ;
    - ultime : R ;
    - consommable : F ;
    - fin de tour : Espace.
  - Q, W, E, A, S, D restent pour les directions.
  - Fenêtres : fiche du héros, inventaire, Voies, arbre actif, journal, carte, marchand, artisanat.
- **Sauvegarde**
  - Des stores IndexedDB `hero` et `combat`.
  - Export et import (même modèle que `savegame.ts`).
- **Réseau**
  - Le combat de groupe utilise `session.ts`, `transport.ts` et `p2p.ts`, en lockstep.
  - La présence passe par Trystero.

### 24.6 Suites
- MCP (#163) : ajouter les capacités à `legal_moves` et à `get_state`. Ce sera une issue à part.

---

## 25. Feuille de route (phases R : une tranche verticale d'abord)

On prouve d'abord que le combat est amusant. Le monde vient ensuite.

| Phase | Contenu | Critère de fin |
|---|---|---|
| R0 | Cette spec : le Decision et 4 PRs de docs | Decision fermé, specs mergées |
| R1 | **Combat minimal**. Un plateau. Un Guerrier niveau 1 et son escouade contre une meute de 2 types de monstres. Contenu : PV, ATQ, ARM, Poids, Choc, poussée pondérée, Rage, 2 capacités, recharges, déroute, mort du héros (0 PV ou éjection), alerte « Danger du bord ». Avec le bot joueur | Jouable dans le navigateur, test « Poids 1 = classique » vert, déterminisme vérifié (même log = même hash), e2e vert |
| R2 | 4 classes (Gardien, Guerrier, Mage, Guérisseur), statuts, 6 types de cases | Chaque classe bat la meute de référence sur l'échelle de bots |
| R3 | Progression : XP, niveaux 1 à 30, 2 Voies, arbre actif, sauvegarde du héros, tutoriel des niveaux 1 à 4 | Du niveau 1 au niveau 30 en test scripté |
| R4 | Monde v1 : 3 biomes, déplacement, meutes, transition, Balises, hub minimal, défaite et retour | Marcher, combattre, revenir, recharger la page |
| R5 | Butin, inventaire, coffre, marchands, or | La boucle « tuer, trouver, vendre, s'équiper » |
| R6 | Quêtes : moteur, journal, quête principale, zones 1 à 3 | Une chaîne finie de bout en bout |
| R7 | Récolte et artisanat : 5 récoltes, raffinage, 4 stations, consommables | Fabriquer un objet à partir de matériaux récoltés |
| R8 | Donjons et boss : les Cales du Ballast (The Echo), les 5 boss convertis, combats multi-tuiles | Une fixture de victoire RPG par boss |
| R9 | Monde complet : 10 biomes, niveau 100, 4 classes de plus, 5 Voies, fin de jeu | Les 8 classes passent l'échelle de bots |
| R10 | Multijoueur : groupe P2P, duels et arènes normalisées, battle royale RPG, présence au hub | e2e à 2 onglets, en groupe et en arène |

---

## 26. Questions ouvertes (réponses plus tard)

1. **Nom et pitch.** On garde « AB-ALONE » et on réécrit `SPEC.md` §1 ?
2. **Durée de la montée en niveau.** 110 h jusqu'au niveau 100, ou plus court (60 h) ?
3. **Taille du monde.** Un rayon de 60, ou plus petit pour la v1 ?
4. **Hardcore et saisons.** Dès la sortie, ou plus tard ?
5. **Langues.** Le jeu en français et en anglais, avec de l'i18n ?
6. **Mobile.** Une barre d'actions tactile ? Seule l'app native est hors du périmètre, pas le web
   mobile.
7. **Revenants.** La limite de 3, une seule réanimation par entrée et la règle du score suffisent-ils
   contre les combats qui ne finissent jamais ? À vérifier en playtest.
8. **Escouade.** Les mêmes Fragments pour toutes les classes, ou une escouade propre à chaque
   classe (v2) ?
9. **Niveaux de monde.** Est-ce contraire au pilier « pas de curseur de difficulté » ? Ma
   proposition : ce sont des paliers de contenu à débloquer, pas un réglage. Un owner tranche.
10. **Héros en PvP.** On vérifie en playtest que les parties ne se résument pas à éjecter le héros
    en 3 tours. Si c'est le cas, on règle d'abord la Formation et l'alerte, et on ne revient pas
    sur la règle « héros éjecté = mort ».

---

## Fichiers critiques

- **À créer** : `docs/specs/rpg/*.md`, 13 fichiers (section 0).
- **À modifier** :
  - `SPEC.md` (§1, §4, §6) ;
  - `docs/specs/game-design.md` (§1, §3.5, §4) ;
  - `docs/specs/world.md` (§1, §2, §4, §6) ;
  - `docs/specs/rules.md` (§5, intro du §10, nouveau §10.5, exemples) ;
  - `docs/specs/tech.md` (§3, crates, déterminisme).
- **Code que la spec cite** (pour les phases R1 et suivantes) :
  - `crates/abalone-core/src/board.rs` : `Board`, `with_radius`, `void`, `cracks`, et le parcours
    de la `HashMap` à remplacer ;
  - `moves.rs` : `legal_moves`, `apply` ;
  - `game.rs` : l'historique et la répétition ;
  - `search.rs` : alpha-bêta avec budget en nœuds ;
  - `encounter/*.rs` : hooks, `ladder.rs`, `fixture.rs`, `telemetry.rs` ;
  - `client/src/daily.ts` : la graine UTC ;
  - `savegame.ts`, `session.ts`, `p2p.ts`.

## Vérification

- **Les chiffres tiennent.**
  - Passif : 5 + 30 + 10 + 54 = 99. Avec le plafond d'éclats `min(6, 1 + ⌊L/16⌋)`, on peut
    toujours dépenser au moins autant de points qu'on en a.
  - Actif : 20 points = 5 capacités à 4 points. L'ultime est bien atteignable au niveau 30 avec
    4 points dans sa branche.
- **Chaque nombre porte son étiquette** : FINAL, TUNE ou PROPOSAL.
- **Chaque capacité est complète** : type, coût, recharge, portée, effet, contre-jeu. Chaque
  Éjecteur a un tell, ou c'est un ultime. Aucune capacité ne dépasse 1 éjection, sauf le terrain
  avec un tell de 2 tours ou plus.
- **Les exemples Given/When/Then de `rules.md`** couvrent :
  - la poussée pondérée (6 cas) ;
  - le Choc ;
  - la glissade sur la Glace (dont la limite d'une éjection) ;
  - la couture entre deux plateaux ;
  - le héros éjecté, qui meurt et fait perdre le combat, et l'alerte « Danger du bord » ;
  - la réanimation et le score (dont « une seule fois par entrée ») ;
  - la fuite ;
  - l'Isolement et la Formation ;
  - les durées (un Gelé d'1 tour fait sauter 1 tour) ;
  - les recharges ;
  - le Pas bonus limité à un par tour.
- **Relecture** : @TidyMaze relit le diff de chaque PR de docs avant de la merger (CONTRIBUTING
  §6.4).
- **Pas de code dans ces PRs** : le TDD (§11) s'appliquera à partir de R1.
