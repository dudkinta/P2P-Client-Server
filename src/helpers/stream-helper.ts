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

const DEFAULT_TIMEOUT = 10000;

/**
 * Чтение данных из потока
 * @param stream Поток libp2p
 * @param length Количество байт для чтения
 * @param options Настройки AbortOptions
 * @returns Uint8Array с прочитанными данными
 */
/**
 * Чтение всех данных из потока
 * @param stream Поток libp2p
 * @param maxLength Максимальная длина данных (по умолчанию без ограничения)
 * @param options Настройки AbortOptions
 * @returns Uint8Array с прочитанными данными
 */
export async function readFromStream(
  stream: Stream,
  maxLength: number = Infinity,
  options: AbortOptions = {}
): Promise<Uint8Array> {
  const receivedDataList = new Uint8ArrayList();

  if (options.signal == null) {
    const signal = AbortSignal.timeout(DEFAULT_TIMEOUT);
    options.signal = signal;
  }

  const reader = stream.source[Symbol.asyncIterator]();

  try {
    let totalLength = 0;

    while (true) {
      const { value, done } = await reader.next();
      if (done) {
        break; // Поток завершён
      }

      totalLength += value.length;

      if (totalLength > maxLength) {
        throw new Error(
          `Stream data exceeds maximum allowed length of ${maxLength} bytes`
        );
      }

      receivedDataList.append(value);
    }

    return receivedDataList.subarray(); // Возвращаем все собранные данные
  } catch (error) {
    throw new Error(`Error while reading from stream: ${error}`);
  }
}

/**
 * Запись данных в поток
 * @param stream Поток libp2p
 * @param data Данные для записи
 * @param options Настройки AbortOptions
 */
export async function writeToStream(
  stream: Stream,
  data: Uint8Array,
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
        yield data;
      })()
    );
  } catch (error) {
    throw new Error(`Error while writing to stream: ${error}`);
  }
}
