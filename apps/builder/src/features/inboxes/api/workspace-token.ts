import { inboxService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnUpdatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPI } from "@/orpc"
import { listInboxes } from "../queries"
import {
  inboxAIAgentSettingResource,
  publicListInboxesResponse,
  publicListInboxResponse,
  publishInboxesRequest,
  updateInboxAIAgentSettingRequest,
} from "../schema/action"

export const inboxesWorkspaceTokenAPIs = {
  listInboxesWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/inboxes",
      summary: "List inboxes",
      description:
        "List connected inboxes with their internal IDs. Use `id` as the `inboxId` parameter when sending messages or flows to a contact.",
      tags: ["Channels"],
    })
    .input(publishInboxesRequest)
    .output(publicListInboxResponse)
    .handler(
      async ({ context, input }) =>
        await listInboxes({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  listChannelsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/channels",
      summary: "List channels",
      tags: ["Channels"],
    })
    .input(publishInboxesRequest)
    .output(publicListInboxesResponse)
    .handler(async ({ context, input }) => {
      const result = await listInboxes({
        ...input,
        workspaceId: context.workspace.id,
      })
      return {
        ...result,
        data: result.data.map(({ sourceId, ...inbox }) => ({
          ...inbox,
          id: sourceId,
        })),
      }
    }),

  getInboxAIAgentSettingWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/inboxes/{inboxId}/ai-agent",
      summary: "Get whether the AI agent answers in an inbox",
      tags: ["Channels"],
    })
    .input(z.object({ inboxId: zodBigintAsString() }))
    .output(inboxAIAgentSettingResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const inbox = await inboxService.find({
        where: { id: input.inboxId, workspaceId: context.workspace.id },
      })
      if (!inbox) {
        throw notFoundException("Inbox not found")
      }
      return { id: inbox.id, aiAgentEnabled: inbox.aiAgentEnabled }
    }),

  updateInboxAIAgentSettingWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/inboxes/{inboxId}/ai-agent",
      summary: "Allow or stop the AI agent answering in an inbox",
      description:
        "With `enabled: false` (the default for every inbox) the workspace's default AI agent never answers there: Keywords and the default reply flow work as if there were no agent.",
      tags: ["Channels"],
    })
    .input(updateInboxAIAgentSettingRequest)
    .output(inboxAIAgentSettingResource)
    .errors(possibleErrorsOnUpdatingResource)
    .handler(async ({ context, input }) => {
      const inbox = await inboxService.updateAIAgentEnabled({
        workspaceId: context.workspace.id,
        inboxId: input.inboxId,
        enabled: input.enabled,
      })
      if (!inbox) {
        throw notFoundException("Inbox not found")
      }
      return { id: inbox.id, aiAgentEnabled: inbox.aiAgentEnabled }
    }),
}

export default inboxesWorkspaceTokenAPIs
