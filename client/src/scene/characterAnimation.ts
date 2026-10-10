import { AnimationMixer, LoopOnce, MathUtils, type AnimationAction, type AnimationClip, type Object3D } from 'three';

export type CharacterActions = [string, AnimationAction][];
const FADE_EPSILON = .001;

/** Actions cannot be reused after uncacheRoot; each effect setup owns a fresh mixer. */
export function createCharacterAnimation(object: Object3D, clips: AnimationClip[], initialClip: string) {
  const mixer = new AnimationMixer(object);
  const actionEntries: CharacterActions = clips.map(clip => [clip.name, mixer.clipAction(clip)]);
  const actions = Object.fromEntries(actionEntries);
  for (const [name, action] of actionEntries) {
    if (['Sit', 'Stand', 'DeadStanding', 'Dead'].includes(name) || name.startsWith('Safety')) {
      action.setLoop(LoopOnce, 1); action.clampWhenFinished = true;
    }
  }
  initializeCharacterActions(actionEntries, initialClip);
  return {
    mixer, actions, actionEntries,
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(object); },
  };
}

/** Dormant clips stay outside the mixer; only the current pose and its fade evaluate. */
export function initializeCharacterActions(actions: CharacterActions, initialClip: string) {
  for (const [name, action] of actions) {
    action.stop().setEffectiveWeight(0);
    if (name === initialClip) action.play().setEffectiveWeight(1);
  }
}

export function blendCharacterActions(
  actions: CharacterActions,
  active: string,
  motion: number,
  delta: number,
  demonstrationTime?: number,
) {
  for (const [name, action] of actions) {
    const requested = active === 'Idle'
      ? name === 'Idle' ? 1 - motion : name === 'Walk' ? motion : 0
      : name === active ? 1 : 0;
    const goal = requested <= FADE_EPSILON ? 0 : requested;
    if (goal > 0 && !action.isScheduled()) action.reset().play().setEffectiveWeight(0);
    if (!action.isScheduled()) continue;

    const weight = MathUtils.damp(action.getEffectiveWeight(), goal, 12, delta);
    if (goal === 0 && weight <= FADE_EPSILON) {
      action.stop().setEffectiveWeight(0);
      continue;
    }
    action.setEffectiveWeight(Math.abs(weight - goal) <= FADE_EPSILON ? goal : weight);
    if (name === active && demonstrationTime !== undefined) {
      // A paused action evaluates the exact server-owned demonstration pose.
      action.enabled = true;
      action.paused = true;
      action.time = demonstrationTime;
    }
  }
}
