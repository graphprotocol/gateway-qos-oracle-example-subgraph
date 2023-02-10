import {
  BigInt,
  JSONValue,
  JSONValueKind,
  log,
  BigDecimal
} from "@graphprotocol/graph-ts";
import {
  Indexer,
  SubgraphDeployment,
  IndexerDataPoint,
  QueryDataPoint,
  IndexerDailyDataPoint,
  QueryDailyDataPoint
} from "../generated/schema";
import {
  BIGINT_ZERO,
  SECONDS_PER_DAY,
  LAUNCH_DAY,
  BIGINT_ONE,
  BIGDECIMAL_ZERO,
  BIGDECIMAL_ONE
} from "./constants";

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

export function compoundId(idA: string, idB: string): string {
  return idA.concat("-").concat(idB);
}

export function getAndUpdateIndexerDailyData(
  entity: IndexerDataPoint,
  timestamp: BigInt
): IndexerDailyDataPoint {
  let dayNumber = timestamp.toI32() / SECONDS_PER_DAY - LAUNCH_DAY;
  let indexerSubgraphId = compoundId(entity.indexer_wallet, entity.subgraph_deployment_ipfs_hash)
  let id = compoundId(indexerSubgraphId, BigInt.fromI32(dayNumber).toString());
  let dailyData = IndexerDailyDataPoint.load(id);

  if (dailyData == null) {
    dailyData = new IndexerDailyDataPoint(id);

    dailyData.dayStart = BigInt.fromI32(
      (timestamp.toI32() / SECONDS_PER_DAY) * SECONDS_PER_DAY
    );
    dailyData.dayEnd = dailyData.dayStart + BigInt.fromI32(SECONDS_PER_DAY);
    dailyData.dayNumber = dayNumber;
    dailyData.indexer = entity.indexer;
    dailyData.subgraphDeployment = entity.subgraphDeployment;
    dailyData.dataPointCount = BIGINT_ZERO;
    dailyData.indexer_url = entity.indexer_url;
    dailyData.indexer_wallet = entity.indexer_wallet;
    dailyData.subgraph_deployment_ipfs_hash = entity.subgraph_deployment_ipfs_hash;
    dailyData.query_count = BIGDECIMAL_ZERO;
    dailyData.start_epoch = entity.start_epoch;
    dailyData.avg_indexer_blocks_behind = BIGDECIMAL_ZERO;
    dailyData.avg_indexer_latency_ms = BIGDECIMAL_ZERO;
    dailyData.avg_query_fee = BIGDECIMAL_ZERO;
    dailyData.max_indexer_blocks_behind = BIGDECIMAL_ZERO;
    dailyData.max_indexer_latency_ms = BIGDECIMAL_ZERO;
    dailyData.max_query_fee = BIGDECIMAL_ZERO;
    dailyData.num_indexer_200_responses = BIGDECIMAL_ZERO;
    dailyData.proportion_indexer_200_responses = BIGDECIMAL_ZERO;
    dailyData.total_query_fees = BIGDECIMAL_ZERO;
  }

  let prevWeight = dailyData.query_count;

  dailyData.dataPointCount = dailyData.dataPointCount.plus(BIGINT_ONE);
  dailyData.query_count = dailyData.query_count + entity.query_count;

  dailyData.avg_indexer_blocks_behind = bdWeightedAverage(
    [
      [dailyData.avg_indexer_blocks_behind, prevWeight],
      [entity.avg_indexer_blocks_behind, entity.query_count]
    ],
    dailyData.query_count
  );
  dailyData.avg_indexer_latency_ms = bdWeightedAverage(
    [
      [dailyData.avg_indexer_latency_ms, prevWeight],
      [entity.avg_indexer_latency_ms, entity.query_count]
    ],
    dailyData.query_count
  );
  dailyData.avg_query_fee = bdWeightedAverage(
    [
      [dailyData.avg_query_fee, prevWeight],
      [entity.avg_query_fee, entity.query_count]
    ],
    dailyData.query_count
  );
  dailyData.end_epoch = entity.end_epoch;
  dailyData.max_indexer_blocks_behind = maxBD(
    dailyData.max_indexer_blocks_behind,
    entity.max_indexer_blocks_behind
  );
  dailyData.max_indexer_latency_ms = maxBD(
    dailyData.max_indexer_latency_ms,
    entity.max_indexer_latency_ms
  );
  dailyData.max_query_fee = maxBD(
    dailyData.max_query_fee,
    entity.max_query_fee
  );
  dailyData.num_indexer_200_responses =
    dailyData.num_indexer_200_responses + entity.num_indexer_200_responses;
  dailyData.proportion_indexer_200_responses = bdWeightedAverage(
    [
      [dailyData.proportion_indexer_200_responses, prevWeight],
      [entity.proportion_indexer_200_responses, entity.query_count]
    ],
    dailyData.query_count
  );
  dailyData.total_query_fees =
    dailyData.total_query_fees + entity.total_query_fees;

  dailyData.save();

  return dailyData as IndexerDailyDataPoint;
}

