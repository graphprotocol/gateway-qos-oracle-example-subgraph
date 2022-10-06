import {
  BigInt,
  JSONValue,
  JSONValueKind,
  log,
  BigDecimal
} from "@graphprotocol/graph-ts";
import { Indexer, SubgraphDeployment } from "../generated/schema";
import { BIGINT_ZERO } from "./constants";

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

export function jsonValueToBigDecimal(val: JSONValue | null): BigDecimal {
  if (val != null && val.kind === JSONValueKind.NUMBER) {
    return BigDecimal.fromString(changetype<string>(val.data as u32));
  }
  return BIGINT_ZERO.toBigDecimal();
}

export function jsonValueToString(val: JSONValue | null): String {
  if (val == null) {
    return "";
  } else if (val.kind == JSONValueKind.NULL) {
    return "null";
  } else if (val.kind == JSONValueKind.BOOL) {
    return val.toBool() ? "true" : "false";
  } else if (val.kind == JSONValueKind.NUMBER) {
    return jsonValueToBigDecimal(val).toString();
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

export function createIndexer(id: String): Indexer {
  let entity = Indexer.load(id);
  if (entity == null) {
    entity = new Indexer(id);
    entity.save();
  }
  return entity as Indexer;
}

export function createDeployment(id: String): SubgraphDeployment {
  let entity = SubgraphDeployment.load(id);
  if (entity == null) {
    entity = new SubgraphDeployment(id);
    entity.save();
  }
  return entity as SubgraphDeployment;
}
