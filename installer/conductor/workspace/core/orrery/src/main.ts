import * as pc from 'playcanvas';
import { allNodes, type OrreryTree, type OrreryNode } from './locationTree';
import { layoutPositions, type Position3 } from './layout';
import { UNRESOLVED_DISPLAY, type DisplayResolver } from './display';
import { fromSimulatedData, simulatedPositionHints, simulatedDisplayResolver } from './adapters/fromSimulatedData';
import './styles.css';

// ============================================================================
// Extracción de la escena PlayCanvas a una función montable/desmontable —
// Spec_Implementacion_Integracion_Core_Orrery_v1_0.md §1.1 y §3.1. La lógica
// de cámara, selección, animación y render (todo lo que sigue dentro de
// `start()`) es la misma que existía antes de esta extracción — se movió de
// ejecución automática a nivel de módulo a una función invocable, y se
// parametrizó la fuente de datos (antes `items`/`genes` de `./data`
// importados directo, ahora un `OrreryTree` recibido por parámetro — ver
// locationTree.ts). El comportamiento standalone de este paquete (dev server
// de Vite sobre index.html, `#app`) se conserva sin cambios via el bloque de
// compatibilidad al final de este archivo.
//
// Nota sobre el diffing (§4.2 de la Spec): el código original construía la
// escena una sola vez y nunca la actualizaba, así que nunca tuvo que limpiar
// nada. Para poder dar de baja o reconstruir un nodo sin dejar entidades
// huérfanas, cada nodo lleva su bookkeeping propio (visuales auxiliares —
// "core" de Domain, "field" de Posture — y las líneas de `ring()` que le
// pertenecen) en `nodeVisuals`, no solo la entidad primaria.
// ============================================================================

export interface OrreryHandle {
	update(tree: OrreryTree, resolveDisplay?: DisplayResolver, positionHints?: Map<string, Position3>): void;
	destroy(): void;
}

function renderChrome(container: HTMLElement): void {
	container.innerHTML = `
<canvas id="world" aria-label="Mundo tridimensional de Orrery"></canvas><div id="labels"></div>
<header><div class="brand">ORRERY</div><div class="divider"></div><div class="context"><div class="eyebrow">Cognituum / Organización de ejemplo</div><div class="sub">Un territorio para comprender el trabajo</div></div><div class="badge" id="simulated-badge"></div></header>
<div class="intro"><div class="eyebrow">Perspectiva espacial</div><h2>El mundo permanece.</h2><p>El criterio lo alcanza. El trabajo lo recorre.</p></div>
<nav class="panel left" aria-label="Explorar el mundo"><h2>EXPLORAR</h2><button class="nav active" data-view="all">◎ &nbsp; Organización</button><button class="nav" data-view="a"><span class="dot"></span>Proyecto A</button><button class="nav" data-view="b"><span class="dot purple"></span>Proyecto B</button><div class="rule"></div><label class="switch"><input id="gravity" type="checkbox" checked> Campos de Gravity</label><label class="switch"><input id="genes" type="checkbox" checked> Conexiones · Genes</label><label class="switch"><input id="names" type="checkbox" checked> Nombres</label><div class="rule"></div><select id="objects" aria-label="Seleccionar elemento" style="width:100%;background:#172632;color:#cddcde;padding:7px;border:1px solid #ffffff22;border-radius:6px"><option value="">Encontrar elemento…</option></select><p class="hint">Arrastrá para orbitar.<br>Rueda para acercarte.<br>Shift + arrastrar para desplazar.<br>Seleccioná un objeto o su nombre.</p></nav>
<aside class="panel right" aria-label="Inspector"><div id="kind" class="eyebrow">TU PUNTO DE ATENCIÓN</div><h1 id="title">Un mundo por recorrer</h1><p id="description">Acercate a un territorio o seleccioná un elemento para descubrir sus relaciones.</p><div class="rule"></div><p id="detail">Las formas son exploratorias. Todos los nombres, relaciones y eventos de esta escena son ejemplos.</p><button id="focus" class="focus">Volver a la vista general</button></aside>
<section class="panel bottom" aria-label="Simulación del trabajo"><div class="runtime-head"><span class="dot" style="background:#79dcac"></span><strong>Revisar acceso → Compartir resultado</strong><span class="eyebrow">CONSTELLATION · EJEMPLO</span></div><div class="transport"><button id="play">Pausar</button><button id="reset" aria-label="Reiniciar simulación">↺</button><input id="timeline" aria-label="Tiempo de la simulación" type="range" min="0" max="30" step="0.05" value="0"><span id="time" class="time">0 / 30 s</span></div><div id="status" class="status" aria-live="polite"></div></section><div id="perf">Iniciando escena…</div><div id="error" role="alert"></div>`;
}

