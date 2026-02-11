import React, { useCallback, useEffect, useRef } from 'react';
import { View as RNView } from 'react-native';
import {
  useRewardAnimation,
} from '../../context/RewardAnimationContext';
import type { RewardAnimationTarget } from '../../context/RewardAnimationContext';

export function ProgressTabAnchor({
  target,
  children,
}: {
  target: RewardAnimationTarget;
  children: React.ReactNode;
}) {
  const ref = useRef<RNView>(null);
  const { registerAnimationTarget } = useRewardAnimation();

  const measure = useCallback(() => {
    requestAnimationFrame(() => {
      ref.current?.measureInWindow((x, y, width, height) => {
        if (width <= 0 || height <= 0) return;
        registerAnimationTarget(target, { x, y, width, height });
      });
    });
  }, [registerAnimationTarget, target]);

  useEffect(() => {
    return () => {
      registerAnimationTarget(target, null);
    };
  }, [registerAnimationTarget, target]);

  return (
    <RNView ref={ref} collapsable={false} onLayout={measure}>
      {children}
    </RNView>
  );
}
