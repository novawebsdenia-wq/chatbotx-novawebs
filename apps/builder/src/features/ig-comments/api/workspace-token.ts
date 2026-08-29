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
import { listIgCommentsForWorkspace } from "../queries"
import {
  listInstagramFacebookMedia,
  listInstagramLoginMedia,
} from "../queries/instagram-media"
import {
  createIgCommentRequest,
  igCommentVariants,
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
      await listIgCommentsForWorkspace({
        ...input,
        workspaceId: context.workspace.id,
      }),
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

/**
 * Las publicaciones de Instagram, para elegir el disparador de una campana.
 *
 * `authenticated.ts` ya las expone, pero pidiendo el `workspaceId` por la ruta
 * y con `workspaceAuthorizedMidddleware`, que un token de espacio no satisface.
 * El token ya identifica el espacio, asi que aqui sale de `context`.
 *
 * El token de la Graph API se queda en ChatbotX: quien llama solo recibe la
 * lista, no la credencial.
 */
const listInstagramMediaWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/ig-comments/instagram-media",
    summary: "List Instagram media for comment automations",
    tags: ["IG Comments"],
  })
  .input(z.object({ variant: igCommentVariants.default("instagram") }))
  .output(
    z.object({
      posts: z.array(
        z.object({
          id: z.string(),
          message: z.string().optional(),
          full_picture: z.string().optional(),
          created_time: z.string(),
          permalink_url: z.string().optional(),
          media_product_type: z.string().optional(),
          accountId: z.string(),
        }),
      ),
      pages: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  )
  .errors(possibleErrorsOnFindingResource)
  .handler(async ({ context, input }) =>
    input.variant === "instagram"
      ? await listInstagramLoginMedia(context.workspace.id)
      : await listInstagramFacebookMedia(context.workspace.id),
  )

export const igCommentsWorkspaceTokenAPIs = {
  listIgCommentsWorkspaceTokenAPI,
  createIgCommentWorkspaceTokenAPI,
  updateIgCommentWorkspaceTokenAPI,
  deleteIgCommentWorkspaceTokenAPI,
  listInstagramMediaWorkspaceTokenAPI,
}
