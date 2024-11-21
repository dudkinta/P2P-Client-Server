import { Uint8ArrayList } from "uint8arraylist";
import { Stream } from "@libp2p/interface";

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

// Функция для записи данных в поток
export async function writeToStream(
  stream: Stream,
  message: string
): Promise<void> {
  const encoder = new TextEncoder();

  // Encode the message
  let messageUint8Array: Uint8Array;
  try {
    messageUint8Array = encoder.encode(message);
  } catch (error) {
    throw new Error("Write helper. Failed to encode the message.");
  }

  // Async generator for sending data
  async function* messageGenerator(): AsyncGenerator<Uint8ArrayList> {
    yield new Uint8ArrayList(messageUint8Array);
  }

  // Send data
  try {
    await stream.sink(messageGenerator());
  } catch (error) {
    throw new Error("Write helper. Error while writing to the stream.");
  }
}

// Функция для чтения данных из потока
export async function readFromStream(stream: Stream): Promise<string> {
  const decoder = new TextDecoder();
  const receivedDataList = new Uint8ArrayList();

  try {
    for await (const chunk of stream.source) {
      console.log("Received chunk:", chunk);
      receivedDataList.append(chunk);
    }
  } catch (error) {
    console.error("Error while iterating over stream.source:", error);
    throw new Error("Read helper. Error while reading from the stream.");
  }

  if (receivedDataList.length === 0) {
    throw new Error("Read helper. No data received from the stream.");
  }

  try {
    const receivedData: Uint8Array = receivedDataList.subarray();
    return decoder.decode(receivedData);
  } catch (error) {
    console.error("Error while decoding received data:", error);
    throw new Error("Read helper. Failed to decode the received data.");
  }
}
