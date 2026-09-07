import type { WorkflowClient } from '@temporalio/client';

import {
  MANDATE_BUILD_WORKFLOW_TYPE,
  mandateBuildWorkflowId,
  type MandateBuildInput,
} from '../workflows/mandate-build-workflow.types';

/**
 * Task queue de Nucleus para los workflows de Genesis. Se asume el mismo
 * naming que usa `MandateExecutionWorkflow` para `mandate run` (D-B1: es
 * el mismo dominio de ejecución) — el diseño no fija el valor exacto, así
 * que queda como constante centralizada en vez de hardcodeada en el
 * handler.
 */
const NUCLEUS_MANDATES_TASK_QUEUE = 'nucleus-mandates';

/**
 * Dispara el arranque ASÍNCRONO de `MandateBuildWorkflow` (§6.1).
 * "Asíncrono" acá significa: el handler HTTP no espera a que el workflow
 * complete (ni siquiera a Fase 1) — solo confirma que Temporal aceptó el
 * `start`. El progreso real se consulta después vía `nucleus mandate status`
 * (§7.4), que lee `gen_state.json` directo, sin engancharse al workflow.
 */
export async function startMandateBuildWorkflow(
  client: WorkflowClient,
  input: MandateBuildInput,
): Promise<{ workflowId: string; runId: string }> {
  const workflowId = mandateBuildWorkflowId(input.mandateId);

  const handle = await client.start(MANDATE_BUILD_WORKFLOW_TYPE, {
    taskQueue: NUCLEUS_MANDATES_TASK_QUEUE,
    workflowId,
    args: [input],
    // Un genesis a medio construir no debería poder duplicarse por un
    // doble submit del CLI — si ya hay un run vivo con este workflowId,
    // Temporal rechaza el start en vez de arrancar un segundo run.
    workflowIdReusePolicy: 'REJECT_DUPLICATE',
  });

  return { workflowId: handle.workflowId, runId: handle.firstExecutionRunId };
}
