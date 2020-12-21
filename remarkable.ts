import { v4 } from "https://deno.land/std@0.81.0/uuid/mod.ts";
import { JSZip } from "https://raw.githubusercontent.com/hayd/deno-zip/0.8.0/mod.ts";

export type DeviceDescriptor =
  | "desktop-windows"
  | "desktop-macos"
  | "mobile-ios"
  | "mobile-android"
  | "browser-chrome"
  | "remarkable";

type ReMarkableStorageItemType = "DocumentType" | "CollectionType";

export interface ReMarkableStorageItem {
  ID: string;
  Version: number;
  Message: string;
  Success: boolean;
  BlobURLGet: string;
  BlobURLGetExpires: string;
  BlobURLPut: string;
  BlobURLPutExpires: string;
  ModifiedClient: string;
  Type: ReMarkableStorageItemType;
  VissibleName: string;
  CurrentPage: number;
  Bookmarked: boolean;
  Parent: string;
}

interface UploadRequestResponse {
  ID: string;
  Version: number;
  Message: string;
  Success: boolean;
  BlobURLPut: string;
  BlobURLPutExpires: string;
}

interface ReMarkableContent {
  extraMetadata: unknown;
  fileType: "pdf" | "epub";
  lastOpenedPage: number;
  lineHeight: number;
  margins: number;
  pageCount: number;
  textScale: number;
  transform: unknown;
}

const DEFAULT_PDF_CONTENT = {
  extraMetadata: {},
  fileType: "pdf",
  lastOpenedPage: 0,
  lineHeight: -1,
  margins: 180,
  pageCount: 0,
  textScale: 1,
  transform: {},
};

const DEFAULT_PDF_METADATA = {
  deleted: false,
  lastModified: new Date().toISOString(),
  ModifiedClient: new Date().toISOString(),
  metadatamodified: false,
  modified: false,
  parent: "",
  pinned: false,
  synced: true,
  type: "DocumentType",
  version: 1,
  VissibleName: "New Document",
};

export class ReMarkableCloudClient {
  private static REGISTER_CLIENT_URL =
    "https://my.remarkable.com/token/json/2/device/new";
  private static REFRESH_BEARER_TOKEN_URL =
    "https://my.remarkable.com/token/json/2/user/new";

  private static API_VERSION = 2;
  private static ENVIRONMENT = "production";
  private static REMARKABLE_GROUP = "auth0|5a68dc51cb30df3877a1d7c4";

  private static LIST_ITEM_INFO_ENDPOINT = "document-storage/json/2/docs";
  private static UPDATE_METADATA_ENDPOINT =
    "document-storage/json/2/upload/update-status";
  private static UPLOAD_REQUEST_ENDPOINT =
    "document-storage/json/2/upload/request";

  headers: { Authorization: string };
  storageAPIHost?: string;
  jszip: JSZip;

  constructor(private bearerToken: string) {
    this.headers = {
      Authorization: `Bearer ${this.bearerToken}`,
    };
    this.jszip = new JSZip();
  }

  /**
   * It seems as though ReMarkable AS shifts their storage API around.
   * https://github.com/splitbrain/ReMarkableAPI/wiki/Service-Discovery#storage
   */
  private async identifyStorageAPIDestination() {
    const url = new URL(
      "https://service-manager-production-dot-remarkable-production.appspot.com/service/json/1/document-storage"
    );
    url.searchParams.set("environment", ReMarkableCloudClient.ENVIRONMENT);
    url.searchParams.set("group", ReMarkableCloudClient.REMARKABLE_GROUP);
    url.searchParams.set(
      "apiVer",
      ReMarkableCloudClient.API_VERSION.toString()
    );
    const { Host: storageAPIHost } = await fetch(url, {
      headers: this.headers,
    }).then((response) => response.json());
    this.storageAPIHost = storageAPIHost;
  }

  /**
   * Retrieves an authorization token from ReMarkable, which is used to make further requests.
   * @param code The One-Time Password generated at https://my.remarkable.com/connect/desktop
   * @param deviceDescriptor A description of the device being used. Recommendation: "desktop-windows" or "desktop-macos".
   * @param deviceId A generated, version 4 UUID. This doesn't ever seem to be needed again.
   */
  static async registerClient(
    code: string,
    deviceDescriptor: DeviceDescriptor,
    deviceId: string
  ) {
    const body = {
      code,
      deviceDesc: deviceDescriptor,
      deviceId,
    };
    const headers = {
      Authorization: "Bearer",
    };

    const response = await fetch(ReMarkableCloudClient.REGISTER_CLIENT_URL, {
      body: JSON.stringify(body),
      headers,
      method: "POST",
    });
    if (response.status === 400) {
      console.error("Got an error from ReMarkable:", await response.text());
      return;
    }
    return (await response.text()).trim();
  }

