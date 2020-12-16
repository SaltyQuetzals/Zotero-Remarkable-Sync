import { Zotero, Collection } from "./zotero.ts";
import { ensureDir } from "https://deno.land/std/fs/mod.ts";

interface IntermediateCollection extends Collection {
  children?: Array<IntermediateCollection>;
}

const buildTree = (
  collections: Array<Partial<Collection>>,
  root: IntermediateCollection
) => {
  const nodes: { [key: string]: IntermediateCollection } = {};
  for (const collection of collections) {
    if (!collection.key) {
      throw new Error(
        `A collection provided to "buildTree" is missing a key. Got`
      );
    }
    const key = collection.key;
    nodes[key] = collection as IntermediateCollection;
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
      root.children.push(node as IntermediateCollection);
      continue;
    }
    const parent = nodes[parentKey];
    if (!parent.children) {
      parent.children = [];
    }
    parent.children.push(node as IntermediateCollection);
  }
  return root;
};

const processNode = async (
  zotero: Zotero,
  subtree: IntermediateCollection,
  dirpath: string,
  tmpDownloadDir: string
) => {};

const main = async () => {
  const [libraryName, libraryId, libraryType, apiKey] = Deno.args;
  if (libraryType !== "groups" && libraryType !== "user") {
    throw new Error("Didn't get a proper library type.");
  }
  const zotero = new Zotero(libraryId, libraryType, apiKey);
  const collections: Partial<Collection>[] = await zotero.listCollections();
  const rootCollection: IntermediateCollection = {
    data: { parentCollection: false, name: libraryName },
    key: "default",
  } as IntermediateCollection;
  const collectionTree = buildTree(collections, rootCollection);
  await processNode(zotero, collectionTree, "", "");
};

main();
