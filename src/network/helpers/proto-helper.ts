import { Uint8ArrayList } from "uint8arraylist";
import { OutOfLimitError } from "../models/out-of-limit-error.js";
import {
  Stream,
  AbortOptions,
  Connection,
  TimeoutError,
} from "@libp2p/interface";
import { pbStream } from "it-protobuf-stream";

export async function writeToConnection(
  connection: Connection,
  timeout: number,
  proto_root: protobuf.Root,
  protocol: string,
  typeName: string,
  data: any
): Promise<void> {
  try {
    if (connection == null) {
      throw new Error("connection is null");
    }
    if (connection.status !== "open") {
      throw new Error("connection is not open");
    }

    if (connection.limits) {
      if (connection.limits.seconds && connection.limits.seconds < 10000) {
        throw new OutOfLimitError("connection has time limits");
      }
      if (connection.limits.bytes && connection.limits.bytes < 10000) {
        throw new OutOfLimitError("connection has byte limits");
      }
    }

    const abortController = new AbortController();
    const signal = abortController.signal;

    // Устанавливаем таймаут
    const timeoutId = setTimeout(() => {
      abortController.abort(); // Уведомляем об отмене
    }, timeout);

    //signal.addEventListener("abort", () => {
    //  throw new Error("Timeout reached, aborting stream");
    //});

    const stream = await connection.newStream([protocol]);
    if (proto_root == null) {
      throw new Error("Proto root is not loaded");
    }

    const root = proto_root;
    const protoType = root.lookupType(typeName);
    const pbstr = pbStream(stream);

    const protobufMessage = data.toProtobuf(root);
    console.log(protobufMessage);
    // Отправляем сообщение
    await pbstr.write(protobufMessage, {
      encode: (data: any) => {
        const errMsg = protoType.verify(data);
        if (errMsg) throw new Error(`Invalid message: ${errMsg}`);
        return protoType.encode(data).finish();
      },
    });

    // Если отправка завершена, отменяем таймаут
    clearTimeout(timeoutId);
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error("Operation aborted due to timeout");
    }
    throw new Error(
      `Failed to write message in writeToConnection: ${err.message}`
    );
  }
}

export async function readFromConnection(
  stream: Stream,
  root: protobuf.Root,
  timeout: number,
  typeName: string
): Promise<any> {
  try {
    const ProtobufMessageChain = root.lookupType(typeName);

    const pbstr = pbStream(stream);

    const signal = AbortSignal.timeout(timeout);

    signal.addEventListener("abort", () => {
      throw new Error("Timeout reached, aborting stream");
    });
    while (true) {
      let decodedMessage: any;

      try {
        // Чтение сообщения из потока
        const messageData = await pbstr.read(
          {
            decode: (buffer: Uint8Array | Uint8ArrayList) => {
              const data =
                buffer instanceof Uint8Array
                  ? buffer
                  : new Uint8Array(buffer.subarray());
              return ProtobufMessageChain.decode(data);
            },
          },
          { signal }
        );
        decodedMessage = messageData;
      } catch (err: any) {
        if (err.name === "AbortError") {
          throw new Error("Stream reading aborted due to timeout");
        }
        throw new Error(`Failed to read message: ${err.message}`);
      }

      if (!decodedMessage) {
        throw new Error("No message received, ending stream");
      }
      return decodedMessage;
    }
  } catch (err: any) {
    throw new Error(
      `Failed to read message in readFromConnection: ${err.message}`
    );
  }
}