export function getAndUpdateQueryDailyData(
  entity: QueryDataPoint,
  timestamp: BigInt
): QueryDailyDataPoint {
  let dayNumber = timestamp.toI32() / SECONDS_PER_DAY - LAUNCH_DAY;
  let id = compoundId(entity.subgraph_deployment_ipfs_hash, BigInt.fromI32(dayNumber).toString());
  let dailyData = QueryDailyDataPoint.load(id);

  if (dailyData == null) {
    dailyData = new QueryDailyDataPoint(id);

    dailyData.dayStart = BigInt.fromI32(
      (timestamp.toI32() / SECONDS_PER_DAY) * SECONDS_PER_DAY
    );
    dailyData.dayEnd = dailyData.dayStart + BigInt.fromI32(SECONDS_PER_DAY);
    dailyData.dayNumber = dayNumber;
    dailyData.subgraphDeployment = entity.subgraphDeployment;
    dailyData.dataPointCount = BIGINT_ZERO;
    dailyData.query_count = BIGDECIMAL_ZERO;
    dailyData.start_epoch = entity.start_epoch;
    dailyData.avg_gateway_latency_ms = BIGDECIMAL_ZERO;
    dailyData.avg_query_fee = BIGDECIMAL_ZERO;
    dailyData.gateway_query_success_rate = BIGDECIMAL_ZERO;
    dailyData.max_gateway_latency_ms = BIGDECIMAL_ZERO;
    dailyData.max_query_fee = BIGDECIMAL_ZERO;
    dailyData.total_query_fees = BIGDECIMAL_ZERO;
    dailyData.user_attributed_error_rate = BIGDECIMAL_ZERO;
  }

  let prevWeight = dailyData.query_count;

  dailyData.dataPointCount = dailyData.dataPointCount.plus(BIGINT_ONE);
  dailyData.query_count = dailyData.query_count + entity.query_count;

  dailyData.avg_gateway_latency_ms = bdWeightedAverage(
    [
      [dailyData.avg_gateway_latency_ms, prevWeight],
      [entity.avg_gateway_latency_ms, entity.query_count]
    ],
    dailyData.query_count
  );
  dailyData.avg_query_fee = bdWeightedAverage(
    [
      [dailyData.avg_query_fee, prevWeight],
      [entity.avg_query_fee, entity.query_count]
    ],
    dailyData.query_count
  );
  dailyData.end_epoch = entity.end_epoch;
  dailyData.gateway_query_success_rate = bdWeightedAverage(
    [
      [dailyData.gateway_query_success_rate, prevWeight],
      [entity.gateway_query_success_rate, entity.query_count]
    ],
    dailyData.query_count
  );
  dailyData.max_gateway_latency_ms = maxBD(
    dailyData.max_gateway_latency_ms,
    entity.max_gateway_latency_ms
  );
  dailyData.max_query_fee = maxBD(
    dailyData.max_query_fee,
    entity.max_query_fee
  );
  dailyData.most_recent_query_ts = entity.most_recent_query_ts;
  dailyData.total_query_fees =
    dailyData.total_query_fees + entity.total_query_fees;
  dailyData.user_attributed_error_rate = bdWeightedAverage(
    [
      [dailyData.user_attributed_error_rate, prevWeight],
      [entity.user_attributed_error_rate, entity.query_count]
    ],
    dailyData.query_count
  );

  dailyData.save();

  return dailyData as QueryDailyDataPoint;
}

export function bdWeightedAverage(
  arr: Array<Array<BigDecimal>>,
  totalWeight: BigDecimal
): BigDecimal {
  let result = BigDecimal.fromString("0");
  for (let i = 0; i < arr.length; i++) {
    result += arr[i][0] * (arr[i][1] / totalWeight);
  }
  return result;
}

export function maxBD(a: BigDecimal, b: BigDecimal): BigDecimal {
  return a > b ? a : b;
}
