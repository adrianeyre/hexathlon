import { createAttractScene } from './attract.ts';
import { createControlsScene } from './controls.ts';
import { createEventScene } from './event.ts';
import { createHighScoresScene } from './high-scores.ts';
import { createInitialsScene } from './initials.ts';
import { createKeyTestScene } from './key-test.ts';
import { createMainMenuScene } from './main-menu.ts';
import { createPracticeScene } from './practice.ts';
import { createResultsScene } from './results.ts';
import { createSettingsScene } from './settings.ts';
import { COOKIE_POLICY, CREDITS, createTextPageScene } from './text-page.ts';
import { createTitleScene } from './title.ts';

/**
 * Register every scene with a manager. Shared by the game and the tests.
 */
export function registerScenes(manager: import('./manager.ts').SceneManager, services: import('./services.ts').Services) {
  const scenes = {
    title: createTitleScene(manager, services),
    menu: createMainMenuScene(manager, services),
    practice: createPracticeScene(manager, services),
    settings: createSettingsScene(manager, services),
    controls: createControlsScene(manager, services),
    keyTest: createKeyTestScene(manager, services),
    event: createEventScene(manager, services),
    results: createResultsScene(manager, services),
    highScores: createHighScoresScene(manager, services),
    initials: createInitialsScene(manager, services),
    attract: createAttractScene(manager, services),
    cookiePolicy: createTextPageScene(manager, services, COOKIE_POLICY),
    credits: createTextPageScene(manager, services, CREDITS),
  };
  Object.assign(manager.scenes, scenes);
  return scenes;
}
