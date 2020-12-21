import {
  Collection as ZoteroCollection,
  Zotero,
  Item as ZoteroItem,
} from "./zotero.ts";
import { ensureDir, ensureFile, exists } from "https://deno.land/std/fs/mod.ts";
import * as path from "https://deno.land/std/path/mod.ts";
import { ReMarkableCloudClient, ReMarkableStorageItem } from "./remarkable.ts";
import { v4 } from "https://deno.land/std@0.81.0/uuid/mod.ts";

import {
  getReMarkableConfigLocation,
  writeReMarkableBearerToken,
  readReMarkableBearerToken,
} from "./config.ts";

interface IntermediateZoteroCollection extends ZoteroCollection {
  children?: IntermediateZoteroCollection[];
}

const buildTree = async (
  collections: Array<Partial<ZoteroCollection>>,
  root: IntermediateZoteroCollection
) => {
  const nodes: { [key: string]: IntermediateZoteroCollection } = {};
  for (const collection of collections) {
    if (!collection.key) {
      throw new Error(
        `A collection provided to "buildTree" is missing a key. Got`
      );
    }
    const key = collection.key;
    nodes[key] = collection as IntermediateZoteroCollection;
  }

  for (const collection of collections) {
    const key = collection.key!;
    if (!collection.data) {
      throw new Error(
        `A collection provided to "buildTree" is missing its "data" attribute.`
      );
    }
    const parentKey = collection.data.parentCollection;
    const node = nodes[key];

    if (parentKey === false) {
      if (!root.children) {
        root.children = [];
      }
      root.children.push(node as IntermediateZoteroCollection);
      continue;
    }
    const parent = nodes[parentKey];
    if (!parent.children) {
      parent.children = [];
    }
    parent.children.push(node as IntermediateZoteroCollection);
  }
  return root;
};

const processNode = async (
  remarkableCloudClient: ReMarkableCloudClient,
  zotero: Zotero,
  subtree: IntermediateZoteroCollection,
  reMarkableDirPath: string,
  levels = 0
): Promise<unknown> => {
  let collectionItems: ZoteroItem[] | null = null;
  if (subtree.key !== "default") {
    collectionItems = await zotero.getItemsForCollection(subtree.key);
  }
  if (!subtree.children) {
    if (!collectionItems) {
      return;
    }
    return Promise.all(
      collectionItems
        .slice(0, 1)
        .map((item) =>
          zotero
            .getFileUint8Array(item.key)
            .then((uint8arr) =>
              remarkableCloudClient.uploadPDF(item.data.title, uint8arr)
            )
        )
    );
  } else {
    return subtree.children
      .slice(0, 1)
      .map((child) =>
        processNode(
          remarkableCloudClient,
          zotero,
          child,
          path.join(reMarkableDirPath, child.data.name),
          levels + 1
        )
      );
  }
};

const main = async () => {
  const [libraryName, libraryId, libraryType, apiKey] = Deno.args;
  if (libraryType !== "groups" && libraryType !== "user") {
    throw new Error("Didn't get a proper library type.");
  }
  const zotero = new Zotero(libraryId, libraryType, apiKey);
  const collections: Partial<ZoteroCollection>[] = await zotero.listCollections();
  const rootCollection: IntermediateZoteroCollection = {
    data: { parentCollection: false, name: libraryName },
    key: "default",
  } as IntermediateZoteroCollection;
  const collectionTree = await buildTree(collections, rootCollection);

  let bearerToken: string;
  const reMarkableConfigLocation = getReMarkableConfigLocation();
  if (!(await exists(reMarkableConfigLocation))) {
    console.log(
      "It seems as though you haven't registered this app with ReMarkable yet."
    );
    console.log(
      "Please go to https://my.remarkable.com/connect/desktop and enter the one-time password you get here."
    );
    console.log("Code: ");
    const buf = new Uint8Array(1024);
    const n = <number>await Deno.stdin.read(buf);
    const oneTimePassword = new TextDecoder().decode(buf.subarray(0, n)).trim();
    bearerToken = (await ReMarkableCloudClient.registerClient(
      oneTimePassword,
      "desktop-windows",
      v4.generate()
    ))!;
    await ensureFile(reMarkableConfigLocation);
    await writeReMarkableBearerToken(bearerToken!);
  } else {
    const oldBearerToken = await readReMarkableBearerToken();
    bearerToken = (await ReMarkableCloudClient.refreshToken(oldBearerToken))!;
  }

  const remarkableCloudClient = new ReMarkableCloudClient(bearerToken);
  await processNode(remarkableCloudClient, zotero, collectionTree, "Zotero");
};

main();
