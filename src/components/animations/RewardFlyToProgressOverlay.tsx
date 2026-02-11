import React from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import type {
  RewardAnimationRect,
  RewardAnimationTokenVariant,
  RewardAnimationType,
} from '../../context/RewardAnimationContext';
import { getRewardImageSource, XP_TOKEN_IMAGE } from '../../constants/rewardImages';

export interface ActiveRewardAnimation {
  key: string;
  type: RewardAnimationType;
  source: RewardAnimationRect;
  target: RewardAnimationRect;
  progress: Animated.Value;
  xpDelta?: number;
  badgeId?: string;
  tokenVariant: RewardAnimationTokenVariant;
  reducedMotion: boolean;
}

export interface RewardImpactPulse {
  key: string;
  type: RewardAnimationType;
  target: RewardAnimationRect;
  progress: Animated.Value;
}

function getTokenTheme(type: RewardAnimationType) {
  if (type === 'badge') {
    return { background: '#1D4ED8', border: '#93C5FD', glow: '#60A5FA', text: '#ffffff', label: 'BDG' };
  }
  if (type === 'certificate') {
    return { background: '#7C3AED', border: '#C4B5FD', glow: '#A78BFA', text: '#ffffff', label: 'CERT' };
  }
  return { background: '#0D9488', border: '#5EEAD4', glow: '#2DD4BF', text: '#ffffff', label: 'XP' };
}

function getCenter(rect: RewardAnimationRect) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

const USE_IMAGE_TOKEN_FOR_REWARDS = true;
// Temporary tuning controls for XP badge alignment on the flying token.
const XP_BADGE_SIZE = 50;
const XP_BADGE_OFFSET_X = 0;
const XP_BADGE_OFFSET_Y = -11;

export function RewardFlyToProgressOverlay({
  activeAnimation,
  pulseAnimation: _pulseAnimation,
}: {
  activeAnimation: ActiveRewardAnimation | null;
  pulseAnimation: RewardImpactPulse | null;
}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {activeAnimation ? <FlyingToken animation={activeAnimation} /> : null}
    </View>
  );
}

function buildFlightPath(
  progress: Animated.Value,
  source: { x: number; y: number },
  target: { x: number; y: number },
  arcHeight: number,
  reducedMotion: boolean,
) {
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [source.x, target.x],
  });

  const linearTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [source.y, target.y],
  });

  // Smooth parabola: -4h * t * (1 - t), peak at t=0.5
  const oneMinusProgress = Animated.subtract(1, progress);
  const parabola = Animated.multiply(
    Animated.multiply(progress, oneMinusProgress),
    -4 * arcHeight,
  );

  const translateY = reducedMotion
    ? linearTranslateY
    : Animated.add(linearTranslateY, parabola);

  return { translateX, translateY };
}

function FlyingToken({ animation }: { animation: ActiveRewardAnimation }) {
  const source = getCenter(animation.source);
  const target = getCenter(animation.target);
  const verticalDistance = Math.abs(target.y - source.y);
  const arcHeight = Math.max(28, Math.min(72, verticalDistance * 0.18));
  const theme = getTokenTheme(animation.type);
  const isImageToken =
    USE_IMAGE_TOKEN_FOR_REWARDS ||
    animation.tokenVariant === 'flashcards-image';
  const tokenImageSource =
    animation.tokenVariant === 'flashcards-image'
      ? XP_TOKEN_IMAGE
      : getRewardImageSource(animation.type, { badgeId: animation.badgeId });

  const mainMotion = buildFlightPath(
    animation.progress,
    source,
    target,
    arcHeight,
    animation.reducedMotion,
  );
  const scale = animation.progress.interpolate({
    inputRange: [0, 0.12, 0.9, 1],
    outputRange: [0.55, 1, 1, 0.82],
    extrapolate: 'clamp',
  });

  const opacity = animation.progress.interpolate({
    inputRange: [0, 0.08, 0.96, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <>
      <Animated.View
        style={[
          isImageToken ? styles.imageTokenContainer : styles.tokenContainer,
          {
            transform: [
              { translateX: mainMotion.translateX },
              { translateY: mainMotion.translateY },
              { scale },
            ],
            opacity,
            backgroundColor: isImageToken ? 'transparent' : theme.background,
            borderColor: isImageToken ? 'transparent' : theme.border,
          },
        ]}
      >
        {isImageToken ? (
          <>
            <Image
              source={tokenImageSource}
              style={styles.tokenImage}
              resizeMode="contain"
            />
            {animation.type === 'xp' && animation.xpDelta ? (
              <View style={styles.tokenXpBadge}>
                <Text style={styles.tokenXpBadgeText}>+{animation.xpDelta}</Text>
              </View>
            ) : null}
          </>
        ) : (
          <Text style={[styles.tokenLabel, { color: theme.text }]}>
            {animation.type === 'xp' && animation.xpDelta ? `+${animation.xpDelta}` : theme.label}
          </Text>
        )}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  tokenContainer: {
    position: 'absolute',
    left: -24,
    top: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2.4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 7,
    elevation: 7,
  },
  imageTokenContainer: {
    position: 'absolute',
    left: -48,
    top: -48,
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  tokenImage: {
    width: 96,
    height: 96,
  },
  tokenXpBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -(XP_BADGE_SIZE / 2) + XP_BADGE_OFFSET_X,
    marginTop: -(XP_BADGE_SIZE / 2) + XP_BADGE_OFFSET_Y,
    width: XP_BADGE_SIZE,
    height: XP_BADGE_SIZE,
    borderRadius: XP_BADGE_SIZE / 2,
    backgroundColor: 'rgba(15,23,42,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2,
    elevation: 3,
  },
  tokenXpBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
});
