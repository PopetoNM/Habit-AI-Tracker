export type CoachTopic = "neutral" | "food" | "focus" | "mentality";

export type CoachPalette = {
  primary: string;
  secondary: string;
  core: string;
  label: string;
};

export type CoachParticleOptions = {
  count: number;
  radius: number;
};

const TOPIC_WORDS: Record<Exclude<CoachTopic, "neutral">, RegExp[]> = {
  food: [
    /\bfood\b/i,
    /\beat(?:ing)?\b/i,
    /\bmeal\b/i,
    /\bdiet\b/i,
    /\bjunk\b/i,
    /\bsugar\b/i,
    /\bcalor(?:y|ies)\b/i,
    /\bprotein\b/i,
    /\bsnack\b/i,
    /\bfasting\b/i,
  ],
  focus: [
    /\bfocus(?:ed|ing)?\b/i,
    /\bstudy\b/i,
    /\bdeep work\b/i,
    /\bwork block\b/i,
    /\bflow\b/i,
    /\bdistraction\b/i,
    /\bproductive\b/i,
    /\battention\b/i,
    /\bpomodoro\b/i,
    /\btimer\b/i,
  ],
  mentality: [
    /\bmental(?:ity| state)?\b/i,
    /\bmindset\b/i,
    /\bmood\b/i,
    /\bmotivation\b/i,
    /\bstress\b/i,
    /\banxiety\b/i,
    /\bconfidence\b/i,
    /\bdiscipline\b/i,
    /\bburnout\b/i,
    /\bemotion\b/i,
  ],
};

export const COACH_TOPIC_PALETTES: Record<CoachTopic, CoachPalette> = {
  neutral: {
    primary: "#ff9f2f",
    secondary: "#ffd166",
    core: "#fff0a3",
    label: "neutral scan",
  },
  food: {
    primary: "#ff3b36",
    secondary: "#ff8a65",
    core: "#ffd0c4",
    label: "food protocol",
  },
  focus: {
    primary: "#1e9bff",
    secondary: "#75e8ff",
    core: "#d8fbff",
    label: "focus protocol",
  },
  mentality: {
    primary: "#2fe66f",
    secondary: "#98ffb8",
    core: "#ddffe7",
    label: "mentality protocol",
  },
};

export function classifyCoachTopic(text: string): CoachTopic {
  const scores = Object.entries(TOPIC_WORDS).map(([topic, patterns]) => ({
    topic: topic as Exclude<CoachTopic, "neutral">,
    score: patterns.reduce(
      (total, pattern) => total + (pattern.test(text) ? 1 : 0),
      0,
    ),
  }));
  const winner = scores.sort((left, right) => right.score - left.score)[0];
  return winner.score > 0 ? winner.topic : "neutral";
}

export function getCoachTopicPalette(topic: CoachTopic): CoachPalette {
  return COACH_TOPIC_PALETTES[topic];
}

export function createCoachOrbParticles({
  count,
  radius,
}: CoachParticleOptions): Float32Array {
  const positions = new Float32Array(count * 3);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let index = 0; index < count; index += 1) {
    const progress = count === 1 ? 0.5 : index / (count - 1);
    const y = 1 - progress * 2;
    const radial = Math.sqrt(1 - y * y);
    const theta = goldenAngle * index;
    const spiral = Math.sin(index * 0.045) * 0.18;
    const shell = 0.68 + deterministicNoise(index) * 0.42;
    const distance = radius * (shell + spiral);

    positions[index * 3] = Math.cos(theta) * radial * distance;
    positions[index * 3 + 1] = y * distance;
    positions[index * 3 + 2] = Math.sin(theta) * radial * distance;
  }

  return positions;
}

export function createCoachOrbitParticles({
  count,
  radius,
}: CoachParticleOptions): Float32Array {
  const positions = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const wave = Math.sin(index * 0.17) * 0.16;
    const tilt = Math.cos(index * 0.09) * 0.18;
    positions[index * 3] = Math.cos(angle) * (radius + wave);
    positions[index * 3 + 1] = tilt;
    positions[index * 3 + 2] = Math.sin(angle) * (radius + wave);
  }

  return positions;
}

function deterministicNoise(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}
