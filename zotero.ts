interface ZoteroRequestQueryParams {
  format: "json" | "atom" | "bib";
  content: string;
  limit?: number;
}

export interface Collection {
  key: string;
  version: number;
  library: {
    type: "group";
    id: number;
    name: string;
    links: { alternate: unknown };
  };
  links: {
    self: {
      href: string;
      type: string;
    };
    alternate: {
      href: string;
      type: string;
    };
  };
  meta: { numCollections: number; numItems: number };

  data: {
    key: string;
    version: number;
    name: string;
    parentCollection: false | string;
    relations: unknown;
  };
}

export const isCollection = (x: any): x is Collection => x.key;

export interface Item {
  key: string;
  version: 1;
  library: {
    type: string;
    id: number;
    name: string;
    links: {
      alternate: {
        href: string;
        type: string;
      };
    };
  };
  links: {
    self: {
      href: string;
      type: string;
    };
    alternate: {
      href: string;
      type: string;
    };
  };
  meta: {
    numChildren: number;
  };
  data: {
    key: string;
    version: number;
    itemType: string;
    title: string;
    creators: [];
    abstractNote: string;
    websiteTitle: string;
    websiteType: string;
    date: string;
    shortTitle: string;
    url: string;
    accessDate: string;
    language: string;
    rights: string;
    extra: string;
    dateAdded: string;
    dateModified: string;
    tags: [];
    collections: [string];
    relations: {};
  };
}

export class Zotero {
  private static ENDPOINT = "https://api.zotero.org";
  constructor(
    private libraryId: string,
    private libraryType: "groups" | "user",
    private apiKey: string
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
    return new URLSearchParams(
      providedParams as Record<string, string>
    ).toString();
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
    const route = `/${this.libraryType}/${
      this.libraryId
    }/items/${item.toLocaleUpperCase()}/file`;
    return (await this.makeRequest(route)).json();
  }

  public async listCollections(): Promise<Collection[]> {
    const route = `/${this.libraryType}/${this.libraryId}/collections`;
    return (await this.makeRequest(route)).json();
  }

  public async getItemsForCollection(collectionKey: string): Promise<Item[]> {
    const route = `/${this.libraryType}/${this.libraryId}/collections/${collectionKey}/items`;
    const response = await this.makeRequest(route);
    console.log(response);
    return await response.json();
  }

  public async getFileUint8Array(itemKey: string): Promise<Uint8Array> {
    const route = `/${this.libraryType}/${this.libraryId}/items/${itemKey}/file`;
    const response = await this.makeRequest(route);
    if (!response.body) {
      throw new Error("Error downloading file.");
    }
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    return new Deno.Buffer(buffer).bytes();
  }

}
