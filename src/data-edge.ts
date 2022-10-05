import {
  BigInt,
  Bytes,
  json,
  ipfs,
  JSONValue,
  JSONValueKind,
  log,
  BigDecimal
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
          processIpfsHash(hash, timestamp, messageID.concat(index.toString()));
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

export function processIpfsHash(
  ipfsHash: String,
  timestamp: BigInt,
  messageID: String
): void {
  let ipfsData = ipfs.cat(ipfsHash);
  let jsonIpfsData = json.try_fromBytes(ipfsData ? ipfsData! : Bytes.empty());

  let indexerDataPointCount = BIGINT_ZERO;
  let messageDataPoint = new MessageDataPoint(messageID);
  // messageDataPoint.rawData = jsonIpfsData.isOk
  //   ? jsonToString(jsonIpfsData.value)
  //   : "";
  messageDataPoint.rawData = ipfsData ? ipfsData!.toString() : "";
  messageDataPoint.ipfsHash = ipfsHash;
  messageDataPoint.timestamp = timestamp;
  messageDataPoint.oracleMessage = messageID;

  if (jsonIpfsData.value.kind == JSONValueKind.ARRAY) {
    let ipfsDataArray = jsonIpfsData.value.toArray();
    indexerDataPointCount = BigInt.fromI32(ipfsDataArray.length);

    for (
      let internalIndex = 0;
      internalIndex < ipfsDataArray.length;
      internalIndex++
    ) {
      let indexerDataPoint = new IndexerDataPoint(
        [messageDataPoint.id, internalIndex.toString()].join("-")
      );
      indexerDataPoint.rawData = jsonObjectToString(
        ipfsDataArray[internalIndex]
      );
      indexerDataPoint.messageDataPoint = messageDataPoint.id;
      indexerDataPoint.save();
    }
  } else {
    log.warning("IPFS data isn't an array for the MessageDataPoint", []);
  }

  messageDataPoint.indexerDataPointCount = indexerDataPointCount;
  messageDataPoint.save();
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

/**
 * Convert TypedMap to JSON string
 */
export function jsonObjectToString(val: JSONValue | null): String {
  let str = "";
  if (val != null && val.kind === JSONValueKind.OBJECT) {
    let object = val.toObject();
    str = "{";
    for (let i = 0; i < object.entries.length; i++) {
      str = str.concat(
        '"' +
          object.entries[i].key +
          '":' +
          jsonValueToString(object.entries[i].value)
      );
      if (i < object.entries.length - 1) {
        str = str.concat(", ");
      }
    }
    str = str.concat("}");
  }
  return str;
}
/*
export enum JSONValueKind {
  NULL = 0,
  BOOL = 1,
  NUMBER = 2,
  STRING = 3,
  ARRAY = 4,
  OBJECT = 5,
}
*/
export function jsonValueToString(val: JSONValue | null): String {
  if (val == null) {
    return "";
  } else if (val.kind == JSONValueKind.NULL) {
    return "null";
  } else if (val.kind == JSONValueKind.BOOL) {
    return val.toBool() ? "true" : "false";
  } else if (val.kind == JSONValueKind.NUMBER) {
    return BigDecimal.fromString(
      changetype<string>(val.data as u32)
    ).toString();
  } else if (val.kind == JSONValueKind.STRING) {
    return '"'.concat(val.toString()).concat('"');
  } else if (val.kind == JSONValueKind.ARRAY) {
    let arr = val.toArray();
    let str = "[";
    for (let i = 0; i < arr.length; i++) {
      str += jsonValueToString(arr[i]);
    }
    str.concat("]");
    return str;
  } else if (val.kind == JSONValueKind.OBJECT) {
    return jsonObjectToString(val);
  } else {
    return "";
  }
}
