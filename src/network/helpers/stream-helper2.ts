import { Uint8ArrayList } from "uint8arraylist";
import type { Stream, AbortOptions } from "@libp2p/interface";
import { pbStream } from "it-protobuf-stream";

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

export async function writeToStream<T>(
  stream: Stream,
  data: T,
  options: AbortOptions = {}
): Promise<void> {
  if (options.signal == null) {
    const signal = AbortSignal.timeout(DEFAULT_TIMEOUT);
    options.signal = signal;
  }
  try {
    const pbstr = pbStream(stream);
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
