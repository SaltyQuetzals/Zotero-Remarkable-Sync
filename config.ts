import * as path from "https://deno.land/std/path/mod.ts";

export const getReMarkableConfigLocation = () => {
  const home = Deno.env.get("HOME");
  if (!home) {
    throw new Error("The $HOME environment variable must be set.");
  }
  return path.join(home, ".remarkable_deno", "config.json");
};

export const readReMarkableBearerToken = async (): Promise<string> => {
  const expectedReMarkableConfigLocation = getReMarkableConfigLocation();
  const configJSON = await Deno.readTextFile(expectedReMarkableConfigLocation);
  const { bearerToken } = JSON.parse(configJSON);
  return bearerToken;
};

export const writeReMarkableBearerToken = async (bearerToken: string) => {
  const reMarkableConfigLocation = getReMarkableConfigLocation();
  await Deno.writeTextFile(
    reMarkableConfigLocation,
    JSON.stringify({ bearerToken }, null, 3)
  );
};
