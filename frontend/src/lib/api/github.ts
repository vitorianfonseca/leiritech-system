/**
 * GitHub issue integration API client — WIRED to the real backend
 * (`/github/*`). Every issue filed from the app is recorded as a link back
 * to whatever it was filed about (a Project, or an internal audit finding),
 * so the UI can show labels/assignees/state instead of the app being a
 * one-way, fire-and-forget button to GitHub.
 */

import { http, HttpError } from "./http";

export interface GithubLabel {
  name: string;
  color: string;
  description: string | null;
}

export interface GithubAssignee {
  login: string;
  avatarUrl: string | null;
}

export interface GithubIssueLink {
  id: string;
  entityType: string;
  entityId: string;
  repo: string;
  issueNumber: number;
  issueUrl: string;
  title: string;
  state: "open" | "closed";
  labels: GithubLabel[];
  assignees: GithubAssignee[];
  createdAt: string;
}

export interface GithubComment {
  id: number;
  author: string;
  authorAvatarUrl: string | null;
  body: string;
  createdAt: string;
  url: string;
}

export interface CreateGithubIssueInput {
  entityType: string;
  entityId: string;
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  /** Overrides the backend's GITHUB_DEFAULT_REPO for this one issue. */
  repo?: string;
}

export interface UpdateGithubIssueInput {
  state?: "open" | "closed";
  /** Replaces the current label/assignee set (matches GitHub's own PATCH
   * semantics) — pass the full desired set, not a delta. */
  labels?: string[];
  assignees?: string[];
}

export interface ListIssuesFilter {
  state?: "open" | "closed" | "all";
  label?: string;
}

export class GithubIntegrationError extends Error {
  constructor(
    public readonly kind: "not_configured" | "repo_required" | "forbidden" | "api_error" | "network",
    message: string
  ) {
    super(message);
    this.name = "GithubIntegrationError";
  }
}

function mapError(err: unknown): never {
  if (err instanceof HttpError) {
    if (err.code === "GITHUB_NOT_CONFIGURED") {
      throw new GithubIntegrationError(
        "not_configured",
        "A integração com o GitHub não está configurada neste ambiente."
      );
    }
    if (err.code === "GITHUB_REPO_REQUIRED") {
      throw new GithubIntegrationError(
        "repo_required",
        "Indique um repositório — não há nenhum configurado por omissão."
      );
    }
    if (err.status === 403) {
      throw new GithubIntegrationError("forbidden", "Não tem permissão para esta ação.");
    }
    if (err.code === "GITHUB_API_ERROR") {
      throw new GithubIntegrationError("api_error", err.message ?? "O GitHub recusou o pedido.");
    }
  }
  throw new GithubIntegrationError("network", "Não foi possível ligar ao servidor.");
}

export const githubApi = {
  /** List issues already filed for one entity (a project, an audit finding, …). */
  async listIssues(
    entityType: string,
    entityId: string,
    filter?: ListIssuesFilter
  ): Promise<GithubIssueLink[]> {
    try {
      return await http.get<GithubIssueLink[]>("/github/issues", {
        query: {
          entity_type: entityType,
          entity_id: entityId,
          state: filter?.state,
          label: filter?.label,
        },
      });
    } catch (err) {
      mapError(err);
    }
  },

  /** File a new GitHub issue and link it to `entityType`/`entityId`. */
  async createIssue(input: CreateGithubIssueInput): Promise<GithubIssueLink> {
    try {
      return await http.post<GithubIssueLink>("/github/issues", {
        entityType: input.entityType,
        entityId: input.entityId,
        title: input.title,
        body: input.body ?? "",
        labels: input.labels ?? [],
        assignees: input.assignees ?? [],
        repo: input.repo,
      });
    } catch (err) {
      mapError(err);
    }
  },

  /** Close/reopen and/or replace the labels/assignees set. */
  async updateIssue(linkId: string, input: UpdateGithubIssueInput): Promise<GithubIssueLink> {
    try {
      return await http.patch<GithubIssueLink>(`/github/issues/${linkId}`, input);
    } catch (err) {
      mapError(err);
    }
  },

  /** Re-fetch the issue's open/closed state from GitHub on demand. */
  async refreshIssue(linkId: string): Promise<GithubIssueLink> {
    try {
      return await http.post<GithubIssueLink>(`/github/issues/${linkId}/refresh`);
    } catch (err) {
      mapError(err);
    }
  },

  /** Every label defined on the repo, for the create/edit label picker. */
  async listLabels(repo?: string): Promise<GithubLabel[]> {
    try {
      return await http.get<GithubLabel[]>("/github/labels", { query: { repo } });
    } catch (err) {
      mapError(err);
    }
  },

  /** Accounts that may be assigned an issue on the repo. */
  async listCollaborators(repo?: string): Promise<GithubAssignee[]> {
    try {
      return await http.get<GithubAssignee[]>("/github/collaborators", { query: { repo } });
    } catch (err) {
      mapError(err);
    }
  },

  async listComments(linkId: string): Promise<GithubComment[]> {
    try {
      return await http.get<GithubComment[]>(`/github/issues/${linkId}/comments`);
    } catch (err) {
      mapError(err);
    }
  },

  async addComment(linkId: string, body: string): Promise<GithubComment> {
    try {
      return await http.post<GithubComment>(`/github/issues/${linkId}/comments`, { body });
    } catch (err) {
      mapError(err);
    }
  },
};