function renderObjectOptions(container: HTMLElement, tree: OrreryTree, resolveDisplay: DisplayResolver): void {
	const select = container.querySelector<HTMLSelectElement>('#objects')!;
	const current = select.value;
	const nodes = allNodes(tree);
	select.innerHTML =
		'<option value="">Encontrar elemento…</option>' +
		nodes
			.map((n) => {
				const d = resolveDisplay(n.ref.id);
				const kind = d?.kind ?? n.ref.type;
				const name = d?.name ?? n.ref.id;
				return `<option value="${n.ref.id}">${kind} · ${name}</option>`;
			})
			.join('');
	if (nodes.some((n) => n.ref.id === current)) select.value = current;
}

function renderSimulatedBadge(container: HTMLElement, tree: OrreryTree): void {
	const badge = container.querySelector<HTMLElement>('#simulated-badge')!;
	badge.textContent = tree.simulated ? 'ESQUICIO 01 · DATOS SIMULADOS' : '';
	badge.style.display = tree.simulated ? '' : 'none';
}

export function mountOrreryScene(
	container: HTMLElement,
	tree: OrreryTree,
	resolveDisplay: DisplayResolver = simulatedDisplayResolver,
	positionHints?: Map<string, Position3>
): OrreryHandle {
	renderChrome(container);
	renderObjectOptions(container, tree, resolveDisplay);
	renderSimulatedBadge(container, tree);

	const noop: OrreryHandle = { update: () => {}, destroy: () => {} };
	const errorEl = container.querySelector<HTMLElement>('#error');

	try {
		return start(container, tree, resolveDisplay, positionHints);
	} catch (error) {
		if (errorEl) errorEl.textContent = `No pudimos iniciar la escena 3D. ${String(error)}`;
		else console.error(error);
		return noop;
	}
}

interface NodeVisuals {
	primary: pc.Entity;
	/** Entidades secundarias del nodo — "core" de Domain, "field" de Posture. */
	auxiliary: pc.Entity[];
	/** Subconjunto de {primary, ...auxiliary} que reacciona al checkbox "Campos de Gravity". */
	gravityToggled: pc.Entity[];
}

