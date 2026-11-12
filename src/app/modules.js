// Codex owns this registry. Registration enables review; it is not acceptance.
export const registered = Object.freeze({ model: '../model/index.js', lookdev: '../lookdev/index.js', camera: '../camera/index.js', art: '../art/index.js', stylesheet: '../styles/exhibition.css' });
export function getStylesheet(profile) {
  return profile === 'registered' && registered.stylesheet ? new URL(registered.stylesheet, import.meta.url).href : null;
}
export async function loadModules(profile = 'engineering') {
  const engineering = { model: './dev/model.js', lookdev: './dev/lookdev.js', camera: './dev/camera.js', art: './dev/art.js' };
  const paths = Object.fromEntries(Object.entries(engineering).map(([key, path]) => [key, profile === 'registered' && registered[key] ? registered[key] : path]));
  const entries = await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await import(path)]));
  return { ...Object.fromEntries(entries), manifest: { profile, paths, stylesheet: getStylesheet(profile),
    placeholder: Object.entries(paths).filter(([, path]) => path.startsWith('./dev/')).map(([key]) => key) } };
}
