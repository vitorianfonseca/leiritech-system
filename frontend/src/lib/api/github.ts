/**
 * GitHub issue integration API client — WIRED to the real backend
 * (`/github/issues`). Every issue filed from the app is recorded as a link
 * back to whatever it was filed about (a Project, or an internal audit
 * finding), so the UI can show "already filed" state instead of the app
 * being a one-way, fire-and-forget button to GitHub.
 */

import { http, HttpError } from "./http";

export interface GithubIssueLink {
  id: string;
  entityType: string;
  entityId: string;
  repo: string;
  issueNumber: number;
  issueUrl: string;
  title: string;
  state: "open" | "closed";
  createdAt: string;
}

export interface CreateGithubIssueInput {
  entityType: string;
  entityId: string;
  title: string;
  body?: string;
  labels?: string[];
  /** Overrides the backend's GITHUB_DEFAULT_REPO for this one issue. */
  repo?: string;
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
      throw new GithubIntegrationError("forbidden", "Não tem permissão para criar issues.");
    }
    if (err.code === "GITHUB_API_ERROR") {
      throw new GithubIntegrationError("api_error", err.message ?? "O GitHub recusou o pedido.");
    }
  }
  throw new GithubIntegrationError("network", "Não foi possível ligar ao servidor.");
}

export const githubApi = {
  /** List issues already filed for one entity (a project, an audit finding, …). */
  async listIssues(entityType: string, entityId: string): Promise<GithubIssueLink[]> {
    try {
      return await http.get<GithubIssueLink[]>("/github/issues", {
        query: { entity_type: entityType, entity_id: entityId },
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
        repo: input.repo,
      });
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
};
