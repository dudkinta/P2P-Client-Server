import { Uint8ArrayList } from "uint8arraylist";
import type { Stream, AbortOptions } from "@libp2p/interface";

const DEFAULT_TIMEOUT = 5000;

async function readChunckFromStream(
  stream: Stream,
  chunkProcessor: (chunk: Uint8Array) => void,
  options: AbortOptions = {}
): Promise<void> {
  if (options.signal == null) {
    const signal = AbortSignal.timeout(DEFAULT_TIMEOUT);
    options.signal = signal;
  }

  const reader = stream.source[Symbol.asyncIterator]();

  try {
    while (true) {
      const { value, done } = await reader.next();
      if (done) {
        break;
      }
      if (value instanceof Uint8ArrayList) {
        chunkProcessor(value.subarray());
      } else {
        chunkProcessor(value);
      }
    }
  } catch (error) {
    throw new Error(`Error while reading from stream: ${error}`);
  }
}

export async function writeToStream(
  stream: Stream,
  data: Uint8Array,
  options: AbortOptions = {}
): Promise<void> {
  if (options.signal == null) {
    const signal = AbortSignal.timeout(DEFAULT_TIMEOUT);
    options.signal = signal;
  }
  const chunkSize: number = 1024;
  try {
    const writer = stream.sink;

    await writer(
      (async function* () {
        for (let i = 0; i < data.length; i += chunkSize) {
          yield data.slice(i, i + chunkSize);
        }
      })()
    );
  } catch (error) {
    throw new Error(`Error while writing to stream: ${error}`);
  }
}

export async function readFromStream(
  stream: Stream,
  options: AbortOptions = {}
): Promise<string> {
  let completeString = "";
  const decoder = new TextDecoder("utf-8");

  await readChunckFromStream(
    stream,
    (chunk) => {
      completeString += decoder.decode(chunk, { stream: true });
    },
    options
  );

  return completeString;
}
