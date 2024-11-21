import { Uint8ArrayList } from "uint8arraylist";
import type { Stream, AbortOptions } from "@libp2p/interface";

export async function sendAndReceive(
  stream: Stream,
  message: string
): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // Encode the message
  let messageUint8Array: Uint8Array;
  try {
    messageUint8Array = encoder.encode(message);
  } catch (error) {
    throw new Error("S&R helper. Failed to encode the message.");
  }

  // Async generator for sending data
  async function* messageGenerator(): AsyncGenerator<Uint8ArrayList> {
    yield new Uint8ArrayList(messageUint8Array);
  }

  // Send data
  const writePromise = stream.sink(messageGenerator());

  // Accumulate received data
  const receivedDataList = new Uint8ArrayList();
  try {
    for await (const chunk of stream.source) {
      receivedDataList.append(chunk);
    }
  } catch (error) {
    throw new Error("S&R helper. Error while reading from the stream.");
  }

  // Await write completion
  try {
    await writePromise;
  } catch (error) {
    throw new Error("S&R helper. Error while writing to the stream.");
  }

  // Decode received data
  let receivedMessage: string;
  try {
    const receivedData: Uint8Array = receivedDataList.subarray();
    receivedMessage = decoder.decode(receivedData);
  } catch (error) {
    throw new Error("S&R helper. Failed to decode the received data.");
  }

  return receivedMessage;
}

const DEFAULT_TIMEOUT = 5000;

export async function readFromStream(
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
        break; // Поток завершён
      }

      if (value instanceof Uint8ArrayList) {
        // Преобразуем Uint8ArrayList в обычный Uint8Array
        chunkProcessor(value.subarray());
      } else {
        chunkProcessor(value); // Если это уже Uint8Array
      }
    }
  } catch (error) {
    throw new Error(`Error while reading from stream: ${error}`);
  }
}

export async function writeToStream(
  stream: Stream,
  data: Uint8Array,
  chunkSize: number = 1024,
  options: AbortOptions = {}
): Promise<void> {
  if (options.signal == null) {
    const signal = AbortSignal.timeout(DEFAULT_TIMEOUT);
    options.signal = signal;
  }

  try {
    const writer = stream.sink;

    await writer(
      (async function* () {
        for (let i = 0; i < data.length; i += chunkSize) {
          // Разбиваем данные на части и записываем по частям
          yield data.slice(i, i + chunkSize);
        }
      })()
    );
  } catch (error) {
    throw new Error(`Error while writing to stream: ${error}`);
  }
}

export async function readCompleteStringFromStream(
  stream: Stream,
  options: AbortOptions = {}
): Promise<string> {
  let completeString = "";
  const decoder = new TextDecoder("utf-8"); // Создаём декодер для преобразования байтов в строку

  await readFromStream(
    stream,
    (chunk) => {
      completeString += decoder.decode(chunk, { stream: true }); // Добавляем преобразованный кусок
    },
    options
  );

  return completeString; // Возвращаем собранную строку
}
