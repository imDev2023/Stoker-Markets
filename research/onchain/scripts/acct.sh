#!/bin/bash
# usage: acct.sh <pubkey> -> getAccountInfo base64
$(dirname "$0")/rpc.sh "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getAccountInfo\",\"params\":[\"$1\",{\"encoding\":\"base64\"}]}"
