# Alcance — Infraestructura Web y Comercial Pendiente (registro v0.1)

**Tipo:** Registro/inventario de alcance — anota superficies e infraestructura que van a hacer falta, identificadas conversacionalmente, para que no se pierdan antes de que exista una investigación o diseño formal de cada una. No es una investigación ni un diseño — ninguno de los puntos de abajo tiene decisión tomada.
**Estado:** v0.1 — registro abierto, se va a ir ampliando a medida que aparezcan más piezas.
**Fecha:** 2026-09-01
**Origen:** conversación de este cowork — Jose fue nombrando piezas de infraestructura que da por hecho que van a hacer falta, pidiendo explícitamente que se anoten como parte del alcance, sin diseñarlas todavía.

---

## Piezas identificadas hasta ahora

### 1. Auth (GitHub) + ABM de usuarios
Sistema web con al menos validación de usuario por GitHub y alta/baja/modificación de usuarios.
**Conecta con:** el track de Roles/Authority ya abierto (`docs/ANAYSIS/BACKEND/ROLES/`) — es la superficie natural para administrar `principals`, `memberships` y asignaciones de rol que ese encargo ya scopea del lado de datos/backend. Todavía no tiene ninguna pieza de frontend diseñada.

### 2. Wisdom Browser / Marketplace UI
Interfaz web donde el ingeniero/CTO navega el marketplace de Mandates, ve qué existe, dispara descarga/instalación, y ve el resultado del chequeo de compatibilidad de posturas (compatible / conflicto / necesita revisión) antes de decidir instalar.
**Conecta con:** `docs/WISDOM/` (cadena Postura→Gravity→Wisdom, Mandate Package) y `docs/ANAYSIS/BACKEND/GRAVITY/Mandate_Server_Compatibilidad_Gravity_Introduccion_v0_1.md` (el chequeo de compatibilidad en sí, hoy sin superficie). También con los endpoints conceptuales de Wisdom ya anotados en `CODEX_Frontera_Backend_Batcave_v0_1.md` (`publications`, `adoptions`) — esos son transporte, no interfaz.

### 3. Cobro al usuario — suscripción anual
El usuario/organización paga con tarjeta, con cadencia anual, para tener acceso al sistema.
**Estado:** recién anotado, sin ninguna conexión todavía a un track existente. Implica al menos: un procesador de pagos (no elegido), un modelo de entitlement ligado a `organizations`/`orgMembers` (qué desbloquea el pago, qué pasa si vence), manejo de renovación/cancelación/reembolso, y cumplimiento (PCI vía el procesador, no maneja Bloom los datos de tarjeta directamente salvo que se decida lo contrario).

### 4. Cobro al desarrollador — venta de Mandates en el marketplace
Los desarrolladores que publican Mandates en Wisdom también van a cobrar por sus ventas — marketplace de dos lados, no solo cobro al usuario final.
**Estado:** recién anotado, sin diseño. Esto agrega complejidad real y todavía sin explorar:
- Identidad del publisher como entidad *cobrable* — se cruza directo con "Ownership" y `publisherKeyRef`, ya señalados como bloqueadores abiertos en `BLOOM_Wisdom_Sintesis_Codex_v0_1.md` (§ Bloqueadores 2 y 3) — antes eran solo problema de identidad/confianza, ahora también son problema de a quién se le paga.
- Split de revenue entre plataforma y publisher (porcentaje, moneda, frecuencia de payout).
- Onboarding de pago del lado del desarrollador (KYC, cuenta bancaria o equivalente, y compliance fiscal — retenciones, 1099/equivalentes según jurisdicción — si hay publishers internacionales).
- Reembolsos y disputas cuando un Mandate comprado resulta incompatible o defectuoso.
- Cómo interactúa esto con la promoción/adopción de Wisdom (¿se cobra por publicar, por adoptar, por ambos?) — ninguno de los documentos de Wisdom contempla todavía un modelo comercial (`BLOOM_Wisdom_Sintesis_Codex_v0_1.md` lo lista explícitamente como algo que "no debe asumirse todavía").

---

## Qué significa este registro y qué no

Anotar estas cuatro piezas acá no autoriza a investigarlas, diseñarlas ni implementarlas — es solo la lista viva de "esto también va a hacer falta" para no perderlo mientras el cowork sigue con los tracks ya abiertos (Installer/Metamorph, Gravity/Mandate Server, Roles/Authority). Cuando Jose decida que corresponde abrir alguno de estos puntos como investigación formal, este documento es el punto de partida y se actualiza con lo que se decida ahí.

---

*Fin del registro v0.1. Se amplía a medida que aparezcan más piezas de infraestructura durante la conversación.*
