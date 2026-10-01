export async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

export function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

export function removeIllegalPath(path: string): string {
  return path?.replaceAll(/[\/:*?"<>|]/ig, "_");
}

export function removeNonVisibleChars(input: string): string {
  return input;
}
