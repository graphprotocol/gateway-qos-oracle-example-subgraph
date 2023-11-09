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
  AllocationDataPoint,
  QueryDataPoint
} from "../generated/schema";
import { JSON_TOPICS, BIGINT_ONE, BIGINT_ZERO, SUBMITTER_WHITELIST } from "./constants";
import {
  jsonToString,
  jsonToBigInt,
  jsonObjectToString,
  jsonValueToBigDecimal,
  jsonValueToString,
  createIndexer,
  createDeployment,
  getAndUpdateQueryDailyData,
  getAndUpdateIndexerDailyData,
  getAndUpdateAllocationDailyData
} from "./helpers";

export function handleSubmitQoSPayload(call: SubmitQoSPayloadCall): void {
  let entity = OracleMessage.load(call.transaction.hash.toHexString());

  if (!entity) {
    entity = new OracleMessage(call.transaction.hash.toHexString());
  }

  entity.payload = call.inputs._payload.toString();
  entity.createdAt = call.block.timestamp;
  entity.createdAtBlock = call.block.number;
  entity.valid = true;

  if(SUBMITTER_WHITELIST.includes(call.from.toHexString())) {
    processPayload(call.inputs._payload, entity.id);
  } else {
    entity.valid = false;
    entity.errorMessage = `${call.from.toHexString()} is not a valid submitter.`
  }

  entity.save();
}

function processPayload(payload: Bytes, messageID: String): void {
  let jsonData = json.try_fromBytes(payload);

  if (jsonData.isOk && !jsonData.isError) {
    if (jsonData.value.kind == JSONValueKind.ARRAY) {
      let jsonArray = jsonData.value.toArray();
      for (let index = 0; index < jsonArray.length; index++) {
        let data = jsonArray[index].toObject();
        let topic = jsonToString(data.get("topic"));
        if (shouldProcessTopic(topic)) {
          let hash = jsonToString(data.get("hash"));
          let timestamp = jsonToBigInt(data.get("timestamp"));
          processIpfsHash(hash, topic, timestamp, messageID, index);
        }
      }
    } else if (jsonData.value.kind == JSONValueKind.OBJECT) {
      let data = jsonData.value.toObject();
      let topic = jsonToString(data.get("topic"));
      if (shouldProcessTopic(topic)) {
        let hash = jsonToString(data.get("hash"));
        let timestamp = jsonToBigInt(data.get("timestamp"));
        processIpfsHash(hash, topic, timestamp, messageID, 0);
      }
    }
  } else if (jsonData.isError) {
    log.warning("JSON DATA ERROR", []);
  }
}

function shouldProcessTopic(topic: String): boolean {
  return topic != "" && JSON_TOPICS.includes(topic);
}

export function processIpfsHash(
  ipfsHash: String,
  topic: String,
  timestamp: BigInt,
  oracleMessageID: String,
  messageIndex: i32
): void {
  let ipfsData = ipfs.cat(ipfsHash);
  if (ipfsData === null) {
    log.warning("IPFS Data couldn't be retrieved. Hash: {}", [ipfsHash]);
    return;
  }
  let jsonIpfsData = json.try_fromBytes(ipfsData ? ipfsData! : Bytes.empty());

  let allocationDataPointCount = BIGINT_ZERO;
  let queryDataPointCount = BIGINT_ZERO;
  let messageDataPoint = new MessageDataPoint(
    oracleMessageID.concat(messageIndex.toString())
  );
  // messageDataPoint.rawData = jsonIpfsData.isOk
  //   ? jsonToString(jsonIpfsData.value)
  //   : "";
  messageDataPoint.rawData = ipfsData ? ipfsData!.toString() : "";
  messageDataPoint.ipfsHash = ipfsHash;
  messageDataPoint.timestamp = timestamp;
  messageDataPoint.oracleMessage = oracleMessageID;

  if (
    jsonIpfsData.isOk &&
    !jsonIpfsData.isError &&
    jsonIpfsData.value.kind == JSONValueKind.ARRAY
  ) {
    let ipfsDataArray = jsonIpfsData.value.toArray();
    
    if (topic.includes("indexer")) {
      for (let i = 0; i < ipfsDataArray.length; i++) {
        createAllocationDataPoint(
          [messageDataPoint.id, i.toString()].join("-"),
          ipfsDataArray[i],
          messageDataPoint.id,
          timestamp
          );
        }
      allocationDataPointCount = BigInt.fromI32(ipfsDataArray.length);
    } else if (topic.includes("query")) {
      for (let i = 0; i < ipfsDataArray.length; i++) {
        createQueryDataPoint(
          [messageDataPoint.id, i.toString()].join("-"),
          ipfsDataArray[i],
          messageDataPoint.id,
          timestamp
          );
        queryDataPointCount = BigInt.fromI32(ipfsDataArray.length);
      }
    } else {
      log.warning("Topic doesn't include indexer or query reference", []);
    }
  } else if (!jsonIpfsData.isOk) {
    log.warning("IPFS data isn't ok. Hash: {}", [ipfsHash]);
  } else if (jsonIpfsData.isError) {
    log.warning("IPFS data error. Hash: {}", [ipfsHash]);
  } else {
    log.warning("IPFS data isn't an array for the MessageDataPoint", []);
  }

  messageDataPoint.allocationDataPointCount = allocationDataPointCount;
  messageDataPoint.queryDataPointCount = queryDataPointCount;
  messageDataPoint.save();
}

