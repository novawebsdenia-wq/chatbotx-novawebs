/**
 * Instagram comment automations over the public workspace-token API.
 *
 * Why this file exists: `authenticated.ts` already exposes create/update/delete
 * for IG comment automations, but only to a browser session — a workspace token
 * gets 401. Twelve other features (contacts, flows, tags, triggers, …) already
 * ship a token variant; this one was simply missing, so an operator can read
 * automations through the API but has to open the panel to create one.
 *
 * Everything here delegates to the SAME actions the panel calls, so validation,
 * permissions inside the workspace and side effects stay identical. The only
 * differences from `authenticated.ts` are the ones the token model requires:
 * the workspace comes from `context.workspace.id` instead of a path parameter,
 * and the routes live under `/v1` like the rest of the public API.
 */

import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnUpdatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPI } from "@/orpc"
import { createIgComment } from "../actions/create-ig-comment.action"
import { deleteIgComment } from "../actions/delete-ig-comment.action"
import { updateIgComment } from "../actions/update-ig-comment.action"
import { listIgComments } from "../queries"
import {
  createIgCommentRequest,
  listIgCommentsResponse,
  updateIgCommentRequest,
} from "../schema/action"
import { igCommentResource } from "../schema/resource"

const listIgCommentsWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/ig-comments",
    summary: "List Instagram comment automations",
    tags: ["IG Comments"],
  })
  // `listIgCommentsRequest` is an intersection (pagination AND filters), so it
  // has no `.omit()` to drop `workspaceId` with. The filters are declared here
  // instead, and the workspace comes from the token — same shape the handler
  // gets, minus the field the caller must not be able to set.
  .input(
    z.object({
      name: z.string().nullish(),
      folderId: zodBigintAsString().nullish(),
      isActive: z.boolean().nullish(),
    }),
  )
  .output(listIgCommentsResponse)
  .errors(possibleErrorsOnFindingResource)
  .handler(
    async ({ context, input }) =>
      await listIgComments({ ...input, workspaceId: context.workspace.id }),
  )

const createIgCommentWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "POST",
    path: "/v1/ig-comments",
    summary: "Create an Instagram comment automation",
    successStatus: 201,
    tags: ["IG Comments"],
  })
  .input(createIgCommentRequest)
  .output(igCommentResource)
  .errors(possibleErrorsOnCreatingResource)
  .handler(
    async ({ context, input }) =>
      await createIgComment(context.workspace.id, input),
  )

const updateIgCommentWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "PUT",
    path: "/v1/ig-comments/{id}",
    summary: "Update an Instagram comment automation",
    tags: ["IG Comments"],
  })
  .input(updateIgCommentRequest.and(z.object({ id: zodBigintAsString() })))
  .output(igCommentResource)
  .errors(possibleErrorsOnUpdatingResource)
  .handler(async ({ context, input }) => {
    const { id, ...rest } = input
    return await updateIgComment(
      { workspaceId: context.workspace.id, id },
      rest,
    )
  })

const deleteIgCommentWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "DELETE",
    path: "/v1/ig-comments/{id}",
    summary: "Delete an Instagram comment automation",
    tags: ["IG Comments"],
  })
  .input(z.object({ id: zodBigintAsString() }))
  .output(z.void())
  .errors(possibleErrorsOnDeletingResource)
  .handler(async ({ context, input }) => {
    await deleteIgComment({ workspaceId: context.workspace.id, id: input.id })
  })

export const igCommentsWorkspaceTokenAPIs = {
  listIgCommentsWorkspaceTokenAPI,
  createIgCommentWorkspaceTokenAPI,
  updateIgCommentWorkspaceTokenAPI,
  deleteIgCommentWorkspaceTokenAPI,
}
