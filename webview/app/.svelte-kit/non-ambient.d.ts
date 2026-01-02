
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/" | "/genesis" | "/home" | "/intents" | "/intents/dev" | "/intents/dev/[id]" | "/intents/doc" | "/intents/doc/[id]" | "/intents/[id]" | "/onboarding" | "/welcome";
		RouteParams(): {
			"/intents/dev/[id]": { id: string };
			"/intents/doc/[id]": { id: string };
			"/intents/[id]": { id: string }
		};
		LayoutParams(): {
			"/": { id?: string };
			"/genesis": Record<string, never>;
			"/home": Record<string, never>;
			"/intents": { id?: string };
			"/intents/dev": { id?: string };
			"/intents/dev/[id]": { id: string };
			"/intents/doc": { id?: string };
			"/intents/doc/[id]": { id: string };
			"/intents/[id]": { id: string };
			"/onboarding": Record<string, never>;
			"/welcome": Record<string, never>
		};
		Pathname(): "/" | "/genesis" | "/genesis/" | "/home" | "/home/" | "/intents" | "/intents/" | "/intents/dev" | "/intents/dev/" | `/intents/dev/${string}` & {} | `/intents/dev/${string}/` & {} | "/intents/doc" | "/intents/doc/" | `/intents/doc/${string}` & {} | `/intents/doc/${string}/` & {} | `/intents/${string}` & {} | `/intents/${string}/` & {} | "/onboarding" | "/onboarding/" | "/welcome" | "/welcome/";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): string & {};
	}
}