export function createAllocationDataPoint(
  id: String,
  jsonData: JSONValue,
  messageID: String,
  timestamp: BigInt
): void {
  let allocationDataPoint = new AllocationDataPoint(id);
  allocationDataPoint.rawData = jsonObjectToString(jsonData);
  allocationDataPoint.messageDataPoint = messageID;

  if (jsonData.kind == JSONValueKind.OBJECT) {
    let jsonDataObject = jsonData.toObject();
    let avg_indexer_blocks_behind = jsonDataObject.get(
      "avg_indexer_blocks_behind"
    );
    let avg_indexer_latency_ms = jsonDataObject.get("avg_indexer_latency_ms");
    let avg_query_fee = jsonDataObject.get("avg_query_fee");
    let end_epoch = jsonDataObject.get("end_epoch");
    let indexer_url = jsonDataObject.get("indexer_url");
    let indexer_wallet = jsonDataObject.get("indexer_wallet");
    let max_indexer_blocks_behind = jsonDataObject.get(
      "max_indexer_blocks_behind"
    );
    let max_indexer_latency_ms = jsonDataObject.get("max_indexer_latency_ms");
    let max_query_fee = jsonDataObject.get("max_query_fee");
    let num_indexer_200_responses = jsonDataObject.get(
      "num_indexer_200_responses"
    );
    let proportion_indexer_200_responses = jsonDataObject.get(
      "proportion_indexer_200_responses"
    );
    let query_count = jsonDataObject.get("query_count");
    let start_epoch = jsonDataObject.get("start_epoch");
    let stdev_indexer_latency_ms = jsonDataObject.get(
      "stdev_indexer_latency_ms"
    );
    let subgraph_deployment_ipfs_hash = jsonDataObject.get(
      "subgraph_deployment_ipfs_hash"
    );
    let total_query_fees = jsonDataObject.get("total_query_fees");
    let chain = jsonDataObject.get("chain");
    let gateway = jsonDataObject.get("gateway_id");

    allocationDataPoint.avg_indexer_blocks_behind = jsonValueToBigDecimal(
      avg_indexer_blocks_behind
    );
    allocationDataPoint.avg_indexer_latency_ms = jsonValueToBigDecimal(
      avg_indexer_latency_ms
    );
    allocationDataPoint.avg_query_fee = jsonValueToBigDecimal(avg_query_fee);
    allocationDataPoint.end_epoch = jsonValueToBigDecimal(end_epoch);
    allocationDataPoint.indexer_url = jsonToString(indexer_url);
    allocationDataPoint.indexer_wallet = jsonToString(indexer_wallet);
    allocationDataPoint.max_indexer_blocks_behind = jsonValueToBigDecimal(
      max_indexer_blocks_behind
    );
    allocationDataPoint.max_indexer_latency_ms = jsonValueToBigDecimal(
      max_indexer_latency_ms
    );
    allocationDataPoint.max_query_fee = jsonValueToBigDecimal(max_query_fee);
    allocationDataPoint.num_indexer_200_responses = jsonValueToBigDecimal(
      num_indexer_200_responses
    );
    allocationDataPoint.proportion_indexer_200_responses = jsonValueToBigDecimal(
      proportion_indexer_200_responses
    );
    allocationDataPoint.query_count = jsonValueToBigDecimal(query_count);
    allocationDataPoint.start_epoch = jsonValueToBigDecimal(start_epoch);
    allocationDataPoint.stdev_indexer_latency_ms = jsonValueToBigDecimal(
      stdev_indexer_latency_ms
    );
    allocationDataPoint.subgraph_deployment_ipfs_hash = jsonToString(
      subgraph_deployment_ipfs_hash
    );
    allocationDataPoint.total_query_fees = jsonValueToBigDecimal(total_query_fees);
    allocationDataPoint.chain_id = jsonToString(chain);
    allocationDataPoint.gateway_id = jsonToString(gateway);

    if (
      allocationDataPoint.indexer_wallet != null &&
      allocationDataPoint.indexer_wallet != ""
    ) {
      allocationDataPoint.indexer = allocationDataPoint.indexer_wallet;
      createIndexer(allocationDataPoint.indexer!);
    }
    if (
      allocationDataPoint.subgraph_deployment_ipfs_hash != null &&
      allocationDataPoint.subgraph_deployment_ipfs_hash != ""
    ) {
      allocationDataPoint.subgraphDeployment =
        allocationDataPoint.subgraph_deployment_ipfs_hash;
      createDeployment(allocationDataPoint.subgraphDeployment!);
    }
    let allocationDailyDataPoint = getAndUpdateAllocationDailyData(allocationDataPoint, timestamp);
    let indexerDailyDataPoint = getAndUpdateIndexerDailyData(allocationDataPoint, timestamp);
    allocationDataPoint.dayNumber = allocationDailyDataPoint.dayNumber;
    allocationDataPoint.dayStart = allocationDailyDataPoint.dayStart;
    allocationDataPoint.dayEnd = allocationDailyDataPoint.dayEnd;
    allocationDataPoint.allocationDailyDataPoint = allocationDailyDataPoint.id;
    allocationDataPoint.indexerDailyDataPoint = indexerDailyDataPoint.id;
  }

  allocationDataPoint.save();
}

