import React from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type {
  RewardCelebrateRect,
  RewardCelebrateTokenVariant,
  RewardCelebrateType,
} from '../../context/RewardCelebrateContext';
import { getRewardImageSource, XP_TOKEN_IMAGE } from '../../constants/rewardImages';

const CELEBRATE_STAR_IMAGE = require('../../../assets/rewards/icons/celebrate-star.png');

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

  const isCertificateCelebrate = animation.type === 'certificate' && !animation.reducedMotion;
  const sparkleOpacity = animation.progress.interpolate({
    inputRange: [0, 0.12, 0.72, 1],
    outputRange: [0, 1, 0.85, 0],
    extrapolate: 'clamp',
  });
  const sparkleLift = animation.progress.interpolate({
    inputRange: [0, 0.22, 0.55, 1],
    outputRange: [16, -40, -180, -320],
    extrapolate: 'clamp',
  });

  const sparkleDriftLeft = animation.progress.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, -20, -44],
    extrapolate: 'clamp',
  });
  const sparkleDriftRight = animation.progress.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, 20, 44],
    extrapolate: 'clamp',
  });
  const fireOpacity = animation.progress.interpolate({
    inputRange: [0, 0.12, 0.68, 1],
    outputRange: [0, 1, 0.82, 0],
    extrapolate: 'clamp',
  });
  const fireRise = animation.progress.interpolate({
    inputRange: [0, 0.2, 0.55, 1],
    outputRange: [14, -36, -170, -300],
    extrapolate: 'clamp',
  });
  const fireScale = animation.progress.interpolate({
    inputRange: [0, 0.24, 0.55, 1],
    outputRange: [0.5, 1.1, 1, 0.7],
    extrapolate: 'clamp',
  });

  const burstRingScale = animation.progress.interpolate({
    inputRange: [0, 0.25, 0.55, 1],
    outputRange: [0.2, 1.35, 1.6, 1.8],
    extrapolate: 'clamp',
  });
  const burstRingOpacity = animation.progress.interpolate({
    inputRange: [0, 0.2, 0.55, 1],
    outputRange: [0, 0.7, 0.22, 0],
    extrapolate: 'clamp',
  });

  const t = animation.progress;
  const oneMinusT = Animated.subtract(1, t);
  const parabola = Animated.multiply(Animated.multiply(t, oneMinusT), 4);

  const star1X = t.interpolate({ inputRange: [0, 1], outputRange: [0, -170] });
  const star2X = t.interpolate({ inputRange: [0, 1], outputRange: [0, 160] });
  const star3X = t.interpolate({ inputRange: [0, 1], outputRange: [0, -120] });
  const star4X = t.interpolate({ inputRange: [0, 1], outputRange: [0, 120] });
  const star5X = t.interpolate({ inputRange: [0, 1], outputRange: [0, -220] });
  const star6X = t.interpolate({ inputRange: [0, 1], outputRange: [0, 220] });

  const star1Y = Animated.add(t.interpolate({ inputRange: [0, 1], outputRange: [18, -360] }), Animated.multiply(parabola, -120));
  const star2Y = Animated.add(t.interpolate({ inputRange: [0, 1], outputRange: [20, -350] }), Animated.multiply(parabola, -100));
  const star3Y = Animated.add(t.interpolate({ inputRange: [0, 1], outputRange: [24, -330] }), Animated.multiply(parabola, -90));
  const star4Y = Animated.add(t.interpolate({ inputRange: [0, 1], outputRange: [24, -330] }), Animated.multiply(parabola, -90));
  const star5Y = Animated.add(t.interpolate({ inputRange: [0, 1], outputRange: [30, -420] }), Animated.multiply(parabola, -130));
  const star6Y = Animated.add(t.interpolate({ inputRange: [0, 1], outputRange: [30, -420] }), Animated.multiply(parabola, -130));

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

          {isCertificateCelebrate ? (
            <>
              <Animated.View style={[styles.burstRing, { opacity: burstRingOpacity, transform: [{ scale: burstRingScale }] }]} />

              <Animated.Image source={CELEBRATE_STAR_IMAGE} style={[styles.starImage, styles.starLg, { opacity: sparkleOpacity, transform: [{ translateX: star1X }, { translateY: star1Y }] }]} />
              <Animated.Image source={CELEBRATE_STAR_IMAGE} style={[styles.starImage, styles.starLg, { opacity: sparkleOpacity, transform: [{ translateX: star2X }, { translateY: star2Y }] }]} />
              <Animated.Image source={CELEBRATE_STAR_IMAGE} style={[styles.starImage, styles.starMd, { opacity: sparkleOpacity, transform: [{ translateX: star3X }, { translateY: star3Y }] }]} />
              <Animated.Image source={CELEBRATE_STAR_IMAGE} style={[styles.starImage, styles.starMd, { opacity: sparkleOpacity, transform: [{ translateX: star4X }, { translateY: star4Y }] }]} />
              <Animated.Image source={CELEBRATE_STAR_IMAGE} style={[styles.starImage, styles.starSm, { opacity: sparkleOpacity, transform: [{ translateX: star5X }, { translateY: star5Y }] }]} />
              <Animated.Image source={CELEBRATE_STAR_IMAGE} style={[styles.starImage, styles.starSm, { opacity: sparkleOpacity, transform: [{ translateX: star6X }, { translateY: star6Y }] }]} />

              <Animated.View style={[styles.fireDot, styles.fireDot1, { opacity: fireOpacity, transform: [{ translateY: fireRise }, { scale: fireScale }] }]} />
              <Animated.View style={[styles.fireDot, styles.fireDot2, { opacity: fireOpacity, transform: [{ translateX: sparkleDriftLeft }, { translateY: fireRise }, { scale: fireScale }] }]} />
              <Animated.View style={[styles.fireDot, styles.fireDot3, { opacity: fireOpacity, transform: [{ translateX: sparkleDriftRight }, { translateY: fireRise }, { scale: fireScale }] }]} />
              <Animated.View style={[styles.fireDotSmall, styles.fireDot4, { opacity: fireOpacity, transform: [{ translateY: fireRise }, { scale: fireScale }] }]} />
              <Animated.View style={[styles.fireDotSmall, styles.fireDot5, { opacity: fireOpacity, transform: [{ translateX: sparkleDriftLeft }, { translateY: fireRise }, { scale: fireScale }] }]} />
              <Animated.View style={[styles.fireDotSmall, styles.fireDot6, { opacity: fireOpacity, transform: [{ translateX: sparkleDriftRight }, { translateY: fireRise }, { scale: fireScale }] }]} />
              <Animated.View style={[styles.fireDot, styles.fireDot7, { opacity: fireOpacity, transform: [{ translateX: sparkleDriftLeft }, { translateY: fireRise }, { scale: fireScale }] }]} />
              <Animated.View style={[styles.fireDot, styles.fireDot8, { opacity: fireOpacity, transform: [{ translateX: sparkleDriftRight }, { translateY: fireRise }, { scale: fireScale }] }]} />
              <Animated.View style={[styles.fireDotSmall, styles.fireDot9, { opacity: fireOpacity, transform: [{ translateX: sparkleDriftLeft }, { translateY: fireRise }, { scale: fireScale }] }]} />
              <Animated.View style={[styles.fireDotSmall, styles.fireDot10, { opacity: fireOpacity, transform: [{ translateX: sparkleDriftRight }, { translateY: fireRise }, { scale: fireScale }] }]} />
            </>
          ) : null}
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

  sparkle: {
    position: 'absolute',
    zIndex: 5,
  },

  burstRing: {
    position: 'absolute',
    top: 16,
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 3,
    borderColor: 'rgba(253, 224, 71, 0.9)',
    zIndex: 3,
  },
  starImage: {
    position: 'absolute',
    zIndex: 6,
    resizeMode: 'contain',
  },
  starLg: { width: 48, height: 48, top: -2, left: '50%', marginLeft: -24 },
  starMd: { width: 36, height: 36, top: 10, left: '50%', marginLeft: -18 },
  starSm: { width: 28, height: 28, top: 22, left: '50%', marginLeft: -14 },
  fireDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F97316',
    zIndex: 4,
  },
  fireDotSmall: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FDE047',
    zIndex: 4,
  },
  fireDot1: {
    top: 46,
    left: '28%',
  },
  fireDot2: {
    top: 42,
    left: '16%',
  },
  fireDot3: {
    top: 40,
    right: '20%',
  },
  fireDot4: {
    top: 52,
    left: '44%',
  },
  fireDot5: {
    top: 50,
    left: '34%',
  },
  fireDot6: {
    top: 50,
    right: '30%',
  },
  fireDot7: {
    top: 36,
    left: '8%',
  },
  fireDot8: {
    top: 34,
    right: '8%',
  },
  fireDot9: {
    top: 60,
    left: '20%',
  },
  fireDot10: {
    top: 58,
    right: '18%',
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
