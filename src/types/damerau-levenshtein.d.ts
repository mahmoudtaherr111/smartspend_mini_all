declare module "damerau-levenshtein" {
  interface DamerauLevenshteinResult {
    steps: number;
    relative: number;
    similarity: number;
  }

  function damerauLevenshtein(
    source: string,
    target: string,
    limit?: number,
  ): DamerauLevenshteinResult;

  export = damerauLevenshtein;
}
