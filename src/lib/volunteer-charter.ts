export function buildVolunteerCharter({ hasOrgInsurance = true }: { hasOrgInsurance?: boolean } = {}): string {
  const insuranceClause = hasOrgInsurance
    ? `La personne bénévole sera couverte pendant toute la durée de sa présence par l'assurance responsabilité civile de l'organisation. Elle reste néanmoins responsable auprès des tiers de tout dommage qu'elle causerait personnellement.`
    : `La personne bénévole est responsable de sa propre couverture accidents (LAA ou assurance personnelle équivalente). Elle reste responsable auprès des tiers de tout dommage qu'elle causerait personnellement.`

  return `A été convenu que :

1. Engagement bénévole

La personne bénévole s'engage librement pour mener une activité non salariée en faveur de l'organisation, en dehors de son temps professionnel et familial. Elle s'engage :

- À respecter toutes les personnes avec qui elle sera en contact, quelles que soient leur origine, leur genre, leur sexualité ou leur identité d'expression,
- À respecter ses disponibilités validées avec la responsable bénévole,
- À participer aux missions confiées par la responsable bénévole selon ses disponibilités,
- À s'assurer d'une couverture accidents personnelle adéquate (LAA).

2. En outre, la personne bénévole accepte

- De respecter les consignes de sécurité en vigueur,
- D'être garante de l'image de l'organisation,
- De considérer son engagement avec tout le sérieux nécessaire au bon déroulement des activités,
- De prévenir la responsable bénévole au moins 48 heures à l'avance en cas de désistement ou de changement de disponibilité, afin de ne pas compromettre l'organisation générale de l'équipe.

3. L'organisation s'engage envers la personne bénévole

- À fournir les informations et le matériel nécessaires à l'exercice des missions,
- À assurer un environnement de travail respectueux et bienveillant,
- À remettre, sur demande, un certificat de bénévolat à l'issue de l'engagement.

${insuranceClause}`
}

export const DEFAULT_VOLUNTEER_CHARTER = buildVolunteerCharter()
