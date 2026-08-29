import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnUpdatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPI } from "@/orpc"
import { createFlow } from "../actions/create-flow-action"
import { publishFlow } from "../actions/publish-flow-action"
import { updateDraftFlowVersion } from "../actions/update-draft-flow-version-action"
import { findDraftFlowVersionId, listFlows } from "../queries"
import {
  createFlowSchema,
  publishFlowSchema,
  updateDraftFlowVersionSchema,
} from "../schemas/action"
import { flowResource } from "../schemas/resource"

const flowWorkspaceTokenAPIs = {
  listFlowsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/flows",
      summary: "Get all flows",
      tags: ["Flows"],
    })
    .input(z.object({}))
    .output(
      z.object({
        data: z.array(flowResource.pick({ id: true, name: true })),
      }),
    )
    .handler(
      async ({ context, input }) =>
        await listFlows({
          ...input,
          workspaceId: context.workspace.id,
          active: true,
        }),
    ),

  // Authoring: `/v1/flows` was read-only, so a flow could be listed but only
  // built from a browser session. These three are the minimum to author one end
  // to end — create, write the node graph, publish — and each delegates to the
  // same function the panel's server action calls.
  createFlowWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/flows",
      summary: "Create a flow",
      successStatus: 201,
      tags: ["Flows"],
    })
    .input(createFlowSchema)
    .output(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await createFlow(context.workspace.id, input),
    ),

  updateFlowDraftWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/flows/{id}/draft",
      summary: "Replace the draft node graph of a flow",
      tags: ["Flows"],
    })
    .input(
      updateDraftFlowVersionSchema.and(z.object({ id: zodBigintAsString() })),
    )
    .output(z.void())
    .errors(possibleErrorsOnUpdatingResource)
    // `updateDraftFlowVersion` takes the *version* id, but the caller only has
    // the flow id — the one this route's path promises. Resolving the draft
    // here keeps the contract honest: pass a flow id, get its draft written.
    .handler(async ({ context, input }) => {
      const { id: flowId, ...rest } = input
      const id = await findDraftFlowVersionId(context.workspace.id, flowId)
      await updateDraftFlowVersion(
        { workspaceId: context.workspace.id, id },
        rest,
      )
    }),

  publishFlowWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/flows/{id}/publish",
      summary: "Publish the current draft of a flow",
      tags: ["Flows"],
    })
    .input(publishFlowSchema.and(z.object({ id: zodBigintAsString() })))
    .output(z.void())
    .errors(possibleErrorsOnUpdatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...rest } = input
      await publishFlow({ workspaceId: context.workspace.id, id }, rest)
    }),
}

export default flowWorkspaceTokenAPIs
