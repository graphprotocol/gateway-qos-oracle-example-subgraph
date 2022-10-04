import {
  BigInt,
  Bytes,
  json,
  ipfs,
  JSONValue,
  JSONValueKind
} from "@graphprotocol/graph-ts";
import { DataEdge, SubmitQoSPayloadCall } from "../generated/DataEdge/DataEdge";
import {
  OracleMessage,
  MessageDataPoint,
  IndexerDataPoint,
  GlobalState
} from "../generated/schema";
import { JSON_TOPICS, BIGINT_ONE, BIGINT_ZERO } from "./constants";

export function handleSubmitQoSPayload(call: SubmitQoSPayloadCall): void {
  let entity = OracleMessage.load(call.transaction.hash.toHexString());

  if (!entity) {
    entity = new OracleMessage(call.transaction.hash.toHexString());
  }

  entity.payload = call.inputs._payload.toString();
  entity.createdAt = call.block.timestamp;

  processPayload(call.inputs._payload, entity.id);

  entity.save();
}

function processPayload(payload: Bytes, messageID: String): void {
  let jsonData = json.try_fromBytes(payload);

  if (jsonData.isOk) {
    if (jsonData.value.kind == JSONValueKind.ARRAY) {
      let jsonArray = jsonData.value.toArray();
      for (let index = 0; index < jsonArray.length; index++) {
        let data = jsonArray[index].toObject();
        let topic = jsonToString(data.get("topic"));
        if (shouldProcessTopic(topic)) {
          let hash = jsonToString(data.get("hash"));
          let timestamp = jsonToBigInt(data.get("timestamp"));
          processIpfsHash(hash, timestamp, messageID);
        }
      }
    } else if (jsonData.value.kind == JSONValueKind.OBJECT) {
      let data = jsonData.value.toObject();
      let topic = jsonToString(data.get("topic"));
      if (shouldProcessTopic(topic)) {
        let hash = jsonToString(data.get("hash"));
        let timestamp = jsonToBigInt(data.get("timestamp"));
        processIpfsHash(hash, timestamp, messageID);
      }
    }
  }
}

function shouldProcessTopic(topic: String): boolean {
  return topic != "" && JSON_TOPICS.includes(topic);
}

export function processIpfsHash(ipfsHash: String, timestamp: BigInt, messageID: String): void {
  let ipfsData = ipfs.cat(ipfsHash);
  // let jsonIpfsData = json.try_fromBytes(
  //   ipfsData ? ipfsData! : Bytes.empty()
  // );

  let messageDataPoint = new MessageDataPoint(messageID);
  // messageDataPoint.rawData = jsonIpfsData.isOk
  //   ? jsonToString(jsonIpfsData.value)
  //   : "";
  messageDataPoint.rawData = ipfsData ? ipfsData!.toString() : "";
  messageDataPoint.ipfsHash = ipfsHash;
  messageDataPoint.indexerDataPointCount = BIGINT_ZERO;
  messageDataPoint.timestamp = timestamp;
  messageDataPoint.oracleMessage = messageID;
  messageDataPoint.save();

  // let ipfsDataArray = jsonData.value.toArray()
  // for(let internalIndex = 0; internalIndex < ipfsDataArray.length; internalIndex++) {
  //
  // }
}

/**
 * Make sure the given JSONValue is a string and returns string it contains.
 * Returns blank string otherwise.
 */
export function jsonToString(val: JSONValue | null): string {
  if (val != null && val.kind === JSONValueKind.STRING) {
    return val.toString();
  }
  return "";
}

/**
 * Make sure the given JSONValue is a number and returns the BigInt it contains.
 * Returns BIGINT_ZERO otherwise.
 */
export function jsonToBigInt(val: JSONValue | null): BigInt {
  if (val != null && val.kind === JSONValueKind.NUMBER) {
    return val.toBigInt();
  }
  return BIGINT_ZERO;
}
