import json,base64,collections,struct,csv,sys
ALPH='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
def b58(b):
    n=int.from_bytes(b,'big'); s=''
    while n: n,r=divmod(n,58); s=ALPH[r]+s
    return '1'*(len(b)-len(b.lstrip(b'\0')))+s
r=json.load(open(sys.argv[1]))['result']
rows=[]
for a in r:
    d=base64.b64decode(a['account']['data'][0])
    u=lambda o: struct.unpack_from('<Q',d,o)[0]
    rows.append(dict(pool=a['pubkey'],epoch=u(8),status=d[17],base_dec=d[18],quote_dec=d[19],migrate_type=d[20],
      supply=u(21),total_base_sell=u(29),virtual_base=u(37),virtual_quote=u(45),real_base=u(53),real_quote=u(61),
      total_quote_fund_raising=u(69),quote_protocol_fee=u(77),platform_fee=u(85),migrate_fee=u(93),
      global_config=b58(d[141:173]),base_mint=b58(d[205:237]),quote_mint=b58(d[237:269]),creator=b58(d[333:365]),
      token_program_flag=d[365],amm_creator_fee_on=d[366]))
with open(sys.argv[2],'w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
print('pools',len(rows))
print('status',collections.Counter(x['status'] for x in rows))
print('migrate_type',collections.Counter(x['migrate_type'] for x in rows))
print('token_program_flag',collections.Counter(x['token_program_flag'] for x in rows))
qm=collections.Counter(x['quote_mint'] for x in rows)
print('distinct quote mints',len(qm)); print('top quote',qm.most_common(25))
gc=collections.Counter((x['global_config'],x['quote_mint']) for x in rows); print('distinct global configs',len(set(x['global_config'] for x in rows)))
print('creators distinct',len(set(x['creator'] for x in rows)))
print('top creators',collections.Counter(x['creator'] for x in rows).most_common(10))
print('epochs',min(x['epoch'] for x in rows),max(x['epoch'] for x in rows))
print('status by top quote', {q:collections.Counter(x['status'] for x in rows if x['quote_mint']==q) for q,_ in qm.most_common(5)})
