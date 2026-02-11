import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

export type RewardToastKind = 'xp' | 'badge' | 'certificate' | 'info';

export interface RewardToastRequest {
  kind: RewardToastKind;
  message: string;
}

interface RewardToastContextValue {
  showRewardToast: (request: RewardToastRequest) => void;
}

interface QueuedRewardToast extends RewardToastRequest {
  id: string;
}

interface ActiveRewardToast extends QueuedRewardToast {
  progress: Animated.Value;
}

const MAX_QUEUE_LENGTH = 8;
const TOAST_IN_DURATION_MS = 240;
const TOAST_VISIBLE_DURATION_MS = 1900;
const TOAST_OUT_DURATION_MS = 180;
const TOAST_STAGGER_MS = 100;

const RewardToastContext = createContext<RewardToastContextValue | null>(null);

function getToastTheme(kind: RewardToastKind) {
  if (kind === 'badge') {
    return {
      icon: 'award' as const,
      backgroundColor: '#1E3A8A',
      borderColor: '#93C5FD',
      textColor: '#EFF6FF',
    };
  }
  if (kind === 'certificate') {
    return {
      icon: 'file-text' as const,
      backgroundColor: '#6D28D9',
      borderColor: '#C4B5FD',
      textColor: '#F5F3FF',
    };
  }
  if (kind === 'xp') {
    return {
      icon: 'zap' as const,
      backgroundColor: '#065F46',
      borderColor: '#6EE7B7',
      textColor: '#ECFDF5',
    };
  }
  return {
    icon: 'check-circle' as const,
    backgroundColor: '#0F172A',
    borderColor: '#475569',
    textColor: '#F8FAFC',
  };
}

export function RewardToastProvider({ children }: { children: React.ReactNode }) {
  const queueRef = useRef<QueuedRewardToast[]>([]);
  const processingRef = useRef(false);
  const [queueTick, setQueueTick] = useState(0);
  const [activeToast, setActiveToast] = useState<ActiveRewardToast | null>(null);

  const processQueue = useCallback(() => {
    if (processingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;

    processingRef.current = true;
    const progress = new Animated.Value(0);

    setActiveToast({
      ...next,
      progress,
    });

    Animated.sequence([
      Animated.timing(progress, {
        toValue: 1,
        duration: TOAST_IN_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(TOAST_VISIBLE_DURATION_MS),
      Animated.timing(progress, {
        toValue: 0,
        duration: TOAST_OUT_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setActiveToast(null);
      processingRef.current = false;
      setTimeout(() => setQueueTick((value) => value + 1), TOAST_STAGGER_MS);
    });
  }, []);

  useEffect(() => {
    processQueue();
  }, [processQueue, queueTick]);

  const showRewardToast = useCallback((request: RewardToastRequest) => {
    if (!request.message.trim()) return;

    const item: QueuedRewardToast = {
      ...request,
      id: `${Date.now()}-${Math.random()}`,
    };

    if (queueRef.current.length >= MAX_QUEUE_LENGTH) {
      queueRef.current.shift();
    }
    queueRef.current.push(item);
    setQueueTick((value) => value + 1);
  }, []);

  const value = useMemo<RewardToastContextValue>(
    () => ({ showRewardToast }),
    [showRewardToast],
  );

  return (
    <RewardToastContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {activeToast ? <RewardToastOverlay toast={activeToast} /> : null}
      </View>
    </RewardToastContext.Provider>
  );
}

export function useRewardToast() {
  const context = useContext(RewardToastContext);
  if (!context) {
    throw new Error('useRewardToast must be used inside RewardToastProvider');
  }
  return context;
}

function RewardToastOverlay({ toast }: { toast: ActiveRewardToast }) {
  const theme = getToastTheme(toast.kind);
  const translateY = toast.progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-16, 0],
  });

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.View
        style={[
          styles.toastCard,
          {
            backgroundColor: theme.backgroundColor,
            borderColor: theme.borderColor,
            opacity: toast.progress,
            transform: [{ translateY }],
          },
        ]}
      >
        <Feather
          name={theme.icon}
          size={15}
          color={theme.textColor}
          style={styles.icon}
        />
        <Text style={[styles.messageText, { color: theme.textColor }]}>{toast.message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 56,
    paddingHorizontal: 14,
    zIndex: 40,
  },
  toastCard: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  icon: {
    marginRight: 8,
  },
  messageText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
