import { formatVisualIdentity } from '@ai-shorts-factory/validation';
import type {
  CharacterVisualIdentity,
  CreateCharacterInput,
  UpdateCharacterInput,
} from './story-types.js';

export const EMPTY_VISUAL_IDENTITY: CharacterVisualIdentity = {
  face: '',
  hair: '',
  eyes: '',
  skin: '',
  clothing: '',
  body: '',
  distinctive_features: '',
  accessories: '',
};

export function mergeVisualIdentity(
  input: CreateCharacterInput | UpdateCharacterInput,
  existing?: CharacterVisualIdentity,
): CharacterVisualIdentity {
  const base = { ...(existing ?? EMPTY_VISUAL_IDENTITY) };
  const structured = input.visual_identity_structured;
  if (structured) {
    return {
      face: structured.face?.trim() ?? base.face,
      hair: structured.hair?.trim() ?? base.hair,
      eyes: structured.eyes?.trim() ?? base.eyes,
      skin: structured.skin?.trim() ?? base.skin,
      clothing: structured.clothing?.trim() ?? base.clothing,
      body: structured.body?.trim() ?? base.body,
      distinctive_features:
        structured.distinctive_features?.trim() ?? base.distinctive_features,
      accessories: structured.accessories?.trim() ?? base.accessories,
    };
  }

  const flat = input.visual_identity?.trim();
  if (flat) {
    return {
      ...base,
      distinctive_features: flat,
      clothing: input.clothing?.trim() ?? base.clothing,
    };
  }

  if (input.clothing !== undefined) {
    base.clothing = input.clothing.trim();
  }
  if (input.appearance_details !== undefined && input.appearance_details.trim()) {
    base.distinctive_features = input.appearance_details.trim();
  }
  return base;
}

export function flattenVisualIdentity(identity: CharacterVisualIdentity): string {
  return formatVisualIdentity(identity);
}

export function normalizeStoredVisualIdentity(
  value: unknown,
  clothing = '',
  appearanceDetails = '',
): CharacterVisualIdentity {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    return {
      face: String(row.face ?? ''),
      hair: String(row.hair ?? ''),
      eyes: String(row.eyes ?? ''),
      skin: String(row.skin ?? ''),
      clothing: String(row.clothing ?? clothing ?? ''),
      body: String(row.body ?? ''),
      distinctive_features: String(row.distinctive_features ?? appearanceDetails ?? ''),
      accessories: String(row.accessories ?? ''),
    };
  }
  if (typeof value === 'string' && value.trim()) {
    return {
      ...EMPTY_VISUAL_IDENTITY,
      distinctive_features: value.trim(),
      clothing: clothing || '',
    };
  }
  return {
    ...EMPTY_VISUAL_IDENTITY,
    clothing: clothing || '',
    distinctive_features: appearanceDetails || '',
  };
}
