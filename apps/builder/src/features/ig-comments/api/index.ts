import { igCommentsPrivateAPI } from "./authenticated"
import { igCommentsWorkspaceTokenAPIs } from "./workspace-token"

export const igCommentsAPI = {
  ...igCommentsPrivateAPI,
  ...igCommentsWorkspaceTokenAPIs,
}
