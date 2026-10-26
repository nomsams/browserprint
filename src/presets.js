export const PRESETS = {
  standard: { title: 'Full local scan', ids: null },
  privacy: { title: 'Tor / privacy review', ids: ['navigator', 'css', 'screen', 'state', 'mobile', 'privacy'] },
  mobile: { title: 'Mobile browser review', ids: ['navigator', 'clientHints', 'canvas', 'webgl', 'audio',
    'textGeometry', 'locale', 'css', 'screen', 'webgpu', 'media', 'worker', 'state', 'mobile', 'privacy'] },
};

export function selectProbes(probes, { mode = 'standard', network = false } = {}) {
  if (!Object.hasOwn(PRESETS, mode)) throw new Error('Unknown scan preset');
  const preset = PRESETS[mode];
  return probes.filter(p => {
    if (['network', 'webrtc'].includes(p.id)) return network && mode !== 'privacy';
    return !preset.ids || preset.ids.includes(p.id);
  }).map(p => mode === 'privacy' ? { ...p, profile: false } : p);
}
