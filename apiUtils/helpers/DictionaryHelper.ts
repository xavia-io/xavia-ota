import { Dictionary } from 'structured-headers';

export class DictionaryHelper {
  static convertToDictionaryItemsRepresentation(obj: { [key: string]: string }): Dictionary {
    return new Map(
      Object.entries(obj).map(([k, v]) => {
        return [k, [v, new Map()]];
      })
    );
  }
}