export function createQueryDataPoint(
  id: String,
  jsonData: JSONValue,
  messageID: String,
  timestamp: BigInt
): void {
  let queryDataPoint = new QueryDataPoint(id);
  queryDataPoint.rawData = jsonObjectToString(jsonData);
  queryDataPoint.messageDataPoint = messageID;

  if (jsonData.kind == JSONValueKind.OBJECT) {
    let jsonDataObject = jsonData.toObject();
    let avg_gateway_latency_ms = jsonDataObject.get("avg_gateway_latency_ms");
    let avg_query_fee = jsonDataObject.get("avg_query_fee");
    let end_epoch = jsonDataObject.get("end_epoch");
    let gateway_query_success_rate = jsonDataObject.get(
      "gateway_query_success_rate"
    );
    let max_gateway_latency_ms = jsonDataObject.get("max_gateway_latency_ms");
    let max_query_fee = jsonDataObject.get("max_query_fee");
    let most_recent_query_ts = jsonDataObject.get("most_recent_query_ts");
    let query_count = jsonDataObject.get("query_count");
    let start_epoch = jsonDataObject.get("start_epoch");
    let stdev_gateway_latency_ms = jsonDataObject.get(
      "stdev_gateway_latency_ms"
    );
    let subgraph_deployment_ipfs_hash = jsonDataObject.get(
      "subgraph_deployment_ipfs_hash"
    );
    let total_query_fees = jsonDataObject.get("total_query_fees");
    let user_attributed_error_rate = jsonDataObject.get(
      "user_attributed_error_rate"
    );
    let chain = jsonDataObject.get("chain");
    let gateway = jsonDataObject.get("gateway_id");

    queryDataPoint.avg_gateway_latency_ms = jsonValueToBigDecimal(
      avg_gateway_latency_ms
    );
    queryDataPoint.avg_query_fee = jsonValueToBigDecimal(avg_query_fee);
    queryDataPoint.end_epoch = jsonValueToBigDecimal(end_epoch);
    queryDataPoint.gateway_query_success_rate = jsonValueToBigDecimal(
      gateway_query_success_rate
    );
    queryDataPoint.max_gateway_latency_ms = jsonValueToBigDecimal(
      max_gateway_latency_ms
    );
    queryDataPoint.max_query_fee = jsonValueToBigDecimal(max_query_fee);
    queryDataPoint.most_recent_query_ts = jsonValueToBigDecimal(
      most_recent_query_ts
    );
    queryDataPoint.query_count = jsonValueToBigDecimal(query_count);
    queryDataPoint.start_epoch = jsonValueToBigDecimal(start_epoch);
    queryDataPoint.stdev_gateway_latency_ms = jsonValueToBigDecimal(
      stdev_gateway_latency_ms
    );
    queryDataPoint.subgraph_deployment_ipfs_hash = jsonToString(
      subgraph_deployment_ipfs_hash
    );
    queryDataPoint.total_query_fees = jsonValueToBigDecimal(total_query_fees);
    queryDataPoint.user_attributed_error_rate = jsonValueToBigDecimal(
      user_attributed_error_rate
    );
    queryDataPoint.chain_id = jsonToString(chain);
    queryDataPoint.gateway_id = jsonToString(gateway);

    if (
      queryDataPoint.subgraph_deployment_ipfs_hash != null &&
      queryDataPoint.subgraph_deployment_ipfs_hash != ""
    ) {
      queryDataPoint.subgraphDeployment =
        queryDataPoint.subgraph_deployment_ipfs_hash;
      createDeployment(queryDataPoint.subgraphDeployment!);
    }
    let dailyDataPoint = getAndUpdateQueryDailyData(queryDataPoint, timestamp);
    queryDataPoint.dayNumber = dailyDataPoint.dayNumber;
    queryDataPoint.dayStart = dailyDataPoint.dayStart;
    queryDataPoint.dayEnd = dailyDataPoint.dayEnd;
    queryDataPoint.dailyDataPoint = dailyDataPoint.id;
  }

  queryDataPoint.save();
}
