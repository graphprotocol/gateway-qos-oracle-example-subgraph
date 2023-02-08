import { BigInt, BigDecimal } from "@graphprotocol/graph-ts";

export let JSON_TOPICS: Array<String> = [];
JSON_TOPICS.push("gateway_query_result_qos_5_minutes_prod_v2");
JSON_TOPICS.push("gateway_indexer_attempt_qos_5_minutes_prod_v2");
JSON_TOPICS.push("gateway_query_result_qos_5_minutes_prod_v3");
JSON_TOPICS.push("gateway_indexer_attempt_qos_5_minutes_prod_v3");
export let BIGINT_ZERO = BigInt.fromI32(0);
export let BIGINT_ONE = BigInt.fromI32(1);
export let BIGDECIMAL_ZERO = BigDecimal.fromString('0');
export let BIGDECIMAL_ONE = BigDecimal.fromString('1');
export const LAUNCH_DAY = 18613 // 1608163200 / 86400. 1608163200 = 17 Dec 2020 00:00:00 GMT
export const SECONDS_PER_DAY = 86400
