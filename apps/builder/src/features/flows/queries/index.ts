import { notFoundException } from "@chatbotx.io/business/errors"
import {
  and,
  countDistinct,
  db,
  eq,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import { rootFolderId } from "@chatbotx.io/database/partials"
import { flowModel, flowNodeStatModel } from "@chatbotx.io/database/schema"
import {
  likeContains,
  parseOrderByAsObject,
  parsePagination,
} from "@chatbotx.io/database/utils"
import { stepTypes } from "@chatbotx.io/flow-config"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import {
  filterFlowsByStartStepType,
  filterFlowsByTemplateIds,
} from "../actions/filter-flow-action"
import type {
  FindFlowParams,
  ListFlowsRequest,
  ListFlowsResponse,
} from "../schemas/query"
import type {
  FlowResource,
  FlowWithVersionsResource,
} from "../schemas/resource"

export const listFlowsRSC = async (
  input: ListFlowsRequest & { workspaceId: string },
) => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return listFlows(input)
}

export async function listFlows(
  input: ListFlowsRequest & { workspaceId: string },
): Promise<ListFlowsResponse> {
  const where = {
    workspaceId: input.workspaceId,
    folderId: input.folderId
      ? // biome-ignore lint/style/noNestedTernary: allow nested ternary
        input.folderId === rootFolderId
        ? { isNull: true as const }
        : input.folderId
      : undefined,
    name: input.name
      ? {
          ilike: likeContains(input.name),
        }
      : undefined,
    active: input.active === null ? undefined : input.active,
  }

  const pagination = parsePagination(input)
  const orderBy = parseOrderByAsObject(flowModel, input)

  let [data, total] = await Promise.all([
    db.query.flowModel.findMany({
      where,
      orderBy,
      ...pagination,
      with: {
        flowVersions: {
          where: {
            OR: [
              { isDraft: true },
              {
                isLatest: true,
              },
            ],
          },
        },
      },
    }),
    db.$count(flowModel, relationsFilterToSQL(flowModel, where)),
  ])

  if (input.startType) {
    data = filterFlowsByStartStepType(data, input.startType)

    if (input.startType === stepTypes.enum.sendWaTemplateMessage) {
      if (input.integrationWhatsappId) {
        const templates = await db.query.whatsappMessageTemplateModel.findMany({
          where: { integrationWhatsappId: input.integrationWhatsappId },
          columns: { id: true },
        })
        const templateIds = templates.map((t) => t.id)
        data = filterFlowsByTemplateIds(data, templateIds)
      } else {
        data = []
      }
    }

    total = data.length
  }

  const pageCount = pagination?.limit ? Math.ceil(total / pagination.limit) : 1

  return { data, pageCount, ...pagination }
}

export const findFlow = async (
  input: FindFlowParams,
): Promise<{ data: FlowResource | null }> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const targetFlow = await db.query.flowModel.findFirst({
    where: {
      workspaceId: input.workspaceId,
      id: input.id,
    },
    with: {
      flowVersions: true,
    },
  })
  if (!targetFlow) {
    throw notFoundException("Flow does not exists.")
  }

  return { data: targetFlow }
}

/**
 * A flow with its versions — and so its node graph — for a caller that has
 * already proven it may read this workspace.
 *
 * `findFlow` above is the session variant: it opens with
 * `assertCurrentUserCanAccessChatbot`, which a workspace token cannot satisfy.
 * The query itself is identical; splitting it here keeps the token API from
 * duplicating the `with: { flowVersions: true }` shape.
 *
 * Authorizes nothing on its own.
 */
export const findFlowForWorkspace = async (
  workspaceId: string,
  id: string,
): Promise<{ data: FlowWithVersionsResource }> => {
  const targetFlow = await db.query.flowModel.findFirst({
    where: { workspaceId, id },
    with: { flowVersions: true },
  })

  if (!targetFlow) {
    throw notFoundException("Flow does not exists.")
  }

  return { data: targetFlow }
}

export const ensureAllFlowIdsExists = async (
  workspaceId: string,
  flowIds: string[],
): Promise<void> => {
  const rows = await db.query.flowModel.findMany({
    where: {
      workspaceId,
      id: {
        in: flowIds,
      },
    },
    columns: { id: true },
  })
  const count = rows.length

  if (count !== flowIds.length) {
    throw notFoundException("Flow does not exists.")
  }
}

/**
 * The id of a flow's live draft version.
 *
 * A flow has many versions and exactly one open draft; the write endpoints take
 * the *version* id, not the flow id. Callers holding only a flow id (the public
 * API, a script) resolve it here instead of querying the table themselves.
 *
 * Authorizes nothing: the caller must already have established it may read this
 * workspace.
 */
export const findDraftFlowVersionId = async (
  workspaceId: string,
  flowId: string,
): Promise<string> => {
  const draft = await db.query.flowVersionModel.findFirst({
    columns: { id: true },
    where: { workspaceId, flowId, isDraft: true },
  })

  if (!draft) {
    throw notFoundException("Draft flow version not found")
  }

  return draft.id
}

/**
 * El embudo de un flujo: cuanta gente distinta llego a cada nodo y cuantos
 * pulsaron cada boton.
 *
 * Se cuenta por contacto (`countDistinct`), no por evento: un mismo nodo puede
 * entregar varios mensajes a la misma persona, y contar eventos inflaria el
 * embudo hasta hacerlo inutil para comparar pasos entre si.
 *
 * `message:delivered` marca que el nodo se ejecuto; `flow:clicked` lleva el
 * `buttonId`, asi que sirve de tasa de pulsacion real, no estimada.
 *
 * Autoriza nada: quien llama ya debe haber probado que puede leer el espacio.
 */
export const flowFunnelStats = async (
  workspaceId: string,
  flowId: string,
): Promise<{
  data: {
    nodes: { nodeId: string; contacts: number }[]
    buttons: { buttonId: string; contacts: number }[]
  }
}> => {
  const filas = await db
    .select({
      nodeId: flowNodeStatModel.nodeId,
      buttonId: flowNodeStatModel.buttonId,
      eventType: flowNodeStatModel.eventType,
      contacts: countDistinct(flowNodeStatModel.contactId),
    })
    .from(flowNodeStatModel)
    .where(
      and(
        eq(flowNodeStatModel.workspaceId, workspaceId),
        eq(flowNodeStatModel.flowId, flowId),
      ),
    )
    .groupBy(
      flowNodeStatModel.nodeId,
      flowNodeStatModel.buttonId,
      flowNodeStatModel.eventType,
    )

  return {
    data: {
      nodes: filas
        .filter((f) => f.eventType === "message:delivered")
        .map((f) => ({ nodeId: f.nodeId, contacts: f.contacts })),
      buttons: filas
        .filter((f) => f.eventType === "flow:clicked" && f.buttonId)
        .map((f) => ({ buttonId: f.buttonId as string, contacts: f.contacts })),
    },
  }
}
