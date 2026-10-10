import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { AnimationClip, AnimationMixer, Group, LoopOnce, NumberKeyframeTrack, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { blendCharacterActions, createCharacterAnimation, initializeCharacterActions, type CharacterActions } from '../client/src/scene/characterAnimation.js';

function syntheticCharacter() {
  const root = new Group(), hand = new Group();
  hand.name = 'Hand'; root.add(hand);
  const mixer = new AnimationMixer(root);
  const values = { Idle: 0, Walk: 2, Seated: 4, DeadStanding: 6, SafetySeatbelt: 8 };
  const entries: CharacterActions = Object.entries(values).map(([name, value]) => [name, mixer.clipAction(
    new AnimationClip(name, 1, [new NumberKeyframeTrack('Hand.position[x]', [0, 1], [value, value + 1])]),
  )]);
  const actions = Object.fromEntries(entries);
  actions.DeadStanding.setLoop(LoopOnce, 1).clampWhenFinished = true;
  initializeCharacterActions(entries, 'Idle');
  const frame = (active: string, motion = 0, time?: number) => {
    blendCharacterActions(entries, active, motion, 1 / 60, time);
    mixer.update(1 / 60);
  };
  const settle = (active: string, motion = 0, time?: number) => {
    for (let i = 0; i < 60; i++) frame(active, motion, time);
  };
  const scheduled = () => entries.filter(([, action]) => action.isScheduled()).map(([name]) => name).sort();
  return { root, hand, actions, frame, settle, scheduled };
}

test('idle and walking crossfade while dormant and faded clips leave the mixer', () => {
  const character = syntheticCharacter();
  assert.deepEqual(character.scheduled(), ['Idle']);
  character.frame('Idle', .5);
  assert.deepEqual(character.scheduled(), ['Idle', 'Walk']);
  assert.ok(character.actions.Idle.getEffectiveWeight() > .5);
  assert.ok(character.actions.Walk.getEffectiveWeight() > 0);
  character.settle('Idle', 1);
  assert.deepEqual(character.scheduled(), ['Walk']);
  assert.equal(character.actions.Idle.getEffectiveWeight(), 0);
  character.settle('Seated');
  assert.deepEqual(character.scheduled(), ['Seated']);
  character.settle('Idle');
  assert.deepEqual(character.scheduled(), ['Idle']);
});

test('a death pose clamps, fades out, and can play again after becoming dormant', () => {
  const character = syntheticCharacter();
  character.settle('DeadStanding');
  character.settle('DeadStanding');
  assert.deepEqual(character.scheduled(), ['DeadStanding']);
  assert.equal(character.actions.DeadStanding.paused, true);
  assert.equal(character.actions.DeadStanding.time, 1);
  assert.equal(character.hand.position.x, 7);
  character.settle('Idle');
  assert.equal(character.actions.DeadStanding.isScheduled(), false);
  character.frame('DeadStanding');
  assert.equal(character.actions.DeadStanding.paused, false);
  assert.ok(character.actions.DeadStanding.time > 0 && character.actions.DeadStanding.time < .1);
});

test('server-timed safety poses remain paused and hand attachments see the current bone transform', () => {
  const character = syntheticCharacter();
  character.root.position.x = 3;
  character.settle('SafetySeatbelt', 0, .25);
  assert.deepEqual(character.scheduled(), ['SafetySeatbelt']);
  assert.equal(character.actions.SafetySeatbelt.paused, true);
  assert.equal(character.actions.SafetySeatbelt.time, .25);
  assert.equal(character.hand.getWorldPosition(new Vector3()).x, 11.25);
  character.frame('SafetySeatbelt', 0, .75);
  assert.equal(character.actions.SafetySeatbelt.time, .75);
  assert.equal(character.hand.getWorldPosition(new Vector3()).x, 11.75);
  character.settle('Seated');
  assert.equal(character.actions.SafetySeatbelt.isScheduled(), false);
});

test('authored Blender clips retain seated, walking, death and all demonstration poses', async () => {
  const bytes = await readFile(new URL('../client/public/models/animated/attendant.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const mixer = new AnimationMixer(gltf.scene);
  const entries: CharacterActions = gltf.animations.map(clip => [clip.name, mixer.clipAction(clip)]);
  for (const [name, action] of entries) {
    if (['Sit', 'Stand', 'DeadStanding', 'Dead'].includes(name) || name.startsWith('Safety')) {
      action.setLoop(LoopOnce, 1); action.clampWhenFinished = true;
    }
  }
  initializeCharacterActions(entries, 'Seated');
  const hand = (gltf.scene.getObjectByName('Hand.R') ?? gltf.scene.getObjectByName('HandR'))!;
  assert.ok(hand);
  const transition = (clip: string, time?: number) => {
    assert.ok(entries.some(([name]) => name === clip), `Missing ${clip}`);
    for (let i = 0; i < 90; i++) {
      blendCharacterActions(entries, clip, 0, 1 / 60, time);
      mixer.update(1 / 60);
    }
    assert.deepEqual(entries.filter(([, action]) => action.isScheduled()).map(([name]) => name), [clip]);
    gltf.scene.traverse(node => {
      assert.ok(node.position.toArray().every(Number.isFinite));
      assert.ok(node.quaternion.toArray().every(Number.isFinite));
    });
    return hand.getWorldPosition(new Vector3());
  };
  for (const clip of ['Sit', 'Seated', 'Stand', 'Walk', 'Brace', 'Dead', 'DeadStanding']) transition(clip);
  for (const clip of ['SafetySeatbelt', 'SafetyOxygen', 'SafetyLifeVest', 'SafetyExits']) {
    const first = transition(clip, .65), second = transition(clip, 2.25);
    assert.ok(first.distanceTo(second) > .01, `${clip} should move the hand through its instruction`);
  }
  mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
});

test('real character clones survive Strict Mode setup-cleanup-setup without stale mixer bindings', async () => {
  for (const model of ['attendant', 'passenger-a']) {
    const bytes = await readFile(new URL(`../client/public/models/animated/${model}.glb`, import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const characters = Array.from({ length: 4 }, () => clone(gltf.scene));
    let previous: ReturnType<typeof createCharacterAnimation>[] = [];
    for (let setup = 0; setup < 3; setup++) {
      const animations = characters.map((object, index) => createCharacterAnimation(object, gltf.animations, index % 2 ? 'Seated' : 'Idle'));
      animations.forEach((current, index) => {
        assert.notEqual(current.mixer, previous[index]?.mixer);
        assert.notEqual(current.actions.Idle, previous[index]?.actions.Idle);
        for (const active of ['Walk', 'Seated', 'DeadStanding', 'SafetySeatbelt']) {
          for (let frame = 0; frame < 45; frame++) {
            blendCharacterActions(current.actionEntries, active, 0, 1 / 60, active.startsWith('Safety') ? 1.5 : undefined);
            current.mixer.update(1 / 60);
          }
          assert.deepEqual(current.actionEntries.filter(([, action]) => action.isScheduled()).map(([name]) => name), [active]);
        }
        const hand = characters[index].getObjectByName('HandR')!;
        assert.ok(hand.getWorldPosition(new Vector3()).toArray().every(Number.isFinite));
      });
      animations.forEach((current, index) => {
        current.dispose();
        assert.ok(current.actionEntries.every(([, action]) => !action.isScheduled()));
        characters[index].traverse(node => { if (node instanceof SkinnedMesh) node.skeleton.dispose(); });
      });
      previous = animations;
    }
  }
});
