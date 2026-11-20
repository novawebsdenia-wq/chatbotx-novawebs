import { boolean, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const inboxModel = pgTable(
  "Inbox",
  {
    ...sharedColumns,
    name: text().notNull(),
    channel: text().notNull(),
    sourceId: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    status: text().notNull().default("connected"),
    // Whether the workspace's default AI agent may answer DMs in this inbox.
    // Off by default: the inbox then behaves as if no agent existed.
    aiAgentEnabled: boolean().notNull().default(false),
  },
  (table) => [
    index("Inbox_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("Inbox_workspaceId_channel_sourceId_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.channel.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
  ],
)