function start(
	container: HTMLElement,
	initialTree: OrreryTree,
	initialResolveDisplay: DisplayResolver,
	initialPositionHints?: Map<string, Position3>
): OrreryHandle {
	const $ = <T extends HTMLElement = HTMLElement>(id: string) => container.querySelector<T>('#' + id) as T;
	const canvas = $<HTMLCanvasElement>('world');

	const app = new pc.Application(canvas, { graphicsDeviceOptions: { antialias: true, alpha: false } });
	app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio, 1.75);
	app.setCanvasFillMode(pc.FILLMODE_NONE);
	app.setCanvasResolution(pc.RESOLUTION_AUTO);
	const resize = () => app.resizeCanvas(window.innerWidth, window.innerHeight);
	window.addEventListener('resize', resize);
	resize();
	app.scene.ambientLight = new pc.Color(0.5, 0.6, 0.7);
	const camera = new pc.Entity('Observer');
	camera.addComponent('camera', { clearColor: new pc.Color(0.027, 0.047, 0.071), fov: 47, nearClip: 0.1, farClip: 300 });
	app.root.addChild(camera);
	const light = new pc.Entity('Light');
	light.addComponent('light', { type: 'directional', color: new pc.Color(0.75, 0.88, 1), intensity: 1.4 });
	light.setEulerAngles(45, 25, 0);
	app.root.addChild(light);
	const material = (hex: string, opacity = 1, lit = true) => {
		const m = new pc.StandardMaterial();
		const c = new pc.Color().fromString(hex);
		m.diffuse = c;
		m.emissive = c.clone().mulScalar(lit ? 0.18 : 1);
		m.useLighting = lit;
		m.opacity = opacity;
		if (opacity < 1) {
			m.blendType = pc.BLEND_NORMAL;
			m.depthWrite = false;
		}
		m.update();
		return m;
	};

	const meshes = new Map<pc.MeshInstance, OrreryNode>();
	const nodeVisuals = new Map<string, NodeVisuals>();
	const lastKnownVersion = new Map<string, number | undefined>();

	function shape(
		name: string,
		type: 'sphere' | 'cylinder' | 'box',
		pos: number[],
		scale: number[],
		mat: pc.StandardMaterial,
		node?: OrreryNode
	) {
		const e = new pc.Entity(name);
		e.addComponent('render', { type, material: mat });
		e.setPosition(pos[0], pos[1], pos[2]);
		e.setLocalScale(scale[0], scale[1], scale[2]);
		app.root.addChild(e);
		if (node) e.render!.meshInstances.forEach((m) => meshes.set(m, node));
		return e;
	}

	// `ownerId`, cuando está presente, permite retirar exactamente las líneas
	// de un nodo al darlo de baja o reconstruirlo (update(), más abajo) — las
	// líneas de grilla base (sin owner) nunca se retiran.
	const lines: { points: pc.Vec3[]; color: pc.Color; group: string; ownerId?: string }[] = [];
	function ring(x: number, y: number, z: number, r: number, color: string, group = 'base', ownerId?: string) {
		const points: pc.Vec3[] = [];
		for (let j = 0; j < 96; j++) {
			for (const a of [(j / 96) * Math.PI * 2, ((j + 1) / 96) * Math.PI * 2])
				points.push(new pc.Vec3(x + Math.cos(a) * r, y, z + Math.sin(a) * r));
		}
		lines.push({ points, color: new pc.Color().fromString(color), group, ownerId });
	}
	for (let n = -30; n <= 30; n += 2) {
		lines.push({
			points: [new pc.Vec3(n, -0.35, -30), new pc.Vec3(n, -0.35, 30), new pc.Vec3(-30, -0.35, n), new pc.Vec3(30, -0.35, n)],
			color: new pc.Color(0.065, 0.11, 0.14),
			group: 'base'
		});
	}

	const labels = new Map<string, HTMLButtonElement>();

	function buildNodeVisuals(node: OrreryNode, position: Position3, resolveDisplay: DisplayResolver): NodeVisuals {
		const display = resolveDisplay(node.ref.id) ?? UNRESOLVED_DISPLAY;
		const [x, y, z] = position;
		const auxiliary: pc.Entity[] = [];
		let primary: pc.Entity;
		let gravityToggled: pc.Entity[] = [];
		if (display.kind === 'Domain') {
			primary = shape(
				node.ref.id,
				'cylinder',
				[x, -0.05, z],
				[5.2, 0.35, 5.2],
				material(display.project === 'Proyecto A' ? '#173b43' : '#292c49'),
				node
			);
			ring(x, 0.15, z, 2.65, display.color, 'base', node.ref.id);
			auxiliary.push(shape('core', 'cylinder', [x, 0.25, z], [0.22, 0.5, 0.22], material(display.color), node));
		} else if (display.kind === 'Posture') {
			primary = shape(node.ref.id, 'sphere', [x, y, z], [0.45, 0.45, 0.45], material(display.color, 1, false), node);
			const field = shape('field', 'sphere', [x, 0.5, z], [11, 5, 11], material(display.color, 0.055, false));
			auxiliary.push(field);
			gravityToggled = [primary, field];
			ring(x, 0.25, z, 5.5, '#79613e', 'gravity', node.ref.id);
			ring(x, 0.28, z, 4.5, '#483f31', 'gravity', node.ref.id);
		} else {
			primary = shape(
				node.ref.id,
				display.kind === 'Artifact' ? 'box' : 'sphere',
				[x, y, z],
				display.kind === 'Artifact' ? [0.55, 0.8, 0.55] : [0.5, 0.5, 0.5],
				material(display.color),
				node
			);
		}
		return { primary, auxiliary, gravityToggled };
	}

	function buildLabel(node: OrreryNode, resolveDisplay: DisplayResolver): HTMLButtonElement {
		const display = resolveDisplay(node.ref.id) ?? UNRESOLVED_DISPLAY;
		const b = document.createElement('button');
		b.className = 'label';
		b.innerHTML = `<small>${display.kind.toUpperCase()}</small>${display.name}`;
		b.onclick = () => select(node);
		$('labels').appendChild(b);
		return b;
	}

	/** Retira por completo lo que un nodo dejó en la escena — entidad
	 *  primaria, auxiliares, líneas propias y label. Usado tanto para bajas
	 *  como antes de reconstruir un nodo cuya `nodeVersion` cambió. */
	function destroyNodeVisuals(id: string): void {
		const visuals = nodeVisuals.get(id);
		if (visuals) {
			visuals.primary.destroy();
			for (const aux of visuals.auxiliary) aux.destroy();
			nodeVisuals.delete(id);
		}
		for (let i = lines.length - 1; i >= 0; i--) {
			if (lines[i].ownerId === id) lines.splice(i, 1);
		}
		labels.get(id)?.remove();
		labels.delete(id);
		lastKnownVersion.delete(id);
	}

	function allGravityToggledEntities(): pc.Entity[] {
		return [...nodeVisuals.values()].flatMap((v) => v.gravityToggled);
	}

	let tree = initialTree;
	let resolveDisplayCurrent = initialResolveDisplay;
	let positions = layoutPositions(tree, initialPositionHints);

	for (const node of allNodes(tree)) {
		nodeVisuals.set(node.ref.id, buildNodeVisuals(node, positions.get(node.ref.id) ?? [0, 0, 0], resolveDisplayCurrent));
		labels.set(node.ref.id, buildLabel(node, resolveDisplayCurrent));
		lastKnownVersion.set(node.ref.id, node.ref.nodeVersion);
	}
	for (const rel of tree.relations) {
		const from = positions.get(rel.fromId);
		const to = positions.get(rel.toId);
		if (!from || !to) continue;
		const points: pc.Vec3[] = [];
		for (let k = 0; k < 36; k++) {
			for (const t of [k / 36, (k + 1) / 36])
				points.push(new pc.Vec3(pc.math.lerp(from[0], to[0], t), 0.35 + Math.sin(t * Math.PI) * 1.7, pc.math.lerp(from[2], to[2], t)));
		}
		lines.push({ points, color: new pc.Color(0.21, 0.43, 0.47), group: 'genes' });
	}

	const marker = shape('Intent', 'sphere', [0, 1, 0], [0.32, 0.32, 0.32], material('#a9f8cc', 1, false));
	const selection = shape('Selection', 'sphere', [0, 0, 0], [0.8, 0.8, 0.8], material('#d0f4ee', 0.15, false));
	selection.enabled = false;
	let selected: OrreryNode | undefined;
	let yaw = 0.32,
		pitch = 0.92,
		distance = 40;
	const target = new pc.Vec3(0, 0, 0),
		desired = new pc.Vec3(0, 0, 0);
	let desiredDistance = 40;

	function select(node: OrreryNode) {
		selected = node;
		const display = resolveDisplayCurrent(node.ref.id) ?? UNRESOLVED_DISPLAY;
		$('kind').textContent = `${display.kind} / ${display.project}`;
		$('title').textContent = display.name;
		$('description').textContent = display.description;
		$('detail').textContent = display.detail;
		$('focus').textContent = 'Acercarme a este elemento';
		labels.forEach((b, id) => b.classList.toggle('selected', id === node.ref.id));
		$<HTMLSelectElement>('objects').value = node.ref.id;
		selection.enabled = true;
		const p = positions.get(node.ref.id) ?? [0, 0, 0];
		selection.setPosition(p[0], display.kind === 'Domain' ? 0.6 : p[1], p[2]);
	}

	$('focus').onclick = () => {
		if (selected) {
			const display = resolveDisplayCurrent(selected.ref.id) ?? UNRESOLVED_DISPLAY;
			const p = positions.get(selected.ref.id) ?? [0, 0, 0];
			desired.set(...p);
			desiredDistance = display.kind === 'Domain' ? 15 : 12;
		} else {
			desired.set(0, 0, 0);
			desiredDistance = 40;
		}
	};
	$('objects').onchange = () => {
		const node = allNodes(tree).find((n) => n.ref.id === $<HTMLSelectElement>('objects').value);
		if (node) select(node);
	};
	container.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(
		(b) =>
			(b.onclick = () => {
				container.querySelectorAll('[data-view]').forEach((n) => n.classList.remove('active'));
				b.classList.add('active');
				const v = b.dataset.view;
				desired.set(v === 'a' ? -5 : v === 'b' ? 8 : 0, 0, 0);
				desiredDistance = v === 'all' ? 40 : 24;
			})
	);
	const gravity = $<HTMLInputElement>('gravity'),
		geneToggle = $<HTMLInputElement>('genes'),
		names = $<HTMLInputElement>('names');
	gravity.onchange = () => allGravityToggledEntities().forEach((e) => (e.enabled = gravity.checked));

	let drag: { x: number; y: number; distance: number } | undefined;
	const picker = new pc.Picker(app, 512, 512);
	let pendingPick = false;
	const onPointerDown = (e: PointerEvent) => {
		drag = { x: e.clientX, y: e.clientY, distance: 0 };
		canvas.setPointerCapture(e.pointerId);
	};
	const onPointerMove = (e: PointerEvent) => {
		if (!drag) return;
		const dx = e.clientX - drag.x,
			dy = e.clientY - drag.y;
		drag.distance += Math.abs(dx) + Math.abs(dy);
		drag.x = e.clientX;
		drag.y = e.clientY;
		if (e.shiftKey) {
			desired.x -= dx * 0.025 * Math.cos(yaw);
			desired.z += dx * 0.025 * Math.sin(yaw);
			desired.z -= dy * 0.025 * Math.cos(yaw);
			desired.x -= dy * 0.025 * Math.sin(yaw);
		} else {
			yaw -= dx * 0.006;
			pitch = pc.math.clamp(pitch + dy * 0.006, 0.18, 1.48);
		}
	};
	const onPointerUp = async (e: PointerEvent) => {
		const click = drag && drag.distance < 5;
		drag = undefined;
		if (!click || pendingPick) return;
		pendingPick = true;
		try {
			picker.prepare(camera.camera!, app.scene);
			const found = await picker.getSelectionAsync((e.clientX / window.innerWidth) * 512, (e.clientY / window.innerHeight) * 512);
			const node = found.map((m) => meshes.get(m as pc.MeshInstance)).find(Boolean);
			if (node) select(node);
		} finally {
			pendingPick = false;
		}
	};
	const onPointerCancel = () => {
		drag = undefined;
	};
	const onWheel = (e: WheelEvent) => {
		e.preventDefault();
		desiredDistance = pc.math.clamp(desiredDistance + e.deltaY * 0.025, 7, 70);
	};
	canvas.addEventListener('pointerdown', onPointerDown);
	canvas.addEventListener('pointermove', onPointerMove);
	canvas.addEventListener('pointerup', onPointerUp);
	canvas.addEventListener('pointercancel', onPointerCancel);
	canvas.addEventListener('wheel', onWheel, { passive: false });

	let time = 0,
		playing = true,
		lastStage = '';
	const timeline = $<HTMLInputElement>('timeline');
	const updatePlay = () => {
		$('play').textContent = playing ? 'Pausar' : 'Reproducir';
	};
	$('play').onclick = () => {
		if (time >= 30) time = 0;
		playing = !playing;
		updatePlay();
	};
	$('reset').onclick = () => {
		time = 0;
		playing = true;
		updatePlay();
	};
	timeline.oninput = () => {
		time = Number(timeline.value);
	};
	const route = [new pc.Vec3(-9, 1, -3), new pc.Vec3(-3, 1, 3), new pc.Vec3(-3, 1, -7), new pc.Vec3(8, 1, -4), new pc.Vec3(9, 1, 4)];
	let elapsed = 0,
		frames = 0;
	const project = new pc.Vec3();

	const onUpdate = (dt: number) => {
		const smooth = 1 - Math.exp(-dt * 7);
		target.lerp(target, desired, smooth);
		distance = pc.math.lerp(distance, desiredDistance, smooth);
		camera.setPosition(
			target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
			target.y + Math.sin(pitch) * distance,
			target.z + Math.cos(yaw) * Math.cos(pitch) * distance
		);
		camera.lookAt(target);
		if (playing) {
			time = Math.min(30, time + dt);
			if (time >= 30) {
				playing = false;
				updatePlay();
			}
		}
		timeline.value = String(time);
		$('time').textContent = `${Math.floor(time)} / 30 s`;
		const stage =
			time < 7
				? 'Intent 1 · Inspeccionar identidad'
				: time < 11
					? 'Orbital · Segunda pasada de revisión'
					: time < 15
						? 'Intent 2 · Espera de intervención simulada'
						: time < 21
							? 'Intent 3 · Registrar evidencia'
							: time < 27
								? 'Mandate 2 · Compartir conocimiento'
								: 'Artifact disponible · Recorrido completado';
		if (stage !== lastStage) {
			$('status').textContent = stage;
			lastStage = stage;
		}
		let t: number;
		if (time < 7) t = time / 7;
		else if (time < 11) t = 1;
		else if (time < 15) t = 1;
		else if (time < 21) t = 1 + (time - 15) / 6;
		else if (time < 27) t = 2 + (time - 21) / 6;
		else t = 3 + (time - 27) / 3;
		const seg = Math.min(3, Math.floor(t)),
			f = t - seg;
		const position = new pc.Vec3().lerp(route[seg], route[seg + 1], f);
		position.y += Math.sin(f * Math.PI) * 1.8;
		if (time >= 7 && time < 11) {
			const angle = ((time - 7) / 4) * Math.PI * 2;
			position.x += Math.sin(angle) * 1.2;
			position.z += 1.2 - Math.cos(angle) * 1.2;
		}
		marker.setPosition(position);
		// 'artifact' es un id específico del prototipo simulado (data.ts) — un
		// árbol real que no lo contenga simplemente no anima este marcador,
		// nunca revienta por buscar una entidad que no existe.
		const artifactVisuals = nodeVisuals.get('artifact');
		if (artifactVisuals) artifactVisuals.primary.enabled = time >= 21;
		for (const l of lines) {
			if ((l.group === 'gravity' && !gravity.checked) || (l.group === 'genes' && !geneToggle.checked)) continue;
			app.drawLines(l.points, l.color);
		}
		for (let j = 0; j < route.length - 1; j++) app.drawLine(route[j], route[j + 1], new pc.Color(0.23, 0.48, 0.36));
		for (const node of allNodes(tree)) {
			const b = labels.get(node.ref.id);
			if (!b) continue;
			const p = positions.get(node.ref.id);
			if (!p) continue;
			const display = resolveDisplayCurrent(node.ref.id) ?? UNRESOLVED_DISPLAY;
			camera.camera!.worldToScreen(new pc.Vec3(p[0], p[1] + 0.9, p[2]), project);
			b.style.left = `${project.x}px`;
			b.style.top = `${project.y + (display.kind === 'Posture' ? -30 : display.kind === 'Artifact' ? 28 : 0)}px`;
			b.style.display =
				names.checked &&
				project.z > 0 &&
				(display.kind !== 'Posture' || gravity.checked) &&
				(node.ref.id !== 'artifact' || time >= 21)
					? 'block'
					: 'none';
		}
		elapsed += dt;
		frames++;
		if (elapsed > 0.75) {
			$('perf').textContent = `${Math.round(frames / elapsed)} FPS · WebGL2\nPlayCanvas · simulación local`;
			elapsed = 0;
			frames = 0;
		}
	};
	app.on('update', onUpdate);
	app.start();

	function update(newTree: OrreryTree, newResolveDisplay?: DisplayResolver, newPositionHints?: Map<string, Position3>): void {
		tree = newTree;
		if (newResolveDisplay) resolveDisplayCurrent = newResolveDisplay;
		positions = layoutPositions(tree, newPositionHints);

		renderObjectOptions(container, tree, resolveDisplayCurrent);
		renderSimulatedBadge(container, tree);

		const incomingIds = new Set(allNodes(tree).map((n) => n.ref.id));
		const currentIds = new Set(nodeVisuals.keys());

		// Bajas — Mecanismo de Diffing, Spec §4.2. destroyNodeVisuals() retira
		// entidad primaria, auxiliares (core/field), líneas propias y label —
		// nunca deja restos de un nodo que ya no está en el árbol nuevo.
		for (const id of currentIds) {
			if (!incomingIds.has(id)) destroyNodeVisuals(id);
		}
		// Altas y actualizaciones — solo se reconstruye lo que cambió de
		// versión; un nodo sin cambio de `nodeVersion` no se toca.
		for (const node of allNodes(tree)) {
			const existing = nodeVisuals.get(node.ref.id);
			const position = positions.get(node.ref.id) ?? [0, 0, 0];
			if (!existing) {
				nodeVisuals.set(node.ref.id, buildNodeVisuals(node, position, resolveDisplayCurrent));
				labels.set(node.ref.id, buildLabel(node, resolveDisplayCurrent));
			} else if (node.ref.nodeVersion !== lastKnownVersion.get(node.ref.id)) {
				destroyNodeVisuals(node.ref.id);
				nodeVisuals.set(node.ref.id, buildNodeVisuals(node, position, resolveDisplayCurrent));
				labels.set(node.ref.id, buildLabel(node, resolveDisplayCurrent));
			}
			lastKnownVersion.set(node.ref.id, node.ref.nodeVersion);
		}
		// Si el nodo seleccionado ya no existe en el árbol nuevo, se limpia la
		// selección en vez de dejar el panel mostrando un elemento fantasma.
		if (selected && !incomingIds.has(selected.ref.id)) {
			selected = undefined;
			selection.enabled = false;
			$('kind').textContent = 'TU PUNTO DE ATENCIÓN';
			$('title').textContent = 'Un mundo por recorrer';
			$('description').textContent = 'Acercate a un territorio o seleccioná un elemento para descubrir sus relaciones.';
			$('detail').textContent = 'Las formas son exploratorias. Todos los nombres, relaciones y eventos de esta escena son ejemplos.';
			$('focus').textContent = 'Volver a la vista general';
		}
	}

	function destroy(): void {
		window.removeEventListener('resize', resize);
		canvas.removeEventListener('pointerdown', onPointerDown);
		canvas.removeEventListener('pointermove', onPointerMove);
		canvas.removeEventListener('pointerup', onPointerUp);
		canvas.removeEventListener('pointercancel', onPointerCancel);
		canvas.removeEventListener('wheel', onWheel);
		app.off('update', onUpdate);
		app.destroy();
	}

	return { update, destroy };
}

// ============================================================================
// Compatibilidad standalone — preserva el comportamiento existente de este
// paquete (dev server de Vite sobre index.html, que monta sobre `#app`) sin
// que ningún consumidor externo (ej. el webview, vía el alias `$orrery` en
// svelte.config.js) dispare un montaje automático no deseado al importar
// este módulo. Solo se autoejecuta si `#app` existe en el documento actual.
// ============================================================================
const standaloneContainer = typeof document !== 'undefined' ? document.querySelector<HTMLElement>('#app') : null;
if (standaloneContainer) {
	mountOrreryScene(standaloneContainer, fromSimulatedData(), simulatedDisplayResolver, simulatedPositionHints());
}
