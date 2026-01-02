

export const index = 9;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/onboarding/_page.svelte.js')).default;
export const imports = ["_app/immutable/nodes/9._G7sXJxW.js","_app/immutable/chunks/NGysjSll.js","_app/immutable/chunks/OFsEVZk6.js","_app/immutable/chunks/Bh8GDqSe.js","_app/immutable/chunks/pRc2cNOE.js"];
export const stylesheets = ["_app/immutable/assets/OnboardingWizard.CTo6JKs5.css"];
export const fonts = [];
