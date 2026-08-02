import { Type, type Static } from '@sinclair/typebox';

/**
 * Unión discriminada para `POST /mandates`.
 * Fuente: §5.1 del diseño.
 *
 * Nota: `standard` está acá solo por completitud de la unión (el endpoint
 * es único, discriminado por `mandateType`), pero su handling NO es parte
 * del alcance de este documento (ver línea 6: "No modifica el diseño ya
 * cerrado de standard"). El handler de §5.4 delega ese caso al código ya
 * existente del Command Surface v0.2.0.
 */

export const StandardCreateBody = Type.Object(
  {
    // Opcional: si el caller (CLI o API) lo manda, el handler lo respeta
    // en vez de generar uno con randomUUID(). Sin esto, additionalProperties:
    // false lo poda silenciosamente antes de llegar al handler.
    mandateId: Type.Optional(Type.String({ minLength: 1 })),
    mandateType: Type.Literal('standard'),
    project: Type.String(),
    name: Type.String({ minLength: 1 }),
    objective: Type.String({ minLength: 1 }),
  },
  { $id: 'StandardCreateBody', additionalProperties: false },
);

export const GenesisCreateBody = Type.Object(
  {
    mandateId: Type.Optional(Type.String({ minLength: 1 })),
    mandateType: Type.Literal('genesis'),
    project: Type.String(),
    name: Type.String({ minLength: 1 }),
    source: Type.String({ minLength: 1 }),
  },
  { $id: 'GenesisCreateBody', additionalProperties: false },
);

export const DomainExpansionCreateBody = Type.Object(
  {
    mandateId: Type.Optional(Type.String({ minLength: 1 })),
    mandateType: Type.Literal('domain_expansion'),
    project: Type.String(),
    name: Type.String({ minLength: 1 }),
    source: Type.String({ minLength: 1 }),
    baseGenesis: Type.String({ minLength: 1 }),
  },
  { $id: 'DomainExpansionCreateBody', additionalProperties: false },
);

// oneOf + discriminator: le da a Ajv un error específico por rama en vez de
// "no matching schema in anyOf" — el mensaje de error es parte del
// contrato del comando CLI (§5.1, nota final).
//
// IMPORTANTE (fix Swagger UI): OpenAPI 3.0 exige que, cuando se usa
// `discriminator`, cada rama del `oneOf` sea un `$ref` a un schema con
// nombre — no un objeto inline. Antes acá se insertaban StandardCreateBody
// etc. por valor; Ajv los validaba igual (por eso el endpoint funcionaba
// en runtime), pero Swagger UI no puede resolver un discriminator con
// ramas inline y omite la operación de la lista sin avisar en consola.
// Type.Ref() genera el `$ref` correcto porque cada schema ahora tiene $id.
export const CreateMandateBody = Type.Unsafe<
  Static<typeof StandardCreateBody> | Static<typeof GenesisCreateBody> | Static<typeof DomainExpansionCreateBody>
>({
  oneOf: [
    Type.Ref(StandardCreateBody),
    Type.Ref(GenesisCreateBody),
    Type.Ref(DomainExpansionCreateBody),
  ],
  discriminator: { propertyName: 'mandateType' },
});

export type CreateMandateBodyT = Static<typeof CreateMandateBody>;
export type StandardCreateBodyT = Static<typeof StandardCreateBody>;
export type GenesisCreateBodyT = Static<typeof GenesisCreateBody>;
export type DomainExpansionCreateBodyT = Static<typeof DomainExpansionCreateBody>;

/** Type guards para discriminar en el handler sin repetir el literal en cada sitio. */
export function isGenesisCreate(body: CreateMandateBodyT): body is GenesisCreateBodyT {
  return body.mandateType === 'genesis';
}

export function isDomainExpansionCreate(body: CreateMandateBodyT): body is DomainExpansionCreateBodyT {
  return body.mandateType === 'domain_expansion';
}

export function isStandardCreate(body: CreateMandateBodyT): body is StandardCreateBodyT {
  return body.mandateType === 'standard';
}
