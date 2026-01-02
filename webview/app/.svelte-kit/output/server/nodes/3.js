

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/genesis/_page.svelte.js')).default;
export const imports = ["_app/immutable/nodes/3.bFK9bLC0.js","_app/immutable/chunks/NGysjSll.js","_app/immutable/chunks/OFsEVZk6.js","_app/immutable/chunks/BGyUxHj7.js","_app/immutable/chunks/PsGZJ0l5.js"];
export const stylesheets = ["_app/immutable/assets/SystemStatus.qBcG1RBe.css"];
export const fonts = [];
