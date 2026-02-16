import React, { useCallback, useEffect, useRef } from 'react';
import { View as RNView } from 'react-native';
import {
  useRewardCelebrate,
} from '../../context/RewardCelebrateContext';
import type { RewardCelebrateTarget } from '../../context/RewardCelebrateContext';

export function ProgressTabAnchor({
  target,
  children,
}: {
  target: RewardCelebrateTarget;
  children: React.ReactNode;
}) {
  const ref = useRef<RNView>(null);
  const { registerAnimationTarget } = useRewardCelebrate();

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
