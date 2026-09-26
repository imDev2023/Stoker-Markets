import json,sys,collections
W=sys.argv[2]
d=json.load(open(sys.argv[1]))['result']['data']
for t in d:
    m=t['transaction']['message']; keys=[k['pubkey'] for k in m['accountKeys']]
    logs=' '.join(l for l in t['meta']['logMessages'] if 'Instruction:' in l or 'IX:' in l)
    kinds=sorted(set(l.split('Instruction: ')[-1] for l in t['meta']['logMessages'] if 'Instruction: ' in l) - {'TransferChecked','GetAccountDataSize','InitializeAccount3','InitializeImmutableOwner','Transfer','CloseAccount','SyncNative'})
    ch=collections.defaultdict(float)
    pre={b['accountIndex']:b for b in t['meta']['preTokenBalances']}
    post={b['accountIndex']:b for b in t['meta']['postTokenBalances']}
    for i in set(pre)|set(post):
        b=post.get(i) or pre.get(i)
        own=b.get('owner')
        a=float((post.get(i) or {}).get('uiTokenAmount',{}).get('uiAmountString') or 0)-float((pre.get(i) or {}).get('uiTokenAmount',{}).get('uiAmountString') or 0)
        if abs(a)>0: ch[(own,b['mint'])]+=a
    sol={keys[i]:(b-a)/1e9 for i,(a,b) in enumerate(zip(t['meta']['preBalances'],t['meta']['postBalances'])) if a!=b}
    mine={k[1][:6]:round(v,6) for k,v in ch.items() if k[0]==W}
    others={(k[0][:6],k[1][:6]):round(v,6) for k,v in ch.items() if k[0]!=W and abs(v)>0}
    print(t['blockTime'], t['transaction']['signatures'][0][:16], ','.join(kinds)[:60], 'SOL',round(sol.get(W,0),4), 'W',mine, 'others', dict(list(others.items())[:4]) if len(sys.argv)>3 else '')
