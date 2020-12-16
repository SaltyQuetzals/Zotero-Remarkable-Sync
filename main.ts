import { Zotero } from "./zotero.ts";

const libraryId = Deno.args[0];
const libraryType = Deno.args[1];
if (libraryType !== "groups" && libraryType !== "user") {
  throw new Error("Didn't get a proper library type.");
}
const apiKey = Deno.args[2];
const zotero = new Zotero(Deno.args[0], libraryType, apiKey);
zotero.listCollections().then((response) => {
  console.log(response);
});
