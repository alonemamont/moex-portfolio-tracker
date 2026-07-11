export type IssRow = Record<string, string>;

export function parseIssDataBlock(xmlText: string, dataId: string): IssRow[] {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error(`ISS XML parse error: ${parserError.textContent}`);
  }

  const dataBlock = doc.querySelector(`data[id="${dataId}"]`);
  if (!dataBlock) {
    throw new Error(`ISS XML: data block "${dataId}" not found`);
  }

  const rowElements = Array.from(dataBlock.querySelectorAll("rows > row"));
  return rowElements.map((row) => {
    const record: IssRow = {};
    for (const attr of Array.from(row.attributes)) {
      record[attr.name] = attr.value;
    }
    return record;
  });
}
