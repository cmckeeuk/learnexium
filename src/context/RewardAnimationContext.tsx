import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  View,
} from 'react-native';
import {
  RewardFlyToProgressOverlay,
  ActiveRewardAnimation,
} from '../components/animations/RewardFlyToProgressOverlay';

export type RewardAnimationType = 'xp' | 'badge' | 'certificate';
export type RewardAnimationTarget = 'progressTab' | 'progressHeader';
export type RewardAnimationTokenVariant = 'default' | 'flashcards-image';

export interface RewardAnimationRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RewardAnimationRequest {
  eventId: string;
  type: RewardAnimationType;
  source?: RewardAnimationRect;
  xpDelta?: number;
  badgeId?: string;
  tokenVariant?: RewardAnimationTokenVariant;
}

interface RewardAnimationContextValue {
  emitRewardAnimation: (request: RewardAnimationRequest) => void;
  registerAnimationTarget: (
    target: RewardAnimationTarget,
    rect: RewardAnimationRect | null,
  ) => void;
  setProgressTabActive: (active: boolean) => void;
}

interface QueuedRewardAnimation extends RewardAnimationRequest {
  enqueuedAt: number;
}

const MAX_QUEUE_LENGTH = 8;
const QUEUE_STAGGER_MS = 140;
const REDUCED_MOTION_DURATION_MS = 280;
const STANDARD_DURATION_MS = 800;

const RewardAnimationContext = createContext<RewardAnimationContextValue | null>(null);

function logAnimationEvent(name: string, payload: Record<string, unknown>) {
  if (__DEV__) {
    console.log(`[RewardAnimation] ${name}`, payload);
  }
}

function buildFallbackTarget(): RewardAnimationRect {
  const { width, height } = Dimensions.get('window');
  return {
    x: width - 46,
    y: height - 72,
    width: 24,
    height: 24,
  };
}

function buildFallbackSource(): RewardAnimationRect {
  const { width, height } = Dimensions.get('window');
  return {
    x: width / 2 - 12,
    y: height * 0.45,
    width: 24,
    height: 24,
  };
}

export function RewardAnimationProvider({ children }: { children: React.ReactNode }) {
  const targetsRef = useRef<Record<RewardAnimationTarget, RewardAnimationRect | null>>({
    progressTab: null,
    progressHeader: null,
  });
  const emittedEventIdsRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<QueuedRewardAnimation[]>([]);
  const processingRef = useRef(false);
  const [queueTick, setQueueTick] = useState(0);
  const [activeAnimation, setActiveAnimation] = useState<ActiveRewardAnimation | null>(null);
  const [progressTabActive, setProgressTabActive] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotionEnabled(enabled);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => setReduceMotionEnabled(enabled),
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const registerAnimationTarget = useCallback((
    target: RewardAnimationTarget,
    rect: RewardAnimationRect | null,
  ) => {
    targetsRef.current[target] = rect;
  }, []);

  const chooseTarget = useCallback((): {
    target: RewardAnimationRect;
    usedFallback: boolean;
  } => {
    const headerTarget = targetsRef.current.progressHeader;
    const tabTarget = targetsRef.current.progressTab;

    if (progressTabActive && headerTarget) {
      return { target: headerTarget, usedFallback: false };
    }
    if (tabTarget) {
      return { target: tabTarget, usedFallback: false };
    }
    return { target: buildFallbackTarget(), usedFallback: true };
  }, [progressTabActive]);

  const processQueue = useCallback(() => {
    if (processingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;

    processingRef.current = true;
    const { target, usedFallback } = chooseTarget();
    const source = next.source ?? buildFallbackSource();
    const progress = new Animated.Value(0);
    const duration = reduceMotionEnabled ? REDUCED_MOTION_DURATION_MS : STANDARD_DURATION_MS;

    if (usedFallback) {
      logAnimationEvent('reward_animation_fallback_used', {
        eventId: next.eventId,
        type: next.type,
      });
    }

    logAnimationEvent('reward_animation_started', {
      eventId: next.eventId,
      type: next.type,
      xpDelta: next.xpDelta ?? null,
    });

    setActiveAnimation({
      key: `${next.eventId}-${Date.now()}`,
      type: next.type,
      source,
      target,
      progress,
      xpDelta: next.xpDelta,
      badgeId: next.badgeId,
      tokenVariant: next.tokenVariant ?? 'default',
      reducedMotion: reduceMotionEnabled,
    });

    Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      setActiveAnimation(null);

      if (finished) {
        logAnimationEvent('reward_animation_completed', {
          eventId: next.eventId,
          type: next.type,
          xpDelta: next.xpDelta ?? null,
        });
      }

      processingRef.current = false;
      setTimeout(() => {
        setQueueTick((v) => v + 1);
      }, QUEUE_STAGGER_MS);
    });
  }, [chooseTarget, reduceMotionEnabled]);

  useEffect(() => {
    processQueue();
  }, [queueTick, processQueue]);

  const emitRewardAnimation = useCallback((request: RewardAnimationRequest) => {
    if (!request.eventId) return;
    if (emittedEventIdsRef.current.has(request.eventId)) return;

    emittedEventIdsRef.current.add(request.eventId);

    const queuedItem: QueuedRewardAnimation = {
      ...request,
      enqueuedAt: Date.now(),
    };

    if (queueRef.current.length >= MAX_QUEUE_LENGTH) {
      queueRef.current.shift();
    }
    queueRef.current.push(queuedItem);
    setQueueTick((v) => v + 1);
  }, []);

  const value = useMemo<RewardAnimationContextValue>(() => ({
    emitRewardAnimation,
    registerAnimationTarget,
    setProgressTabActive,
  }), [emitRewardAnimation, registerAnimationTarget]);

  return (
    <RewardAnimationContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        <RewardFlyToProgressOverlay
          activeAnimation={activeAnimation}
          pulseAnimation={null}
        />
      </View>
    </RewardAnimationContext.Provider>
  );
}

export function useRewardAnimation() {
  const context = useContext(RewardAnimationContext);
  if (!context) {
    throw new Error('useRewardAnimation must be used inside RewardAnimationProvider');
  }
  return context;
}