  /**
   * Refreshes an existing bearer token, swapping it out for a new one.
   * @param bearerToken The "old" authorization token, which will become invalid after being refreshed.
   */
  static async refreshToken(bearerToken: string): Promise<string> {
    const headers = {
      Authorization: `Bearer ${bearerToken}`,
    };
    const response = await fetch(
      ReMarkableCloudClient.REFRESH_BEARER_TOKEN_URL,
      { headers, method: "POST" }
    );
    return (await response.text()).trim();
  }

  /**
   * Retrieves a flat, unordered list of documents and folders in the ReMarkable cloud.
   * @param doc The UUID of a specific document to retrieve. If provided, the resulting array will only have info for that specific document.
   * @param withBlob A boolean flag that indicates whether download links should be included for each response item.
   */
  async listItems(
    doc: string | undefined = undefined,
    withBlob = false
  ): Promise<ReMarkableStorageItem[]> {
    if (!this.storageAPIHost) {
      await this.identifyStorageAPIDestination();
    }
    const address = `https://${this.storageAPIHost!}/${
      ReMarkableCloudClient.LIST_ITEM_INFO_ENDPOINT
    }`;
    const url = new URL(address);
    url.searchParams.set("withBlob", withBlob.toString());
    if (doc) {
      url.searchParams.set("doc", doc);
    }
    return fetch(url, { headers: this.headers }).then((response) =>
      response.json()
    );
  }

  private async createUploadRequest(
    uploadRequestPayload: Partial<ReMarkableStorageItem>[]
  ): Promise<UploadRequestResponse[]> {
    if (!this.storageAPIHost) {
      await this.identifyStorageAPIDestination();
    }
    const address = `https://${this.storageAPIHost}/${ReMarkableCloudClient.UPLOAD_REQUEST_ENDPOINT}`;
    const url = new URL(address);
    return fetch(url, {
      headers: this.headers,
      body: JSON.stringify(uploadRequestPayload),
      method: "PUT",
    }).then((response) => response.json());
  }

  private async uploadMetadata(documentInfo: Partial<ReMarkableStorageItem>[]) {
    const address = `https://${this.storageAPIHost}/${ReMarkableCloudClient.UPDATE_METADATA_ENDPOINT}`;
    return fetch(address, {body: JSON.stringify(documentInfo), headers: this.headers, method: 'PUT'});
  }

  async upload(
    documentInfo: Partial<ReMarkableStorageItem>[],
    zipContents: Uint8Array[]
  ) {
    const uploadRequestResponse = await this.createUploadRequest(documentInfo);
    const zipIterator: [
      Partial<ReMarkableStorageItem>,
      Uint8Array,
      UploadRequestResponse
    ][] = documentInfo.map((doc, i) => [
      doc,
      zipContents[i],
      uploadRequestResponse[i],
    ]);
    const promises = zipIterator.map(([doc, zipfile, requestResponse]) => {
      const { BlobURLPut } = requestResponse;
      return fetch(BlobURLPut, {
        body: zipfile,
        headers: { ...this.headers, "Content-Type": "" },
        method: "PUT",
      }).then((response) => {
        console.log(`Uploaded ${doc.VissibleName} zip to ReMarkable`);
        return this.uploadMetadata([doc]);
      });
    });
    await Promise.all(promises);
  }

  async uploadPDF(name: string, file: Uint8Array) {
    const uuid = v4.generate();
    this.jszip.addFile(`${uuid}.content`, JSON.stringify(DEFAULT_PDF_CONTENT));
    this.jszip.addFile(`${uuid}.pagedata`, JSON.stringify([]));
    this.jszip.addFile(`${uuid}.pdf`, file);
    const zipContent = await this.jszip.generateAsync({ type: "uint8array" });
    await this.upload(
      [{ ID: uuid, Type: "DocumentType", Version: 1, VissibleName: name }],
      [zipContent]
    );
  }
  public async createDirectory() {}

}
