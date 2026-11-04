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
        character_id: 'rina',
        name: 'Rina',
        role: 'protagonist',
        age_range: 'mid-20s',
        description: 'Night courier with a stubborn sense of duty',
        visual_identity: {
          face: 'Sharp jaw, rain-specked skin',
          hair: 'Short black hair',
          eyes: 'Determined dark eyes',
          skin: 'Light olive, rain droplets',
          clothing: 'Amber weather jacket, dark pants, boots',
          body: 'Lean athletic build',
          distinctive_features: 'Courier satchel always on left shoulder',
          accessories: 'Earpiece, worn gloves',
        },
        clothing: 'Amber weather jacket, dark pants, boots',
        appearance_details: 'Determined eyes, rain-specked face',
        reference_image_prompt:
          'Portrait of a mid-20s night courier woman, short black hair, amber weather jacket, courier satchel, rainy neon rim light, vertical reference photo',
        continuity_rules:
          'Always wear amber jacket and satchel on left shoulder. Hair stays short and rain-damp. Never change eye color.',
        voice_description: 'Low, steady, slightly breathless when running',
        dialogue_style: 'Short clipped lines, rarely explains herself',
      },
      {
        character_id: 'the-chip',
        name: 'The Chip',
        role: 'catalyst',
        age_range: 'ageless device',
        description: 'Mysterious memory device inside the package',
        visual_identity: {
          face: '',
          hair: '',
          eyes: '',
          skin: '',
          clothing: '',
          body: 'Palm-sized translucent slab',
          distinctive_features: 'Soft cyan glow that pulses when speaking',
          accessories: 'Sealed in a wet courier pouch',
        },
        clothing: '',
        appearance_details: 'Pulses brighter when speaking',
        reference_image_prompt:
          'Palm-sized translucent memory chip with soft cyan glow, sealed pouch residue, product-style reference on dark wet surface',
        continuity_rules: 'Always cyan glow; never change shape or color temperature.',
        voice_description: 'Soft layered whisper',
        dialogue_style: 'Fragmented memory phrases',
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
        character_ids: ['rina', 'the-chip'],
        narration: 'It called her name before she ever opened it.',
        dialogue: 'Rina: Not tonight…',
        text_overlay: 'It knows your name',
        transition_out: 'whip_pan',
        audio_direction: 'Rain + distant traffic + soft package whisper',
        camera_direction: 'Push-in close-up on package then Rina face',
        environment: 'Neon awning, wet sidewalk',
        lighting: 'Magenta/cyan neon rim light',
      },
      {
        scene_number: 2,
        title: 'Alley Sprint',
        duration_seconds: 7,
        visual_description: 'Rina sprints through reflective puddles between towering signs.',
        flow_prompt:
          'Tracking shot through neon alley, courier running with satchel, rain streaks, cinematic motion, vertical 9:16',
        character_ids: ['rina'],
        narration: 'The city wanted the package more than she did.',
        dialogue: '',
        text_overlay: 'Keep moving',
        transition_out: 'cut',
        audio_direction: 'Footsteps splash, rising synth pulse',
        camera_direction: 'Side tracking mid-shot',
        environment: 'Narrow neon alley, reflective puddles',
        lighting: 'Moving neon streaks on wet pavement',
      },
      {
        scene_number: 3,
        title: 'Rooftop Bargain',
        duration_seconds: 8,
        visual_description: 'A silhouetted buyer waits on a rooftop as Rina hesitates.',
        flow_prompt:
          'Rooftop exchange at night, neon skyline, tense courier facing a silhouetted buyer, cinematic lighting',
        character_ids: ['rina', 'the-chip'],
        narration: '',
        dialogue: 'Buyer: Hand it over.\nRina: It is not finished speaking.',
        text_overlay: '',
        transition_out: 'dissolve',
        audio_direction: 'Wind, distant sirens, chip hum',
        camera_direction: 'Wide two-shot then cut to satchel',
        environment: 'Rooftop overlooking neon skyline',
        lighting: 'Backlit silhouette against city glow',
      },
      {
        scene_number: 4,
        title: 'Memory Flood',
        duration_seconds: 8,
        visual_description:
          'Rina opens the chip; cyan light paints her face with remembered streets.',
        flow_prompt:
          'Extreme close-up of courier opening a glowing memory chip, cyan light on face, emotional cinematic portrait',
        character_ids: ['rina', 'the-chip'],
        narration: 'Inside were nights she had already survived.',
        dialogue: 'Chip: You left yourself a map.',
        text_overlay: 'Open it',
        transition_out: 'cut',
        audio_direction: 'Intimate whisper + soft memory reverb',
        camera_direction: 'Extreme close-up face + chip',
        environment: 'Sheltered rooftop corner',
        lighting: 'Cyan fill from chip, dark ambient',
      },
      {
        scene_number: 5,
        title: 'Own Voice',
        duration_seconds: 7,
        visual_description: 'Rina walks into the rain again, calmer, package empty, city quieter.',
        flow_prompt:
          'Wide vertical shot of courier walking into rain-soaked neon street, hopeful ending, cinematic atmosphere',
        character_ids: ['rina'],
        narration: 'The delivery was never for someone else.',
        dialogue: 'Rina: I remember the way home.',
        text_overlay: 'Delivered',
        transition_out: 'fade',
        audio_direction: 'Rain softens, hopeful low drone',
        camera_direction: 'Slow wide pull-back',
        environment: 'Open neon street in rain',
        lighting: 'Soft dawn-adjacent neon wash',
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
