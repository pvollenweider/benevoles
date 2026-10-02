# Product

## Register

product

## Users

**Organisateurs** (admins) — responsables associatifs ou coordinateurs festival. Contexte : bureau, parfois mobile, sous pression avant et pendant l'événement. Tâche principale : créer les créneaux, inviter les membres du pool, suivre les inscriptions, exporter pour le terrain. Ils connaissent Excel et sont à l'aise avec les outils web, mais n'ont pas de temps à perdre à apprendre.

**Bénévoles** (public) — profils très variés, dont des seniors. Contexte : téléphone, souvent en déplacement ou sur place. Tâche unique : choisir un créneau, s'inscrire, gérer son inscription. Ils arrivent par un lien (email, page de l'organisation ou QR code) et ne créent pas de compte. L'expérience doit fonctionner sans effort.

**Responsables de secteur** — bénévoles désignés pour un poste, sans compte. Un lien personnel leur montre les inscrits de leur poste, pour les coordonner sur place.

**Super admin** — l'opérateur de la plateforme : organisations, nouveautés produit envoyées aux admins, santé du service.

## Product Purpose

Benevol est un outil communautaire open source qui simplifie la gestion des bénévoles pour les événements (festivals, spectacles, associations). Il couvre le cycle complet : création des créneaux → pool de membres → invitations tokenisées → inscription publique via Gantt → rappels automatiques → exports terrain.

Ce n'est pas un produit SaaS commercial — c'est un outil que des organisations gèrent elles-mêmes ou partagent en multi-tenant. Le succès se mesure à la réduction de friction pour les organisateurs et à la clarté absolue pour les bénévoles.

## Brand Personality

**Simple · Humain · Fiable**

La voix est directe, bienveillante, légèrement chaleureuse — mais jamais familière au point d'être condescendante. On tutoie les bénévoles, dans les emails et sur leur page personnelle ; on vouvoie les organisateurs et les responsables de secteur. On ne vend pas, on organise. L'interface s'efface pour laisser l'information devant.

Référence d'élégance : Notion / Linear — sobre, structuré, dense sans être oppressant. Le chrome disparaît, le contenu prime.

## Anti-references

- **SaaS corporate froid** (Salesforce, Monday.com) : bleu-gris générique, hero-metrics, jargon de conversion, KPI partout. Benevol n'a pas de dashboards de croissance.
- Overdesign dev-centric : dark mode obsidien pour le principe, typographie ultra-serrée, vibes "startup B2B".
- Outil associatif daté : pastel délavé, hiérarchie plate, visuellement 2012.

## Design Principles

1. **Structure avant décoration.** L'interface organise, elle ne performe pas. Chaque élément visuel gagne sa place par l'information qu'il porte, pas par l'effet qu'il crée.

2. **Les bénévoles ne sont pas des utilisateurs à convertir.** Ils sont là pour aider. Le ton et les états UI (succès, erreur, attente) leur parlent comme à des alliés, pas comme à des leads.

3. **La fiabilité se voit.** Pour un outil qui gère de vrais événements, la prévisibilité construit la confiance : espacement cohérent, états clairs, pas de surprises entre les écrans.

4. **Mobile d'abord sur le public, dense sur l'admin.** Les bénévoles s'inscrivent sur téléphone au festival. Les organisateurs travaillent sur desktop avec beaucoup de données. Les deux ont leurs exigences propres.

5. **Communauté, pas produit.** L'outil est open source et maintenu par ceux qui l'utilisent. Pas d'upsell, pas de paywall, pas de dark patterns. La transparence fait partie du design.

## Accessibility & Inclusion

Cible WCAG 2.2 AA sur toutes les surfaces ; état réel et limites connues dans `ACCESSIBILITE.md` (page `/accessibilite`), vérifications dans `docs/accessibilite.md`. Aucune régression acceptée. Pas d'animation de mouvement hors `motion-safe:`. Attention particulière sur la timeline Gantt publique (seniors, mobile, contraste des barres de postes).
