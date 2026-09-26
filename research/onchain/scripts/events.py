#!/usr/bin/env python3
"""Decode Anchor emit_cpi events from a getTransaction jsonParsed file.
usage: events.py <idl.json> <tx.json> [programId]"""
import sys, json, base64, struct, importlib.util
spec = importlib.util.spec_from_file_location('d', sys.argv[0].replace('events.py','decode_lib.py')); 
ALPH='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
def unb58(s):
    n=0
    for c in s: n=n*58+ALPH.index(c)
    b=n.to_bytes((n.bit_length()+7)//8,'big') if n else b''
    return b'\0'*(len(s)-len(s.lstrip('1')))+b
exec(open(sys.argv[0].replace('events.py','decode.py')).read().split("buf = base64")[0].replace("idl = json.load(open(sys.argv[1]))","idl = json.load(open(sys.argv[1]))"))
t=json.load(open(sys.argv[2]))['result']
pid=idl.get('address')
evs={bytes(e['discriminator']):e['name'] for e in idl.get('events',[])}
for grp in t['meta']['innerInstructions']:
    for ix in grp['instructions']:
        if ix.get('programId')!=pid or 'data' not in ix: continue
        raw=unb58(ix['data'])
        if raw[:8]!=bytes.fromhex('e445a52e51cb9a1d'): continue
        name=evs.get(raw[8:16])
        if not name: continue
        v,_=dec({'defined':{'name':name}},raw,16)
        print(json.dumps({'event':name,**v}))
