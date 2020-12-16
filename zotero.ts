interface ZoteroRequestQueryParams{
  format: "json" | "atom" | "bib";
  content: string;
  limit?: number;
}

export class Zotero {
  private static ENDPOINT = "https://api.zotero.org";
  constructor(
    private libraryId: string,
    private libraryType: "groups" | "user",
    private apiKey: string,
    private preserveJsonOrder: boolean = false
  ) {}

  private buildEncodedQueryParameters(
    providedParams: Partial<ZoteroRequestQueryParams> | undefined
  ): string {
    if (!providedParams) {
      providedParams = {};
    }
    if (!providedParams.format) {
      providedParams.format = "json";
    }
    if (providedParams.content) {
      providedParams.format = "atom";
    }

    if (!providedParams.limit || providedParams.limit === 0) {
      providedParams.limit = 100;
    } else if (providedParams.limit === -1 || !providedParams.limit) {
      providedParams.limit = undefined;
    }

    if (providedParams.format === "bib") {
      providedParams.limit = undefined;
    }
    return new URLSearchParams(providedParams as Record<string, string>).toString();
  }

  private getDefaultHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private makeRequest(
    route: string,
    params: Partial<ZoteroRequestQueryParams> | undefined = undefined
  ) {
    const encodedQueryParams = this.buildEncodedQueryParameters(params);
    const fullUrl = `${Zotero.ENDPOINT}${route}?${encodedQueryParams}`;
    return fetch(fullUrl, { headers: this.getDefaultHeaders() });
  }

  public async getFile(item: string) {
    const route = `/${this.libraryId}/${
      this.libraryType
    }/items/${item.toLocaleUpperCase()}/file`;
    return (await this.makeRequest(route)).json();
  }

  public async listCollections() {
    const route = `/${this.libraryType}/${this.libraryId}/collections`;
    return (await this.makeRequest(route)).json();
  }
}
