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
    mandateType: Type.Literal('standard'),
    project: Type.String(),
    name: Type.String({ minLength: 1 }),
    objective: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const GenesisCreateBody = Type.Object(
  {
    mandateType: Type.Literal('genesis'),
    project: Type.String(),
    name: Type.String({ minLength: 1 }),
    source: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const DomainExpansionCreateBody = Type.Object(
  {
    mandateType: Type.Literal('domain_expansion'),
    project: Type.String(),
    name: Type.String({ minLength: 1 }),
    source: Type.String({ minLength: 1 }),
    baseGenesis: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

// oneOf + discriminator: le da a Ajv un error específico por rama en vez de
// "no matching schema in anyOf" — el mensaje de error es parte del
// contrato del comando CLI (§5.1, nota final).
export const CreateMandateBody = Type.Unsafe<
  Static<typeof StandardCreateBody> | Static<typeof GenesisCreateBody> | Static<typeof DomainExpansionCreateBody>
>({
  oneOf: [StandardCreateBody, GenesisCreateBody, DomainExpansionCreateBody],
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
