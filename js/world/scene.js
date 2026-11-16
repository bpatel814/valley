// Shared storybook scenery. These are the original, preserved art layers.
import art from './art.js';
import settings from '../state/settings.js';
import { halloweenActive, seasonalBackgroundKey } from '../data/season.js';

export function addScenery(root, region = 'map', { foreground = true } = {}) {
  root.classList.add('world-scene');
  const backdrop = document.createElement('div');
  backdrop.className = `scene-backdrop scene-backdrop--${region}`;
  backdrop.setAttribute('aria-hidden', 'true');
  const sceneRegion = art.has(`bg/${region}/layer1`) ? region : 'map';
  const seasonal = seasonalBackgroundKey(region, settings.get());
  const themed = seasonal && art.has(seasonal);
  const keys = themed ? [seasonal] : ['bg/shared/layer0', `bg/${sceneRegion}/layer1`];
  if (foreground && !themed) keys.push(`bg/${sceneRegion}/layer2`);
  keys.forEach((key, index) => {
    const source = art.get(key);
    if (!source) return;
    const img = source.cloneNode();
    img.className = `scene-layer scene-layer--${index}`;
    img.alt = '';
    img.draggable = false;
    backdrop.append(img);
  });
  root.prepend(backdrop);
  if (halloweenActive(settings.get()) && art.has('halloween/treat-bucket-v1')) {
    const props = document.createElement('div');
    props.className = 'scene-seasonal-props'; props.setAttribute('aria-hidden', 'true');
    for (const side of ['left', 'right']) {
      const pumpkin = picture('halloween/treat-bucket-v1', { className: `scene-seasonal-pumpkin scene-seasonal-pumpkin--${side}` });
      if (pumpkin) props.append(pumpkin);
    }
    root.append(props);
  }
  return backdrop;
}

export function picture(key, { className = '', alt = '' } = {}) {
  const source = art.get(key);
  if (!source) return null;
  const img = source.cloneNode();
  img.alt = alt;
  img.draggable = false;
  img.className = className;
  return img;
}

export function prefersReducedMotion() {
  return document.documentElement.classList.contains('reduced-motion') ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
