/** Content-platform enums: Brand → Project → Video → Distribution. */

export const SOCIAL_PLATFORMS = [
  'youtube',
  'facebook',
  'instagram',
  'tiktok',
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_CONNECTION_STATUSES = [
  'registered',
  'connected',
  'error',
  'revoked',
] as const;

export type SocialConnectionStatus = (typeof SOCIAL_CONNECTION_STATUSES)[number];

export const DISTRIBUTION_STATUSES = [
  'draft',
  'ready',
  'scheduled',
  'published_manual',
  'published',
  'failed',
  'cancelled',
] as const;

export type DistributionStatus = (typeof DISTRIBUTION_STATUSES)[number];

export const VIDEO_PORTFOLIO_STATES = [
  'draft',
  'in_production',
  'ready_for_assembly',
  'completed',
  'published',
  'failed',
] as const;

export type VideoPortfolioState = (typeof VIDEO_PORTFOLIO_STATES)[number];

export const ENVIRONMENT_KINDS = [
  'location',
  'room',
  'landscape',
  'battlefield',
  'building',
  'fictional',
  'prop',
  'other',
] as const;

export type EnvironmentKind = (typeof ENVIRONMENT_KINDS)[number];
