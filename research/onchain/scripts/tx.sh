#!/bin/bash
# usage: tx.sh sig -> raw getTransaction jsonParsed
$(dirname "$0")/rpc.sh "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getTransaction\",\"params\":[\"$1\",{\"encoding\":\"jsonParsed\",\"maxSupportedTransactionVersion\":0}]}"
