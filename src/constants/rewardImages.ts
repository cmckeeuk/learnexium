import type { ImageSourcePropType } from 'react-native';

export type RewardVisualType = 'xp' | 'badge' | 'certificate';

export const XP_TOKEN_IMAGE = require('../../assets/rewards/icons/xp-token.png');
export const CERTIFICATE_REWARD_IMAGE = require('../../assets/rewards/icons/certificate.png');

const FIRST_STEPS_BADGE_IMAGE = require('../../assets/rewards/icons/badge-first-steps.png');
const CARD_CRUSHER_BADGE_IMAGE = require('../../assets/rewards/icons/card-crusher.png');
const QUIZ_STARTER_BADGE_IMAGE = require('../../assets/rewards/icons/quiz-starter.png');
const PERFECT_SCORE_BADGE_IMAGE = require('../../assets/rewards/icons/perfect-score.png');
const ON_A_ROLL_BADGE_IMAGE = require('../../assets/rewards/icons/on-a-roll.png');
const COURSE_FINISHER_BADGE_IMAGE = require('../../assets/rewards/icons/course-finisher.png');

const BADGE_IMAGE_BY_ID: Record<string, ImageSourcePropType> = {
  'first-steps': FIRST_STEPS_BADGE_IMAGE,
  'card-crusher': CARD_CRUSHER_BADGE_IMAGE,
  'quiz-starter': QUIZ_STARTER_BADGE_IMAGE,
  'perfect-score': PERFECT_SCORE_BADGE_IMAGE,
  'on-a-roll': ON_A_ROLL_BADGE_IMAGE,
  'course-finisher': COURSE_FINISHER_BADGE_IMAGE,
};

export function getBadgeImageSource(badgeId?: string): ImageSourcePropType {
  if (!badgeId) return XP_TOKEN_IMAGE;
  return BADGE_IMAGE_BY_ID[badgeId] ?? XP_TOKEN_IMAGE;
}

export function getRewardImageSource(
  type: RewardVisualType,
  options?: { badgeId?: string },
): ImageSourcePropType {
  if (type === 'certificate') return CERTIFICATE_REWARD_IMAGE;
  if (type === 'badge') return getBadgeImageSource(options?.badgeId);
  return XP_TOKEN_IMAGE;
}
