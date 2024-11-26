import {
  PeerId,
  Ed25519PrivateKey,
  Secp256k1PrivateKey,
  RSAPrivateKey,
} from "@libp2p/interface";
import {
  createFromProtobuf,
  createEd25519PeerId,
  exportToProtobuf,
} from "@libp2p/peer-id-factory";
import fs from "fs/promises";
import path from "path";
import { privateKeyFromProtobuf } from "@libp2p/crypto/keys";

export async function loadOrCreatePeerId(
  filename: string
): Promise<
  Ed25519PrivateKey | Secp256k1PrivateKey | RSAPrivateKey | undefined
> {
  const file = path.resolve(filename);
  try {
    const peerIdData = await fs.readFile(file);
    const peerId = (await createFromProtobuf(peerIdData)) as unknown as PeerId;

    const privateKey = await privateKeyFromProtobuf((peerId as any).privateKey);

    return privateKey;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      const peerId = await createEd25519PeerId();
      await fs.writeFile(file, exportToProtobuf(peerId));
      const privateKey = await privateKeyFromProtobuf(
        (peerId as any).privateKey
      );
      return privateKey;
    } else {
      return undefined;
    }
  }
}
