import { SCREENPLAY_SCHEMA_VERSION, type ScreenplayV1 } from '@ai-shorts-factory/validation';

/** Deterministic valid five-scene screenplay for tests and local demos. */
export function createSampleScreenplay(overrides?: Partial<ScreenplayV1>): ScreenplayV1 {
  const base: ScreenplayV1 = {
    schema_version: SCREENPLAY_SCHEMA_VERSION,
    title: 'Echoes in Neon',
    category: 'cinematic',
    visual_style: 'realistic_cinematic',
    story_summary:
      'A courier races across a rainy neon city to deliver a package that whispers memories.',
    hook: 'Rain hits neon glass as a sealed package starts whispering her name.',
    characters: [
      {
        name: 'Rina',
        description: 'Night courier with a stubborn sense of duty',
        visual_identity: 'Short black hair, amber jacket, courier satchel',
        clothing: 'Amber weather jacket, dark pants, boots',
        appearance_details: 'Determined eyes, rain-specked face',
      },
      {
        name: 'The Chip',
        description: 'Mysterious memory device inside the package',
        visual_identity: 'Palm-sized translucent chip with soft cyan glow',
        clothing: '',
        appearance_details: 'Pulses brighter when speaking',
      },
    ],
    scenes: [
      {
        scene_number: 1,
        title: 'Whispering Parcel',
        duration_seconds: 7,
        visual_description: 'Close-up of Rina under a neon awning as the package vibrates.',
        flow_prompt:
          'Cinematic vertical shot, rainy neon street, courier girl holding a glowing package that whispers, dramatic rim light, 6 seconds',
        narration: 'It called her name before she ever opened it.',
        dialogue: 'Rina: Not tonight…',
        text_overlay: 'It knows your name',
        transition_out: 'whip_pan',
      },
      {
        scene_number: 2,
        title: 'Alley Sprint',
        duration_seconds: 7,
        visual_description: 'Rina sprints through reflective puddles between towering signs.',
        flow_prompt:
          'Tracking shot through neon alley, courier running with satchel, rain streaks, cinematic motion, vertical 9:16',
        narration: 'The city wanted the package more than she did.',
        dialogue: '',
        text_overlay: 'Keep moving',
        transition_out: 'cut',
      },
      {
        scene_number: 3,
        title: 'Rooftop Bargain',
        duration_seconds: 8,
        visual_description: 'A silhouetted buyer waits on a rooftop as Rina hesitates.',
        flow_prompt:
          'Rooftop exchange at night, neon skyline, tense courier facing a silhouetted buyer, cinematic lighting',
        narration: '',
        dialogue: 'Buyer: Hand it over.\nRina: It is not finished speaking.',
        text_overlay: '',
        transition_out: 'dissolve',
      },
      {
        scene_number: 4,
        title: 'Memory Flood',
        duration_seconds: 8,
        visual_description:
          'Rina opens the chip; cyan light paints her face with remembered streets.',
        flow_prompt:
          'Extreme close-up of courier opening a glowing memory chip, cyan light on face, emotional cinematic portrait',
        narration: 'Inside were nights she had already survived.',
        dialogue: 'Chip: You left yourself a map.',
        text_overlay: 'Open it',
        transition_out: 'cut',
      },
      {
        scene_number: 5,
        title: 'Own Voice',
        duration_seconds: 7,
        visual_description: 'Rina walks into the rain again, calmer, package empty, city quieter.',
        flow_prompt:
          'Wide vertical shot of courier walking into rain-soaked neon street, hopeful ending, cinematic atmosphere',
        narration: 'The delivery was never for someone else.',
        dialogue: 'Rina: I remember the way home.',
        text_overlay: 'Delivered',
        transition_out: 'fade',
      },
    ],
    ending:
      'She realizes the package was a message from her past self and walks forward with purpose.',
    publishing_metadata: {
      title: 'Echoes in Neon',
      description: 'A courier delivers a whispering memory through a rainy neon city.',
      tags: ['cinematic', 'sci-fi', 'short'],
    },
  };

  return { ...base, ...overrides, scenes: overrides?.scenes ?? base.scenes };
}
