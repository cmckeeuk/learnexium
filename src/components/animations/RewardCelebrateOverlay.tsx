import React from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type {
  RewardCelebrateRect,
  RewardCelebrateTokenVariant,
  RewardCelebrateType,
} from '../../context/RewardCelebrateContext';
import { getRewardImageSource, XP_TOKEN_IMAGE } from '../../constants/rewardImages';

export interface ActiveRewardCelebrateAnimation {
  key: string;
  type: RewardCelebrateType;
  source: RewardCelebrateRect;
  target: RewardCelebrateRect;
  progress: Animated.Value;
  xpDelta?: number;
  badgeId?: string;
  tokenVariant: RewardCelebrateTokenVariant;
  reducedMotion: boolean;
}

export interface RewardImpactPulse {
  key: string;
  type: RewardCelebrateType;
  target: RewardCelebrateRect;
  progress: Animated.Value;
}

function getRewardTheme(type: RewardCelebrateType) {
  if (type === 'badge') {
    return {
      panelBackground: '#0E7F77',
      panelBorder: '#5FE8D8',
      title: 'Badge unlocked!',
      subtitle: 'New achievement earned',
      chipText: 'BADGE',
      tokenLabel: 'BDG',
    };
  }
  if (type === 'certificate') {
    return {
      panelBackground: '#0A746C',
      panelBorder: '#7AF5E7',
      title: 'Course complete!',
      subtitle: 'Certificate unlocked',
      chipText: 'CERTIFICATE',
      tokenLabel: 'CERT',
    };
  }
  return {
    panelBackground: '#0D9488',
    panelBorder: '#70F0E3',
    title: 'Good job!',
    subtitle: 'XP earned',
    chipText: 'CONTINUE',
    tokenLabel: 'XP',
  };
}

function buildPrimaryMessage(animation: ActiveRewardCelebrateAnimation) {
  if (animation.type === 'xp') {
    if (animation.xpDelta && animation.xpDelta > 0) {
      return `+${animation.xpDelta} XP earned`;
    }
    return 'XP earned';
  }
  if (animation.type === 'certificate') {
    return 'Certificate unlocked';
  }
  return 'New achievement earned';
}

export function RewardCelebrateOverlay({
  activeAnimation,
  pulseAnimation: _pulseAnimation,
}: {
  activeAnimation: ActiveRewardCelebrateAnimation | null;
  pulseAnimation: RewardImpactPulse | null;
}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {activeAnimation ? <BottomCelebratePanel animation={activeAnimation} /> : null}
    </View>
  );
}

function BottomCelebratePanel({ animation }: { animation: ActiveRewardCelebrateAnimation }) {
  const theme = getRewardTheme(animation.type);
  const primaryMessage = buildPrimaryMessage(animation);
  const tokenImageSource =
    animation.tokenVariant === 'flashcards-image'
      ? XP_TOKEN_IMAGE
      : getRewardImageSource(animation.type, { badgeId: animation.badgeId });

  const panelTranslateY = animation.progress.interpolate({
    inputRange: [0, 0.16, 0.86, 1],
    outputRange: animation.reducedMotion ? [52, 0, 0, 14] : [230, 0, 0, 210],
  });
  const panelOpacity = animation.progress.interpolate({
    inputRange: [0, 0.08, 0.92, 1],
    outputRange: [0, 1, 1, 0],
  });
  const tokenTranslateY = animation.progress.interpolate({
    inputRange: [0, 0.24, 0.42, 1],
    outputRange: animation.reducedMotion ? [16, 0, 0, 0] : [82, -16, 0, 2],
  });
  const tokenScale = animation.progress.interpolate({
    inputRange: [0, 0.22, 0.45, 1],
    outputRange: animation.reducedMotion ? [0.98, 1, 1, 1] : [0.7, 1.12, 1, 1],
    extrapolate: 'clamp',
  });
  const haloScale = animation.progress.interpolate({
    inputRange: [0, 0.24, 0.42, 1],
    outputRange: animation.reducedMotion ? [0.9, 1, 1, 1] : [0.7, 1.4, 1.2, 1],
    extrapolate: 'clamp',
  });
  const haloOpacity = animation.progress.interpolate({
    inputRange: [0, 0.2, 0.42, 1],
    outputRange: [0, 0.36, 0.16, 0.1],
    extrapolate: 'clamp',
  });

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.View
        style={[
          styles.panel,
          {
            backgroundColor: theme.panelBackground,
            borderColor: theme.panelBorder,
            opacity: panelOpacity,
            transform: [{ translateY: panelTranslateY }],
          },
        ]}
      >
        <View style={styles.tokenStage}>
          <Animated.View
            style={[
              styles.tokenHalo,
              {
                opacity: haloOpacity,
                transform: [{ scale: haloScale }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.tokenBubble,
              {
                transform: [{ translateY: tokenTranslateY }, { scale: tokenScale }],
              },
            ]}
          >
            <Image
              source={tokenImageSource}
              style={[styles.tokenImage, animation.type === 'xp' && styles.tokenImageXp]}
              resizeMode="contain"
            />
            {animation.type === 'xp' && animation.xpDelta ? (
              <View style={styles.tokenBadge}>
                <Text style={styles.tokenBadgeText}>+{animation.xpDelta}</Text>
              </View>
            ) : (
              <View style={styles.tokenPill}>
                <Text style={styles.tokenPillText}>{theme.tokenLabel}</Text>
              </View>
            )}
          </Animated.View>
        </View>

        <View style={styles.panelBody}>
          <View style={styles.messageRow}>
            <Feather name="check-circle" size={20} color="#E7FFFB" />
            <Text style={styles.title}>{theme.title}</Text>
          </View>
          <Text style={styles.subtitle}>{primaryMessage}</Text>
          <View style={styles.ctaChip}>
            <Text style={styles.ctaText}>{theme.chipText}</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    paddingBottom: 14,
    paddingHorizontal: 10,
  },
  panel: {
    borderRadius: 18,
    borderWidth: 2,
    minHeight: 168,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 12,
  },
  tokenStage: {
    position: 'absolute',
    top: -50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  tokenHalo: {
    position: 'absolute',
    top: 20,
    width: 102,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(212,255,248,0.7)',
  },
  tokenBubble: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0A4E48',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 8,
  },
  tokenImage: {
    width: 92,
    height: 92,
  },
  tokenImageXp: {
    width: 82,
    height: 82,
    marginTop: -6,
  },
  tokenBadge: {
    position: 'absolute',
    bottom: 6,
    minWidth: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.88)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  tokenPill: {
    position: 'absolute',
    bottom: 8,
    minWidth: 54,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.78)',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenPillText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  panelBody: {
    marginTop: 38,
    paddingTop: 30,
    paddingHorizontal: 16,
    paddingBottom: 16,
    alignItems: 'center',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    marginLeft: 7,
    fontSize: 27,
    fontWeight: '900',
    color: '#EFFFFB',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#D8FFFA',
    marginBottom: 13,
  },
  ctaChip: {
    minWidth: 168,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#35D17A',
    borderWidth: 2,
    borderColor: '#5DE08E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0B5E36',
    letterSpacing: 0.8,
  },
});
