#!/usr/bin/env python3
"""Minimal Anchor account decoder driven by an IDL (fixed-size types only).
usage: decode.py <idl.json> <TypeName> <base64 data>"""
import sys, json, base64, struct
ALPH = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
def b58(b):
    n = int.from_bytes(b, 'big'); s = ''
    while n: n, r = divmod(n, 58); s = ALPH[r] + s
    return '1' * (len(b) - len(b.lstrip(b'\0'))) + s
idl = json.load(open(sys.argv[1])); types = {t['name']: t for t in idl['types']}
def dec(t, buf, o):
    if isinstance(t, str):
        fmt = {'u8':'<B','i8':'<b','u16':'<H','i16':'<h','u32':'<I','i32':'<i','u64':'<Q','i64':'<q','bool':'<?'}
        if t in fmt: v = struct.unpack_from(fmt[t], buf, o)[0]; return v, o + struct.calcsize(fmt[t])
        if t == 'u128': return int.from_bytes(buf[o:o+16], 'little'), o + 16
        if t == 'string':
            n = struct.unpack_from('<I', buf, o)[0]; return buf[o+4:o+4+n].decode(), o + 4 + n
        if t == 'pubkey': return b58(buf[o:o+32]), o + 32
        raise Exception(t)
    if 'array' in t:
        et, n = t['array']
        if et == 'u8':
            raw = buf[o:o+n]; txt = raw.rstrip(b'\0')
            try: v = txt.decode()
            except Exception: v = raw.hex()
            return v, o + n
        out = []
        for _ in range(n): v, o = dec(et, buf, o); out.append(v)
        return out, o
    if 'defined' in t:
        td = types[t['defined']['name']]['type']
        if td['kind'] == 'struct':
            d = {}
            for f in td['fields']: d[f['name']], o = dec(f['type'], buf, o)
            return d, o
        if td['kind'] == 'enum':
            i = buf[o]; var = td['variants'][i]; o += 1
            fs = var.get('fields')
            if not fs: return var['name'], o
            if isinstance(fs[0], dict) and 'name' in fs[0]:
                d = {}
                for f in fs: d[f['name']], o = dec(f['type'], buf, o)
            else:
                d = []
                for f in fs: v, o = dec(f, buf, o); d.append(v)
            return {var['name']: d}, o
    if 'vec' in t:
        n = struct.unpack_from('<I', buf, o)[0]; o += 4; out = []
        for _ in range(n): v, o = dec(t['vec'], buf, o); out.append(v)
        return out, o
    if 'option' in t:
        if buf[o] == 0: return None, o + 1
        return dec(t['option'], buf, o + 1)
    raise Exception(str(t))
buf = base64.b64decode(sys.argv[3])
v, _ = dec({'defined': {'name': sys.argv[2]}}, buf, 8)
print(json.dumps(v, indent=1))
