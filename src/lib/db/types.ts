/**
 * Hand-written subset of the database schema, enough to type the tables the
 * app touches today. Replace with `npx supabase gen types typescript` output
 * once the project is linked; the shape is identical.
 */

export type ItemKind = "task" | "followup" | "note";
export type ItemStatus = "open" | "waiting" | "done" | "archived";
export type ItemPriority = "low" | "normal" | "high";
export type InboxStatus =
  | "pending"
  | "processing"
  | "processed"
  | "needs_review"
  | "failed";
export type CaptureSource = "web" | "api" | "voice";
export type PersonRole = "waiting_on" | "mentioned" | "owner";

export type InboxItemRow = {
  id: string;
  user_id: string;
  raw_text: string;
  source: CaptureSource;
  status: InboxStatus;
  ai_result: unknown | null;
  ai_confidence: number | null;
  ai_model: string | null;
  ai_error: string | null;
  item_id: string | null;
  created_at: string;
  processed_at: string | null;
};

export type ItemRow = {
  id: string;
  user_id: string;
  kind: ItemKind;
  title: string;
  body: string | null;
  source_text: string | null;
  status: ItemStatus;
  priority: ItemPriority | null;
  due_at: string | null;
  workspace_id: string | null;
  project_id: string | null;
  organization_id: string | null;
  category: string | null;
  tags: string[];
  inbox_item_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceRow = {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  color: string | null;
  sort_order: number;
  created_at: string;
};

export type ProjectRow = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
};

export type PersonRow = {
  id: string;
  user_id: string;
  name: string;
  aliases: string[];
  organization_id: string | null;
  notes: string | null;
  created_at: string;
};

export type ItemPersonRow = {
  user_id: string;
  item_id: string;
  person_id: string;
  role: PersonRole;
};

type Table<Row, Insert> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      inbox_items: Table<
        InboxItemRow,
        Partial<Omit<InboxItemRow, "raw_text">> & { raw_text: string }
      >;
      items: Table<
        ItemRow,
        Partial<Omit<ItemRow, "kind" | "title">> & {
          kind: ItemKind;
          title: string;
        }
      >;
      workspaces: Table<
        WorkspaceRow,
        Partial<Omit<WorkspaceRow, "name" | "slug">> & { name: string; slug: string }
      >;
      projects: Table<
        ProjectRow,
        Partial<Omit<ProjectRow, "name">> & { name: string }
      >;
      people: Table<
        PersonRow,
        Partial<Omit<PersonRow, "name">> & { name: string }
      >;
      item_people: Table<
        ItemPersonRow,
        Partial<Omit<ItemPersonRow, "item_id" | "person_id">> & {
          item_id: string;
          person_id: string;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
