#!/bin/bash
# usage: rpc.sh '<json body>'  -> posts to Helius mainnet RPC
cd "/Volumes/Farhan/Work Folder/Dev/AI/stonk-fun-solana"; set -a; . ./.env; set +a
curl -s -X POST "https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY" -H 'Content-Type: application/json' -d "$1"
