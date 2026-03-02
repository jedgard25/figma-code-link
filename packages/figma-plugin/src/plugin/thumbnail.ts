const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

declare const figma: any;

function toBase64(bytes: Uint8Array): string {
  let result = "";
  let index = 0;

  while (index + 2 < bytes.length) {
    const triple =
      (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];
    result += BASE64_ALPHABET[(triple >> 18) & 63];
    result += BASE64_ALPHABET[(triple >> 12) & 63];
    result += BASE64_ALPHABET[(triple >> 6) & 63];
    result += BASE64_ALPHABET[triple & 63];
    index += 3;
  }

  const remaining = bytes.length - index;
  if (remaining === 1) {
    const single = bytes[index];
    result += BASE64_ALPHABET[(single >> 2) & 63];
    result += BASE64_ALPHABET[(single & 3) << 4];
    result += "==";
  } else if (remaining === 2) {
    const pair = (bytes[index] << 8) | bytes[index + 1];
    result += BASE64_ALPHABET[(pair >> 10) & 63];
    result += BASE64_ALPHABET[(pair >> 4) & 63];
    result += BASE64_ALPHABET[(pair & 15) << 2];
    result += "=";
  }

  return result;
}

export async function exportNodeThumbnail(nodeId: string): Promise<string> {
  const node = figma.getNodeById(nodeId);
  if (!node || !("exportAsync" in node)) {
    throw new Error("Node not found or not exportable");
  }

  const bytes = await node.exportAsync({
    format: "PNG",
    constraint: { type: "WIDTH", value: 200 },
  });

  return toBase64(bytes);
}
